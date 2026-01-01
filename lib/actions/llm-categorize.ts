'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getOrCreateUser } from './user'
import { TRANSACTION_CATEGORIES, isRecurringCategory } from '@/lib/constants/categories'
import { getExpenseAmount } from '@/lib/utils/transaction-amounts'

type LLMCategoryResult = {
  id: string
  category: string | null
  confidence?: number
}

const ALLOWED_CATEGORIES = TRANSACTION_CATEGORIES.filter(
  cat => !isRecurringCategory(cat) && cat !== 'Uncategorized'
)
type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number]

type CategorizeScope = 'period' | 'all'

type CategorizeOptions = {
  scope?: CategorizeScope
}

type HistoryMatch = {
  date: string
  amount: number
  category: string
  note?: string | null
}

type HistoryGroup = {
  description: string
  subDescription: string
  transactions: HistoryMatch[]
}

type LLMTransactionItem = {
  id: string
  type: 'transaction'
  description: string
  subDescription: string
  amount: number
  date: string
  historyMatches: HistoryGroup[]
}

type LLMAmazonItem = {
  id: string
  type: 'amazon'
  orderId: string
  orderDate: string
  orderTotal: number
  currency: string
  items: string[]
  linkedTransactions: {
    id: string
    description: string
    subDescription: string
    amount: number
    date: string
  }[]
  historyMatches: HistoryGroup[]
}

type LLMItem = LLMTransactionItem | LLMAmazonItem

type LLMProgressUpdate = {
  type: 'start' | 'batch'
  totalBatches: number
  totalItems: number
  batch?: number
  updatedOrders?: number
  updatedTransactions?: number
  skipped?: number
}

type TransactionWithAccount = {
  id: string
  description: string
  subDescription: string | null
  userDescription: string | null
  amount: number
  date: Date
  category: string
  source: string
  importBatch?: {
    account?: {
      type?: string
      invertAmounts?: boolean | null
    } | null
  } | null
  periodId: string
}

const DEFAULT_CONFIDENCE_THRESHOLD = 0.6
const LOOKBACK_DAYS = 365
const MAX_BATCH_CHARS = 14000

function normalizeDescriptor(value: string | null | undefined) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function buildDescriptorKey(description: string | null | undefined, subDescription: string | null | undefined) {
  return `${normalizeDescriptor(description)}||${normalizeDescriptor(subDescription)}`
}

function isWithinLookback(dateText: string, referenceDate: Date) {
  const parsed = new Date(dateText)
  if (Number.isNaN(parsed.getTime())) return false
  const diffDays = Math.abs((parsed.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24))
  return diffDays <= LOOKBACK_DAYS
}

function buildHistoryGroups(
  descriptors: Array<{ description: string; subDescription: string }>,
  historyMap: Map<string, HistoryMatch[]>,
  referenceDate: Date
) {
  return descriptors
    .map(descriptor => {
      const key = buildDescriptorKey(descriptor.description, descriptor.subDescription)
      const matches = (historyMap.get(key) || []).filter(match => isWithinLookback(match.date, referenceDate))
      return {
        description: descriptor.description,
        subDescription: descriptor.subDescription,
        transactions: matches,
      }
    })
    .filter(group => group.transactions.length > 0)
}

function chunkItems(items: LLMItem[], basePrompt: string) {
  const batches: LLMItem[][] = []
  let current: LLMItem[] = []
  let length = basePrompt.length

  for (const item of items) {
    const itemLength = JSON.stringify(item).length + 2
    if (current.length > 0 && length + itemLength > MAX_BATCH_CHARS) {
      batches.push(current)
      current = []
      length = basePrompt.length
    }
    current.push(item)
    length += itemLength
  }

  if (current.length > 0) {
    batches.push(current)
  }

  return batches
}

