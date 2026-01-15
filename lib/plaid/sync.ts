'use server'

import { prisma } from '@/lib/db'
import { plaidClient } from './client'
import { decryptAccessToken } from './encryption'
import { getOrCreatePeriodForDate } from '@/lib/actions/period'
import { matchExistingImportsForOpenPeriodsByUser } from '@/lib/actions/recurring'
import { markInternalTransfersForPeriodByUser } from '@/lib/actions/transfers'
import { findClosestProjectedTransaction, getBestRecurringMatch, matchAgainstDefinitions } from '@/lib/utils/import/recurring-matcher'
import { computeHashKey, normalizeDescription } from '@/lib/utils/import/normalizer'
import { revalidatePath } from 'next/cache'
import type { Transaction as PlaidTransaction, RemovedTransaction } from 'plaid'

export interface SyncResult {
  added: number
  modified: number
  removed: number
  skippedDuplicates: number
  skippedTransfers: number
  matchedRecurring: number
  errors: string[]
}

/**
 * Syncs transactions from Plaid for a specific account
 */
export async function syncPlaidTransactions(
  accountId: string,
  options?: { revalidate?: boolean }
): Promise<SyncResult> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { user: true },
  })

  if (!account) {
    throw new Error('Account not found')
  }

  if (!account.plaidAccessToken || !account.plaidItemId) {
    throw new Error('Account is not linked to Plaid')
  }

  const accessToken = decryptAccessToken(account.plaidAccessToken)
  const cursor = account.plaidSyncCursor || undefined

  const result: SyncResult = {
    added: 0,
    modified: 0,
    removed: 0,
    skippedDuplicates: 0,
    skippedTransfers: 0,
    matchedRecurring: 0,
    errors: [],
  }

  let hasMore = true
  let nextCursor = cursor

  // Fetch all transactions with pagination
  const allAdded: PlaidTransaction[] = []
  const allModified: PlaidTransaction[] = []
  const allRemoved: RemovedTransaction[] = []

  while (hasMore) {
    try {
      const response = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor: nextCursor,
        count: 500,
      })

      allAdded.push(...response.data.added)
      allModified.push(...response.data.modified)
      allRemoved.push(...response.data.removed)

      hasMore = response.data.has_more
      nextCursor = response.data.next_cursor
    } catch (error) {
      console.error('Error fetching transactions from Plaid:', error)
      result.errors.push(error instanceof Error ? error.message : 'Failed to fetch transactions')
      break
    }
  }

  // Filter transactions to only include those for this specific account
  // (Plaid returns all transactions for the Item, which may have multiple accounts)
  const plaidAccountId = account.plaidAccountId

  // Debug logging
  console.log(`Plaid sync for account ${accountId}:`)
  console.log(`  - plaidAccountId filter: ${plaidAccountId || 'none (will include all)'}`)
  console.log(`  - Total transactions from Plaid: added=${allAdded.length}, modified=${allModified.length}, removed=${allRemoved.length}`)
  if (allAdded.length > 0) {
    const uniqueAccountIds = [...new Set(allAdded.map(tx => tx.account_id))]
    console.log(`  - Unique account_ids in added transactions: ${uniqueAccountIds.join(', ')}`)
  }

  const filteredAdded = plaidAccountId
    ? allAdded.filter(tx => tx.account_id === plaidAccountId)
    : allAdded
  const filteredModified = plaidAccountId
    ? allModified.filter(tx => tx.account_id === plaidAccountId)
    : allModified
  const filteredRemoved = plaidAccountId
    ? allRemoved.filter(tx => tx.account_id === plaidAccountId)
    : allRemoved

  console.log(`  - After filtering: added=${filteredAdded.length}, modified=${filteredModified.length}, removed=${filteredRemoved.length}`)

  // Process added transactions
  if (filteredAdded.length > 0) {
    const addResult = await processAddedTransactions(account, filteredAdded)
    result.added = addResult.added
    result.skippedDuplicates = addResult.skippedDuplicates
    result.skippedTransfers = addResult.skippedTransfers
    result.matchedRecurring = addResult.matchedRecurring
    result.errors.push(...addResult.errors)
  }

  // Process modified transactions
  if (filteredModified.length > 0) {
    const modResult = await processModifiedTransactions(account, filteredModified)
    result.modified = modResult.modified
    result.errors.push(...modResult.errors)
  }

  // Process removed transactions
  if (filteredRemoved.length > 0) {
    const remResult = await processRemovedTransactions(filteredRemoved)
    result.removed = remResult.removed
    result.errors.push(...remResult.errors)
  }

  // Update sync cursor and timestamp
  if (nextCursor) {
    await prisma.account.update({
      where: { id: accountId },
      data: {
        plaidSyncCursor: nextCursor,
        plaidLastSyncAt: new Date(),
      },
    })
  }

  try {
    await matchExistingImportsForOpenPeriodsByUser(account.userId, undefined, {
      revalidate: options?.revalidate,
    })
  } catch (error) {
    console.error('Error matching recurring transactions after Plaid sync:', error)
    result.errors.push(error instanceof Error ? error.message : 'Failed to match recurring transactions')
  }

  if (options?.revalidate !== false) {
    revalidatePath('/')
    revalidatePath('/import')
  }

  return result
}

