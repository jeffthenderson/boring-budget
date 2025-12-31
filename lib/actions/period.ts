'use server'

import { prisma } from '@/lib/db'
import { getOrCreateUser } from './user'
import { revalidatePath } from 'next/cache'
import { CATEGORIES, RECURRING_CATEGORIES } from '@/lib/constants/categories'
import { roundCurrency } from '@/lib/utils/currency'
import { generateProjectedTransactions } from './recurring'

export async function getCurrentOrCreatePeriod(year?: number, month?: number) {
  const user = await getOrCreateUser()

  const now = new Date()
  const targetYear = year ?? now.getFullYear()
  const targetMonth = month ?? now.getMonth() + 1

  let period = await prisma.budgetPeriod.findUnique({
    where: {
      userId_year_month: {
        userId: user.id,
        year: targetYear,
        month: targetMonth,
      },
    },
    include: {
      incomeItems: true,
      categoryBudgets: true,
      user: {
        include: {
          recurringDefinitions: {
            where: { active: true },
          },
        },
      },
      transactions: {
        include: {
          recurringDefinition: true,
          importBatch: {
            include: { account: true },
          },
        },
      },
    },
  })

  if (!period) {
    period = await createPeriod(targetYear, targetMonth)
  }

  return period
}

export async function createPeriod(year: number, month: number) {
  const user = await getOrCreateUser()

  const period = await prisma.budgetPeriod.create({
    data: {
      userId: user.id,
      year,
      month,
      status: 'open',
      categoryBudgets: {
        create: CATEGORIES.map(category => ({
          category,
          amountBudgeted: 0,
        })),
      },
    },
    include: {
      incomeItems: true,
      categoryBudgets: true,
      user: {
        include: {
          recurringDefinitions: {
            where: { active: true },
          },
        },
      },
      transactions: {
        include: {
          recurringDefinition: true,
          importBatch: {
            include: { account: true },
          },
        },
      },
    },
  })

  await generateProjectedTransactions(period.id, year, month)
  return period
}

export async function togglePeriodLock(periodId: string) {
  const period = await prisma.budgetPeriod.findUnique({
    where: { id: periodId },
  })

  if (!period) {
    throw new Error('Period not found')
  }

  const updated = await prisma.budgetPeriod.update({
    where: { id: periodId },
    data: {
      status: period.status === 'open' ? 'locked' : 'open',
    },
  })

  revalidatePath('/')
  return updated
}

export async function addIncomeItem(periodId: string, data: {
  date: Date
  source: string
  amount: number
}) {
  const item = await prisma.incomeItem.create({
    data: {
      periodId,
      ...data,
    },
  })

  revalidatePath('/')
  return item
}

export async function deleteIncomeItem(id: string) {
  await prisma.incomeItem.delete({
    where: { id },
  })

  revalidatePath('/')
  return { success: true }
}

export async function updateCategoryBudget(periodId: string, category: string, amount: number) {
  const budget = await prisma.categoryBudget.upsert({
    where: {
      periodId_category: {
        periodId,
        category,
      },
    },
    create: {
      periodId,
      category,
      amountBudgeted: amount,
    },
    update: {
      amountBudgeted: amount,
    },
  })

  revalidatePath('/')
  return budget
}

export async function suggestCategoryBudgets(
  periodId: string,
  options?: { monthsBack?: number }
) {
  const period = await prisma.budgetPeriod.findUnique({
    where: { id: periodId },
    select: { id: true, userId: true },
  })

  if (!period) {
    throw new Error('Period not found')
  }

  const monthsBack = options?.monthsBack ?? 3
  const priorPeriods = await prisma.budgetPeriod.findMany({
    where: {
      userId: period.userId,
      NOT: { id: period.id },
    },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    take: monthsBack,
    select: { id: true },
  })

  if (priorPeriods.length === 0) {
    return { updated: 0, monthsUsed: 0, budgets: {} }
  }

  const priorPeriodIds = priorPeriods.map(p => p.id)
  const historyTransactions = await prisma.transaction.findMany({
    where: {
      periodId: { in: priorPeriodIds },
      status: 'posted',
      isIgnored: false,
    },
    include: {
      importBatch: {
        include: { account: true },
      },
    },
  })

  const totalsByCategory = new Map<string, number>()
  for (const category of CATEGORIES) {
    totalsByCategory.set(category, 0)
  }

  for (const transaction of historyTransactions) {
    if (transaction.category === 'Uncategorized') continue
    const expense = getExpenseAmount(transaction)
    if (expense <= 0) continue
    totalsByCategory.set(
      transaction.category,
      (totalsByCategory.get(transaction.category) || 0) + expense
    )
  }

  const monthsUsed = priorPeriods.length
  const suggestedBudgets = new Map<string, number>()

  for (const category of CATEGORIES) {
    const total = totalsByCategory.get(category) || 0
    const average = roundCurrency(total / monthsUsed)
    if (average > 0) {
      suggestedBudgets.set(category, average)
    }
  }

  const recurringTransactions = await prisma.transaction.findMany({
    where: {
      periodId,
      category: { in: RECURRING_CATEGORIES },
      isIgnored: false,
    },
    include: {
      importBatch: {
        include: { account: true },
      },
    },
  })

  const recurringTotals = new Map<string, number>()
  for (const category of RECURRING_CATEGORIES) {
    recurringTotals.set(category, 0)
  }

  for (const transaction of recurringTransactions) {
    const expense = getExpenseAmount(transaction)
    if (expense <= 0) continue
    recurringTotals.set(
      transaction.category,
      (recurringTotals.get(transaction.category) || 0) + expense
    )
  }

  for (const category of RECURRING_CATEGORIES) {
    const total = recurringTotals.get(category) || 0
    if (total > 0) {
      suggestedBudgets.set(category, roundCurrency(total))
    }
  }

  const updates = Array.from(suggestedBudgets.entries()).map(([category, amount]) =>
    prisma.categoryBudget.upsert({
      where: {
        periodId_category: {
          periodId,
          category,
        },
      },
      create: {
        periodId,
        category,
        amountBudgeted: amount,
      },
      update: {
        amountBudgeted: amount,
      },
    })
  )

  if (updates.length > 0) {
    await prisma.$transaction(updates)
  }

  revalidatePath('/')
  return {
    updated: updates.length,
    monthsUsed,
    budgets: Object.fromEntries(suggestedBudgets),
  }
}

function getExpenseAmount(transaction: {
  amount: number
  source: string
  importBatch?: { account?: { type?: string } | null } | null
}) {
  if (transaction.source === 'import') {
    const accountType = transaction.importBatch?.account?.type
    if (accountType === 'bank') return -transaction.amount
    if (accountType === 'credit_card') return transaction.amount
  }
  return transaction.amount
}
