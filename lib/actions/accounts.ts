'use server'

import { prisma } from '@/lib/db'
import { getCurrentUser } from './user'
import { revalidatePath } from 'next/cache'

export async function createAccount(data: {
  name: string
  type: 'credit_card' | 'bank'
  displayAlias?: string
  last4?: string
}) {
  const user = await getCurrentUser()

  const account = await prisma.account.create({
    data: {
      userId: user.id,
      ...data,
      active: true,
    },
  })

  revalidatePath('/accounts')
  return account
}

export async function updateAccount(id: string, data: {
  name?: string
  displayAlias?: string
  last4?: string
  active?: boolean
}) {
  const user = await getCurrentUser()
  const account = await prisma.account.findFirst({
    where: { id, userId: user.id },
  })

  if (!account) {
    throw new Error('Account not found.')
  }

  const updated = await prisma.account.update({
    where: { id: account.id },
    data,
  })

  revalidatePath('/accounts')
  return updated
}

export async function deleteAccount(id: string) {
  const user = await getCurrentUser()
  await prisma.account.deleteMany({
    where: { id, userId: user.id },
  })

  revalidatePath('/accounts')
  return { success: true }
}

export async function getAllAccounts() {
  const user = await getCurrentUser()

  return prisma.account.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
  })
}

export async function getAccount(id: string) {
  const user = await getCurrentUser()
  return prisma.account.findFirst({
    where: { id, userId: user.id },
  })
}
