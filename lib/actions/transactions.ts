'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { isRecurringCategory } from '@/lib/constants/categories'
import { parseCurrency, roundCurrency } from '@/lib/utils/currency'
import { buildCompositeDescription, normalizeDescription } from '@/lib/utils/import/normalizer'
import { getExpenseAmount } from '@/lib/utils/transaction-amounts'
import { getCurrentUser } from './user'

const LINK_MATCH_WINDOW_DAYS = 365
const LINK_MAX_CANDIDATES = 15
const INCOME_MATCH_WINDOW_DAYS = 30
const INCOME_MATCH_PERCENT = 0.1
const INCOME_MATCH_MIN_DELTA = 100
const RECURRING_MATCH_WINDOW_DAYS = 5
const RECURRING_MATCH_PERCENT = 0.1

function getRemainingLinkAmount(
  transaction: {
    amount: number
    source?: string | null
    importBatch?: { account?: { type?: string | null; invertAmounts?: boolean | null } | null } | null
    linksFrom?: { type: string; amount: number }[]
    linksTo?: { type: string; amount: number }[]
  },
  type: 'refund' | 'reimbursement'
) {
  const expenseAmount = getExpenseAmount(transaction)
  if (!expenseAmount) return { expenseAmount, linkedAmount: 0, remainingAmount: 0 }
  const isCredit = expenseAmount < 0
  const relevantLinks = isCredit ? (transaction.linksFrom || []) : (transaction.linksTo || [])
  const linkedAmount = relevantLinks
    .filter(link => link.type === type)
    .reduce((sum, link) => sum + (link.amount || 0), 0)
  const remainingAmount = roundCurrency(Math.max(0, Math.abs(expenseAmount) - linkedAmount))
  return { expenseAmount, linkedAmount, remainingAmount }
}

export async function addManualTransaction(periodId: string, data: {
  date: Date
  description: string
  amount: number
  category: string
}) {
  const user = await getCurrentUser()
  const period = await prisma.budgetPeriod.findFirst({
    where: { id: periodId, userId: user.id },
    select: { id: true },
  })

  if (!period) {
    throw new Error('Period not found')
  }

  const transaction = await prisma.transaction.create({
    data: {
      periodId: period.id,
      date: data.date,
      description: data.description,
      amount: data.amount,
      category: data.category,
      status: 'posted',
      source: 'manual',
      isRecurringInstance: false,
    },
  })

  revalidatePath('/')
  return transaction
}

export async function markTransactionPosted(id: string, actualAmount?: number) {
  const user = await getCurrentUser()
  const transaction = await prisma.transaction.findFirst({
    where: { id, period: { userId: user.id } },
  })

  if (!transaction) {
    throw new Error('Transaction not found')
  }

  if (transaction.status === 'projected' && transaction.source === 'recurring') {
    throw new Error('Projected recurring transactions must be matched to a posted transaction.')
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      status: 'posted',
      amount: actualAmount ?? transaction.amount,
    },
  })

  revalidatePath('/')
  return updated
}

export async function deleteTransaction(id: string) {
  const user = await getCurrentUser()
  await prisma.transaction.deleteMany({
    where: { id, period: { userId: user.id } },
  })

  revalidatePath('/')
  return { success: true }
}

export async function getTransactionsByPeriod(periodId: string, filters?: {
  category?: string
  status?: string
}) {
  const user = await getCurrentUser()
  return prisma.transaction.findMany({
    where: {
      periodId,
      period: { userId: user.id },
      ...(filters?.category && { category: filters.category }),
      ...(filters?.status && { status: filters.status }),
    },
    include: {
      recurringDefinition: true,
    },
    orderBy: { date: 'asc' },
  })
}

