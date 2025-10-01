'use server'

import { prisma } from '@/lib/db'
import { getOrCreateUser } from './user'
import { revalidatePath } from 'next/cache'
import { CATEGORIES } from '@/lib/constants/categories'
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
      transactions: {
        include: {
          recurringDefinition: true,
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
      transactions: {
        include: {
          recurringDefinition: true,
        },
      },
    },
  })

  await generateProjectedTransactions(period.id, year, month)

  revalidatePath('/')
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
