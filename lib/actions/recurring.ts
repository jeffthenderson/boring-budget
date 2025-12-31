'use server'

import { prisma } from '@/lib/db'
import { getOrCreateUser } from './user'
import { revalidatePath } from 'next/cache'
import { normalizeDescription, buildCompositeDescription } from '@/lib/utils/import/normalizer'
import {
  getBestRecurringMatch,
  matchAgainstDefinitions,
  type ProjectedTransaction,
  type RecurringDefinition as MatcherDefinition,
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
  const user = await getOrCreateUser()
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
    await generateProjectedTransactionsForDefinition(definition.id, period.id, period.year, period.month)
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

  const definition = await prisma.recurringDefinition.update({
    where: { id },
    data: updateData,
  })

  await prisma.transaction.deleteMany({
    where: {
      recurringDefinitionId: id,
      status: 'projected',
    },
  })

  if (definition.active) {
    const openPeriods = await prisma.budgetPeriod.findMany({
      where: {
        user: {
          recurringDefinitions: {
            some: { id },
          },
        },
        status: 'open',
      },
    })

    for (const period of openPeriods) {
      await generateProjectedTransactionsForDefinition(id, period.id, period.year, period.month)
    }
  }

  revalidatePath('/')
  return definition
}

export async function deleteRecurringDefinition(id: string) {
  await prisma.transaction.deleteMany({
    where: { recurringDefinitionId: id },
  })

  await prisma.recurringDefinition.delete({
    where: { id },
  })

  revalidatePath('/')
  return { success: true }
}

export async function generateProjectedTransactions(periodId: string, year: number, month: number) {
  const period = await prisma.budgetPeriod.findUnique({
    where: { id: periodId },
    include: { user: { include: { recurringDefinitions: true } } },
  })

  if (!period) return

  const definitions = period.user.recurringDefinitions.filter(d => d.active)

  for (const definition of definitions) {
    await generateProjectedTransactionsForDefinition(definition.id, periodId, year, month)
  }
}

async function generateProjectedTransactionsForDefinition(
  definitionId: string,
  periodId: string,
  year: number,
  month: number
) {
  const definition = await prisma.recurringDefinition.findUnique({
    where: { id: definitionId },
  })

  if (!definition || !definition.active) return

  const rule = parseSchedulingRule(definition.schedulingRule)
  const dates = getProjectedDates(rule, year, month)

  const description = definition.displayLabel || definition.merchantLabel

  for (const date of dates) {
    await prisma.transaction.create({
      data: {
        periodId,
        recurringDefinitionId: definitionId,
        date,
        description,
        amount: definition.nominalAmount,
        category: definition.category,
        status: 'projected',
        source: 'recurring',
        isRecurringInstance: true,
      },
    })
  }
}

export async function getAllRecurringDefinitions() {
  const user = await getOrCreateUser()

  return prisma.recurringDefinition.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
  })
}

export async function matchExistingImportsForPeriod(
  periodId: string,
  options?: {
    definitionIds?: string[]
    revalidate?: boolean
  }
) {
  const period = await prisma.budgetPeriod.findUnique({
    where: { id: periodId },
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

  const matcherDefinitions: MatcherDefinition[] = filteredDefinitions.map(def => ({
    id: def.id,
    merchantLabel: def.merchantLabel,
    nominalAmount: def.nominalAmount,
    category: def.category,
  }))

  const definitionsById = new Map(filteredDefinitions.map(def => [def.id, def]))

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

  const importTransactions = period.transactions.filter(tx => (
    tx.source === 'import'
    && !tx.recurringDefinitionId
    && tx.category === 'Uncategorized'
    && !tx.isIgnored
  ))

  let matched = 0

  for (const transaction of importTransactions) {
    const accountType = transaction.importBatch?.account?.type
    if (!accountType) continue

    const expenseAmount = accountType === 'credit_card'
      ? transaction.amount
      : -transaction.amount
    if (expenseAmount <= 0) continue

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
      normalizedAmount: expenseAmount,
      normalizedDescription: normalized,
      parsedDescription: rawDescription,
    }

    let match = getBestRecurringMatch(importedRow, projectedTransactions, matcherDefinitions)
    if (!match) {
      match = matchAgainstDefinitions(importedRow, matcherDefinitions, period.year, period.month)
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

  if (options?.revalidate !== false) {
    revalidatePath('/')
  }
  return { matched }
}

export async function matchExistingImportsForOpenPeriods(definitionIds?: string[]) {
  const user = await getOrCreateUser()

  const openPeriods = await prisma.budgetPeriod.findMany({
    where: {
      userId: user.id,
      status: 'open',
    },
    select: { id: true },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  })

  let matched = 0

  for (const period of openPeriods) {
    const result = await matchExistingImportsForPeriod(period.id, {
      definitionIds,
      revalidate: false,
    })
    matched += result.matched
  }

  revalidatePath('/')
  return { matched, periodsChecked: openPeriods.length }
}
