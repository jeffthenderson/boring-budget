'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from './user'
import { normalizeDescription, buildCompositeDescription } from '@/lib/utils/import/normalizer'

export async function createCategoryMappingRule(data: {
  description: string
  subDescription?: string | null
  category: string
}) {
  const user = await getCurrentUser()
  const rawDescription = buildCompositeDescription(data.description, data.subDescription)
  const normalizedDescription = normalizeDescription(rawDescription)

  if (!normalizedDescription) {
    throw new Error('Description is required to create a mapping rule.')
  }

  const rule = await prisma.categoryMappingRule.upsert({
    where: {
      userId_normalizedDescription: {
        userId: user.id,
        normalizedDescription,
      },
    },
    create: {
      userId: user.id,
      rawDescription,
      normalizedDescription,
      category: data.category,
      active: true,
    },
    update: {
      rawDescription,
      category: data.category,
      active: true,
    },
  })

  await prisma.categoryMappingDismissal.deleteMany({
    where: {
      userId: user.id,
      normalizedDescription,
    },
  })

  const uncategorizedTransactions = await prisma.transaction.findMany({
    where: {
      period: { userId: user.id },
      source: 'import',
      category: 'Uncategorized',
      isIgnored: false,
    },
    select: { id: true, description: true, subDescription: true },
  })

  const matchingIds = uncategorizedTransactions
    .filter(tx =>
      normalizeDescription(buildCompositeDescription(tx.description, tx.subDescription))
      === normalizedDescription
    )
    .map(tx => tx.id)

  if (matchingIds.length > 0) {
    await prisma.transaction.updateMany({
      where: {
        id: { in: matchingIds },
        period: { userId: user.id },
      },
      data: { category: data.category },
    })
  }

  revalidatePath('/')
  revalidatePath('/import')

  return { created: true, appliedToExisting: matchingIds.length }
}

export async function dismissCategoryMappingSuggestion(
  description: string,
  subDescription?: string | null
) {
  const user = await getCurrentUser()
  const normalizedDescription = normalizeDescription(
    buildCompositeDescription(description, subDescription)
  )

  if (!normalizedDescription) {
    throw new Error('Description is required to dismiss a mapping suggestion.')
  }

  await prisma.categoryMappingDismissal.upsert({
    where: {
      userId_normalizedDescription: {
        userId: user.id,
        normalizedDescription,
      },
    },
    create: {
      userId: user.id,
      normalizedDescription,
    },
    update: {},
  })

  return { dismissed: true }
}