export async function updateTransactionCategory(
  transactionId: string,
  newCategory: string,
  options?: { skipMappingSuggestion?: boolean }
): Promise<{
  success: boolean
  error?: string
  mappingSuggestion?: { description: string; subDescription?: string | null; category: string }
}> {
  try {
    const user = await getCurrentUser()
    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId, period: { userId: user.id } },
      include: {
        period: true,
        importBatch: { include: { account: true } },
      },
    })

    if (!transaction) {
      return { success: false, error: 'Transaction not found' }
    }

    if (transaction.category === newCategory) {
      return { success: true }
    }

    // Guard: prevent changing projected recurring placeholders
    if (transaction.status === 'projected' && transaction.source === 'recurring') {
      return { success: false, error: 'Cannot change category of projected recurring transaction. Post it or delete it first.' }
    }

    // Guard: prevent turning refunds into recurring
    if (isRecurringCategory(newCategory) && getExpenseAmount(transaction) < 0) {
      return { success: false, error: 'Refunds cannot be made recurring' }
    }

    // If changing to non-recurring, unlink
    const wasRecurring = transaction.isRecurringInstance
    const isNowRecurring = isRecurringCategory(newCategory)

    if (wasRecurring && !isNowRecurring) {
      // Unlink from recurring
      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          category: newCategory,
          isRecurringInstance: false,
          recurringDefinitionId: null,
        },
      })

      return { success: true }
    }

    // If changing to recurring category, just update category
    // The modal will handle the actual linking/creation
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { category: newCategory },
    })

    const shouldSuggest = !options?.skipMappingSuggestion
      && transaction.source === 'import'
      && !transaction.isRecurringInstance
      && !transaction.isIgnored
      && newCategory !== 'Uncategorized'
      && !isRecurringCategory(newCategory)

    if (!shouldSuggest) {
      return { success: true }
    }

    const normalized = normalizeDescription(
      buildCompositeDescription(transaction.description, transaction.subDescription)
    )
    if (!normalized) {
      return { success: true }
    }

    const [existingRule, dismissal] = await Promise.all([
      prisma.categoryMappingRule.findUnique({
        where: {
          userId_normalizedDescription: {
            userId: transaction.period.userId,
            normalizedDescription: normalized,
          },
        },
      }),
      prisma.categoryMappingDismissal.findUnique({
        where: {
          userId_normalizedDescription: {
            userId: transaction.period.userId,
            normalizedDescription: normalized,
          },
        },
      }),
    ])

    if (existingRule || dismissal) {
      return { success: true }
    }

    const sameCategoryTransactions = await prisma.transaction.findMany({
      where: {
        period: { userId: transaction.period.userId },
        source: 'import',
        category: newCategory,
      },
      select: { description: true, subDescription: true },
    })

    const matchCount = sameCategoryTransactions.reduce((count, tx) => {
      const composite = buildCompositeDescription(tx.description, tx.subDescription)
      return count + (normalizeDescription(composite) === normalized ? 1 : 0)
    }, 0)

    if (matchCount < 2) {
      return { success: true }
    }

    return {
      success: true,
      mappingSuggestion: {
        description: transaction.description,
        subDescription: transaction.subDescription,
        category: newCategory,
      },
    }
  } catch (error: any) {
    console.error('Error updating category:', error)
    return { success: false, error: error.message }
  }
}

export async function updateTransactionNote(
  transactionId: string,
  note: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId, period: { userId: user.id } },
      select: { id: true },
    })

    if (!transaction) {
      return { success: false, error: 'Transaction not found' }
    }

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { userDescription: note },
    })

    return { success: true }
  } catch (error: any) {
    console.error('Error updating description:', error)
    return { success: false, error: error.message }
  }
}

export async function linkTransactionToRecurring(
  transactionId: string,
  recurringDefinitionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId, period: { userId: user.id } },
    })

    if (!transaction) {
      return { success: false, error: 'Transaction not found' }
    }

    const definition = await prisma.recurringDefinition.findFirst({
      where: { id: recurringDefinitionId, userId: user.id },
    })

    if (!definition) {
      return { success: false, error: 'Recurring definition not found' }
    }

    // Find and remove any projected placeholder for this definition in this month
    const projectedPlaceholder = await prisma.transaction.findFirst({
      where: {
        periodId: transaction.periodId,
        recurringDefinitionId,
        status: 'projected',
        source: 'recurring',
      },
    })

    if (projectedPlaceholder) {
      await prisma.transaction.delete({
        where: { id: projectedPlaceholder.id },
      })
    }

    // Link transaction to definition
    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        category: definition.category,
        isRecurringInstance: true,
        recurringDefinitionId,
        status: 'posted',
      },
    })

    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    console.error('Error linking transaction:', error)
    return { success: false, error: error.message }
  }
}