/**
 * Force-resyncs transactions from Plaid for the last N days (default 90).
 * Uses transactions/get and upserts based on externalId.
 */
export async function forceResyncPlaidTransactions(
  accountId: string,
  days = 90,
  options?: { revalidate?: boolean }
): Promise<SyncResult> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { user: true },
  })

  if (!account) {
    throw new Error('Account not found')
  }

  if (!account.plaidAccessToken || !account.plaidItemId) {
    throw new Error('Account is not linked to Plaid')
  }

  const accessToken = decryptAccessToken(account.plaidAccessToken)

  const result: SyncResult = {
    added: 0,
    modified: 0,
    removed: 0,
    skippedDuplicates: 0,
    skippedTransfers: 0,
    matchedRecurring: 0,
    errors: [],
  }

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - days)

  const startDateStr = startDate.toISOString().slice(0, 10)
  const endDateStr = endDate.toISOString().slice(0, 10)

  const allTransactions: PlaidTransaction[] = []
  let offset = 0
  const count = 500

  while (true) {
    const response = await plaidClient.transactionsGet({
      access_token: accessToken,
      start_date: startDateStr,
      end_date: endDateStr,
      options: {
        count,
        offset,
      },
    })

    allTransactions.push(...response.data.transactions)

    if (allTransactions.length >= response.data.total_transactions) {
      break
    }

    offset += count
  }

  const plaidAccountId = account.plaidAccountId
  const filtered = plaidAccountId
    ? allTransactions.filter(tx => tx.account_id === plaidAccountId)
    : allTransactions

  if (filtered.length > 0) {
    const addResult = await processAddedTransactions(account, filtered)
    result.added = addResult.added
    result.skippedDuplicates = addResult.skippedDuplicates
    result.skippedTransfers = addResult.skippedTransfers
    result.matchedRecurring = addResult.matchedRecurring
    result.errors.push(...addResult.errors)
  }

  await prisma.account.update({
    where: { id: accountId },
    data: {
      plaidLastSyncAt: new Date(),
    },
  })

  try {
    await matchExistingImportsForOpenPeriodsByUser(account.userId, undefined, {
      revalidate: options?.revalidate,
    })
  } catch (error) {
    console.error('Error matching recurring transactions after Plaid force resync:', error)
    result.errors.push(error instanceof Error ? error.message : 'Failed to match recurring transactions')
  }

  if (options?.revalidate !== false) {
    revalidatePath('/')
    revalidatePath('/import')
  }

  return result
}

interface ProcessAddedResult {
  added: number
  skippedDuplicates: number
  skippedTransfers: number
  matchedRecurring: number
  errors: string[]
}

