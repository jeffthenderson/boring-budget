export const BUDGET_CATEGORIES = [
  'Recurring - Essential',
  'Recurring - Non-Essential',
  'Auto',
  'Grocery',
  'Dining',
  'Entertainment',
  'Other - Fun',
  'Other - Responsible',
] as const

export const CATEGORIES = BUDGET_CATEGORIES

export const TRANSACTION_CATEGORIES = [
  ...BUDGET_CATEGORIES,
  'Income',
  'Uncategorized',
] as const

export type Category = typeof TRANSACTION_CATEGORIES[number]
export type BudgetCategory = typeof BUDGET_CATEGORIES[number]

export const RECURRING_CATEGORIES = [
  'Recurring - Essential',
  'Recurring - Non-Essential',
] as const

export function isRecurringCategory(category: string): boolean {
  return RECURRING_CATEGORIES.includes(category as any)
}

export const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  'Recurring - Essential': { bg: 'bg-red-100', text: 'text-red-800' },
  'Recurring - Non-Essential': { bg: 'bg-orange-100', text: 'text-orange-800' },
  'Auto': { bg: 'bg-blue-100', text: 'text-blue-800' },
  'Grocery': { bg: 'bg-green-100', text: 'text-green-800' },
  'Dining': { bg: 'bg-purple-100', text: 'text-purple-800' },
  'Entertainment': { bg: 'bg-pink-100', text: 'text-pink-800' },
  'Other - Fun': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  'Other - Responsible': { bg: 'bg-cyan-100', text: 'text-cyan-800' },
  'Income': { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  'Uncategorized': { bg: 'bg-gray-100', text: 'text-gray-800' },
}

export function getCategoryColor(category: string): { bg: string; text: string } {
  return CATEGORY_COLORS[category] || { bg: 'bg-gray-100', text: 'text-gray-800' }
}

export function isIncomeCategory(category: string): boolean {
  return category === 'Income'
}

export function isBudgetCategory(category: string): boolean {
  return BUDGET_CATEGORIES.includes(category as BudgetCategory)
}