export async function createRecurringFromTransaction(
  transactionId: string,
  data: {
    merchantLabel: string
    displayLabel?: string
    nominalAmount: number
    frequency: string
    schedulingRule: string
    category?: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId, period: { userId: user.id } },
      include: { period: { include: { user: true } } },
    })

    if (!transaction) {
      return { success: false, error: 'Transaction not found' }
    }

    // Create the recurring definition with provided category or transaction's current category
    const merchantLabel = data.merchantLabel.trim()
    const displayLabel = (data.displayLabel ?? '').trim() || merchantLabel

    const definition = await prisma.recurringDefinition.create({
      data: {
        userId: transaction.period.userId,
        category: data.category || transaction.category,
        merchantLabel,
        displayLabel,
        nominalAmount: data.nominalAmount,
        frequency: data.frequency,
        schedulingRule: data.schedulingRule,
        active: true,
      },
    })

    // Link transaction to the new definition
    await linkTransactionToRecurring(transactionId, definition.id)

    revalidatePath('/')
    revalidatePath('/recurring')
    return { success: true }
  } catch (error: any) {
    console.error('Error creating recurring:', error)
    return { success: false, error: error.message }
  }
}

export async function getActiveRecurringDefinitions(
  category?: string
): Promise<Array<{ id: string; merchantLabel: string; displayLabel: string | null; nominalAmount: number; frequency: string; category: string }>> {
  const user = await getCurrentUser()
  const definitions = await prisma.recurringDefinition.findMany({
    where: {
      userId: user.id,
      ...(category && { category }),
      active: true,
    },
    select: {
      id: true,
      merchantLabel: true,
      displayLabel: true,
      nominalAmount: true,
      frequency: true,
      category: true,
    },
    orderBy: { merchantLabel: 'asc' },
  })

  return definitions
}

export async function setTransactionIgnored(
  transactionId: string,
  ignored: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    const transaction = await prisma.transaction.findFirst({
      where: { id: transactionId, period: { userId: user.id } },
      select: { id: true },
    })

    if (!transaction) {
      return { success: false, error: 'Transaction not found' }
    }

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { isIgnored: ignored },
    })

    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    console.error('Error updating ignored status:', error)
    return { success: false, error: error.message }
  }
}

export async function addIncomeTransaction(
  periodId: string,
  data: {
    date: Date
    source: string
    amount: number
  }
) {
  const user = await getCurrentUser()
  const period = await prisma.budgetPeriod.findFirst({
    where: { id: periodId, userId: user.id },
    select: { id: true },
  })

  if (!period) {
    throw new Error('Period not found')
  }

  const amount = -Math.abs(data.amount)
  const transaction = await prisma.transaction.create({
    data: {
      periodId: period.id,
      date: data.date,
      description: data.source,
      amount,
      category: 'Income',
      status: 'projected',
      source: 'income',
      isRecurringInstance: false,
    },
  })

  revalidatePath('/')
  return transaction
}

