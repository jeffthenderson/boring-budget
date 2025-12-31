'use server'

import { prisma } from '@/lib/db'
import { getOrCreateUser } from './user'
import { normalizeDescription, buildCompositeDescription } from '@/lib/utils/import/normalizer'
import { roundCurrency } from '@/lib/utils/currency'

interface SuggestionOccurrence {
  date: Date
  amount: number
  rawDescription: string
  description: string
  subDescription?: string
}

export interface RecurringSuggestion {
  key: string
  normalizedDescription: string
  displayDescription: string
  matchDescription: string
  amountMedian: number
  amountMin: number
  amountMax: number
  dayOfMonthMedian: number
  dayOfMonthMin: number
  dayOfMonthMax: number
  months: Array<{ year: number; month: number; date: Date; amount: number }>
  occurrences: SuggestionOccurrence[]
  confidence: number
}

export async function getRecurringSuggestions(): Promise<RecurringSuggestion[]> {
  const user = await getOrCreateUser()

  const [transactions, definitions, dismissals] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        source: 'import',
        isIgnored: false,
        period: { userId: user.id },
      },
      include: {
        importBatch: { include: { account: true } },
      },
      orderBy: { date: 'asc' },
    }),
    prisma.recurringDefinition.findMany({
      where: { userId: user.id },
    }),
    prisma.recurringSuggestionDismissal.findMany({
      where: { userId: user.id },
    }),
  ])

  const dismissedKeys = new Set(dismissals.map(d => d.suggestionKey))
  const normalizedDefinitions = definitions.map(def => normalizeDescription(def.merchantLabel))

  const latestDataDate = transactions.reduce<Date | null>((latest, tx) => {
    if (!latest || tx.date > latest) return tx.date
    return latest
  }, null)

  if (!latestDataDate) {
    return []
  }

  const grouped = new Map<string, SuggestionOccurrence[]>()

  for (const tx of transactions) {
    const accountType = tx.importBatch?.account?.type
    if (!accountType) continue

    const rawDescription = (tx.description || '').trim()
    const subDescription = (tx.subDescription || '').trim()
    const compositeDescription = buildCompositeDescription(rawDescription, subDescription)
    const description = rawDescription
    const normalized = normalizeDescription(compositeDescription)
    if (!normalized) continue

    const expenseAmount = accountType === 'credit_card' ? tx.amount : -tx.amount
    if (expenseAmount <= 0) continue

    const amount = roundCurrency(Math.abs(expenseAmount))

    if (!grouped.has(normalized)) {
      grouped.set(normalized, [])
    }

    grouped.get(normalized)!.push({
      date: tx.date,
      amount,
      rawDescription: compositeDescription,
      description,
      subDescription: subDescription || undefined,
    })
  }

  const suggestions: RecurringSuggestion[] = []

  for (const [normalizedDescription, occurrences] of grouped) {
    if (occurrences.length < 3) continue

    if (normalizedDefinitions.some(def => normalizedDescription.includes(def) || def.includes(normalizedDescription))) {
      continue
    }

    const sequences = buildRecurringSequences(occurrences)

    for (const sequence of sequences) {
      const suggestionKey = `${normalizedDescription}|${sequence.amountMedian.toFixed(2)}`
      if (dismissedKeys.has(suggestionKey)) continue

      const latestOccurrence = sequence.occurrences[sequence.occurrences.length - 1]
      const latestMonthIndex = latestDataDate.getFullYear() * 12 + latestDataDate.getMonth()
      const lastOccurrenceMonthIndex = latestOccurrence.date.getFullYear() * 12 + latestOccurrence.date.getMonth()

      if (latestMonthIndex - lastOccurrenceMonthIndex >= 3) {
        continue
      }

      suggestions.push({
        key: suggestionKey,
        normalizedDescription,
        displayDescription: sequence.displayDescription,
        matchDescription: sequence.matchDescription,
        amountMedian: sequence.amountMedian,
        amountMin: sequence.amountMin,
        amountMax: sequence.amountMax,
        dayOfMonthMedian: sequence.dayOfMonthMedian,
        dayOfMonthMin: sequence.dayOfMonthMin,
        dayOfMonthMax: sequence.dayOfMonthMax,
        months: sequence.months,
        occurrences: sequence.occurrences,
        confidence: sequence.confidence,
      })
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence)
}

export async function dismissRecurringSuggestion(key: string) {
  const user = await getOrCreateUser()
  const suggestionKey = key.trim()

  if (!suggestionKey) {
    throw new Error('Suggestion key is required')
  }

  await prisma.recurringSuggestionDismissal.upsert({
    where: {
      userId_suggestionKey: {
        userId: user.id,
        suggestionKey,
      },
    },
    create: {
      userId: user.id,
      suggestionKey,
    },
    update: {},
  })

  return { success: true }
}

