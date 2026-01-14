'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { normalizeDescription, buildCompositeDescription } from '@/lib/utils/import/normalizer'
import { detectTransfers, type RawRow } from '@/lib/utils/import/transfer-detector'
import { isTransferDescription } from '@/lib/plaid/category-map'

export async function markInternalTransfersForPeriodByUser(
  userId: string,
  periodId: string,
  options?: { revalidate?: boolean }
) {
  const [accounts, transactions] = await Promise.all([
    prisma.account.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        displayAlias: true,
        last4: true,
        invertAmounts: true,
      },
    }),
    prisma.transaction.findMany({
      where: {
        periodId,
        status: { not: 'projected' },
        isIgnored: false,
        source: 'import',
      },
      include: {
        account: true,
        importBatch: { include: { account: true } },
      },
    }),
  ])

  if (transactions.length === 0 || accounts.length < 2) {
    return { updated: 0 }
  }

  const accountsForDetection = accounts.map(account => ({
    displayAlias: account.displayAlias || undefined,
    last4: account.last4 || undefined,
  }))

  const accountById = new Map(accounts.map(account => [account.id, account]))

  const rows: RawRow[] = []
  const transactionById = new Map<string, typeof transactions[number]>()

  for (const tx of transactions) {
    const account = tx.accountId
      ? accountById.get(tx.accountId)
      : (tx.importBatch?.account || undefined)

    if (!account) continue

    const composite = buildCompositeDescription(tx.description, tx.subDescription)
    const normalized = normalizeDescription(composite)
    if (!normalized) continue

    transactionById.set(tx.id, tx)
    rows.push({
      id: tx.id,
      accountId: account.id,
      accountType: account.type as 'credit_card' | 'bank',
      accountLast4: account.last4 || undefined,
      accountInvertAmounts: account.invertAmounts || false,
      parsedDate: tx.date,
      parsedDescription: tx.description,
      normalizedDescription: normalized,
      normalizedAmount: tx.amount,
      status: tx.status,
      transferHint: isTransferDescription(tx.description || ''),
    })
  }

  if (rows.length === 0) {
    return { updated: 0 }
  }

  const transferCandidates = detectTransfers(rows, accountsForDetection)
  if (transferCandidates.size === 0) {
    return { updated: 0 }
  }

  const candidateIds: string[] = []
  for (const [rowId] of transferCandidates) {
    const tx = transactionById.get(rowId)
    if (!tx) continue
    if (tx.category !== 'Uncategorized' && tx.category !== 'Transfer') continue
    candidateIds.push(rowId)
  }

  if (candidateIds.length === 0) {
    return { updated: 0 }
  }

  const updateResult = await prisma.transaction.updateMany({
    where: { id: { in: candidateIds } },
    data: {
      category: 'Transfer',
      isInternalTransfer: true,
    },
  })

  if (options?.revalidate !== false) {
    revalidatePath('/')
  }

  return { updated: updateResult.count }
}

export async function markInternalTransfersForOpenPeriodsByUser(userId: string) {
  const periods = await prisma.budgetPeriod.findMany({
    where: { userId, status: 'open' },
    select: { id: true },
  })

  let updated = 0
  for (const period of periods) {
    const result = await markInternalTransfersForPeriodByUser(userId, period.id, { revalidate: false })
    updated += result.updated
  }

  revalidatePath('/')
  return { updated, periodsChecked: periods.length }
}
