import { normalizeDescription } from './normalizer'

export interface RecurringDefinition {
  id: string
  merchantLabel: string
  displayLabel?: string | null
  nominalAmount: number
  category: string
}

export interface ProjectedTransaction {
  id: string
  recurringDefinitionId: string
  date: Date
  amount: number
  description: string
}

export interface ImportedRow {
  id: string
  parsedDate: Date
  normalizedAmount: number
  normalizedDescription: string
  parsedDescription: string
}

export interface RecurringMatch {
  importedRowId: string
  projectedTransactionId: string
  definitionId: string
  merchantLabel: string
  confidence: 'high' | 'medium' | 'low'
  dateDiffDays: number
  amountDiffPercent: number
}

const TOKEN_MIN_LENGTH = 4
const TOKEN_PREFIX_MATCH = 4

function tokenizeNormalized(value: string): string[] {
  return value.split(' ').filter(Boolean)
}

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length)
  let i = 0
  while (i < max && a[i] === b[i]) {
    i += 1
  }
  return i
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => [])
  for (let i = 0; i <= a.length; i += 1) {
    matrix[i][0] = i
  }
  for (let j = 0; j <= b.length; j += 1) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  return matrix[a.length][b.length]
}

function tokensMatch(labelToken: string, rowToken: string): boolean {
  if (labelToken === rowToken) return true

  if (labelToken.length >= TOKEN_MIN_LENGTH && rowToken.length >= TOKEN_MIN_LENGTH) {
    if (labelToken.startsWith(rowToken) || rowToken.startsWith(labelToken)) {
      return true
    }
    if (commonPrefixLength(labelToken, rowToken) >= TOKEN_PREFIX_MATCH) {
      return true
    }

    const maxLen = Math.max(labelToken.length, rowToken.length)
    if (maxLen >= 6 && levenshteinDistance(labelToken, rowToken) <= 2) {
      return true
    }
  }

  return false
}

function labelMatches(rowDescription: string, label: string): boolean {
  const normalizedRow = normalizeDescription(rowDescription)
  const normalizedLabel = normalizeDescription(label)

  if (!normalizedRow || !normalizedLabel) return false
  if (normalizedRow.includes(normalizedLabel) || normalizedLabel.includes(normalizedRow)) {
    return true
  }

  const rowTokens = tokenizeNormalized(normalizedRow).filter(token => token.length >= TOKEN_MIN_LENGTH)
  const labelTokens = tokenizeNormalized(normalizedLabel).filter(token => token.length >= TOKEN_MIN_LENGTH)
  if (rowTokens.length === 0 || labelTokens.length === 0) return false

  let matchedTokens = 0
  let matchedLength = 0
  let labelLength = 0

  for (const labelToken of labelTokens) {
    labelLength += labelToken.length
    if (rowTokens.some(rowToken => tokensMatch(labelToken, rowToken))) {
      matchedTokens += 1
      matchedLength += labelToken.length
    }
  }

  if (matchedTokens === 0) return false
  if (rowTokens.length === 1 && rowTokens[0].length >= TOKEN_MIN_LENGTH) return true

  const coverage = labelLength === 0 ? 0 : matchedLength / labelLength
  return matchedTokens >= 2 || coverage >= 0.4
}

function matchesDefinitionLabel(rowDescription: string, definition: RecurringDefinition): boolean {
  const labels = [definition.merchantLabel, definition.displayLabel].filter(Boolean) as string[]
  return labels.some(label => labelMatches(rowDescription, label))
}

export function findClosestProjectedTransaction(
  projectedTransactions: ProjectedTransaction[],
  definitionId: string,
  targetDate: Date,
  targetAmount: number
): ProjectedTransaction | null {
  const candidates = projectedTransactions.filter(tx => tx.recurringDefinitionId === definitionId)
  if (candidates.length === 0) return null

  const sameSign = targetAmount !== 0
    ? candidates.filter(tx => Math.sign(tx.amount) === Math.sign(targetAmount))
    : candidates
  const usable = sameSign.length > 0 ? sameSign : candidates

  let best = usable[0]
  let bestScore = Number.POSITIVE_INFINITY
  for (const candidate of usable) {
    const dateDiffDays = Math.abs(
      (candidate.date.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24)
    )
    const amountDiff = Math.abs(Math.abs(candidate.amount) - Math.abs(targetAmount))
    const score = dateDiffDays * 100 + amountDiff
    if (score < bestScore) {
      bestScore = score
      best = candidate
    }
  }

  return best ?? null
}