export async function getIncomeMatchCandidates(
  transactionId: string
): Promise<{
  projectedAmount: number
  tolerance: number
  candidates: Array<{
    id: string
    date: string
    description: string
    subDescription?: string | null
    amount: number
    category: string
    status: string
    source: string
    amountDiff: number
    dateDiffDays: number
    withinTolerance: boolean
  }>
}> {
  const user = await getCurrentUser()
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, period: { userId: user.id } },
    include: {
      period: { select: { userId: true } },
    },
  })

  if (!transaction) {
    throw new Error('Transaction not found')
  }

  if (transaction.category !== 'Income' || transaction.status !== 'projected') {
    throw new Error('Only projected income transactions can be matched.')
  }

  const projectedAmount = roundCurrency(Math.abs(transaction.amount))
  const tolerance = Math.max(INCOME_MATCH_MIN_DELTA, projectedAmount * INCOME_MATCH_PERCENT)
  const targetDate = transaction.date
  const windowStart = new Date(targetDate.getTime() - INCOME_MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const windowEnd = new Date(targetDate.getTime() + INCOME_MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const candidates = await prisma.transaction.findMany({
    where: {
      period: { userId: transaction.period.userId },
      id: { not: transactionId },
      status: 'posted',
      source: 'import',
      isIgnored: false,
      date: { gte: windowStart, lte: windowEnd },
      importBatch: {
        is: {
          account: { type: 'bank' },
        },
      },
    },
    include: {
      importBatch: { include: { account: true } },
    },
    orderBy: { date: 'desc' },
  })

  const scored = candidates
    .map(candidate => {
      const expenseAmount = getExpenseAmount(candidate)
      if (expenseAmount >= 0) return null
      const candidateAmount = roundCurrency(Math.abs(expenseAmount))
      const amountDiff = roundCurrency(Math.abs(candidateAmount - projectedAmount))
      const dateDiffDays = Math.abs(candidate.date.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)
      const withinTolerance = amountDiff <= tolerance
      return {
        id: candidate.id,
        date: candidate.date.toISOString().split('T')[0],
        description: candidate.description,
        subDescription: candidate.subDescription,
        amount: candidate.amount,
        category: candidate.category,
        status: candidate.status,
        source: candidate.source,
        amountDiff,
        dateDiffDays,
        withinTolerance,
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a!.withinTolerance !== b!.withinTolerance) {
        return a!.withinTolerance ? -1 : 1
      }
      if (a!.amountDiff !== b!.amountDiff) {
        return a!.amountDiff - b!.amountDiff
      }
      return a!.dateDiffDays - b!.dateDiffDays
    })
    .slice(0, 40)
    .map(item => item!)

  return {
    projectedAmount,
    tolerance: roundCurrency(tolerance),
    candidates: scored,
  }
}

export async function mergeIncomeMatch(
  projectedId: string,
  importId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    const transactions = await prisma.transaction.findMany({
      where: { id: { in: [projectedId, importId] }, period: { userId: user.id } },
      include: {
        period: { select: { userId: true } },
        importBatch: { include: { account: true } },
      },
    })

    if (transactions.length !== 2) {
      return { success: false, error: 'Transactions not found' }
    }

    const projected = transactions.find(tx => tx.id === projectedId)!
    const imported = transactions.find(tx => tx.id === importId)!

    if (projected.period.userId !== imported.period.userId) {
      return { success: false, error: 'Transactions belong to different users' }
    }

    if (projected.category !== 'Income' || projected.status !== 'projected') {
      return { success: false, error: 'Projected income not found' }
    }

    if (imported.source !== 'import') {
      return { success: false, error: 'Selected transaction is not an import' }
    }

    if (imported.importBatch?.account?.type !== 'bank') {
      return { success: false, error: 'Only bank deposits can be matched to income' }
    }

    const projectedAmount = roundCurrency(Math.abs(projected.amount))
    const actualAmount = roundCurrency(Math.abs(imported.amount))
    const varianceNote = projectedAmount !== actualAmount
      ? `Projected ${projectedAmount.toFixed(2)}; actual ${actualAmount.toFixed(2)}.`
      : ''
    const combinedNote = [
      projected.userDescription?.trim(),
      varianceNote,
    ].filter(Boolean).join(' ')

    await prisma.transaction.update({
      where: { id: projected.id },
      data: {
        periodId: imported.periodId,
        date: imported.date,
        description: imported.description,
        subDescription: imported.subDescription || undefined,
        amount: imported.amount,
        category: 'Income',
        status: 'posted',
        source: 'import',
        importBatchId: imported.importBatchId,
        externalId: imported.externalId || undefined,
        sourceImportHash: imported.sourceImportHash || undefined,
        userDescription: combinedNote || undefined,
      },
    })

    await prisma.transaction.delete({
      where: { id: imported.id },
    })

    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    console.error('Error merging income match:', error)
    return { success: false, error: error.message }
  }
}

