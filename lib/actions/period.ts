'use server'

import { prisma } from '@/lib/db'
import { getCurrentUser } from './user'
import { revalidatePath } from 'next/cache'
import { BUDGET_CATEGORIES, RECURRING_CATEGORIES, isIncomeCategory } from '@/lib/constants/categories'
import { roundCurrency } from '@/lib/utils/currency'
import { generateProjectedTransactions } from './recurring'
import { getExpenseAmount } from '@/lib/utils/transaction-amounts'

const PERIOD_INCLUDE = {
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
      account: true,  // Direct account reference (for Plaid syncs)
      importBatch: {
        include: { account: true },
      },
      amazonOrderTransactions: {
        include: {
          order: {
            include: {
              items: true,
              _count: { select: { amazonOrderTransactions: true } },
            },
          },
        },
      },
      linksFrom: {
        include: {
          toTransaction: {
            select: {
              id: true,
              description: true,
              subDescription: true,
              amount: true,
              date: true,
              category: true,
              status: true,
            },
          },
        },
      },
      linksTo: {
        include: {
          fromTransaction: {
            select: {
              id: true,
              description: true,
              subDescription: true,
              amount: true,
              date: true,
              category: true,
              status: true,
            },
          },
        },
      },
    },
  },
} as const

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
  )
}

export async function getCurrentOrCreatePeriod(year?: number, month?: number) {
  const user = await getCurrentUser()

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
    include: PERIOD_INCLUDE,
  })

  if (!period) {
    period = await createPeriod(targetYear, targetMonth)
  } else {
    const nowIndex = now.getFullYear() * 12 + now.getMonth()
    const periodIndex = targetYear * 12 + (targetMonth - 1)
    if (period.status === 'open' && periodIndex >= nowIndex) {
      await generateProjectedTransactions(period.id, targetYear, targetMonth)
      period = await prisma.budgetPeriod.findUnique({
        where: { id: period.id },
        include: PERIOD_INCLUDE,
      })
    }
  }

  return period
}

export async function createPeriod(year: number, month: number) {
  const user = await getCurrentUser()

  try {
    const period = await prisma.budgetPeriod.create({
      data: {
        userId: user.id,
        year,
        month,
        status: 'open',
        categoryBudgets: {
          create: BUDGET_CATEGORIES.map(category => ({
            category,
            amountBudgeted: 0,
          })),
        },
      },
      include: PERIOD_INCLUDE,
    })

    await generateProjectedTransactions(period.id, year, month)
    const refreshed = await prisma.budgetPeriod.findUnique({
      where: { id: period.id },
      include: PERIOD_INCLUDE,
    })
    return refreshed || period
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existing = await prisma.budgetPeriod.findUnique({
        where: {
          userId_year_month: {
            userId: user.id,
            year,
            month,
          },
        },
        include: PERIOD_INCLUDE,
      })

      if (existing) {
        const now = new Date()
        const nowIndex = now.getFullYear() * 12 + now.getMonth()
        const existingIndex = year * 12 + (month - 1)
        if (existing.status === 'open' && existingIndex >= nowIndex) {
          await generateProjectedTransactions(existing.id, year, month)
          const refreshed = await prisma.budgetPeriod.findUnique({
            where: { id: existing.id },
            include: PERIOD_INCLUDE,
          })
          return refreshed || existing
        }
        return existing
      }
    }

    throw error
  }
}

export async function togglePeriodLock(periodId: string) {
  const user = await getCurrentUser()
  const period = await prisma.budgetPeriod.findFirst({
    where: { id: periodId, userId: user.id },
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
  const user = await getCurrentUser()
  const period = await prisma.budgetPeriod.findFirst({
    where: { id: periodId, userId: user.id },
    select: { id: true },
  })

  if (!period) {
    throw new Error('Period not found')
  }

  const item = await prisma.incomeItem.create({
    data: {
      periodId: period.id,
      ...data,
    },
  })

  revalidatePath('/')
  return item
}

export async function deleteIncomeItem(id: string) {
  const user = await getCurrentUser()
  await prisma.incomeItem.deleteMany({
    where: { id, period: { userId: user.id } },
  })

  revalidatePath('/')
  return { success: true }
}

export async function updateCategoryBudget(periodId: string, category: string, amount: number) {
  const user = await getCurrentUser()
  const period = await prisma.budgetPeriod.findFirst({
    where: { id: periodId, userId: user.id },
    select: { id: true },
  })

  if (!period) {
    throw new Error('Period not found')
  }

  const budget = await prisma.categoryBudget.upsert({
    where: {
      periodId_category: {
        periodId: period.id,
        category,
      },
    },
    create: {
      periodId: period.id,
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

/**
 * Get or create a period for a specific user and date
 * Used by Plaid sync which operates on behalf of a user
 */
export async function getOrCreatePeriodForDate(userId: string, year: number, month: number) {
  let period = await prisma.budgetPeriod.findUnique({
    where: {
      userId_year_month: {
        userId,
        year,
        month,
      },
    },
  })

  if (!period) {
    try {
      period = await prisma.budgetPeriod.create({
        data: {
          userId,
          year,
          month,
          status: 'open',
          categoryBudgets: {
            create: BUDGET_CATEGORIES.map(category => ({
              category,
              amountBudgeted: 0,
            })),
          },
        },
      })
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        period = await prisma.budgetPeriod.findUnique({
          where: {
            userId_year_month: {
              userId,
              year,
              month,
            },
          },
        })
      } else {
        throw error
      }
    }
  }

  return period!
}

export async function suggestCategoryBudgets(
  periodId: string,
  options?: { monthsBack?: number }
) {
  const user = await getCurrentUser()
  const period = await prisma.budgetPeriod.findFirst({
    where: { id: periodId, userId: user.id },
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
  for (const category of BUDGET_CATEGORIES) {
    totalsByCategory.set(category, 0)
  }

  for (const transaction of historyTransactions) {
    if (transaction.category === 'Uncategorized' || isIncomeCategory(transaction.category)) continue
    const expense = getExpenseAmount(transaction)
    if (expense <= 0) continue
    totalsByCategory.set(
      transaction.category,
      (totalsByCategory.get(transaction.category) || 0) + expense
    )
  }

  const monthsUsed = priorPeriods.length
  const suggestedBudgets = new Map<string, number>()

  for (const category of BUDGET_CATEGORIES) {
    const total = totalsByCategory.get(category) || 0
    const average = roundCurrency(total / monthsUsed)
    if (average > 0) {
      suggestedBudgets.set(category, average)
    }
  }

  const recurringTransactions = await prisma.transaction.findMany({
    where: {
      periodId,
      category: { in: [...RECURRING_CATEGORIES] },
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
