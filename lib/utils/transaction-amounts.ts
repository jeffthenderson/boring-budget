type AccountMeta = {
  type?: string | null
  invertAmounts?: boolean | null
  plaidItemId?: string | null
} | null

type TransactionAmountInput = {
  amount: number
  source?: string | null
  importBatch?: { account?: AccountMeta } | null
  account?: AccountMeta
}

export function getCanonicalAmount(
  amount: number,
  account?: AccountMeta
): number {
  if (!account?.invertAmounts || account?.plaidItemId) return amount
  return -amount
}

export function getExpenseAmount(transaction: TransactionAmountInput): number {
  if (transaction.source === 'import') {
    const account = transaction.importBatch?.account ?? transaction.account ?? null
    const canonical = getCanonicalAmount(transaction.amount, account)
    if (account?.type === 'bank') return -canonical
    if (account?.type === 'credit_card') return canonical
  }

  return transaction.amount
}
