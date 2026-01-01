'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireUserId } from '@/lib/auth'

export async function getCurrentUser() {
  const userId = await requireUserId()

  return prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      timezone: 'America/New_York',
      currency: 'USD',
    },
    update: {},
  })
}

export async function getPreallocationSettings() {
  const user = await getCurrentUser()

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
  const user = await getCurrentUser()

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
  const user = await getCurrentUser()

  await prisma.$transaction([
    prisma.amazonOrder.deleteMany({
      where: { userId: user.id },
    }),
    prisma.transferGroup.deleteMany({
      where: { period: { userId: user.id } },
    }),
    prisma.rawImportRow.deleteMany({
      where: { account: { userId: user.id } },
    }),
    prisma.importBatch.deleteMany({
      where: { account: { userId: user.id } },
    }),
    prisma.transaction.deleteMany({
      where: { period: { userId: user.id } },
    }),
    prisma.categoryBudget.deleteMany({
      where: { period: { userId: user.id } },
    }),
    prisma.incomeItem.deleteMany({
      where: { period: { userId: user.id } },
    }),
    prisma.budgetPeriod.deleteMany({ where: { userId: user.id } }),
    prisma.recurringDefinition.deleteMany({ where: { userId: user.id } }),
    prisma.preallocationSettings.deleteMany({ where: { userId: user.id } }),
    prisma.account.deleteMany({ where: { userId: user.id } }),
    prisma.ignoreRule.deleteMany({ where: { userId: user.id } }),
    prisma.recurringSuggestionDismissal.deleteMany({ where: { userId: user.id } }),
    prisma.categoryMappingRule.deleteMany({ where: { userId: user.id } }),
    prisma.categoryMappingDismissal.deleteMany({ where: { userId: user.id } }),
  ])

  revalidatePath('/')
  revalidatePath('/accounts')
  revalidatePath('/import')
  revalidatePath('/recurring')
  revalidatePath('/settings')
  revalidatePath('/amazon')
  return { success: true }
}
