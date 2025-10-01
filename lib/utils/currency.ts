// Round half away from zero to 2 decimal places
export function roundCurrency(value: number): number {
  const sign = value >= 0 ? 1 : -1
  const abs = Math.abs(value)
  return sign * Math.round(abs * 100) / 100
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
