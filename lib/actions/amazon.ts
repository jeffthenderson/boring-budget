'use server'

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from './user'
import { roundCurrency } from '@/lib/utils/currency'
import { TRANSACTION_CATEGORIES, isRecurringCategory, isIncomeCategory } from '@/lib/constants/categories'
import { getExpenseAmount } from '@/lib/utils/transaction-amounts'

const AMAZON_KEYWORDS = ['amazon', 'amzn', 'amazon.ca']
const MATCH_LOOKBACK_DAYS = (() => {
  const parsed = Number.parseInt(process.env.AMAZON_MATCH_LOOKBACK_DAYS || '', 10)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  const windowDays = Number.parseInt(process.env.AMAZON_MATCH_WINDOW_DAYS || '', 10)
  if (Number.isFinite(windowDays) && windowDays > 0) return windowDays
  return 30
})()

const MATCH_LOOKAHEAD_DAYS = (() => {
  const parsed = Number.parseInt(process.env.AMAZON_MATCH_LOOKAHEAD_DAYS || '', 10)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  const windowDays = Number.parseInt(process.env.AMAZON_MATCH_WINDOW_DAYS || '', 10)
  if (Number.isFinite(windowDays) && windowDays > 0) return windowDays
  return 30
})()
const CREATE_CHUNK_SIZE = 200

const ALLOWED_CATEGORIES = TRANSACTION_CATEGORIES.filter(
  cat => !isRecurringCategory(cat) && cat !== 'Uncategorized' && !isIncomeCategory(cat)
)
type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number]

export type AmazonOrderImport = {
  orderId: string
  orderDate: string
  orderTotal: number
  currency?: string
  orderUrl?: string
  items: string[]
}

type MatchCandidate = {
  id: string
  date: string
  amount: number
  description: string
  subDescription?: string | null
  category: string
}

type MatchMetadata = {
  candidates: MatchCandidateGroup[]
}

