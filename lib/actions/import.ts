'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import {
  normalizeAmount,
  normalizeDescription,
  buildCompositeDescription,
  computeHashKey,
  parseAmount,
  parseDate,
  isDateInPeriod,
} from '@/lib/utils/import/normalizer'
import { detectTransfers, type RawRow } from '@/lib/utils/import/transfer-detector'
import { getBestRecurringMatch, matchAgainstDefinitions } from '@/lib/utils/import/recurring-matcher'
import { ColumnMapping } from '@/lib/utils/import/csv-parser'
import { getCurrentOrCreatePeriod } from './period'
import { getExpenseAmount } from '@/lib/utils/transaction-amounts'

export interface ProcessedRow {
  lineNumber: number
  rawData: any
  parsedDate: Date
  parsedDescription: string
  parsedSubDescription?: string
  parsedAmountBeforeNorm: number
  normalizedAmount: number
  normalizedDescription: string
  externalId?: string
  hashKey: string
  status: 'pending' | 'imported' | 'duplicate' | 'ignored' | 'out_of_period'
  ignoreReason?: string
}

export interface ImportSummary {
  batchId: string
  batchIds?: string[]
  imported: number
  skippedDuplicates: number
  ignoredTransfers: number
  ignoredByRule: number
  outOfPeriod: number
  matchedRecurring: number
  pendingConfirmation: number
  periodsTouched?: Array<{ year: number; month: number; batchId: string }>
}

export interface ImportOptions {
  periodMode?: 'current' | 'specific' | 'auto'
  periodId?: string
  targetYear?: number
  targetMonth?: number
}

const CREATE_CHUNK_SIZE = 500
const INCOME_MATCH_WINDOW_DAYS = 30

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * Process CSV rows and create import batch
 */
