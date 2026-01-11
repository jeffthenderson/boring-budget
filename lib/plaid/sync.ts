'use server'

import { prisma } from '@/lib/db'
import { plaidClient } from './client'
import { decryptAccessToken } from './encryption'
import { isTransferCategory, isTransferDescription } from './category-map'
import { getCurrentOrCreatePeriod, getOrCreatePeriodForDate } from '@/lib/actions/period'
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
export async function syncPlaidTransactions(accountId: string): Promise<SyncResult> {
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

  revalidatePath('/')
  revalidatePath('/import')

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
  account: { id: string; userId: string; type: string; invertAmounts: boolean },
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
  const transactionsByPeriod = new Map<string, PlaidTransaction[]>()

  for (const tx of transactions) {
    const date = new Date(tx.date)
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`
    if (!transactionsByPeriod.has(key)) {
      transactionsByPeriod.set(key, [])
    }
    transactionsByPeriod.get(key)!.push(tx)
  }

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

      // Check for existing transactions to avoid duplicates
      const plaidTxIds = periodTransactions.map(tx => tx.transaction_id)
      const existingByExternalId = await prisma.transaction.findMany({
        where: {
          periodId: period.id,
          externalId: { in: plaidTxIds },
        },
        select: { id: true, externalId: true, accountId: true },
      })
      const existingMap = new Map(existingByExternalId.map(t => [t.externalId, t]))

      const projectedToDelete = new Set<string>()
      const transactionsToCreate: any[] = []
      const transactionsToBackfillAccountId: string[] = []

      for (const tx of periodTransactions) {
        // Check if already imported
        const existing = existingMap.get(tx.transaction_id)
        if (existing) {
          // If existing but missing accountId, queue for backfill
          if (!existing.accountId) {
            transactionsToBackfillAccountId.push(existing.id)
          }
          result.skippedDuplicates++
          continue
        }

        // Check if this is a transfer by category
        const plaidCategory = tx.personal_finance_category ? {
          primary: tx.personal_finance_category.primary,
          detailed: tx.personal_finance_category.detailed,
        } : null

        if (isTransferCategory(plaidCategory)) {
          result.skippedTransfers++
          continue
        }

        // Normalize data
        const date = new Date(tx.date)
        const description = tx.name || tx.merchant_name || 'Unknown'
        const subDescription = tx.merchant_name && tx.name !== tx.merchant_name ? tx.merchant_name : undefined

        // Also check if description indicates a transfer (fallback)
        if (isTransferDescription(description)) {
          result.skippedTransfers++
          continue
        }

        // Plaid amounts: positive = money leaving account (expense), negative = money entering (income/refund)
        // Our system: positive = expense, negative = income
        let amount = tx.amount
        if (account.invertAmounts) {
          amount = -amount
        }

        const normalizedDesc = normalizeDescription(description + (subDescription ? ` ${subDescription}` : ''))

        // Compute hash for deduplication
        const hashKey = computeHashKey(
          account.id,
          period.id,
          date,
          Math.round(amount * 100),
          normalizedDesc
        )

        // Try to match recurring
        let category = 'Uncategorized'
        let isRecurringInstance = false
        let recurringDefinitionId: string | undefined

        if (definitions.length > 0 && amount > 0) {
          const importedRow = {
            id: tx.transaction_id,
            parsedDate: date,
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
                date,
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
          date,
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
        })
      }

      // Create transactions in batches
      if (transactionsToCreate.length > 0) {
        await prisma.transaction.createMany({
          data: transactionsToCreate,
        })
        result.added += transactionsToCreate.length
      }

      // Backfill accountId for existing transactions that are missing it
      if (transactionsToBackfillAccountId.length > 0) {
        await prisma.transaction.updateMany({
          where: { id: { in: transactionsToBackfillAccountId } },
          data: { accountId: account.id },
        })
      }

      // Delete matched projected transactions
      if (projectedToDelete.size > 0) {
        await prisma.transaction.deleteMany({
          where: { id: { in: Array.from(projectedToDelete) } },
        })
      }
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
  account: { id: string },
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
      })

      if (!existing) {
        // Transaction doesn't exist, might have been deleted or not synced yet
        continue
      }

      // Update the transaction
      let amount = tx.amount
      // Note: We don't re-apply invertAmounts here since the existing transaction already has the correct sign

      await prisma.transaction.update({
        where: { id: existing.id },
        data: {
          date: new Date(tx.date),
          description: tx.name || tx.merchant_name || existing.description,
          subDescription: tx.merchant_name && tx.name !== tx.merchant_name ? tx.merchant_name : existing.subDescription,
          amount: existing.amount < 0 ? -Math.abs(tx.amount) : Math.abs(tx.amount), // Preserve sign
          status: tx.pending ? 'pending' : 'posted',
        },
      })

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
export async function syncAllPlaidAccounts(userId: string): Promise<Map<string, SyncResult>> {
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
      const result = await syncPlaidTransactions(account.id)
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
