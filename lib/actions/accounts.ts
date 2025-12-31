'use server'

import { prisma } from '@/lib/db'
import { getOrCreateUser } from './user'
import { revalidatePath } from 'next/cache'

export async function createAccount(data: {
  name: string
  type: 'credit_card' | 'bank'
  displayAlias?: string
  last4?: string
}) {
  const user = await getOrCreateUser()

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
  const account = await prisma.account.update({
    where: { id },
    data,
  })

  revalidatePath('/accounts')
  return account
}

export async function deleteAccount(id: string) {
  await prisma.account.delete({
    where: { id },
  })

  revalidatePath('/accounts')
  return { success: true }
}

export async function getAllAccounts() {
  const user = await getOrCreateUser()

  return prisma.account.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
  })
}

export async function getAccount(id: string) {
  return prisma.account.findUnique({
    where: { id },
  })
}