function buildRecurringSequences(occurrences: SuggestionOccurrence[]) {
  const byMonth = new Map<string, SuggestionOccurrence[]>()

  for (const occ of occurrences) {
    const key = `${occ.date.getFullYear()}-${occ.date.getMonth() + 1}`
    if (!byMonth.has(key)) {
      byMonth.set(key, [])
    }
    byMonth.get(key)!.push(occ)
  }

  const monthsWithMultiple = Array.from(byMonth.values()).some(list => list.length > 1)
  const sequences: Array<ReturnType<typeof buildSequenceFromOccurrences>> = []

  if (!monthsWithMultiple) {
    const sequence = buildSequenceFromOccurrences(occurrences)
    if (sequence) sequences.push(sequence)
    return sequences
  }

  const clusters = clusterByAmount(occurrences)
  for (const cluster of clusters) {
    const sequence = buildSequenceFromOccurrences(cluster)
    if (sequence) sequences.push(sequence)
  }

  return sequences
}

function buildSequenceFromOccurrences(occurrences: SuggestionOccurrence[]) {
  if (occurrences.length < 3) return null

  const sorted = [...occurrences].sort((a, b) => a.date.getTime() - b.date.getTime())

  const monthlyMap = new Map<string, SuggestionOccurrence[]>()
  for (const occ of sorted) {
    const key = `${occ.date.getFullYear()}-${occ.date.getMonth() + 1}`
    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, [])
    }
    monthlyMap.get(key)!.push(occ)
  }

  const monthOccurrences: SuggestionOccurrence[] = []
  const amountMedianBase = median(sorted.map(o => o.amount))

  for (const list of monthlyMap.values()) {
    list.sort((a, b) => Math.abs(a.amount - amountMedianBase) - Math.abs(b.amount - amountMedianBase))
    monthOccurrences.push(list[0])
  }

  if (monthOccurrences.length < 3) return null

  monthOccurrences.sort((a, b) => a.date.getTime() - b.date.getTime())

  const gaps = []
  for (let i = 1; i < monthOccurrences.length; i++) {
    const diffDays = (monthOccurrences[i].date.getTime() - monthOccurrences[i - 1].date.getTime()) / (1000 * 60 * 60 * 24)
    gaps.push(diffDays)
  }

  const medianGap = median(gaps)
  const maxGap = Math.max(...gaps)

  if (medianGap < 25 || medianGap > 35) return null
  if (maxGap > 45) return null

  const dayValues = monthOccurrences.map(o => o.date.getDate())
  const dayMin = Math.min(...dayValues)
  const dayMax = Math.max(...dayValues)

  if (dayMax - dayMin > 10) return null

  const amounts = monthOccurrences.map(o => o.amount)
  const amountMin = Math.min(...amounts)
  const amountMax = Math.max(...amounts)
  const amountMedianValue = median(amounts)

  const monthList = monthOccurrences.map(o => ({
    year: o.date.getFullYear(),
    month: o.date.getMonth() + 1,
    date: o.date,
    amount: o.amount,
  }))

  return {
    displayDescription: mostCommonDescription(monthOccurrences, 'description'),
    matchDescription: mostCommonDescription(monthOccurrences, 'rawDescription'),
    amountMedian: roundCurrency(amountMedianValue),
    amountMin: roundCurrency(amountMin),
    amountMax: roundCurrency(amountMax),
    dayOfMonthMedian: median(dayValues),
    dayOfMonthMin: dayMin,
    dayOfMonthMax: dayMax,
    months: monthList,
    occurrences: monthOccurrences,
    confidence: calculateConfidence(dayMin, dayMax, amountMin, amountMax, amountMedianValue, gaps),
  }
}

function clusterByAmount(occurrences: SuggestionOccurrence[]) {
  const sorted = [...occurrences].sort((a, b) => a.amount - b.amount)
  const clusters: SuggestionOccurrence[][] = []

  for (const occ of sorted) {
    let bestIndex = -1
    let bestDelta = Infinity

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i]
      const mean = cluster.reduce((sum, item) => sum + item.amount, 0) / cluster.length
      const tolerance = Math.max(2, mean * 0.1)
      const delta = Math.abs(occ.amount - mean)
      if (delta <= tolerance && delta < bestDelta) {
        bestDelta = delta
        bestIndex = i
      }
    }

    if (bestIndex === -1) {
      clusters.push([occ])
    } else {
      clusters[bestIndex].push(occ)
    }
  }

  return clusters
}

function mostCommonDescription(
  occurrences: SuggestionOccurrence[],
  key: 'description' | 'rawDescription'
) {
  const counts = new Map<string, number>()
  for (const occ of occurrences) {
    const value = occ[key].trim()
    if (!value) continue
    counts.set(value, (counts.get(value) || 0) + 1)
  }

  let best = occurrences[0]?.[key] || 'Recurring item'
  let bestCount = 0
  for (const [desc, count] of counts) {
    if (count > bestCount) {
      best = desc
      bestCount = count
    }
  }

  return best
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function calculateConfidence(
  dayMin: number,
  dayMax: number,
  amountMin: number,
  amountMax: number,
  amountMedian: number,
  gaps: number[]
) {
  const dayRange = dayMax - dayMin
  const amountRangePercent = amountMedian === 0 ? 0 : ((amountMax - amountMin) / amountMedian) * 100
  const gapVariance = gaps.length === 0 ? 0 : Math.max(...gaps) - Math.min(...gaps)

  const dayScore = Math.max(0, 1 - dayRange / 10)
  const amountScore = Math.max(0, 1 - amountRangePercent / 60)
  const gapScore = Math.max(0, 1 - gapVariance / 10)

  return Math.round((dayScore * 0.4 + amountScore * 0.3 + gapScore * 0.3) * 100)
}
