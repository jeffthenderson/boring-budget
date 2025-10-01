'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function addManualTransaction(periodId: string, data: {
  date: Date
  description: string
  amount: number
  category: string
}) {
  const transaction = await prisma.transaction.create({
    data: {
      periodId,
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
  const transaction = await prisma.transaction.findUnique({
    where: { id },
  })

  if (!transaction) {
    throw new Error('Transaction not found')
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
  await prisma.transaction.delete({
    where: { id },
  })

  revalidatePath('/')
  return { success: true }
}

export async function getTransactionsByPeriod(periodId: string, filters?: {
  category?: string
  status?: string
}) {
  return prisma.transaction.findMany({
    where: {
      periodId,
      ...(filters?.category && { category: filters.category }),
      ...(filters?.status && { status: filters.status }),
    },
    include: {
      recurringDefinition: true,
    },
    orderBy: { date: 'asc' },
  })
}
