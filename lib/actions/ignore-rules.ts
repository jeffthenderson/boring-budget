'use server'

import { prisma } from '@/lib/db'
import { getOrCreateUser } from './user'
import { revalidatePath } from 'next/cache'
import { normalizeDescription, buildCompositeDescription } from '@/lib/utils/import/normalizer'

export interface IgnoreRuleResult {
  rule: {
    id: string
    pattern: string
    normalizedPattern: string
    active: boolean
  }
  created: boolean
  deletedTransactions: number
}

export async function getIgnoreRules() {
  const user = await getOrCreateUser()

  return prisma.ignoreRule.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createIgnoreRule(pattern: string): Promise<IgnoreRuleResult> {
  const user = await getOrCreateUser()
  const trimmed = pattern.trim()
  const normalizedPattern = normalizeDescription(trimmed)

  if (!normalizedPattern) {
    throw new Error('Ignore rule cannot be empty')
  }

  const existing = await prisma.ignoreRule.findFirst({
    where: { userId: user.id, normalizedPattern },
  })

  const rule = existing
    ? existing
    : await prisma.ignoreRule.create({
        data: {
          userId: user.id,
          pattern: trimmed,
          normalizedPattern,
          active: true,
        },
      })

  const deletedTransactions = await applyIgnoreRuleToImports(
    user.id,
    normalizedPattern
  )

  revalidatePath('/')
  revalidatePath('/import')
  revalidatePath('/settings')

  return {
    rule,
    created: !existing,
    deletedTransactions,
  }
}

export async function deleteIgnoreRule(id: string) {
  await prisma.ignoreRule.delete({
    where: { id },
  })

  revalidatePath('/settings')
  return { success: true }
}

export async function toggleIgnoreRule(id: string, active: boolean) {
  const rule = await prisma.ignoreRule.update({
    where: { id },
    data: { active },
  })

  revalidatePath('/settings')
  revalidatePath('/import')
  return rule
}

export async function createIgnoreRuleFromTransaction(transactionId: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { period: true },
  })

  if (!transaction) {
    throw new Error('Transaction not found')
  }

  if (transaction.source !== 'import') {
    throw new Error('Only imported transactions can be ignored')
  }

  const pattern = buildCompositeDescription(
    transaction.description || '',
    transaction.subDescription
  )
  return createIgnoreRule(pattern)
}

async function applyIgnoreRuleToImports(userId: string, normalizedPattern: string): Promise<number> {
  const matchingRows = await prisma.rawImportRow.findMany({
    where: {
      account: { userId },
      normalizedDescription: { contains: normalizedPattern },
    },
    select: { hashKey: true },
  })

  const hashes = matchingRows.map(row => row.hashKey)
  if (hashes.length === 0) {
    return 0
  }

  const updated = await prisma.transaction.updateMany({
    where: {
      sourceImportHash: { in: hashes },
      source: 'import',
    },
    data: { isIgnored: true },
  })

  await prisma.rawImportRow.updateMany({
    where: { hashKey: { in: hashes } },
    data: { status: 'ignored', ignoreReason: 'ignore_rule' },
  })

  return updated.count
}