export async function getRecurringMatchCandidates(
  projectedId: string
): Promise<{
  projectedAmount: number
  tolerance: number
  candidates: Array<{
    id: string
    date: string
    description: string
    subDescription?: string | null
    amount: number
    category: string
    status: string
    source: string
    amountDiff: number
    dateDiffDays: number
    withinTolerance: boolean
  }>
}> {
  const user = await getCurrentUser()
  const projected = await prisma.transaction.findFirst({
    where: { id: projectedId, period: { userId: user.id } },
    include: {
      period: { select: { userId: true } },
      recurringDefinition: true,
    },
  })

  if (!projected) {
    throw new Error('Transaction not found')
  }

  if (projected.status !== 'projected' || projected.source !== 'recurring') {
    throw new Error('Only projected recurring transactions can be matched.')
  }

  if (!projected.recurringDefinition) {
    throw new Error('Recurring definition not found for this transaction.')
  }

  const projectedExpense = getExpenseAmount(projected)
  if (projectedExpense === 0) {
    return { projectedAmount: 0, tolerance: 0, candidates: [] }
  }

  const projectedAmount = roundCurrency(Math.abs(projectedExpense))
  const tolerance = roundCurrency(projectedAmount * RECURRING_MATCH_PERCENT)
  const targetDate = projected.date
  const windowStart = new Date(targetDate.getTime() - RECURRING_MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const windowEnd = new Date(targetDate.getTime() + RECURRING_MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const normalizedMerchant = normalizeDescription(projected.recurringDefinition.merchantLabel)

  const candidates = await prisma.transaction.findMany({
    where: {
      periodId: projected.periodId,
      period: { userId: projected.period.userId },
      id: { not: projectedId },
      status: 'posted',
      isIgnored: false,
      recurringDefinitionId: null,
      source: { not: 'recurring' },
      date: { gte: windowStart, lte: windowEnd },
    },
    include: {
      importBatch: { include: { account: true } },
    },
    orderBy: { date: 'desc' },
    take: 200,
  })

  const scored = candidates
    .map(candidate => {
      const candidateExpense = getExpenseAmount(candidate)
      if (candidateExpense === 0) return null
      if (Math.sign(candidateExpense) !== Math.sign(projectedExpense)) return null

      const candidateAmount = roundCurrency(Math.abs(candidateExpense))
      const amountDiff = roundCurrency(Math.abs(candidateAmount - projectedAmount))
      const dateDiffDays = Math.abs(candidate.date.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)
      const withinTolerance = amountDiff <= tolerance
      const normalizedCandidate = normalizeDescription(
        buildCompositeDescription(candidate.description, candidate.subDescription)
      )
      const descriptionMatch = normalizedMerchant && normalizedCandidate
        ? normalizedCandidate.includes(normalizedMerchant)
        : false
      const score = amountDiff * 10 + dateDiffDays + (descriptionMatch ? 0 : 25)

      return {
        id: candidate.id,
        date: candidate.date.toISOString().split('T')[0],
        description: candidate.description,
        subDescription: candidate.subDescription,
        amount: candidate.amount,
        category: candidate.category,
        status: candidate.status,
        source: candidate.source,
        amountDiff,
        dateDiffDays,
        withinTolerance,
        score,
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a!.withinTolerance !== b!.withinTolerance) {
        return a!.withinTolerance ? -1 : 1
      }
      if (a!.score !== b!.score) return a!.score - b!.score
      return a!.dateDiffDays - b!.dateDiffDays
    })
    .slice(0, 40)
    .map(item => {
      const { score, ...rest } = item!
      return rest
    })

  return {
    projectedAmount,
    tolerance: roundCurrency(tolerance),
    candidates: scored,
  }
}

export async function mergeRecurringMatch(
  projectedId: string,
  candidateId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    const transactions = await prisma.transaction.findMany({
      where: { id: { in: [projectedId, candidateId] }, period: { userId: user.id } },
      include: {
        period: { select: { userId: true } },
        importBatch: { include: { account: true } },
        recurringDefinition: true,
      },
    })

    if (transactions.length !== 2) {
      return { success: false, error: 'Transactions not found' }
    }

    const projected = transactions.find(tx => tx.id === projectedId)!
    const candidate = transactions.find(tx => tx.id === candidateId)!

    if (projected.period.userId !== candidate.period.userId) {
      return { success: false, error: 'Transactions belong to different users' }
    }

    if (projected.status !== 'projected' || projected.source !== 'recurring') {
      return { success: false, error: 'Projected recurring transaction not found' }
    }

    if (!projected.recurringDefinition) {
      return { success: false, error: 'Recurring definition missing for projected transaction' }
    }

    if (projected.periodId !== candidate.periodId) {
      return { success: false, error: 'Transactions must be in the same period' }
    }

    if (candidate.status !== 'posted' || candidate.isIgnored) {
      return { success: false, error: 'Candidate transaction must be a posted, non-ignored transaction' }
    }

    if (candidate.source === 'recurring') {
      return { success: false, error: 'Candidate transaction is already recurring' }
    }

    if (candidate.recurringDefinitionId) {
      return { success: false, error: 'Candidate transaction is already linked to a recurring definition' }
    }

    const projectedExpense = getExpenseAmount(projected)
    const candidateExpense = getExpenseAmount(candidate)
    if (projectedExpense === 0 || candidateExpense === 0 || Math.sign(projectedExpense) !== Math.sign(candidateExpense)) {
      return { success: false, error: 'Transactions must have the same direction to match' }
    }

    const projectedAmount = roundCurrency(Math.abs(projectedExpense))
    const actualAmount = roundCurrency(Math.abs(candidateExpense))
    const varianceNote = projectedAmount !== actualAmount
      ? `Projected ${projectedAmount.toFixed(2)}; actual ${actualAmount.toFixed(2)}.`
      : ''
    const combinedNote = [
      projected.userDescription?.trim(),
      candidate.userDescription?.trim(),
      varianceNote,
    ].filter(Boolean).join(' ')

    const isImport = candidate.source === 'import'
    const category = projected.recurringDefinition.category || projected.category

    await prisma.transaction.update({
      where: { id: projected.id },
      data: {
        periodId: candidate.periodId,
        date: candidate.date,
        description: candidate.description,
        subDescription: candidate.subDescription || undefined,
        amount: candidate.amount,
        category,
        status: 'posted',
        source: candidate.source,
        importBatchId: isImport ? candidate.importBatchId : null,
        externalId: isImport ? (candidate.externalId ?? null) : null,
        sourceImportHash: isImport ? (candidate.sourceImportHash ?? null) : null,
        userDescription: combinedNote || undefined,
        isRecurringInstance: true,
        recurringDefinitionId: projected.recurringDefinitionId,
      },
    })

    await prisma.transaction.delete({
      where: { id: candidate.id },
    })

    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    console.error('Error merging recurring match:', error)
    return { success: false, error: error.message }
  }
}

export async function getTransactionLinkCandidates(
  transactionId: string,
  type: 'refund' | 'reimbursement'
): Promise<Array<{
  id: string
  date: string
  description: string
  subDescription?: string | null
  amount: number
  category: string
  status: string
  source: string
  amountDelta: number
  dateDiffDays: number
  score: number
  linkedAmount: number
  remainingAmount: number
}>> {
  const user = await getCurrentUser()
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, period: { userId: user.id } },
    include: {
      period: { select: { userId: true } },
      importBatch: { include: { account: true } },
      linksFrom: true,
      linksTo: true,
    },
  })

  if (!transaction) {
    throw new Error('Transaction not found')
  }

  const userId = transaction.period.userId
  const targetExpense = getExpenseAmount(transaction)
  if (targetExpense === 0) return []

  const targetIsCredit = targetExpense < 0
  const targetDate = transaction.date
  const windowStart = new Date(targetDate.getTime() - LINK_MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const windowEnd = new Date(targetDate.getTime() + LINK_MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const linkedIds = new Set<string>()
  for (const link of transaction.linksFrom) {
    if (link.type === type) linkedIds.add(link.toTransactionId)
  }
  for (const link of transaction.linksTo) {
    if (link.type === type) linkedIds.add(link.fromTransactionId)
  }

  const candidates = await prisma.transaction.findMany({
    where: {
      period: { userId },
      id: { not: transactionId },
      status: 'posted',
      isIgnored: false,
      date: { gte: windowStart, lte: windowEnd },
    },
    include: {
      importBatch: { include: { account: true } },
      linksFrom: { where: { type } },
      linksTo: { where: { type } },
    },
  })

  const normalizedTarget = normalizeDescription(
    buildCompositeDescription(transaction.description, transaction.subDescription)
  )

  const scored = candidates
    .filter(candidate => !linkedIds.has(candidate.id))
    .map(candidate => {
      const candidateExpense = getExpenseAmount(candidate)
      if (candidateExpense === 0) return null
      if (targetIsCredit === (candidateExpense < 0)) return null
      const candidateLinks = candidateExpense < 0 ? candidate.linksFrom : candidate.linksTo
      const linkedAmount = roundCurrency(
        candidateLinks.reduce((sum, link) => sum + (link.amount || 0), 0)
      )
      const remainingAmount = roundCurrency(Math.max(0, Math.abs(candidateExpense) - linkedAmount))
      if (remainingAmount <= 0) return null

      const amountDelta = Math.abs(Math.abs(targetExpense) - Math.abs(candidateExpense))
      const dateDiffDays = Math.abs(candidate.date.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)
      const normalizedCandidate = normalizeDescription(
        buildCompositeDescription(candidate.description, candidate.subDescription)
      )
      const descriptionMatch = normalizedTarget && normalizedCandidate
        ? normalizedTarget.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedTarget)
        : false
      const score = amountDelta * 10 + dateDiffDays + (descriptionMatch ? 0 : 30)

      return {
        id: candidate.id,
        date: candidate.date.toISOString().split('T')[0],
        description: candidate.description,
        subDescription: candidate.subDescription,
        amount: candidate.amount,
        category: candidate.category,
        status: candidate.status,
        source: candidate.source,
        amountDelta,
        dateDiffDays,
        score,
        linkedAmount,
        remainingAmount,
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a!.score - b!.score))
    .slice(0, LINK_MAX_CANDIDATES)
    .map(item => item!)

  return scored
}

export async function searchTransactionLinkCandidates(
  transactionId: string,
  type: 'refund' | 'reimbursement',
  query: string
): Promise<Array<{
  id: string
  date: string
  description: string
  subDescription?: string | null
  amount: number
  category: string
  status: string
  source: string
  amountDelta: number
  dateDiffDays: number
  score: number
  linkedAmount: number
  remainingAmount: number
}>> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const user = await getCurrentUser()
  const transaction = await prisma.transaction.findFirst({
    where: { id: transactionId, period: { userId: user.id } },
    include: {
      period: { select: { userId: true } },
      importBatch: { include: { account: true } },
      linksFrom: true,
      linksTo: true,
    },
  })

  if (!transaction) {
    throw new Error('Transaction not found')
  }

  const userId = transaction.period.userId
  const targetExpense = getExpenseAmount(transaction)
  if (targetExpense === 0) return []
  const targetIsCredit = targetExpense < 0
  const targetDate = transaction.date

  const linkedIds = new Set<string>()
  for (const link of transaction.linksFrom) {
    if (link.type === type) linkedIds.add(link.toTransactionId)
  }
  for (const link of transaction.linksTo) {
    if (link.type === type) linkedIds.add(link.fromTransactionId)
  }

  const numericQuery = Math.abs(parseCurrency(trimmed))
  const hasNumeric = /[0-9]/.test(trimmed) && numericQuery > 0
  if (trimmed.length < 2 && !hasNumeric) return []

  const orFilters: any[] = []
  if (trimmed.length >= 2) {
    orFilters.push(
      { description: { contains: trimmed, mode: 'insensitive' } },
      { subDescription: { contains: trimmed, mode: 'insensitive' } },
      { userDescription: { contains: trimmed, mode: 'insensitive' } }
    )
  }
  if (hasNumeric) {
    const lower = numericQuery - 0.01
    const upper = numericQuery + 0.01
    orFilters.push(
      { amount: { gte: lower, lte: upper } },
      { amount: { gte: -upper, lte: -lower } }
    )
  }

  const candidates = await prisma.transaction.findMany({
    where: {
      period: { userId },
      id: { not: transactionId },
      status: 'posted',
      isIgnored: false,
      ...(orFilters.length > 0 ? { OR: orFilters } : {}),
    },
    include: {
      importBatch: { include: { account: true } },
      linksFrom: { where: { type } },
      linksTo: { where: { type } },
    },
    take: 200,
    orderBy: { date: 'desc' },
  })

  const normalizedQuery = normalizeDescription(trimmed)

  const scored = candidates
    .filter(candidate => !linkedIds.has(candidate.id))
    .map(candidate => {
      const candidateExpense = getExpenseAmount(candidate)
      if (candidateExpense === 0) return null
      if (targetIsCredit === (candidateExpense < 0)) return null

      const candidateLinks = candidateExpense < 0 ? candidate.linksFrom : candidate.linksTo
      const linkedAmount = roundCurrency(
        candidateLinks.reduce((sum, link) => sum + (link.amount || 0), 0)
      )
      const remainingAmount = roundCurrency(Math.max(0, Math.abs(candidateExpense) - linkedAmount))
      if (remainingAmount <= 0) return null

      const amountDelta = Math.abs(Math.abs(targetExpense) - Math.abs(candidateExpense))
      const amountDeltaForScore = hasNumeric
        ? Math.abs(Math.abs(candidateExpense) - numericQuery)
        : amountDelta
      const dateDiffDays = Math.abs(candidate.date.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)
      const normalizedCandidate = normalizeDescription(
        buildCompositeDescription(candidate.description, candidate.subDescription)
      )
      const textMatch = normalizedQuery && normalizedCandidate
        ? normalizedCandidate.includes(normalizedQuery)
        : false
      const score = amountDeltaForScore * 10 + dateDiffDays + (textMatch ? 0 : 20)

      return {
        id: candidate.id,
        date: candidate.date.toISOString().split('T')[0],
        description: candidate.description,
        subDescription: candidate.subDescription,
        amount: candidate.amount,
        category: candidate.category,
        status: candidate.status,
        source: candidate.source,
        amountDelta,
        dateDiffDays,
        score,
        linkedAmount,
        remainingAmount,
      }
    })
    .filter(Boolean)
    .sort((a, b) => (a!.score - b!.score))
    .slice(0, 50)
    .map(item => item!)

  return scored
}

