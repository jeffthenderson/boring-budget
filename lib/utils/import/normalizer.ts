import crypto from 'crypto'
import { parseDateInput } from '@/lib/utils/dates'
import { roundCurrency } from '@/lib/utils/currency'

export type AccountType = 'credit_card' | 'bank'

/**
 * Normalize amount based on account type:
 * - Credit card: positive = expense, negative = refund/payment
 * - Bank: positive = income, negative = outflow/expense
 */
export function normalizeAmount(
  amount: number,
  accountType: AccountType,
  transactionType?: string
): number {
  const type = transactionType?.toLowerCase() || ''

  if (type.includes('debit')) {
    return accountType === 'credit_card' ? Math.abs(amount) : -Math.abs(amount)
  }

  if (type.includes('credit')) {
    return accountType === 'credit_card' ? -Math.abs(amount) : Math.abs(amount)
  }

  return amount
}

/**
 * Normalize description for matching and deduplication
 * - Lowercase
 * - Trim whitespace
 * - Collapse multiple spaces
 * - Remove special characters except letters, numbers, spaces
 */
export function normalizeDescription(description: string): string {
  return description
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
}

export function buildCompositeDescription(
  description: string,
  subDescription?: string | null
): string {
  const base = (description || '').trim()
  const sub = (subDescription || '').trim()

  if (!base) return sub
  if (!sub) return base
  return `${base} ${sub}`
}

/**
 * Compute hash key for deduplication:
 * SHA-256 of: accountId + periodId + ISO date + amount in cents + normalized description
 */
export function computeHashKey(
  accountId: string,
  periodId: string,
  date: Date,
  normalizedAmount: number,
  normalizedDescription: string
): string {
  const dateISO = date.toISOString().split('T')[0]
  const amountCents = Math.round(normalizedAmount * 100)
  const data = `${accountId}|${periodId}|${dateISO}|${amountCents}|${normalizedDescription}`

  return crypto.createHash('sha256').update(data).digest('hex')
}

/**
 * Parse amount from string, handling various formats
 */
export function parseAmount(amountStr: string): number {
  // Remove currency symbols, commas, and whitespace
  const cleaned = amountStr.replace(/[$,\s]/g, '')

  // Handle parentheses as negative (accounting format)
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    const parsed = parseFloat(cleaned.slice(1, -1))
    return isNaN(parsed) ? NaN : roundCurrency(-parsed)
  }

  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? NaN : roundCurrency(parsed)
}

/**
 * Parse date from string
 */
export function parseDate(dateStr: string): Date {
  // Handle various date formats without timezone shifts for YYYY-MM-DD
  const date = parseDateInput(dateStr)

  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`)
  }

  return date
}

/**
 * Check if date is within the given month/year
 */
export function isDateInPeriod(date: Date, year: number, month: number): boolean {
  return date.getFullYear() === year && date.getMonth() + 1 === month
}
