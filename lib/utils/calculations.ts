import { roundCurrency } from './currency'

export interface PreallocationInputs {
  anticipatedIncome: number
  charityPercent: number
  retirementAmount: number
  otherSavingsAmount: number
}

export interface PreallocationResults {
  anticipatedIncome: number
  charity: number
  retirement: number
  otherSavings: number
  goalBudget: number
}

export function calculatePreallocations(inputs: PreallocationInputs): PreallocationResults {
  const charity = roundCurrency(inputs.anticipatedIncome * (inputs.charityPercent / 100))
  const retirement = roundCurrency(inputs.retirementAmount)
  const otherSavings = roundCurrency(inputs.otherSavingsAmount)
  const goalBudget = roundCurrency(
    inputs.anticipatedIncome - charity - retirement - otherSavings
  )

  return {
    anticipatedIncome: roundCurrency(inputs.anticipatedIncome),
    charity,
    retirement,
    otherSavings,
    goalBudget,
  }
}

export interface CategoryActual {
  category: string
  budgeted: number
  actual: number
  difference: number
}

export function calculateCategoryActual(
  budgeted: number,
  transactions: Array<{ amount: number; status: string }>
): number {
  const actual = transactions.reduce((sum, t) => sum + t.amount, 0)
  return roundCurrency(actual)
}

export function calculateDifference(actual: number, budgeted: number): number {
  return roundCurrency(actual - budgeted)
}