type MatchCandidateGroup = {
  transactionIds: string[]
  transactions: MatchCandidate[]
  total: number
  dateSpanDays: number
  score: number
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function daysBetween(a: Date, b: Date) {
  const diff = Math.abs(a.getTime() - b.getTime())
  return Math.round(diff / (1000 * 60 * 60 * 24))
}

type CandidateTransaction = MatchCandidate & {
  roundedAmount: number
  dateObj: Date
  accountId: string | null
}

function buildCandidateGroups(
  order: { orderDate: Date; orderTotal: number },
  transactions: CandidateTransaction[]
): MatchCandidateGroup[] {
  const target = roundCurrency(order.orderTotal)
  if (!Number.isFinite(target) || target <= 0) return []

  const orderDate = order.orderDate
  const byAccount = new Map<string, CandidateTransaction[]>()
  for (const tx of transactions) {
    const key = tx.accountId || 'unknown'
    if (!byAccount.has(key)) byAccount.set(key, [])
    byAccount.get(key)!.push(tx)
  }

  const seen = new Set<string>()
  const groups: MatchCandidateGroup[] = []

  const addGroup = (txs: CandidateTransaction[]) => {
    const ids = txs.map(tx => tx.id).sort()
    const key = ids.join('|')
    if (seen.has(key)) return
    seen.add(key)

    const dates = txs.map(tx => tx.dateObj)
    const minDate = dates.reduce((min, d) => (d < min ? d : min), dates[0])
    const maxDate = dates.reduce((max, d) => (d > max ? d : max), dates[0])
    const dateSpanDays = daysBetween(minDate, maxDate)
    const orderDistance =
      txs.reduce((sum, tx) => sum + daysBetween(orderDate, tx.dateObj), 0) / txs.length
    const sizePenalty = (txs.length - 1) * 12
    const spanPenalty = dateSpanDays * 2
    const distancePenalty = orderDistance
    const score = Math.round(100 - sizePenalty - spanPenalty - distancePenalty)

    groups.push({
      transactionIds: ids,
      transactions: txs.map(tx => ({
        id: tx.id,
        date: tx.dateObj.toISOString().split('T')[0],
        amount: tx.roundedAmount,
        description: tx.description,
        subDescription: tx.subDescription,
        category: tx.category,
      })),
      total: roundCurrency(txs.reduce((sum, tx) => sum + tx.roundedAmount, 0)),
      dateSpanDays,
      score,
    })
  }

  for (const txs of byAccount.values()) {
    for (let i = 0; i < txs.length; i += 1) {
      if (roundCurrency(txs[i].roundedAmount) === target) {
        addGroup([txs[i]])
      }
    }
    for (let i = 0; i < txs.length; i += 1) {
      for (let j = i + 1; j < txs.length; j += 1) {
        if (roundCurrency(txs[i].roundedAmount + txs[j].roundedAmount) === target) {
          addGroup([txs[i], txs[j]])
        }
      }
    }
    for (let i = 0; i < txs.length; i += 1) {
      for (let j = i + 1; j < txs.length; j += 1) {
        for (let k = j + 1; k < txs.length; k += 1) {
          if (roundCurrency(txs[i].roundedAmount + txs[j].roundedAmount + txs[k].roundedAmount) === target) {
            addGroup([txs[i], txs[j], txs[k]])
          }
        }
      }
    }
  }

  return groups.sort((a, b) => b.score - a.score).slice(0, 12)
}

function buildAmazonKeywordFilters() {
  return AMAZON_KEYWORDS.flatMap(keyword => ([
    { description: { contains: keyword, mode: 'insensitive' as const } },
    { subDescription: { contains: keyword, mode: 'insensitive' as const } },
  ]))
}

function isAllowedCategory(category: string | null): category is AllowedCategory {
  if (!category) return false
  return ALLOWED_CATEGORIES.includes(category as AllowedCategory)
}

export async function importAmazonOrders(
  userId: string,
  orders: AmazonOrderImport[],
  sourceUrl?: string
) {
  const seen = new Map<string, AmazonOrderImport>()
  let invalid = 0

  for (const order of orders) {
    const orderId = (order.orderId || '').trim()
    const items = Array.isArray(order.items)
      ? order.items.map(item => item.trim()).filter(Boolean)
      : []

    const total = Number(order.orderTotal)
    const date = new Date(order.orderDate)
    if (!orderId || !Number.isFinite(total) || Number.isNaN(date.getTime())) {
      invalid++
      continue
    }

    if (!seen.has(orderId)) {
      seen.set(orderId, {
        ...order,
        orderId,
        orderTotal: Number(roundCurrency(total)),
        items,
      })
    }
  }

  const dedupedOrders = Array.from(seen.values())
  if (dedupedOrders.length === 0) {
    return { received: orders.length, created: 0, skipped: 0, invalid, matched: 0, ambiguous: 0, unmatched: 0 }
  }

  const existing = await prisma.amazonOrder.findMany({
    where: {
      userId,
      amazonOrderId: { in: dedupedOrders.map(order => order.orderId) },
    },
    select: { amazonOrderId: true },
  })
  const existingSet = new Set(existing.map(order => order.amazonOrderId))

  const newOrders = dedupedOrders.filter(order => !existingSet.has(order.orderId))
  let created = 0

  if (newOrders.length > 0) {
    const createChunks = chunkArray(newOrders, CREATE_CHUNK_SIZE)
    for (const chunk of createChunks) {
      const result = await prisma.amazonOrder.createMany({
        data: chunk.map(order => ({
          userId,
          amazonOrderId: order.orderId,
          orderDate: new Date(order.orderDate),
          orderTotal: order.orderTotal,
          currency: order.currency || 'CAD',
          orderUrl: order.orderUrl || sourceUrl || undefined,
          itemCount: order.items.length,
        })),
        skipDuplicates: true,
      })
      created += result.count
    }
  }

  const storedOrders = await prisma.amazonOrder.findMany({
    where: {
      userId,
      amazonOrderId: { in: newOrders.map(order => order.orderId) },
    },
    select: { id: true, amazonOrderId: true },
  })

  const orderIdMap = new Map(storedOrders.map(order => [order.amazonOrderId, order.id]))

  const itemsToCreate = newOrders.flatMap(order => {
    const orderId = orderIdMap.get(order.orderId)
    if (!orderId) return []
    return order.items.map(title => ({
      orderId,
      title,
      quantity: 1,
    }))
  })

  if (itemsToCreate.length > 0) {
    const itemChunks = chunkArray(itemsToCreate, CREATE_CHUNK_SIZE)
    for (const chunk of itemChunks) {
      await prisma.amazonOrderItem.createMany({ data: chunk })
    }
  }

  const matchResult = await matchAmazonOrdersForUser(
    userId,
    storedOrders.map(order => order.id)
  )

  revalidatePath('/amazon')
  return {
    received: orders.length,
    created,
    skipped: dedupedOrders.length - newOrders.length,
    invalid,
    matched: matchResult.matched,
    ambiguous: matchResult.ambiguous,
    unmatched: matchResult.unmatched,
  }
}

export async function getAmazonOrders() {
  const user = await getCurrentUser()
  return prisma.amazonOrder.findMany({
    where: { userId: user.id },
    include: {
      items: true,
      amazonOrderTransactions: {
        include: {
          transaction: true,
        },
      },
    },
    orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
  })
}

export async function matchAmazonOrders(options?: { orderIds?: string[] }) {
  const user = await getCurrentUser()
  return matchAmazonOrdersForUser(user.id, options?.orderIds)
}

async function matchAmazonOrdersForUser(userId: string, orderIds?: string[]) {
  const orderFilter = orderIds?.length ? { id: { in: orderIds } } : {}

  const orders = await prisma.amazonOrder.findMany({
    where: { userId, isIgnored: false, ...orderFilter },
    include: { items: true, amazonOrderTransactions: true },
  })

  if (orders.length === 0) {
    return { matched: 0, ambiguous: 0, unmatched: 0 }
  }

  const ordersToMatch = orders.filter(order => order.amazonOrderTransactions.length === 0)
  if (ordersToMatch.length === 0) {
    return { matched: 0, ambiguous: 0, unmatched: 0 }
  }

  const minDate = ordersToMatch.reduce(
    (min, order) => (order.orderDate < min ? order.orderDate : min),
    ordersToMatch[0].orderDate
  )
  const maxDate = ordersToMatch.reduce(
    (max, order) => (order.orderDate > max ? order.orderDate : max),
    ordersToMatch[0].orderDate
  )
  const startDate = addDays(minDate, -MATCH_LOOKBACK_DAYS)
  const endDate = addDays(maxDate, MATCH_LOOKAHEAD_DAYS)

  const linkedTransactionIds = new Set(
    orders.flatMap(order => order.amazonOrderTransactions.map(link => link.transactionId))
  )
  const excludeIds = Array.from(linkedTransactionIds)

  const amazonFilters = buildAmazonKeywordFilters()

  const transactions = await prisma.transaction.findMany({
    where: {
      period: { userId },
      source: 'import',
      isIgnored: false,
      date: { gte: startDate, lte: endDate },
      ...(amazonFilters.length > 0 ? { OR: amazonFilters } : {}),
      ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    },
    include: {
      importBatch: { include: { account: true } },
    },
  })

  const transactionsWithAmount = transactions.map(tx => {
    const expenseAmount = getExpenseAmount(tx)
    const accountId = tx.importBatch?.account?.id || null
    return {
      id: tx.id,
      date: tx.date.toISOString().split('T')[0],
      amount: expenseAmount,
      description: tx.description,
      subDescription: tx.subDescription,
      category: tx.category,
      roundedAmount: roundCurrency(expenseAmount),
      dateObj: tx.date,
      accountId,
    }
  }).filter(tx => Number.isFinite(tx.roundedAmount) && tx.roundedAmount > 0)

  const candidateMap = new Map<string, MatchCandidateGroup[]>()
  const transactionUseCounts = new Map<string, number>()

  for (const order of ordersToMatch) {
    const orderStart = addDays(order.orderDate, -MATCH_LOOKBACK_DAYS)
    const orderEnd = addDays(order.orderDate, MATCH_LOOKAHEAD_DAYS)
    const scopedTransactions = transactionsWithAmount.filter(
      tx => tx.dateObj >= orderStart && tx.dateObj <= orderEnd
    )

    const groups = buildCandidateGroups(order, scopedTransactions)
    candidateMap.set(order.id, groups)

    const orderTransactionIds = new Set(groups.flatMap(group => group.transactionIds))
    for (const id of orderTransactionIds) {
      transactionUseCounts.set(id, (transactionUseCounts.get(id) || 0) + 1)
    }
  }

  let matched = 0
  let ambiguous = 0
  let unmatched = 0
  const updates = []
  const linkRows: { orderId: string; transactionId: string }[] = []
  const assignedTransactions = new Set<string>()

  const sortedOrders = [...ordersToMatch].sort((a, b) => {
    const aCount = candidateMap.get(a.id)?.length || 0
    const bCount = candidateMap.get(b.id)?.length || 0
    if (aCount !== bCount) return aCount - bCount
    return a.orderDate.getTime() - b.orderDate.getTime()
  })

  for (const order of sortedOrders) {
    const groups = candidateMap.get(order.id) || []

    if (groups.length === 0) {
      unmatched++
      updates.push(prisma.amazonOrder.update({
        where: { id: order.id },
        data: { matchStatus: 'unmatched', matchMetadata: Prisma.DbNull },
      }))
      continue
    }

    const availableGroups = groups.filter(group =>
      group.transactionIds.every(id => !assignedTransactions.has(id))
    )

    if (availableGroups.length === 0) {
      ambiguous++
      const metadata: MatchMetadata = { candidates: groups }
      updates.push(prisma.amazonOrder.update({
        where: { id: order.id },
        data: { matchStatus: 'ambiguous', matchMetadata: metadata as any },
      }))
      continue
    }

    let selectedGroup: MatchCandidateGroup | null = null
    if (availableGroups.length === 1) {
      selectedGroup = availableGroups[0]
    } else {
      const uniqueGroups = availableGroups.filter(group =>
        group.transactionIds.every(id => transactionUseCounts.get(id) === 1)
      )
      if (uniqueGroups.length === 1) {
        selectedGroup = uniqueGroups[0]
      }
    }

    if (!selectedGroup) {
      ambiguous++
      const metadata: MatchMetadata = { candidates: groups }
      updates.push(prisma.amazonOrder.update({
        where: { id: order.id },
        data: { matchStatus: 'ambiguous', matchMetadata: metadata as any },
      }))
      continue
    }

    matched++
    for (const id of selectedGroup.transactionIds) {
      assignedTransactions.add(id)
      linkRows.push({ orderId: order.id, transactionId: id })
    }
    updates.push(prisma.amazonOrder.update({
      where: { id: order.id },
      data: { matchStatus: 'matched', matchMetadata: Prisma.DbNull },
    }))
  }

  if (linkRows.length > 0) {
    updates.push(prisma.amazonOrderTransaction.createMany({ data: linkRows, skipDuplicates: true }))
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates)
  }

  revalidatePath('/amazon')
  revalidatePath('/')
  return { matched, ambiguous, unmatched }
}

