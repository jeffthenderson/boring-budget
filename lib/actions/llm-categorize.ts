'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getOrCreateUser } from './user'
import { CATEGORIES, isRecurringCategory } from '@/lib/constants/categories'

type LLMCategoryResult = {
  id: string
  category: string | null
  confidence?: number
}

const ALLOWED_CATEGORIES = CATEGORIES.filter(cat => !isRecurringCategory(cat))
type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number]

const DEFAULT_CONFIDENCE_THRESHOLD = 0.6

export async function categorizeTransactionsWithLLM(periodId: string) {
  const user = await getOrCreateUser()
  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || 'gpt-5-mini'

  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY in the environment.')
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      periodId,
      period: { userId: user.id },
      source: 'import',
      category: 'Uncategorized',
      isIgnored: false,
    },
    include: {
      importBatch: {
        include: { account: true },
      },
    },
    orderBy: { date: 'asc' },
  })

  const candidates = transactions.filter(tx => {
    const accountType = tx.importBatch?.account?.type
    if (!accountType) return false
    const expenseAmount = accountType === 'credit_card' ? tx.amount : -tx.amount
    return expenseAmount > 0
  })

  if (candidates.length === 0) {
    return { updated: 0, skipped: 0, total: 0 }
  }

  const payload = candidates.map(tx => ({
    id: tx.id,
    description: tx.description,
    subDescription: tx.subDescription || '',
    amount: tx.amount,
    date: tx.date.toISOString().split('T')[0],
    accountType: tx.importBatch?.account?.type || 'unknown',
  }))

  const systemPrompt = [
    'You are a budgeting assistant.',
    'Categorize each transaction into exactly one category from the allowed list.',
    'Return JSON only: an array of objects with { "id", "category", "confidence" }.',
    'confidence is a number from 0 to 1.',
    'If unsure, keep confidence below 0.6.',
  ].join(' ')

  const userPrompt = [
    `Allowed categories: ${ALLOWED_CATEGORIES.join(', ')}`,
    'Transactions:',
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
      'Authorization': `Bearer ${apiKey}`,
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

  const threshold = Number.parseFloat(process.env.OPENAI_CATEGORY_CONFIDENCE || '') || DEFAULT_CONFIDENCE_THRESHOLD

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
      prisma.transaction.updateMany({
        where: {
          id: result.id,
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

  revalidatePath('/')
  return { updated: updates.length, skipped, total: candidates.length }
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
