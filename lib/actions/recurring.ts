'use server'

import { prisma } from '@/lib/db'
import { getCurrentUser } from './user'
import { revalidatePath } from 'next/cache'
import { normalizeDescription, buildCompositeDescription } from '@/lib/utils/import/normalizer'
import { getExpenseAmount } from '@/lib/utils/transaction-amounts'
import { isRecurringCategory } from '@/lib/constants/categories'
import {
  findClosestProjectedTransaction,
  getBestRecurringMatch,
  matchAgainstDefinitions,
  type ProjectedTransaction,
} from '@/lib/utils/import/recurring-matcher'
import { getProjectedDates, parseSchedulingRule, type SchedulingRule } from '@/lib/utils/scheduling'

export async function createRecurringDefinition(data: {
  category: string
  merchantLabel: string
  displayLabel?: string
  nominalAmount: number
  frequency: string
  schedulingRule: SchedulingRule | string
}) {
  const user = await getCurrentUser()
  const merchantLabel = data.merchantLabel.trim()
  const displayLabel = (data.displayLabel ?? '').trim() || merchantLabel
  const schedulingRule = typeof data.schedulingRule === 'string'
    ? data.schedulingRule
    : JSON.stringify(data.schedulingRule)

  const definition = await prisma.recurringDefinition.create({
    data: {
      userId: user.id,
      category: data.category,
      merchantLabel,
      displayLabel,
      nominalAmount: data.nominalAmount,
      frequency: data.frequency,
      schedulingRule,
      active: true,
    },
  })

  const openPeriods = await prisma.budgetPeriod.findMany({
    where: {
      userId: user.id,
      status: 'open',
    },
  })

  for (const period of openPeriods) {
    await generateProjectedTransactionsForDefinition(user.id, definition.id, period.id, period.year, period.month)
  }

  revalidatePath('/')
  return definition
}

export async function updateRecurringDefinition(id: string, data: {
  category?: string
  merchantLabel?: string
  displayLabel?: string
  nominalAmount?: number
  frequency?: string
  schedulingRule?: SchedulingRule | string
  active?: boolean
}) {
  const schedulingRule = data.schedulingRule
    ? (typeof data.schedulingRule === 'string'
        ? data.schedulingRule
        : JSON.stringify(data.schedulingRule))
    : undefined

  const updateData: {
    category?: string
    merchantLabel?: string
    displayLabel?: string | null
    nominalAmount?: number
    frequency?: string
    schedulingRule?: string
    active?: boolean
  } = {
    ...data,
    schedulingRule,
  }

  if (data.merchantLabel !== undefined) {
    updateData.merchantLabel = data.merchantLabel.trim()
  }

  if (data.displayLabel !== undefined) {
    const trimmed = data.displayLabel.trim()
    updateData.displayLabel = trimmed ? trimmed : null
  }

  const user = await getCurrentUser()
  const existing = await prisma.recurringDefinition.findFirst({
    where: { id, userId: user.id },
  })

  if (!existing) {
    throw new Error('Recurring definition not found')
  }

  const definition = await prisma.recurringDefinition.update({
    where: { id: existing.id },
    data: updateData,
  })

  await prisma.transaction.deleteMany({
    where: {
      recurringDefinitionId: id,
      status: 'projected',
      period: { userId: user.id },
    },
  })

  if (definition.active) {
    const openPeriods = await prisma.budgetPeriod.findMany({
      where: {
        userId: user.id,
        status: 'open',
      },
    })

    for (const period of openPeriods) {
      await generateProjectedTransactionsForDefinition(user.id, id, period.id, period.year, period.month)
    }
  }

  revalidatePath('/')
  return definition
}

export async function deleteRecurringDefinition(id: string) {
  const user = await getCurrentUser()
  const definition = await prisma.recurringDefinition.findFirst({
    where: { id, userId: user.id },
  })

  if (!definition) {
    throw new Error('Recurring definition not found')
  }

  await prisma.transaction.updateMany({
    where: {
      recurringDefinitionId: definition.id,
      period: { userId: user.id },
      status: { not: 'projected' },
    },
    data: {
      recurringDefinitionId: null,
      isRecurringInstance: false,
    },
  })

  await prisma.transaction.deleteMany({
    where: {
      recurringDefinitionId: definition.id,
      period: { userId: user.id },
      status: 'projected',
      source: 'recurring',
    },
  })

  await prisma.recurringDefinition.delete({
    where: { id: definition.id },
  })

  revalidatePath('/')
  return { success: true }
}

