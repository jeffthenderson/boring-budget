'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function getOrCreateUser() {
  const users = await prisma.user.findMany()

  if (users.length > 0) {
    return users[0]
  }

  const user = await prisma.user.create({
    data: {
      timezone: 'America/New_York',
      currency: 'USD',
    },
  })

  return user
}

export async function getPreallocationSettings() {
  const user = await getOrCreateUser()

  let settings = await prisma.preallocationSettings.findUnique({
    where: { userId: user.id },
  })

  if (!settings) {
    settings = await prisma.preallocationSettings.create({
      data: {
        userId: user.id,
        charityPercent: 0,
        retirementAmount: 0,
        otherSavingsAmount: 0,
      },
    })
  }

  return settings
}

export async function updatePreallocationSettings(data: {
  charityPercent: number
  retirementAmount: number
  otherSavingsAmount: number
}) {
  const user = await getOrCreateUser()

  const settings = await prisma.preallocationSettings.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      ...data,
    },
    update: data,
  })

  revalidatePath('/')
  return settings
}

export async function resetAllData() {
  const user = await getOrCreateUser()

  await prisma.transaction.deleteMany()
  await prisma.categoryBudget.deleteMany()
  await prisma.incomeItem.deleteMany()
  await prisma.budgetPeriod.deleteMany({ where: { userId: user.id } })
  await prisma.recurringDefinition.deleteMany({ where: { userId: user.id } })
  await prisma.preallocationSettings.deleteMany({ where: { userId: user.id } })

  revalidatePath('/')
  return { success: true }
}