export async function processCSVImport(
  accountId: string,
  periodId: string,
  rows: any[],
  mapping: ColumnMapping,
  accountType: 'credit_card' | 'bank'
): Promise<ImportSummary> {
  // Get period info
  const period = await prisma.budgetPeriod.findUnique({
    where: { id: periodId },
    include: {
      transactions: {
        where: {
          status: 'projected',
          isRecurringInstance: true,
        },
        include: {
          recurringDefinition: true,
        },
      },
    },
  })

  if (!period) {
    throw new Error('Period not found')
  }

  // Get current account
  const currentAccount = await prisma.account.findUnique({
    where: { id: accountId },
  })

  if (!currentAccount) {
    throw new Error('Account not found')
  }

  // Get all accounts for transfer detection
  const allAccounts = await prisma.account.findMany({
    select: { id: true, displayAlias: true, last4: true },
  })

  const accountsForDetection = allAccounts.map(a => ({
    displayAlias: a.displayAlias || undefined,
    last4: a.last4 || undefined,
  }))

  const ignoreRules = await prisma.ignoreRule.findMany({
    where: { userId: period.userId, active: true },
  })

  const categoryMappingRules = await prisma.categoryMappingRule.findMany({
    where: { userId: period.userId, active: true },
  })
  const mappingRulesByNormalized = new Map(
    categoryMappingRules.map(rule => [rule.normalizedDescription, rule])
  )

  const recurringDefinitions = await prisma.recurringDefinition.findMany({
    where: { userId: period.userId, active: true },
  })
  const definitions = recurringDefinitions.map(d => ({
    id: d.id,
    merchantLabel: d.merchantLabel,
    displayLabel: d.displayLabel,
    nominalAmount: d.nominalAmount,
    category: d.category,
  }))
  const definitionsById = new Map(definitions.map(def => [def.id, def]))
  const projectedTransactions = period.transactions.map(t => ({
    id: t.id,
    recurringDefinitionId: t.recurringDefinitionId!,
    date: t.date,
    amount: t.amount,
    description: t.description,
  }))

  // Create import batch
  const batch = await prisma.importBatch.create({
    data: {
      accountId,
      periodId,
      imported: 0,
      skippedDuplicates: 0,
      ignoredTransfers: 0,
      ignoredByRule: 0,
      matchedRecurring: 0,
      pendingConfirmation: 0,
    },
  })

  const processedRows: ProcessedRow[] = []
  const rawRows: RawRow[] = []

  // Step 1: Parse and normalize all rows
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    try {
      const parsedDate = parseDate(row[mapping.date])
      const parsedAmountBeforeNorm = parseAmount(row[mapping.amount])

      // Use the description column as-is and keep sub-description separate
      let parsedDescription = row[mapping.description] || ''
      let parsedSubDescription = mapping.merchant && row[mapping.merchant]
        ? row[mapping.merchant]
        : ''
      if (!parsedDescription && parsedSubDescription) {
        parsedDescription = parsedSubDescription
        parsedSubDescription = ''
      }

      const transactionType = mapping.transactionType ? row[mapping.transactionType] : undefined
      const normalizedAmount = normalizeAmount(parsedAmountBeforeNorm, accountType, transactionType)
      const adjustedAmount = currentAccount.invertAmounts ? -normalizedAmount : normalizedAmount
      const normalizedDesc = normalizeDescription(
        buildCompositeDescription(parsedDescription, parsedSubDescription)
      )

      const hashKey = computeHashKey(
        accountId,
        periodId,
        parsedDate,
        adjustedAmount,
        normalizedDesc
      )

      // Check if in period
      const inPeriod = isDateInPeriod(parsedDate, period.year, period.month)

      const matchedIgnoreRule = inPeriod
        ? ignoreRules.find(rule => normalizedDesc.includes(rule.normalizedPattern))
        : null

      const processed: ProcessedRow = {
        lineNumber: i + 2, // +2 because of header and 1-indexing
        rawData: row,
        parsedDate,
        parsedDescription,
        parsedSubDescription: parsedSubDescription || undefined,
        parsedAmountBeforeNorm,
        normalizedAmount: adjustedAmount,
        normalizedDescription: normalizedDesc,
        externalId: row.externalId,
        hashKey,
        status: inPeriod ? (matchedIgnoreRule ? 'ignored' : 'pending') : 'out_of_period',
        ignoreReason: matchedIgnoreRule ? 'ignore_rule' : undefined,
      }

      processedRows.push(processed)

      if (processed.status === 'pending') {
        rawRows.push({
          id: `temp_${i}`,
          accountId,
          accountType,
          accountLast4: currentAccount.last4 || undefined,
          accountInvertAmounts: currentAccount.invertAmounts || false,
          parsedDate,
          parsedDescription,
          normalizedDescription: normalizedDesc,
          normalizedAmount: adjustedAmount,
          status: 'pending',
        })
      }
    } catch (error) {
      console.error(`Error processing row ${i}:`, error)
      // Skip malformed rows
    }
  }

  // Step 2: Check for duplicates in both Transaction and RawImportRow
  const [existingTransactionHashes, existingRawRowHashes] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        periodId,
        sourceImportHash: {
          in: processedRows.map(r => r.hashKey),
        },
      },
      select: { sourceImportHash: true },
    }),
    prisma.rawImportRow.findMany({
      where: {
        accountId,
        hashKey: {
          in: processedRows.map(r => r.hashKey),
        },
      },
      select: { hashKey: true },
    }),
  ])

  const existingRawRowHashSet = new Set(existingRawRowHashes.map(h => h.hashKey))
  const existingHashSet = new Set([
    ...existingTransactionHashes.map(h => h.sourceImportHash),
    ...existingRawRowHashSet,
  ])

  for (const row of processedRows) {
    if (row.status === 'pending' && existingHashSet.has(row.hashKey)) {
      row.status = 'duplicate'
    }
  }

  // Step 3: Detect transfers
  const transferCandidates = detectTransfers(rawRows, accountsForDetection)

  for (let i = 0; i < processedRows.length; i++) {
    const row = processedRows[i]
    const tempId = `temp_${i}`

    if (row.status === 'pending' && transferCandidates.has(tempId)) {
      row.status = 'ignored'
      row.ignoreReason = transferCandidates.get(tempId)!.reason
    }
  }

  // Step 3.5: Check for duplicates within the CSV itself and mark later occurrences
  const seenHashes = new Set<string>()
  for (const row of processedRows) {
    if (row.status !== 'duplicate') {
      if (seenHashes.has(row.hashKey)) {
        row.status = 'duplicate'
      } else {
        seenHashes.add(row.hashKey)
      }
    }
  }

  // Step 4: Create raw import rows (skip any that already exist in raw rows)
  const rowsToCreate = processedRows.filter(
    row => row.status !== 'duplicate' && !existingRawRowHashSet.has(row.hashKey)
  )

  if (rowsToCreate.length > 0) {
    const createChunks = chunkArray(rowsToCreate, CREATE_CHUNK_SIZE)
    for (const chunk of createChunks) {
      await prisma.rawImportRow.createMany({
        data: chunk.map(row => ({
          batchId: batch.id,
          accountId,
          rawLineNumber: row.lineNumber,
          rawData: JSON.stringify(row.rawData),
          parsedDate: row.parsedDate,
          parsedDescription: row.parsedDescription,
          parsedSubDescription: row.parsedSubDescription || undefined,
          parsedAmountBeforeNorm: row.parsedAmountBeforeNorm,
          normalizedAmount: row.normalizedAmount,
          normalizedDescription: row.normalizedDescription,
          externalId: row.externalId || undefined,
          hashKey: row.hashKey,
          status: row.status,
          ignoreReason: row.ignoreReason || undefined,
        })),
      })
    }
  }

  // Step 5: Create transactions for imported rows
  const pendingRows = rowsToCreate.filter(row => row.status === 'pending')
  const ignoredRows = rowsToCreate.filter(row => row.status === 'ignored')
  let matchedRecurring = 0
  const pendingConfirmation = 0
  const projectedToDelete = new Set<string>()

  const projectedIncomeCandidates = currentAccount.type === 'bank'
    ? await prisma.transaction.findMany({
        where: {
          periodId,
          category: 'Income',
          status: 'projected',
          isIgnored: false,
        },
      })
    : []

  const usedProjectedIncomeIds = new Set<string>()
  const incomeMatches: Array<{ transactionId: string; row: ProcessedRow }> = []
  const rowsForImport = pendingRows.filter(row => {
    if (currentAccount.type !== 'bank' || projectedIncomeCandidates.length === 0) return true

    const expenseAmount = getExpenseAmount({
      amount: row.normalizedAmount,
      source: 'import',
      importBatch: { account: currentAccount },
    })

    if (expenseAmount >= 0) return true

    const candidates = projectedIncomeCandidates.filter(candidate => {
      if (usedProjectedIncomeIds.has(candidate.id)) return false
      const projectedAmount = Math.abs(candidate.amount)
      const tolerance = Math.max(100, projectedAmount * 0.1)
      const amountDiff = Math.abs(Math.abs(expenseAmount) - projectedAmount)
      if (amountDiff > tolerance) return false
      const daysDiff = Math.abs(candidate.date.getTime() - row.parsedDate.getTime()) / (1000 * 60 * 60 * 24)
      return daysDiff <= INCOME_MATCH_WINDOW_DAYS
    })

    if (candidates.length !== 1) return true

    const match = candidates[0]
    usedProjectedIncomeIds.add(match.id)
    incomeMatches.push({ transactionId: match.id, row })
    return false
  })

  const transactionsToCreate = rowsForImport.map(row => {
    let category = 'Uncategorized'
    let isRecurringInstance = false
    let recurringDefinitionId: string | undefined

    const importedRow = {
      id: row.hashKey,
      parsedDate: row.parsedDate,
      normalizedAmount: row.normalizedAmount,
      normalizedDescription: row.normalizedDescription,
      parsedDescription: row.parsedDescription,
    }

    let match = null as ReturnType<typeof getBestRecurringMatch>

    if (definitions.length > 0) {
      match = getBestRecurringMatch(importedRow, projectedTransactions, definitions)
      if (!match) {
        match = matchAgainstDefinitions(importedRow, definitions, period.year, period.month)
      }
    }

    if (match) {
      matchedRecurring++
      const matchedDefinition = definitionsById.get(match.definitionId)
      category = matchedDefinition?.category || category
      isRecurringInstance = true
      recurringDefinitionId = match.definitionId
      if (match.projectedTransactionId) {
        projectedToDelete.add(match.projectedTransactionId)
      }
    } else {
      const mappingRule = mappingRulesByNormalized.get(row.normalizedDescription)
      if (mappingRule && mappingRule.category !== 'Uncategorized') {
        category = mappingRule.category
      }
    }

    return {
      periodId,
      date: row.parsedDate,
      description: row.parsedDescription,
      subDescription: row.parsedSubDescription || undefined,
      amount: row.normalizedAmount,
      category,
      status: 'posted',
      source: 'import',
      importBatchId: batch.id,
      externalId: row.externalId,
      sourceImportHash: row.hashKey,
      isRecurringInstance,
      recurringDefinitionId,
    }
  })

  const ignoredTransactionsToCreate = ignoredRows.map(row => ({
    periodId,
    date: row.parsedDate,
    description: row.parsedDescription,
    subDescription: row.parsedSubDescription || undefined,
    amount: row.normalizedAmount,
    category: 'Uncategorized',
    status: 'posted',
    source: 'import',
    importBatchId: batch.id,
    externalId: row.externalId,
    sourceImportHash: row.hashKey,
    isRecurringInstance: false,
    isIgnored: true,
  }))

  if (transactionsToCreate.length > 0) {
    const createChunks = chunkArray(transactionsToCreate, CREATE_CHUNK_SIZE)
    for (const chunk of createChunks) {
      await prisma.transaction.createMany({ data: chunk })
    }
  }

  if (ignoredTransactionsToCreate.length > 0) {
    const createChunks = chunkArray(ignoredTransactionsToCreate, CREATE_CHUNK_SIZE)
    for (const chunk of createChunks) {
      await prisma.transaction.createMany({ data: chunk })
    }
  }

  if (projectedToDelete.size > 0) {
    await prisma.transaction.deleteMany({
      where: { id: { in: Array.from(projectedToDelete) } },
    })
  }

  if (incomeMatches.length > 0) {
    const updates = incomeMatches.map(match =>
      prisma.transaction.update({
        where: { id: match.transactionId },
        data: {
          date: match.row.parsedDate,
          description: match.row.parsedDescription,
          subDescription: match.row.parsedSubDescription || undefined,
          amount: match.row.normalizedAmount,
          category: 'Income',
          status: 'posted',
          source: 'import',
          importBatchId: batch.id,
          externalId: match.row.externalId,
          sourceImportHash: match.row.hashKey,
        },
      })
    )
    await prisma.$transaction(updates)
  }

  if (pendingRows.length > 0) {
    await prisma.rawImportRow.updateMany({
      where: { batchId: batch.id, status: 'pending' },
      data: { status: 'imported' },
    })
  }

  // Update batch summary
  const imported = transactionsToCreate.length + incomeMatches.length
  const skippedDuplicates = processedRows.filter(r => r.status === 'duplicate').length
  const ignoredTransfers = processedRows.filter(r => r.status === 'ignored' && r.ignoreReason !== 'ignore_rule').length
  const ignoredByRule = processedRows.filter(r => r.status === 'ignored' && r.ignoreReason === 'ignore_rule').length
  const outOfPeriod = processedRows.filter(r => r.status === 'out_of_period').length

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      imported,
      skippedDuplicates,
      ignoredTransfers,
      ignoredByRule,
      matchedRecurring,
      pendingConfirmation,
    },
  })

  revalidatePath('/')
  revalidatePath('/import')

  return {
    batchId: batch.id,
    batchIds: [batch.id],
    imported,
    skippedDuplicates,
    ignoredTransfers,
    ignoredByRule,
    outOfPeriod,
    matchedRecurring,
    pendingConfirmation,
  }
}