export async function categorizeTransactionsWithLLM(
  periodId: string,
  options: CategorizeOptions = {},
  onProgress?: (update: LLMProgressUpdate) => void
) {
  const user = await getOrCreateUser()
  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || 'gpt-5-mini'
  const scope: CategorizeScope = options.scope === 'all' ? 'all' : 'period'
  const temperatureEnv = process.env.OPENAI_TEMPERATURE
  const temperatureValue = temperatureEnv ? Number.parseFloat(temperatureEnv) : undefined

  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY in the environment.')
  }

  const transactionScopeFilter = scope === 'period' ? { periodId } : {}

  const uncategorizedTransactions = await prisma.transaction.findMany({
    where: {
      period: { userId: user.id },
      category: 'Uncategorized',
      isIgnored: false,
      status: 'posted',
      ...transactionScopeFilter,
    },
    include: {
      amazonOrderTransactions: true,
      importBatch: {
        include: { account: true },
      },
    },
    orderBy: { date: 'asc' },
  })

  const nonAmazonTransactions = uncategorizedTransactions.filter(
    tx => tx.amazonOrderTransactions.length === 0
  )

  const amazonOrders = await prisma.amazonOrder.findMany({
    where: {
      userId: user.id,
      isIgnored: false,
      matchStatus: 'matched',
      category: null,
      amazonOrderTransactions: {
        some: {
          transaction: {
            period: { userId: user.id },
            category: 'Uncategorized',
            isIgnored: false,
            status: 'posted',
            ...transactionScopeFilter,
          },
        },
      },
    },
    include: {
      items: true,
      amazonOrderTransactions: {
        include: {
          transaction: {
            include: {
              importBatch: {
                include: { account: true },
              },
            },
          },
        },
      },
    },
    orderBy: { orderDate: 'asc' },
  })

  const candidates = [
    ...nonAmazonTransactions.map(tx => ({ type: 'transaction' as const, tx })),
    ...amazonOrders.map(order => ({ type: 'amazon' as const, order })),
  ]

  if (candidates.length === 0) {
    return { updated: 0, updatedOrders: 0, updatedTransactions: 0, skipped: 0, total: 0 }
  }

  const candidateIds = new Set<string>()
  const descriptorSet = new Map<string, { description: string; subDescription: string }>()
  let minDate: Date | null = null
  let maxDate: Date | null = null

  for (const candidate of candidates) {
    if (candidate.type === 'transaction') {
      candidateIds.add(candidate.tx.id)
      const desc = candidate.tx.description
      const subDesc = candidate.tx.subDescription || ''
      descriptorSet.set(buildDescriptorKey(desc, subDesc), { description: desc, subDescription: subDesc })
      const date = candidate.tx.date
      if (!minDate || date < minDate) minDate = date
      if (!maxDate || date > maxDate) maxDate = date
    } else {
      candidateIds.add(candidate.order.id)
      const orderDate = candidate.order.orderDate
      if (!minDate || orderDate < minDate) minDate = orderDate
      if (!maxDate || orderDate > maxDate) maxDate = orderDate
      for (const link of candidate.order.amazonOrderTransactions) {
        if (scope !== 'all' && link.transaction.periodId !== periodId) continue
        const desc = link.transaction.description
        const subDesc = link.transaction.subDescription || ''
        descriptorSet.set(buildDescriptorKey(desc, subDesc), { description: desc, subDescription: subDesc })
      }
    }
  }

  const historyMap = new Map<string, HistoryMatch[]>()
  if (descriptorSet.size > 0 && minDate && maxDate) {
    const lookbackStart = new Date(minDate)
    lookbackStart.setDate(lookbackStart.getDate() - LOOKBACK_DAYS)

    const historyTransactions = await prisma.transaction.findMany({
      where: {
        period: { userId: user.id },
        category: { not: 'Uncategorized' },
        isIgnored: false,
        date: { gte: lookbackStart, lte: maxDate },
      },
      include: {
        importBatch: {
          include: { account: true },
        },
      },
      orderBy: { date: 'desc' },
    })

    for (const tx of historyTransactions) {
      if (candidateIds.has(tx.id)) continue
      const key = buildDescriptorKey(tx.description, tx.subDescription || '')
      if (!descriptorSet.has(key)) continue
      const expenseAmount = getExpenseAmount(tx as TransactionWithAccount)
      if (!Number.isFinite(expenseAmount)) continue
      const entry: HistoryMatch = {
        date: tx.date.toISOString().split('T')[0],
        amount: Math.abs(expenseAmount),
        category: tx.category,
        note: tx.userDescription || null,
      }
      const list = historyMap.get(key) || []
      list.push(entry)
      historyMap.set(key, list)
    }
  }

  const items: LLMItem[] = []
  const candidateById = new Map<string, LLMItem>()

  for (const candidate of candidates) {
    if (candidate.type === 'transaction') {
      const tx = candidate.tx as TransactionWithAccount
      const expenseAmount = getExpenseAmount(tx)
      if (!Number.isFinite(expenseAmount) || expenseAmount <= 0) continue
      const descriptor = { description: tx.description, subDescription: tx.subDescription || '' }
      const item: LLMTransactionItem = {
        id: tx.id,
        type: 'transaction',
        description: tx.description,
        subDescription: tx.subDescription || '',
        amount: Math.abs(expenseAmount),
        date: tx.date.toISOString().split('T')[0],
        historyMatches: buildHistoryGroups([descriptor], historyMap, tx.date),
      }
      items.push(item)
      candidateById.set(tx.id, item)
    } else {
      const order = candidate.order
      const linkedTransactions = order.amazonOrderTransactions
        .filter(link => scope === 'all' || link.transaction.periodId === periodId)
        .map(link => {
          const tx = link.transaction as TransactionWithAccount
          const expenseAmount = getExpenseAmount(tx)
          return {
            id: tx.id,
            description: tx.description,
            subDescription: tx.subDescription || '',
            amount: Math.abs(expenseAmount),
            date: tx.date.toISOString().split('T')[0],
          }
        })
        .filter(link => Number.isFinite(link.amount) && link.amount > 0)
      const descriptors = order.amazonOrderTransactions
        .filter(link => scope === 'all' || link.transaction.periodId === periodId)
        .map(link => ({
          description: link.transaction.description,
          subDescription: link.transaction.subDescription || '',
        }))

      const item: LLMAmazonItem = {
        id: order.id,
        type: 'amazon',
        orderId: order.amazonOrderId,
        orderDate: order.orderDate.toISOString().split('T')[0],
        orderTotal: order.orderTotal,
        currency: order.currency,
        items: order.items.map(item => item.title).filter(Boolean),
        linkedTransactions,
        historyMatches: buildHistoryGroups(descriptors, historyMap, order.orderDate),
      }
      items.push(item)
      candidateById.set(order.id, item)
    }
  }

  if (items.length === 0) {
    return { updated: 0, updatedOrders: 0, updatedTransactions: 0, skipped: 0, total: 0 }
  }

  const systemPrompt = [
    'You are a budgeting assistant.',
    'Categorize each item into exactly one category from the allowed list.',
    'Items can be transactions or Amazon orders.',
    'Use historyMatches (exact description/sub-description matches with past categorized transactions) as a strong signal.',
    'For Amazon orders, use item names plus linked transaction descriptions.',
    'Use Income only for clear inflows like payroll, salary, or deposit-type transactions.',
    'Return JSON only: an array of objects with { "id", "category", "confidence" }.',
    'confidence is a number from 0 to 1.',
    'If unsure, keep confidence below 0.6.',
  ].join(' ')

  const exampleInput: LLMItem[] = [
    {
      id: 'example_tx_1',
      type: 'transaction',
      description: 'SAFEWAY',
      subDescription: 'CALGARY AB',
      amount: 82.14,
      date: '2025-05-12',
      historyMatches: [
        {
          description: 'SAFEWAY',
          subDescription: 'CALGARY AB',
          transactions: [
            { date: '2025-03-04', amount: 54.2, category: 'Grocery', note: 'weekly groceries' },
            { date: '2025-04-10', amount: 63.45, category: 'Grocery', note: null },
          ],
        },
      ],
    },
    {
      id: 'example_tx_2',
      type: 'transaction',
      description: 'PAYROLL',
      subDescription: 'ACME INC',
      amount: 2450,
      date: '2025-05-15',
      historyMatches: [
        {
          description: 'PAYROLL',
          subDescription: 'ACME INC',
          transactions: [
            { date: '2025-04-30', amount: 2450, category: 'Income', note: 'paycheck' },
          ],
        },
      ],
    },
    {
      id: 'example_amz_1',
      type: 'amazon',
      orderId: '702-1234567-1234567',
      orderDate: '2025-04-02',
      orderTotal: 48.99,
      currency: 'CAD',
      items: ['USB-C charging cable', 'HDMI adapter'],
      linkedTransactions: [
        {
          id: 'tx_amz_1',
          description: 'AMAZON',
          subDescription: 'AMZN MKTPLACE',
          amount: 48.99,
          date: '2025-04-03',
        },
      ],
      historyMatches: [],
    },
  ]

  const exampleOutput = [
    { id: 'example_tx_1', category: 'Grocery', confidence: 0.88 },
    { id: 'example_tx_2', category: 'Income', confidence: 0.91 },
    { id: 'example_amz_1', category: 'Other - Responsible', confidence: 0.64 },
  ]

  const baseUserPrompt = [
    `Allowed categories: ${ALLOWED_CATEGORIES.join(', ')}`,
    'Examples (input then output):',
    JSON.stringify(exampleInput),
    JSON.stringify(exampleOutput),
    'Items:',
  ].join('\n')

  const batches = chunkItems(items, baseUserPrompt)
  const threshold = Number.parseFloat(process.env.OPENAI_CATEGORY_CONFIDENCE || '') || DEFAULT_CONFIDENCE_THRESHOLD

  let skipped = 0
  let updatedOrders = 0
  let updatedTransactions = 0
  const totalBatches = batches.length
  const totalItems = items.length

  onProgress?.({ type: 'start', totalBatches, totalItems })

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const batch = batches[batchIndex]
    const userPrompt = `${baseUserPrompt}\n${JSON.stringify(batch)}`
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

      const candidate = candidateById.get(result.id)
      if (!candidate) {
        skipped++
        continue
      }

      if (candidate.type === 'transaction') {
        const txResult = await prisma.transaction.updateMany({
          where: {
            id: candidate.id,
            category: 'Uncategorized',
            isIgnored: false,
          },
          data: { category },
        })
        updatedTransactions += txResult.count
        continue
      }

      const order = amazonOrders.find(order => order.id === candidate.id)
      if (!order) {
        skipped++
        continue
      }

      await prisma.amazonOrder.update({
        where: { id: order.id },
        data: {
          category,
          categoryConfidence: confidence,
        },
      })
      updatedOrders += 1

      const transactionIds = order.amazonOrderTransactions
        .filter(link => scope === 'all' || link.transaction.periodId === periodId)
        .map(link => link.transactionId)

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
    }

    onProgress?.({
      type: 'batch',
      batch: batchIndex + 1,
      totalBatches,
      totalItems,
      updatedOrders,
      updatedTransactions,
      skipped,
    })
  }

  const total = items.length
  const updated = updatedOrders + updatedTransactions

  revalidatePath('/')
  revalidatePath('/amazon')
  return { updated, updatedOrders, updatedTransactions, skipped, total }
}

function isAllowedCategory(category: string | null): category is AllowedCategory {
  if (!category) return false
  return ALLOWED_CATEGORIES.includes(category as AllowedCategory)
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
