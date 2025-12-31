/**
 * Format date consistently for SSR
 * Returns ISO date string in YYYY-MM-DD format
 */
export function formatDate(date: Date | string): string {
  const d = coerceDate(date)
  return formatDateParts(d)
}

/**
 * Format date for display (M/D/YYYY format)
 * Uses consistent formatting to avoid hydration errors
 */
export function formatDateDisplay(date: Date | string): string {
  const d = coerceDate(date)
  const { year, month, day } = getDisplayDateParts(d)
  return `${month}/${day}/${year}`
}

export function parseDateInput(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
  }

  return new Date(value)
}

function coerceDate(date: Date | string): Date {
  return typeof date === 'string' ? parseDateInput(date) : date
}

function formatDateParts(date: Date): string {
  const { year, month, day } = getDisplayDateParts(date)
  const monthPadded = String(month).padStart(2, '0')
  const dayPadded = String(day).padStart(2, '0')
  return `${year}-${monthPadded}-${dayPadded}`
}

function getDisplayDateParts(date: Date): { year: number; month: number; day: number } {
  if (isUtcMidnight(date)) {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    }
  }

  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  }
}

function isUtcMidnight(date: Date): boolean {
  return (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  )
}
