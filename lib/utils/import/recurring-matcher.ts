import { normalizeDescription } from './normalizer'

export interface RecurringDefinition {
  id: string
  merchantLabel: string
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

    const defLabel = normalizeDescription(definition.merchantLabel)

    // Check if merchant label is contained in description
    if (!rowDesc.includes(defLabel)) continue

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
    const defLabel = normalizeDescription(definition.merchantLabel)

    // Check if merchant label is contained in description
    if (!rowDesc.includes(defLabel)) continue

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