export async function processCSVImportWithMode(
  accountId: string,
  rows: any[],
  mapping: ColumnMapping,
  accountType: 'credit_card' | 'bank',
  options: ImportOptions = {}
): Promise<ImportSummary> {
  const periodMode = options.periodMode || 'current'

  if (periodMode === 'auto') {
    const grouped = groupRowsByPeriod(rows, mapping)
    const summaries: ImportSummary[] = []

    for (const group of grouped) {
      const period = await getCurrentOrCreatePeriod(group.year, group.month)
      if (!period) {
        throw new Error('Failed to load or create budget period.')
      }
      const summary = await processCSVImport(
        accountId,
        period.id,
        group.rows,
        mapping,
        accountType
      )
      summaries.push({
        ...summary,
        periodsTouched: [
          ...(summary.periodsTouched || []),
          { year: group.year, month: group.month, batchId: summary.batchId },
        ],
      })
    }

    return mergeSummaries(summaries)
  }

  if (periodMode === 'specific') {
    if (!options.targetYear || !options.targetMonth) {
      throw new Error('targetYear and targetMonth are required for specific period imports')
    }

    const period = await getCurrentOrCreatePeriod(options.targetYear, options.targetMonth)
    if (!period) {
      throw new Error('Failed to load or create budget period.')
    }
    return processCSVImport(accountId, period.id, rows, mapping, accountType)
  }

  if (!options.periodId) {
    throw new Error('periodId is required for current period imports')
  }

  return processCSVImport(accountId, options.periodId, rows, mapping, accountType)
}

