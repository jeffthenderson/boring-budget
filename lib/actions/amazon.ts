'use server'

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getOrCreateUser } from './user'
import { roundCurrency } from '@/lib/utils/currency'
import { CATEGORIES, isRecurringCategory } from '@/lib/constants/categories'

const AMAZON_KEYWORDS = ['amazon', 'amzn', 'amazon.ca']
const MATCH_WINDOW_DAYS = (() => {
  const parsed = Number.parseInt(process.env.AMAZON_MATCH_WINDOW_DAYS || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5
})()
const CREATE_CHUNK_SIZE = 200

const ALLOWED_CATEGORIES = CATEGORIES.filter(cat => !isRecurringCategory(cat))
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
  candidates: MatchCandidate[]
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

export async function importAmazonOrders(orders: AmazonOrderImport[], sourceUrl?: string) {
  const user = await getOrCreateUser()
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
      userId: user.id,
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
          userId: user.id,
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
      userId: user.id,
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

  const matchResult = await matchAmazonOrders({
    userId: user.id,
    orderIds: storedOrders.map(order => order.id),
  })

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
  const user = await getOrCreateUser()
  return prisma.amazonOrder.findMany({
    where: { userId: user.id },
    include: {
      items: true,
      matchedTransaction: true,
    },
    orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
  })
}

export async function matchAmazonOrders(options?: { userId?: string; orderIds?: string[] }) {
  const userId = options?.userId ?? (await getOrCreateUser()).id
  const orderFilter = options?.orderIds?.length ? { id: { in: options.orderIds } } : {}

  const orders = await prisma.amazonOrder.findMany({
    where: { userId, ...orderFilter },
    include: { items: true },
  })

  if (orders.length === 0) {
    return { matched: 0, ambiguous: 0, unmatched: 0 }
  }

  const minDate = orders.reduce((min, order) => (order.orderDate < min ? order.orderDate : min), orders[0].orderDate)
  const maxDate = orders.reduce((max, order) => (order.orderDate > max ? order.orderDate : max), orders[0].orderDate)
  const startDate = addDays(minDate, -MATCH_WINDOW_DAYS)
  const endDate = addDays(maxDate, MATCH_WINDOW_DAYS)

  const excludeMatchIds = await prisma.amazonOrder.findMany({
    where: {
      userId,
      matchedTransactionId: { not: null },
      ...(options?.orderIds?.length ? { id: { notIn: options.orderIds } } : {}),
    },
    select: { matchedTransactionId: true },
  })

  const excludeIds = excludeMatchIds
    .map(row => row.matchedTransactionId)
    .filter((id): id is string => Boolean(id))

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
    const accountType = tx.importBatch?.account?.type
    const expenseAmount = accountType === 'credit_card' ? tx.amount : -tx.amount
    return {
      ...tx,
      expenseAmount,
      roundedAmount: roundCurrency(expenseAmount),
    }
  }).filter(tx => Number.isFinite(tx.roundedAmount) && tx.roundedAmount > 0)

  const candidateMap = new Map<string, MatchCandidate[]>()
  const txToOrders = new Map<string, Set<string>>()

  for (const order of orders) {
    const orderTotal = roundCurrency(order.orderTotal)
    const orderStart = addDays(order.orderDate, -MATCH_WINDOW_DAYS)
    const orderEnd = addDays(order.orderDate, MATCH_WINDOW_DAYS)

    const candidates: MatchCandidate[] = []
    for (const tx of transactionsWithAmount) {
      if (tx.date < orderStart || tx.date > orderEnd) continue
      if (roundCurrency(tx.roundedAmount) !== orderTotal) continue

      const candidate: MatchCandidate = {
        id: tx.id,
        date: tx.date.toISOString().split('T')[0],
        amount: roundCurrency(tx.roundedAmount),
        description: tx.description,
        subDescription: tx.subDescription,
        category: tx.category,
      }
      candidates.push(candidate)

      if (!txToOrders.has(tx.id)) {
        txToOrders.set(tx.id, new Set())
      }
      txToOrders.get(tx.id)!.add(order.id)
    }

    candidateMap.set(order.id, candidates)
  }

  let matched = 0
  let ambiguous = 0
  let unmatched = 0
  const updates = []

  for (const order of orders) {
    const candidates = candidateMap.get(order.id) || []

    if (candidates.length === 1 && txToOrders.get(candidates[0].id)?.size === 1) {
      matched++
      updates.push(prisma.amazonOrder.update({
        where: { id: order.id },
        data: {
          matchedTransactionId: candidates[0].id,
          matchStatus: 'matched',
          matchMetadata: Prisma.DbNull,
        },
      }))
      continue
    }

    if (candidates.length === 0) {
      unmatched++
      updates.push(prisma.amazonOrder.update({
        where: { id: order.id },
        data: {
          matchedTransactionId: null,
          matchStatus: 'unmatched',
          matchMetadata: Prisma.DbNull,
        },
      }))
      continue
    }

    ambiguous++
    const metadata: MatchMetadata = { candidates }
    updates.push(prisma.amazonOrder.update({
      where: { id: order.id },
      data: {
        matchedTransactionId: null,
        matchStatus: 'ambiguous',
        matchMetadata: metadata as any,
      },
    }))
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates)
  }

  revalidatePath('/amazon')
  return { matched, ambiguous, unmatched }
}

export async function linkAmazonOrder(orderId: string, transactionId: string | null) {
  const user = await getOrCreateUser()

  if (transactionId) {
    const existing = await prisma.amazonOrder.findFirst({
      where: {
        userId: user.id,
        matchedTransactionId: transactionId,
        id: { not: orderId },
      },
      select: { id: true, amazonOrderId: true },
    })

    if (existing) {
      throw new Error(`Transaction already linked to order ${existing.amazonOrderId}`)
    }

    const transaction = await prisma.transaction.findFirst({
      where: {
        id: transactionId,
        period: { userId: user.id },
      },
    })

    if (!transaction) {
      throw new Error('Transaction not found')
    }
  }

  const matchStatus = transactionId ? 'matched' : 'unmatched'

  const updated = await prisma.amazonOrder.update({
    where: { id: orderId },
    data: {
      matchedTransactionId: transactionId,
      matchStatus,
      matchMetadata: null,
    },
  })

  revalidatePath('/amazon')
  revalidatePath('/')
  return updated
}

export async function categorizeAmazonOrdersWithLLM() {
  const user = await getOrCreateUser()
  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || 'gpt-5-mini'

  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY in the environment.')
  }

  const orders = await prisma.amazonOrder.findMany({
    where: {
      userId: user.id,
      matchStatus: 'matched',
      matchedTransactionId: { not: null },
      category: null,
    },
    include: {
      items: true,
      matchedTransaction: true,
    },
    orderBy: { orderDate: 'desc' },
    take: 100,
  })

  const candidates = orders.filter(order => order.matchedTransaction?.category === 'Uncategorized')

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
  const updates = []
  let skipped = 0

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

    updates.push(
      prisma.amazonOrder.update({
        where: { id: result.id },
        data: {
          category,
          categoryConfidence: confidence,
        },
      })
    )

    updates.push(
      prisma.transaction.updateMany({
        where: {
          id: candidates.find(order => order.id === result.id)?.matchedTransactionId || '',
          category: 'Uncategorized',
          isIgnored: false,
        },
        data: { category },
      })
    )
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates)
  }

  revalidatePath('/amazon')
  revalidatePath('/')
  return { updated: updates.length / 2, skipped, total: candidates.length }
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