export async function generateProjectedTransactions(periodId: string, year: number, month: number) {
  const user = await getCurrentUser()
  const period = await prisma.budgetPeriod.findFirst({
    where: { id: periodId, userId: user.id },
    include: { user: { include: { recurringDefinitions: true } } },
  })

  if (!period) return

  const definitions = period.user.recurringDefinitions.filter(d => d.active)

  for (const definition of definitions) {
    await generateProjectedTransactionsForDefinition(user.id, definition.id, periodId, year, month)
  }
}

async function generateProjectedTransactionsForDefinition(
  userId: string,
  definitionId: string,
  periodId: string,
  year: number,
  month: number
) {
  const definition = await prisma.recurringDefinition.findFirst({
    where: { id: definitionId, userId },
  })

  if (!definition || !definition.active) return

  const rule = parseSchedulingRule(definition.schedulingRule)
  const dates = getProjectedDates(rule, year, month)

  const description = definition.displayLabel || definition.merchantLabel
  const amount = definition.category === 'Income'
    ? -Math.abs(definition.nominalAmount)
    : definition.nominalAmount

  const existing = await prisma.transaction.findMany({
    where: {
      periodId,
      recurringDefinitionId: definitionId,
    },
    select: { date: true, status: true },
  })

  const existingProjectedDates = new Set<string>()
  const existingPostedDates = new Set<string>()
  for (const tx of existing) {
    const dateKey = tx.date.toISOString().split('T')[0]
    if (tx.status === 'projected') {
      existingProjectedDates.add(dateKey)
    } else {
      existingPostedDates.add(dateKey)
    }
  }

  for (const date of dates) {
    const dateKey = date.toISOString().split('T')[0]
    if (existingProjectedDates.has(dateKey) || existingPostedDates.has(dateKey)) continue
    await prisma.transaction.create({
      data: {
        periodId,
        recurringDefinitionId: definitionId,
        date,
        description,
        amount,
        category: definition.category,
        status: 'projected',
        source: 'recurring',
        isRecurringInstance: true,
      },
    })
  }
}

export async function getAllRecurringDefinitions() {
  const user = await getCurrentUser()

  return prisma.recurringDefinition.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
  })
}

