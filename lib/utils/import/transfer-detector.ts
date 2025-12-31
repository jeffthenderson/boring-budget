import { normalizeDescription } from './normalizer'

const TRANSFER_KEYWORDS = [
  'payment',
  'pay',
  'transfer',
  'xfer',
  'online banking',
  'e-transfer',
  'etransfer',
  'e transfer',
  'mb-transfer',
  'mb transfer',
  'mb-credit card',
  'loc pay',
  'visa payment',
  'mastercard payment',
  'credit card payment'
]

const PAYMENT_KEYWORDS = [
  'payment from',
  'scotiaonline',
  'teles',
  'bns',
  'online banking'
]

export interface RawRow {
  id: string
  accountId: string
  accountType: 'credit_card' | 'bank'
  accountLast4?: string
  parsedDate: Date
  parsedDescription: string
  normalizedDescription: string
  normalizedAmount: number
  status: string
}

export interface TransferCandidate {
  rowId: string
  reason: string
  pairedWith?: string
}

/**
 * Detect if a row is a transfer candidate based on keywords and patterns
 */
export function isTransferCandidate(row: RawRow, allAccounts: Array<{ displayAlias?: string; last4?: string }>): boolean {
  const desc = row.normalizedDescription

  // Credit card payment from bank side
  if (row.accountType === 'bank') {
    // Check for credit card payment keywords
    if (TRANSFER_KEYWORDS.some(keyword => desc.includes(keyword))) {
      // Check if description contains any known card last4
      const hasCardReference = allAccounts.some(acc =>
        acc.last4 && desc.includes(acc.last4)
      )

      if (hasCardReference) {
        return true
      }

      // Check for generic credit card payment patterns
      if (desc.includes('credit card') || desc.includes('visa') || desc.includes('mastercard')) {
        return true
      }
    }
  }

  // Credit card payment from card side
  if (row.accountType === 'credit_card' && row.normalizedAmount < 0) {
    // Negative amount on credit card with payment keywords
    if (PAYMENT_KEYWORDS.some(keyword => desc.includes(keyword))) {
      return true
    }
  }

  // Inter-account transfer
  if (TRANSFER_KEYWORDS.some(keyword => desc.includes(keyword))) {
    // Check if description contains any known account alias
    const hasAccountReference = allAccounts.some(acc =>
      acc.displayAlias && desc.includes(acc.displayAlias.toLowerCase())
    )

    if (hasAccountReference) {
      return true
    }
  }

  return false
}

/**
 * Pair credit card payments between bank and card accounts
 */
export function pairCreditCardPayments(rows: RawRow[]): Map<string, TransferCandidate> {
  const candidates = new Map<string, TransferCandidate>()

  const bankRows = rows.filter(r => r.accountType === 'bank')
  const cardRows = rows.filter(r => r.accountType === 'credit_card')

  for (const bankRow of bankRows) {
    if (bankRow.normalizedAmount >= 0) continue // Only negative bank amounts

    for (const cardRow of cardRows) {
      if (cardRow.normalizedAmount >= 0) continue // Only negative card amounts (payments)

      // Check if amounts match (absolute values)
      const amountMatch = Math.abs(Math.abs(bankRow.normalizedAmount) - Math.abs(cardRow.normalizedAmount)) < 0.01

      if (!amountMatch) continue

      // Check if dates are within 3 days
      const daysDiff = Math.abs(bankRow.parsedDate.getTime() - cardRow.parsedDate.getTime()) / (1000 * 60 * 60 * 24)

      if (daysDiff > 3) continue

      // We have a match!
      candidates.set(bankRow.id, {
        rowId: bankRow.id,
        reason: 'credit_card_payment',
        pairedWith: cardRow.id
      })

      candidates.set(cardRow.id, {
        rowId: cardRow.id,
        reason: 'credit_card_payment',
        pairedWith: bankRow.id
      })
    }
  }

  return candidates
}

/**
 * Pair inter-account transfers between bank accounts
 */
export function pairInterAccountTransfers(rows: RawRow[]): Map<string, TransferCandidate> {
  const candidates = new Map<string, TransferCandidate>()

  const bankRows = rows.filter(r => r.accountType === 'bank')

  for (let i = 0; i < bankRows.length; i++) {
    for (let j = i + 1; j < bankRows.length; j++) {
      const row1 = bankRows[i]
      const row2 = bankRows[j]

      // Skip if from same account
      if (row1.accountId === row2.accountId) continue

      // Check if amounts are equal but opposite signs
      const amountMatch = Math.abs(Math.abs(row1.normalizedAmount) - Math.abs(row2.normalizedAmount)) < 0.01
      const oppositeSigns = (row1.normalizedAmount > 0 && row2.normalizedAmount < 0) ||
                           (row1.normalizedAmount < 0 && row2.normalizedAmount > 0)

      if (!amountMatch || !oppositeSigns) continue

      // Check if dates are within 1 day
      const daysDiff = Math.abs(row1.parsedDate.getTime() - row2.parsedDate.getTime()) / (1000 * 60 * 60 * 24)

      if (daysDiff > 1) continue

      // Check if at least one has transfer keywords
      const hasTransferKeyword = TRANSFER_KEYWORDS.some(keyword =>
        row1.normalizedDescription.includes(keyword) ||
        row2.normalizedDescription.includes(keyword)
      )

      if (!hasTransferKeyword) continue

      // We have a match!
      candidates.set(row1.id, {
        rowId: row1.id,
        reason: 'inter_account_transfer',
        pairedWith: row2.id
      })

      candidates.set(row2.id, {
        rowId: row2.id,
        reason: 'inter_account_transfer',
        pairedWith: row1.id
      })
    }
  }

  return candidates
}

/**
 * Detect all transfers and return candidates
 */
export function detectTransfers(
  rows: RawRow[],
  allAccounts: Array<{ displayAlias?: string; last4?: string }>
): Map<string, TransferCandidate> {
  const candidates = new Map<string, TransferCandidate>()

  // First, pair cross-account matches
  const creditCardPairs = pairCreditCardPayments(rows)
  const transferPairs = pairInterAccountTransfers(rows)

  // Merge paired transfers
  for (const [id, candidate] of creditCardPairs) {
    candidates.set(id, candidate)
  }

  for (const [id, candidate] of transferPairs) {
    if (!candidates.has(id)) {
      candidates.set(id, candidate)
    }
  }

  // Then, mark unpaired transfer candidates
  for (const row of rows) {
    if (!candidates.has(row.id) && isTransferCandidate(row, allAccounts)) {
      candidates.set(row.id, {
        rowId: row.id,
        reason: row.accountType === 'bank' ? 'inter_account_transfer' : 'credit_card_payment',
      })
    }
  }

  return candidates
}
