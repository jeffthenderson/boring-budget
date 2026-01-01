type AccountMeta = {
  type?: string | null
  invertAmounts?: boolean | null
} | null

type TransactionAmountInput = {
  amount: number
  source?: string | null
  importBatch?: { account?: AccountMeta } | null
}

export function getCanonicalAmount(
  amount: number,
  account?: AccountMeta
): number {
  if (!account?.invertAmounts) return amount
  return -amount
}

export function getExpenseAmount(transaction: TransactionAmountInput): number {
  if (transaction.source === 'import') {
    const account = transaction.importBatch?.account
    const canonical = getCanonicalAmount(transaction.amount, account)
    if (account?.type === 'bank') return -canonical
    if (account?.type === 'credit_card') return canonical
  }

  return transaction.amount
}