export async function getAmazonMatchCandidates(orderId: string) {
  const user = await getCurrentUser()

  const order = await prisma.amazonOrder.findFirst({
    where: { id: orderId, userId: user.id },
    select: { id: true, amazonOrderId: true, orderDate: true, orderTotal: true },
  })

  if (!order) {
    throw new Error('Order not found')
  }

  const linkedTransactions = await prisma.amazonOrderTransaction.findMany({
    where: {
      orderId: { not: orderId },
      order: { userId: user.id },
    },
    select: { transactionId: true },
  })

  const excludeIds = linkedTransactions.map(link => link.transactionId)
  const orderStart = addDays(order.orderDate, -MATCH_LOOKBACK_DAYS)
  const orderEnd = addDays(order.orderDate, MATCH_LOOKAHEAD_DAYS)
  const amazonFilters = buildAmazonKeywordFilters()

  const transactions = await prisma.transaction.findMany({
    where: {
      period: { userId: user.id },
      source: 'import',
      isIgnored: false,
      date: { gte: orderStart, lte: orderEnd },
      ...(amazonFilters.length > 0 ? { OR: amazonFilters } : {}),
      ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
    },
    include: {
      importBatch: { include: { account: true } },
    },
  })

  const transactionsWithAmount = transactions.map(tx => {
    const expenseAmount = getExpenseAmount(tx)
    const accountId = tx.importBatch?.account?.id || null
    return {
      id: tx.id,
      date: tx.date.toISOString().split('T')[0],
      amount: expenseAmount,
      description: tx.description,
      subDescription: tx.subDescription,
      category: tx.category,
      roundedAmount: roundCurrency(expenseAmount),
      dateObj: tx.date,
      accountId,
    }
  }).filter(tx => Number.isFinite(tx.roundedAmount) && tx.roundedAmount > 0)

  const candidates = buildCandidateGroups(order, transactionsWithAmount)

  return {
    orderId: order.id,
    amazonOrderId: order.amazonOrderId,
    windowStart: orderStart.toISOString().split('T')[0],
    windowEnd: orderEnd.toISOString().split('T')[0],
    candidates,
  }
}