export async function matchExistingImportsForPeriodByUser(
  userId: string,
  periodId: string,
  options?: {
    definitionIds?: string[]
    revalidate?: boolean
  }
) {
  const period = await prisma.budgetPeriod.findFirst({
    where: { id: periodId, userId },
    include: {
      user: { include: { recurringDefinitions: true } },
      transactions: {
        include: {
          importBatch: {
            include: { account: true },
          },
        },
      },
    },
  })

  if (!period) {
    throw new Error('Period not found')
  }

  const activeDefinitions = period.user.recurringDefinitions.filter(def => def.active)
  const filteredDefinitions = options?.definitionIds?.length
    ? activeDefinitions.filter(def => options.definitionIds!.includes(def.id))
    : activeDefinitions

  if (filteredDefinitions.length === 0) {
    return { matched: 0 }
  }

  const incomeDefinitions = filteredDefinitions.filter(def => def.category === 'Income')
  const expenseDefinitions = filteredDefinitions.filter(def => def.category !== 'Income')

  const definitionsById = new Map(filteredDefinitions.map(def => [def.id, def]))
  const incomeDefinitionIds = new Set(incomeDefinitions.map(def => def.id))
  const expenseDefinitionIds = new Set(expenseDefinitions.map(def => def.id))

  const projectedTransactions: ProjectedTransaction[] = period.transactions
    .filter(tx => tx.status === 'projected' && tx.source === 'recurring' && tx.recurringDefinitionId)
    .filter(tx => definitionsById.has(tx.recurringDefinitionId as string))
    .map(tx => ({
      id: tx.id,
      recurringDefinitionId: tx.recurringDefinitionId as string,
      date: tx.date,
      amount: tx.amount,
      description: tx.description,
    }))

  const projectedIncome = projectedTransactions.filter(tx => incomeDefinitionIds.has(tx.recurringDefinitionId))
  const projectedExpenses = projectedTransactions.filter(tx => expenseDefinitionIds.has(tx.recurringDefinitionId))

  const importTransactions = period.transactions.filter(tx => (
    tx.source === 'import'
    && !tx.recurringDefinitionId
    && (tx.category === 'Uncategorized' || isRecurringCategory(tx.category))
    && !tx.isIgnored
  ))

  let matched = 0

  for (const transaction of importTransactions) {
    const expenseAmount = getExpenseAmount(transaction)
    const isIncome = expenseAmount < 0 && transaction.importBatch?.account?.type === 'bank'
    if (expenseAmount === 0) continue

    const definitionsForMatch = isIncome ? incomeDefinitions : expenseDefinitions
    if (definitionsForMatch.length === 0) continue
    const projectedForMatch = isIncome ? projectedIncome : projectedExpenses

    const rawDescription = (transaction.description || '').trim()
    const compositeDescription = buildCompositeDescription(
      rawDescription,
      transaction.subDescription
    )
    const normalized = normalizeDescription(compositeDescription)
    if (!normalized) continue

    const importedRow = {
      id: transaction.id,
      parsedDate: transaction.date,
      normalizedAmount: isIncome ? -Math.abs(expenseAmount) : expenseAmount,
      normalizedDescription: normalized,
      parsedDescription: rawDescription,
    }

    let match = getBestRecurringMatch(importedRow, projectedForMatch, definitionsForMatch)
    if (!match && !isIncome) {
      match = matchAgainstDefinitions(importedRow, definitionsForMatch, period.year, period.month)
    }
    if (!match) continue

    const definition = definitionsById.get(match.definitionId)
    if (!definition) continue

    const projectedPlaceholder = await prisma.transaction.findFirst({
      where: {
        periodId: period.id,
        recurringDefinitionId: definition.id,
        status: 'projected',
        source: 'recurring',
      },
    })

    if (projectedPlaceholder) {
      await prisma.transaction.delete({
        where: { id: projectedPlaceholder.id },
      })
    }

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        category: definition.category,
        isRecurringInstance: true,
        recurringDefinitionId: definition.id,
        status: 'posted',
      },
    })

    matched++
  }

  const postedRecurring = await prisma.transaction.findMany({
    where: {
      periodId: period.id,
      recurringDefinitionId: { not: null },
      status: { not: 'projected' },
    },
    select: { id: true, recurringDefinitionId: true, date: true, amount: true },
  })

  if (postedRecurring.length > 0) {
    const placeholderRows = await prisma.transaction.findMany({
      where: {
        periodId: period.id,
        recurringDefinitionId: { not: null },
        status: 'projected',
        source: 'recurring',
      },
      select: { id: true, recurringDefinitionId: true, date: true, amount: true, description: true },
    })
    let remainingPlaceholders: ProjectedTransaction[] = placeholderRows.map(row => ({
      ...row,
      recurringDefinitionId: row.recurringDefinitionId as string,
    }))

    const placeholdersToDelete = new Set<string>()
    for (const posted of postedRecurring) {
      const definitionId = posted.recurringDefinitionId
      if (!definitionId) continue
      const closest = findClosestProjectedTransaction(
        remainingPlaceholders,
        definitionId,
        posted.date,
        posted.amount
      )
      if (!closest) continue
      placeholdersToDelete.add(closest.id)
      remainingPlaceholders = remainingPlaceholders.filter(item => item.id !== closest.id)
    }

    if (placeholdersToDelete.size > 0) {
      await prisma.transaction.deleteMany({
        where: { id: { in: Array.from(placeholdersToDelete) } },
      })
    }
  }

  if (options?.revalidate !== false) {
    revalidatePath('/')
  }
  return { matched }
}

export async function matchExistingImportsForPeriod(
  periodId: string,
  options?: {
    definitionIds?: string[]
    revalidate?: boolean
  }
) {
  const user = await getCurrentUser()
  return matchExistingImportsForPeriodByUser(user.id, periodId, options)
}

export async function matchExistingImportsForOpenPeriods(definitionIds?: string[]) {
  const user = await getCurrentUser()
  return matchExistingImportsForOpenPeriodsByUser(user.id, definitionIds)
}

export async function matchExistingImportsForOpenPeriodsByUser(
  userId: string,
  definitionIds?: string[]
) {
  const openPeriods = await prisma.budgetPeriod.findMany({
    where: {
      userId,
      status: 'open',
    },
    select: { id: true },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  })

  let matched = 0

  for (const period of openPeriods) {
    const result = await matchExistingImportsForPeriodByUser(userId, period.id, {
      definitionIds,
      revalidate: false,
    })
    matched += result.matched
  }

  revalidatePath('/')
  return { matched, periodsChecked: openPeriods.length }
}