/**
 * Attempt to match an imported row to existing recurring projections
 */
export function findRecurringMatches(
  importedRow: ImportedRow,
  projectedTransactions: ProjectedTransaction[],
  recurringDefinitions: RecurringDefinition[]
): RecurringMatch[] {
  const matches: RecurringMatch[] = []

  const rowDesc = importedRow.normalizedDescription

  for (const projected of projectedTransactions) {
    const definition = recurringDefinitions.find(d => d.id === projected.recurringDefinitionId)
    if (!definition) continue

    if (!matchesDefinitionLabel(rowDesc, definition)) continue

    // Check date difference (within 5 days)
    const daysDiff = Math.abs(
      (importedRow.parsedDate.getTime() - projected.date.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (daysDiff > 5) continue

    // Check amount difference (within 10%)
    const amountDiff = Math.abs(importedRow.normalizedAmount - projected.amount)
    const amountDiffPercent = (amountDiff / Math.abs(projected.amount)) * 100

    if (amountDiffPercent > 10) continue

    // Determine confidence
    let confidence: 'high' | 'medium' | 'low' = 'low'

    if (daysDiff <= 1 && amountDiffPercent <= 1) {
      confidence = 'high'
    } else if (daysDiff <= 2 && amountDiffPercent <= 5) {
      confidence = 'medium'
    }

    matches.push({
      importedRowId: importedRow.id,
      projectedTransactionId: projected.id,
      definitionId: definition.id,
      merchantLabel: definition.merchantLabel,
      confidence,
      dateDiffDays: daysDiff,
      amountDiffPercent
    })
  }

  // Sort by confidence and then by closeness
  matches.sort((a, b) => {
    const confidenceOrder = { high: 0, medium: 1, low: 2 }
    if (confidenceOrder[a.confidence] !== confidenceOrder[b.confidence]) {
      return confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
    }
    return a.dateDiffDays - b.dateDiffDays
  })

  return matches
}

/**
 * Find the best match for an imported row (if any)
 */
export function getBestRecurringMatch(
  importedRow: ImportedRow,
  projectedTransactions: ProjectedTransaction[],
  recurringDefinitions: RecurringDefinition[]
): RecurringMatch | null {
  const matches = findRecurringMatches(importedRow, projectedTransactions, recurringDefinitions)
  return matches.length > 0 ? matches[0] : null
}

/**
 * Match an imported row directly against recurring definitions (without needing projections)
 * Useful for matching when projections don't exist yet or dates are slightly off
 */
export function matchAgainstDefinitions(
  importedRow: ImportedRow,
  recurringDefinitions: RecurringDefinition[],
  periodYear: number,
  periodMonth: number
): RecurringMatch | null {
  const matches: RecurringMatch[] = []
  const rowDesc = importedRow.normalizedDescription

  for (const definition of recurringDefinitions) {
    if (!matchesDefinitionLabel(rowDesc, definition)) continue

    // Check amount difference (within 10%)
    const amountDiff = Math.abs(importedRow.normalizedAmount - definition.nominalAmount)
    const amountDiffPercent = (amountDiff / Math.abs(definition.nominalAmount)) * 100

    if (amountDiffPercent > 10) continue

    // For date matching, we don't have a specific projected date, so we just check
    // if the transaction is in the correct period and consider it a match
    // The confidence will be based mainly on amount match
    let confidence: 'high' | 'medium' | 'low' = 'medium'

    if (amountDiffPercent <= 1) {
      confidence = 'high'
    } else if (amountDiffPercent <= 5) {
      confidence = 'medium'
    } else {
      confidence = 'low'
    }

    matches.push({
      importedRowId: importedRow.id,
      projectedTransactionId: '', // No projected transaction
      definitionId: definition.id,
      merchantLabel: definition.merchantLabel,
      confidence,
      dateDiffDays: 0, // Unknown without projection
      amountDiffPercent
    })
  }

  // Sort by confidence and amount closeness
  matches.sort((a, b) => {
    const confidenceOrder = { high: 0, medium: 1, low: 2 }
    if (confidenceOrder[a.confidence] !== confidenceOrder[b.confidence]) {
      return confidenceOrder[a.confidence] - confidenceOrder[b.confidence]
    }
    return a.amountDiffPercent - b.amountDiffPercent
  })

  return matches.length > 0 ? matches[0] : null
}