export async function linkAmazonOrder(orderId: string, transactionIds: string[] | null) {
  const user = await getCurrentUser()

  const order = await prisma.amazonOrder.findFirst({
    where: { id: orderId, userId: user.id },
    select: { id: true },
  })

  if (!order) {
    throw new Error('Order not found')
  }

  const normalizedIds = Array.from(new Set(
    (transactionIds || [])
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      .map(id => id.trim())
  ))

  if (normalizedIds.length > 0) {
    const existing = await prisma.amazonOrderTransaction.findMany({
      where: {
        transactionId: { in: normalizedIds },
        orderId: { not: orderId },
        order: { userId: user.id },
      },
      select: { transactionId: true, order: { select: { amazonOrderId: true } } },
    })

    if (existing.length > 0) {
      const conflict = existing[0]
      throw new Error(`Transaction already linked to order ${conflict.order.amazonOrderId}`)
    }

    const transactions = await prisma.transaction.findMany({
      where: {
        id: { in: normalizedIds },
        period: { userId: user.id },
      },
      select: { id: true },
    })

    if (transactions.length !== normalizedIds.length) {
      throw new Error('Transaction not found')
    }
  }

  await prisma.amazonOrderTransaction.deleteMany({ where: { orderId } })

  if (normalizedIds.length > 0) {
    await prisma.amazonOrderTransaction.createMany({
      data: normalizedIds.map(id => ({ orderId, transactionId: id })),
      skipDuplicates: true,
    })
  }

  const matchStatus = normalizedIds.length > 0 ? 'matched' : 'unmatched'

  const updated = await prisma.amazonOrder.update({
    where: { id: orderId },
    data: {
      matchStatus,
      matchMetadata: Prisma.DbNull,
    },
  })

  revalidatePath('/amazon')
  revalidatePath('/')
  return updated
}

