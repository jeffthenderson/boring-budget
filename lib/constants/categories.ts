export const CATEGORIES = [
  'Recurring - Essential',
  'Recurring - Non-Essential',
  'Auto',
  'Grocery',
  'Dining',
  'Entertainment',
  'Other - Fun',
  'Other - Responsible',
] as const

export type Category = typeof CATEGORIES[number]

export const RECURRING_CATEGORIES = [
  'Recurring - Essential',
  'Recurring - Non-Essential',
] as const

export function isRecurringCategory(category: string): boolean {
  return RECURRING_CATEGORIES.includes(category as any)
}
