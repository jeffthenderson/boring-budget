import Decimal from 'decimal.js'

// Bankers rounding (half-even) to 2 decimal places
export function roundCurrency(value: number): number {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toNumber()
}

export function formatCurrency(value: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundCurrency(value))
}

export function parseCurrency(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, '')
  const parsed = parseFloat(cleaned)
  return isNaN(parsed) ? 0 : roundCurrency(parsed)
}