export async function setAmazonOrderIgnored(orderId: string, isIgnored: boolean) {
  const user = await getCurrentUser()

  const order = await prisma.amazonOrder.findFirst({
    where: { id: orderId, userId: user.id },
    select: { id: true },
  })

  if (!order) {
    throw new Error('Order not found')
  }

  const updated = await prisma.amazonOrder.update({
    where: { id: orderId },
    data: { isIgnored },
  })

  revalidatePath('/amazon')
  revalidatePath('/')
  return updated
}

export async function categorizeAmazonOrdersWithLLM() {
  const user = await getCurrentUser()
  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || 'gpt-5-mini'

  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY in the environment.')
  }

  const orders = await prisma.amazonOrder.findMany({
    where: {
      userId: user.id,
      isIgnored: false,
      matchStatus: 'matched',
      category: null,
      amazonOrderTransactions: {
        some: {
          transaction: {
            category: 'Uncategorized',
            isIgnored: false,
          },
        },
      },
    },
    include: {
      items: true,
      amazonOrderTransactions: {
        include: { transaction: true },
      },
    },
    orderBy: { orderDate: 'desc' },
    take: 100,
  })

  const candidates = orders.filter(order =>
    order.amazonOrderTransactions.some(link => link.transaction.category === 'Uncategorized')
  )

  if (candidates.length === 0) {
    return { updated: 0, skipped: 0, total: 0 }
  }

  const payload = candidates.map(order => ({
    id: order.id,
    orderId: order.amazonOrderId,
    orderDate: order.orderDate.toISOString().split('T')[0],
    orderTotal: order.orderTotal,
    currency: order.currency,
    items: order.items.map(item => item.title),
  }))

  const systemPrompt = [
    'You are a budgeting assistant.',
    'Categorize each Amazon order into exactly one category from the allowed list.',
    'Use the item list and order total as your primary signals.',
    'Return JSON only: an array of objects with { "id", "category", "confidence" }.',
    'confidence is a number from 0 to 1.',
    'If unsure, keep confidence below 0.6.',
  ].join(' ')

  const userPrompt = [
    `Allowed categories: ${ALLOWED_CATEGORIES.join(', ')}`,
    'Amazon orders:',
    JSON.stringify(payload),
  ].join('\n')

  const temperatureEnv = process.env.OPENAI_TEMPERATURE
  const temperatureValue = temperatureEnv ? Number.parseFloat(temperatureEnv) : undefined

  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  }

  if (!model.startsWith('gpt-5') && typeof temperatureValue === 'number' && !Number.isNaN(temperatureValue)) {
    requestBody.temperature = temperatureValue
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`OpenAI request failed (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  const parsed = parseLLMResults(content)

  const threshold = Number.parseFloat(process.env.OPENAI_CATEGORY_CONFIDENCE || '') || 0.6
  let skipped = 0
  let updatedOrders = 0
  let updatedTransactions = 0

  for (const result of parsed) {
    if (!result?.id) {
      skipped++
      continue
    }

    const category = result.category
    const confidence = typeof result.confidence === 'number' ? result.confidence : 1

    if (!isAllowedCategory(category)) {
      skipped++
      continue
    }

    if (confidence < threshold) {
      skipped++
      continue
    }

    const order = candidates.find(candidate => candidate.id === result.id)
    if (!order) {
      skipped++
      continue
    }

    await prisma.amazonOrder.update({
      where: { id: result.id },
      data: {
        category,
        categoryConfidence: confidence,
      },
    })

    const transactionIds = order.amazonOrderTransactions.map(link => link.transactionId)
    if (transactionIds.length > 0) {
      const txResult = await prisma.transaction.updateMany({
        where: {
          id: { in: transactionIds },
          category: 'Uncategorized',
          isIgnored: false,
        },
        data: { category },
      })
      updatedTransactions += txResult.count
    }
    updatedOrders += 1
  }

  revalidatePath('/amazon')
  revalidatePath('/')
  return { updated: updatedOrders, updatedTransactions, skipped, total: candidates.length }
}

type LLMCategoryResult = {
  id: string
  category: string | null
  confidence?: number
}

function parseLLMResults(content: unknown): LLMCategoryResult[] {
  if (!content || typeof content !== 'string') return []

  try {
    const direct = JSON.parse(content)
    return Array.isArray(direct) ? direct : []
  } catch {
    const match = content.match(/\[[\s\S]*\]/)
    if (!match) return []
    try {
      const parsed = JSON.parse(match[0])
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
}