export async function createTransactionLink(
  primaryTransactionId: string,
  candidateTransactionId: string,
  type: 'refund' | 'reimbursement',
  amount?: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    const transactions = await prisma.transaction.findMany({
      where: {
        id: { in: [primaryTransactionId, candidateTransactionId] },
        period: { userId: user.id },
      },
      include: {
        period: { select: { userId: true } },
        importBatch: { include: { account: true } },
        linksFrom: { where: { type } },
        linksTo: { where: { type } },
      },
    })

    if (transactions.length !== 2) {
      return { success: false, error: 'Transactions not found' }
    }

    const [first, second] = transactions
    if (first.period.userId !== second.period.userId) {
      return { success: false, error: 'Transactions belong to different users' }
    }

    if (first.isIgnored || second.isIgnored) {
      return { success: false, error: 'Ignored transactions cannot be linked' }
    }

    const firstRemaining = getRemainingLinkAmount(first, type)
    const secondRemaining = getRemainingLinkAmount(second, type)
    const firstExpense = firstRemaining.expenseAmount
    const secondExpense = secondRemaining.expenseAmount

    if (firstExpense === 0 || secondExpense === 0 || firstExpense * secondExpense > 0) {
      return { success: false, error: 'Transactions must have opposite signs to link' }
    }

    const credit = firstExpense < 0 ? first : second
    const expense = firstExpense < 0 ? second : first
    const creditRemaining = firstExpense < 0 ? firstRemaining.remainingAmount : secondRemaining.remainingAmount
    const expenseRemaining = firstExpense < 0 ? secondRemaining.remainingAmount : firstRemaining.remainingAmount
    const suggestedAmount = Math.min(creditRemaining, expenseRemaining)
    const requestedAmount = amount !== undefined
      ? (Number.isFinite(amount) ? roundCurrency(amount) : NaN)
      : suggestedAmount

    if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
      return { success: false, error: 'Link amount must be greater than zero.' }
    }

    if (requestedAmount > creditRemaining + 0.01 || requestedAmount > expenseRemaining + 0.01) {
      return { success: false, error: 'Link amount exceeds remaining available balance.' }
    }

    await prisma.transactionLink.create({
      data: {
        type,
        fromTransactionId: credit.id,
        toTransactionId: expense.id,
        amount: requestedAmount,
      },
    })

    if (
      expense.category
      && expense.category !== credit.category
      && expense.category !== 'Income'
      && expense.category !== 'Uncategorized'
    ) {
      await prisma.transaction.update({
        where: { id: credit.id },
        data: { category: expense.category },
      })
    }

    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return { success: false, error: 'These transactions are already linked.' }
    }
    console.error('Error creating transaction link:', error)
    return { success: false, error: error.message }
  }
}

export async function removeTransactionLink(
  linkId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getCurrentUser()
    const link = await prisma.transactionLink.findFirst({
      where: {
        id: linkId,
        fromTransaction: { period: { userId: user.id } },
      },
      select: { id: true },
    })

    if (!link) {
      return { success: false, error: 'Link not found' }
    }

    await prisma.transactionLink.delete({
      where: { id: link.id },
    })
    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    console.error('Error removing transaction link:', error)
    return { success: false, error: error.message }
  }
}
