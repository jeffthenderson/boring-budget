'use server'

import { prisma } from '@/lib/db'
import { getOrCreateUser } from './user'
import { revalidatePath } from 'next/cache'
import { getProjectedDates, parseSchedulingRule, type SchedulingRule } from '@/lib/utils/scheduling'

export async function createRecurringDefinition(data: {
  category: string
  merchantLabel: string
  nominalAmount: number
  frequency: string
  schedulingRule: SchedulingRule
}) {
  const user = await getOrCreateUser()

  const definition = await prisma.recurringDefinition.create({
    data: {
      userId: user.id,
      category: data.category,
      merchantLabel: data.merchantLabel,
      nominalAmount: data.nominalAmount,
      frequency: data.frequency,
      schedulingRule: JSON.stringify(data.schedulingRule),
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
  nominalAmount?: number
  frequency?: string
  schedulingRule?: SchedulingRule
  active?: boolean
}) {
  const definition = await prisma.recurringDefinition.update({
    where: { id },
    data: {
      ...data,
      schedulingRule: data.schedulingRule ? JSON.stringify(data.schedulingRule) : undefined,
    },
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

  for (const date of dates) {
    await prisma.transaction.create({
      data: {
        periodId,
        recurringDefinitionId: definitionId,
        date,
        description: definition.merchantLabel,
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