function groupRowsByPeriod(
  rows: any[],
  mapping: ColumnMapping
): Array<{ year: number; month: number; rows: any[] }> {
  const groups = new Map<string, { year: number; month: number; rows: any[] }>()

  for (const row of rows) {
    try {
      const parsedDate = parseDate(row[mapping.date])
      const year = parsedDate.getFullYear()
      const month = parsedDate.getMonth() + 1
      const key = `${year}-${month}`

      if (!groups.has(key)) {
        groups.set(key, { year, month, rows: [] })
      }

      groups.get(key)!.rows.push(row)
    } catch {
      // Skip invalid date rows
    }
  }

  return Array.from(groups.values()).sort((a, b) => (a.year - b.year) || (a.month - b.month))
}

function mergeSummaries(summaries: ImportSummary[]): ImportSummary {
  if (summaries.length === 0) {
    return {
      batchId: '',
      batchIds: [],
      imported: 0,
      skippedDuplicates: 0,
      ignoredTransfers: 0,
      ignoredByRule: 0,
      outOfPeriod: 0,
      matchedRecurring: 0,
      pendingConfirmation: 0,
      periodsTouched: [],
    }
  }

  const merged = {
    batchId: summaries[0].batchId,
    batchIds: [] as string[],
    imported: 0,
    skippedDuplicates: 0,
    ignoredTransfers: 0,
    ignoredByRule: 0,
    outOfPeriod: 0,
    matchedRecurring: 0,
    pendingConfirmation: 0,
    periodsTouched: [] as Array<{ year: number; month: number; batchId: string }>,
  }

  for (const summary of summaries) {
    merged.imported += summary.imported
    merged.skippedDuplicates += summary.skippedDuplicates
    merged.ignoredTransfers += summary.ignoredTransfers
    merged.ignoredByRule += summary.ignoredByRule
    merged.outOfPeriod += summary.outOfPeriod
    merged.matchedRecurring += summary.matchedRecurring
    merged.pendingConfirmation += summary.pendingConfirmation
    if (summary.batchIds) {
      merged.batchIds.push(...summary.batchIds)
    } else if (summary.batchId) {
      merged.batchIds.push(summary.batchId)
    }
    if (summary.periodsTouched) {
      merged.periodsTouched.push(...summary.periodsTouched)
    }
  }

  return merged
}

/**
 * Get import batch with details
 */
export async function getImportBatch(batchId: string) {
  return prisma.importBatch.findUnique({
    where: { id: batchId },
    include: {
      account: true,
      period: true,
      rawRows: {
        orderBy: { rawLineNumber: 'asc' },
      },
      transactions: {
        orderBy: { date: 'asc' },
      },
    },
  })
}

/**
 * Undo an import batch
 */
export async function undoImportBatch(batchId: string) {
  // Delete transactions created by this batch
  await prisma.transaction.deleteMany({
    where: { importBatchId: batchId },
  })

  // Delete transfer groups created by this batch
  // (we'll need to track this separately)

  // Delete raw import rows
  await prisma.rawImportRow.deleteMany({
    where: { batchId },
  })

  // Delete the batch itself
  await prisma.importBatch.delete({
    where: { id: batchId },
  })

  revalidatePath('/')
  revalidatePath('/import')

  return { success: true }
}

/**
 * Get all import batches for the current period
 */
export async function getImportBatches(periodId: string) {
  return prisma.importBatch.findMany({
    where: { periodId },
    include: {
      account: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}