async function processAddedTransactions(
  account: { id: string; userId: string; type: string; invertAmounts: boolean; plaidItemId: string | null },
  transactions: PlaidTransaction[]
): Promise<ProcessAddedResult> {
  const result: ProcessAddedResult = {
    added: 0,
    skippedDuplicates: 0,
    skippedTransfers: 0,
    matchedRecurring: 0,
    errors: [],
  }

  // Group transactions by month/year for period assignment
  const transactionsByPeriod = new Map<string, Array<{
    tx: PlaidTransaction
    primaryDate: Date
    postedDate: Date
    authorizedDate: Date | null
  }>>()

  for (const tx of transactions) {
    const postedDate = new Date(tx.date)
    const authorizedDate = tx.authorized_date ? new Date(tx.authorized_date) : null
    const primaryDate = account.type === 'credit_card' && authorizedDate ? authorizedDate : postedDate
    const key = `${primaryDate.getFullYear()}-${primaryDate.getMonth() + 1}`
    if (!transactionsByPeriod.has(key)) {
      transactionsByPeriod.set(key, [])
    }
    transactionsByPeriod.get(key)!.push({ tx, primaryDate, postedDate, authorizedDate })
  }

  const plaidTxIds = transactions.map(tx => tx.transaction_id)
  const existingByExternalId = await prisma.transaction.findMany({
    where: {
      externalId: { in: plaidTxIds },
      period: { userId: account.userId },
    },
    select: { id: true, externalId: true, accountId: true, periodId: true },
  })
  const existingMap = new Map(existingByExternalId.map(t => [t.externalId, t]))

  // Process each period's transactions
  for (const [periodKey, periodTransactions] of transactionsByPeriod) {
    const [year, month] = periodKey.split('-').map(Number)

    try {
      // Get or create period
      const period = await getOrCreatePeriodForDate(account.userId, year, month)

      // Get recurring definitions for matching
      const recurringDefinitions = await prisma.recurringDefinition.findMany({
        where: { userId: account.userId, active: true },
      })
      const definitions = recurringDefinitions.map(d => ({
        id: d.id,
        merchantLabel: d.merchantLabel,
        displayLabel: d.displayLabel,
        nominalAmount: d.nominalAmount,
        category: d.category,
      }))

      // Get projected transactions
      const projectedTransactions = await prisma.transaction.findMany({
        where: {
          periodId: period.id,
          status: 'projected',
          isRecurringInstance: true,
        },
        include: { recurringDefinition: true },
      })

      // Get category mapping rules
      const categoryMappingRules = await prisma.categoryMappingRule.findMany({
        where: { userId: account.userId, active: true },
      })
      const mappingRulesByNormalized = new Map(
        categoryMappingRules.map(rule => [rule.normalizedDescription, rule])
      )

      const projectedToDelete = new Set<string>()
      const transactionsToCreate: any[] = []
      const transactionsToUpdate: Array<{ where: { id: string }; data: any }> = []

      for (const item of periodTransactions) {
        const { tx, primaryDate, postedDate, authorizedDate } = item
        // Check if already imported
        const existing = existingMap.get(tx.transaction_id)
        const description = tx.name || tx.merchant_name || 'Unknown'
        const subDescription = tx.merchant_name && tx.name !== tx.merchant_name ? tx.merchant_name : undefined

        // Plaid amounts: positive = money leaving account (expense), negative = money entering (income/refund)
        // Our system: positive = expense, negative = income
        let amount = tx.amount
        if (account.invertAmounts && !account.plaidItemId) {
          amount = -amount
        }

        const normalizedDesc = normalizeDescription(description + (subDescription ? ` ${subDescription}` : ''))

        // Compute hash for deduplication
        const hashKey = computeHashKey(
          account.id,
          period.id,
          primaryDate,
          Math.round(amount * 100),
          normalizedDesc
        )

        if (tx.pending_transaction_id) {
          const pendingMatch = await prisma.transaction.findFirst({
            where: {
              externalId: tx.pending_transaction_id,
              accountId: account.id,
            },
          })

          if (pendingMatch) {
            const updateData: any = {
              accountId: account.id,
              date: primaryDate,
              postedDate,
              authorizedDate,
              description,
              subDescription,
              amount,
              status: tx.pending ? 'pending' : 'posted',
              sourceImportHash: hashKey,
              externalId: tx.transaction_id,
            }

            if (pendingMatch.periodId !== period.id) {
              updateData.periodId = period.id
            }

            await prisma.transaction.update({
              where: { id: pendingMatch.id },
              data: updateData,
            })
            result.added += 1
            continue
          }
        }

        if (existing) {
          const updateData: any = {
            accountId: account.id,
            date: primaryDate,
            postedDate,
            authorizedDate,
            description,
            subDescription,
            amount,
            status: tx.pending ? 'pending' : 'posted',
            sourceImportHash: hashKey,
          }
          if (existing.periodId !== period.id) {
            updateData.periodId = period.id
          }
          transactionsToUpdate.push({
            where: { id: existing.id },
            data: updateData,
          })
          result.skippedDuplicates++
          continue
        }

        // Try to match recurring
        let category = 'Uncategorized'
        let isRecurringInstance = false
        let recurringDefinitionId: string | undefined

        if (definitions.length > 0 && amount > 0) {
          const importedRow = {
            id: tx.transaction_id,
            parsedDate: primaryDate,
            normalizedAmount: amount,
            normalizedDescription: normalizedDesc,
            parsedDescription: description,
          }

          const projected = projectedTransactions
            .filter(t => !projectedToDelete.has(t.id))
            .map(t => ({
            id: t.id,
            recurringDefinitionId: t.recurringDefinitionId!,
            date: t.date,
            amount: t.amount,
            description: t.description,
          }))

          let match = getBestRecurringMatch(importedRow, projected, definitions)
          if (!match) {
            match = matchAgainstDefinitions(importedRow, definitions, year, month)
          }

          if (match) {
            result.matchedRecurring++
            const matchedDef = definitions.find(d => d.id === match!.definitionId)
            if (matchedDef) {
              category = matchedDef.category
            }
            isRecurringInstance = true
            recurringDefinitionId = match.definitionId
            let projectedId: string | undefined = match.projectedTransactionId || undefined
          if (!projectedId) {
            const closest = findClosestProjectedTransaction(
              projected,
              match.definitionId,
              primaryDate,
              amount
            )
            if (closest) {
              projectedId = closest.id
            }
            }
            if (projectedId) {
              projectedToDelete.add(projectedId)
            }
          }
        }

        // Check category mapping rules if not matched to recurring
        if (!isRecurringInstance) {
          const mappingRule = mappingRulesByNormalized.get(normalizedDesc)
          if (mappingRule && mappingRule.category !== 'Uncategorized') {
            category = mappingRule.category
          }
        }

        transactionsToCreate.push({
          periodId: period.id,
          accountId: account.id,  // Direct account reference for Plaid syncs
          date: primaryDate,
          postedDate,
          authorizedDate,
          description,
          subDescription,
          amount,
          category,
          status: tx.pending ? 'pending' : 'posted',
          source: 'import',
          externalId: tx.transaction_id,
          sourceImportHash: hashKey,
          isRecurringInstance,
          recurringDefinitionId,
          isInternalTransfer: false,
        })
      }

      // Create transactions in batches
      if (transactionsToCreate.length > 0) {
        await prisma.transaction.createMany({
          data: transactionsToCreate,
        })
        result.added += transactionsToCreate.length
      }

      if (transactionsToUpdate.length > 0) {
        await prisma.$transaction(
          transactionsToUpdate.map(update => prisma.transaction.update(update))
        )
      }

      // Delete matched projected transactions
      if (projectedToDelete.size > 0) {
        await prisma.transaction.deleteMany({
          where: { id: { in: Array.from(projectedToDelete) } },
        })
      }

      await markInternalTransfersForPeriodByUser(account.userId, period.id, { revalidate: false })
    } catch (error) {
      console.error(`Error processing period ${periodKey}:`, error)
      result.errors.push(`Failed to process ${periodKey}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return result
}

interface ProcessModifiedResult {
  modified: number
  errors: string[]
}

async function processModifiedTransactions(
  account: { id: string; userId: string; type: string; invertAmounts: boolean; plaidItemId: string | null },
  transactions: PlaidTransaction[]
): Promise<ProcessModifiedResult> {
  const result: ProcessModifiedResult = {
    modified: 0,
    errors: [],
  }

  for (const tx of transactions) {
    try {
      const existing = await prisma.transaction.findFirst({
        where: { externalId: tx.transaction_id },
        include: { period: true },
      })

      const postedDate = new Date(tx.date)
      const authorizedDate = tx.authorized_date ? new Date(tx.authorized_date) : null
      const primaryDate = account.type === 'credit_card' && authorizedDate ? authorizedDate : postedDate

      let amount = tx.amount
      if (account.invertAmounts && !account.plaidItemId) {
        amount = -amount
      }

      const description = tx.name || tx.merchant_name || existing?.description || 'Unknown'
      const subDescription = tx.merchant_name && tx.name !== tx.merchant_name
        ? tx.merchant_name
        : existing?.subDescription

      if (!existing && !tx.pending_transaction_id) {
        // Transaction doesn't exist and has no pending link
        continue
      }

      const targetPeriod = await getOrCreatePeriodForDate(
        existing?.period.userId ?? account.userId,
        primaryDate.getFullYear(),
        primaryDate.getMonth() + 1
      )

      const normalizedDesc = normalizeDescription(description + (subDescription ? ` ${subDescription}` : ''))
      const hashKey = computeHashKey(
        account.id,
        targetPeriod.id,
        primaryDate,
        Math.round(amount * 100),
        normalizedDesc
      )

      const updateData: any = {
        accountId: account.id,
        date: primaryDate,
        postedDate,
        authorizedDate,
        description,
        subDescription,
        amount,
        status: tx.pending ? 'pending' : 'posted',
        sourceImportHash: hashKey,
      }
      if (!existing) {
        const pendingId = tx.pending_transaction_id
        if (!pendingId) {
          continue
        }

        const pendingMatch = await prisma.transaction.findFirst({
          where: {
            externalId: pendingId,
            accountId: account.id,
          },
        })

        if (!pendingMatch) {
          continue
        }

        if (pendingMatch.periodId !== targetPeriod.id) {
          updateData.periodId = targetPeriod.id
        }

        await prisma.transaction.update({
          where: { id: pendingMatch.id },
          data: {
            ...updateData,
            externalId: tx.transaction_id,
          },
        })
      } else {
        if (existing.periodId !== targetPeriod.id) {
          updateData.periodId = targetPeriod.id
        }

        await prisma.transaction.update({
          where: { id: existing.id },
          data: updateData,
        })
      }

      result.modified++
    } catch (error) {
      console.error(`Error updating transaction ${tx.transaction_id}:`, error)
      result.errors.push(`Failed to update ${tx.transaction_id}`)
    }
  }

  return result
}

interface ProcessRemovedResult {
  removed: number
  errors: string[]
}

async function processRemovedTransactions(
  transactions: RemovedTransaction[]
): Promise<ProcessRemovedResult> {
  const result: ProcessRemovedResult = {
    removed: 0,
    errors: [],
  }

  const txIds = transactions.map(tx => tx.transaction_id).filter(Boolean) as string[]

  if (txIds.length === 0) {
    return result
  }

  try {
    const deleteResult = await prisma.transaction.deleteMany({
      where: { externalId: { in: txIds } },
    })
    result.removed = deleteResult.count
  } catch (error) {
    console.error('Error deleting transactions:', error)
    result.errors.push('Failed to delete removed transactions')
  }

  return result
}

/**
 * Syncs transactions for all Plaid-linked accounts for a user
 */
export async function syncAllPlaidAccounts(
  userId: string,
  options?: { revalidate?: boolean }
): Promise<Map<string, SyncResult>> {
  const accounts = await prisma.account.findMany({
    where: {
      userId,
      plaidItemId: { not: null },
      plaidAccessToken: { not: null },
    },
  })

  const results = new Map<string, SyncResult>()

  for (const account of accounts) {
    try {
      const result = await syncPlaidTransactions(account.id, options)
      results.set(account.id, result)
    } catch (error) {
      console.error(`Error syncing account ${account.id}:`, error)
      results.set(account.id, {
        added: 0,
        modified: 0,
        removed: 0,
        skippedDuplicates: 0,
        skippedTransfers: 0,
        matchedRecurring: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      })
    }
  }

  return results
}
