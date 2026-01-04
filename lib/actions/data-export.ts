'use server'

import { prisma } from '@/lib/db'
import { getCurrentUser } from './user'

export interface ExportData {
  version: number
  exportedAt: string
  user: {
    timezone: string
    currency: string
  }
  preallocationSettings: {
    charityPercent: number
    retirementAmount: number
    otherSavingsAmount: number
  } | null
  accounts: Array<{
    id: string
    name: string
    type: string
    displayAlias: string | null
    last4: string | null
    active: boolean
    invertAmounts: boolean
  }>
  budgetPeriods: Array<{
    id: string
    year: number
    month: number
    status: string
    incomeItems: Array<{
      id: string
      date: string
      source: string
      amount: number
    }>
    categoryBudgets: Array<{
      category: string
      amountBudgeted: number
    }>
  }>
  transactions: Array<{
    id: string
    periodId: string
    accountId: string | null
    date: string
    description: string
    subDescription: string | null
    userDescription: string | null
    amount: number
    category: string
    status: string
    source: string
    isIgnored: boolean
    isRecurringInstance: boolean
    recurringDefinitionId: string | null
    externalId: string | null
    sourceImportHash: string | null
  }>
  recurringDefinitions: Array<{
    id: string
    category: string
    merchantLabel: string
    displayLabel: string | null
    nominalAmount: number
    frequency: string
    schedulingRule: string
    active: boolean
  }>
  transactionLinks: Array<{
    type: string
    fromTransactionId: string
    toTransactionId: string
    amount: number
  }>
  transferGroups: Array<{
    periodId: string
    reason: string
    leftTransactionId: string | null
    rightTransactionId: string | null
    status: string
  }>
  ignoreRules: Array<{
    pattern: string
    normalizedPattern: string
    active: boolean
  }>
  recurringSuggestionDismissals: Array<{
    suggestionKey: string
  }>
  categoryMappingRules: Array<{
    rawDescription: string
    normalizedDescription: string
    category: string
    active: boolean
  }>
  categoryMappingDismissals: Array<{
    normalizedDescription: string
  }>
  amazonOrders: Array<{
    id: string
    amazonOrderId: string
    orderDate: string
    orderTotal: number
    currency: string
    orderUrl: string | null
    itemCount: number
    isIgnored: boolean
    matchStatus: string
    category: string | null
    categoryConfidence: number | null
    items: Array<{
      title: string
      quantity: number
    }>
  }>
  amazonOrderTransactions: Array<{
    orderId: string
    transactionId: string
  }>
}

/**
 * Exports all user data to a JSON structure
 */
export async function exportUserData(): Promise<ExportData> {
  const user = await getCurrentUser()

  // Fetch all user data
  const [
    userData,
    preallocationSettings,
    accounts,
    budgetPeriods,
    transactions,
    recurringDefinitions,
    transactionLinks,
    transferGroups,
    ignoreRules,
    recurringSuggestionDismissals,
    categoryMappingRules,
    categoryMappingDismissals,
    amazonOrders,
    amazonOrderTransactions,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id } }),
    prisma.preallocationSettings.findUnique({ where: { userId: user.id } }),
    prisma.account.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        type: true,
        displayAlias: true,
        last4: true,
        active: true,
        invertAmounts: true,
        // Exclude Plaid data for security
      },
    }),
    prisma.budgetPeriod.findMany({
      where: { userId: user.id },
      include: {
        incomeItems: true,
        categoryBudgets: true,
      },
    }),
    prisma.transaction.findMany({
      where: { period: { userId: user.id } },
    }),
    prisma.recurringDefinition.findMany({
      where: { userId: user.id },
    }),
    prisma.transactionLink.findMany({
      where: { fromTransaction: { period: { userId: user.id } } },
    }),
    prisma.transferGroup.findMany({
      where: { period: { userId: user.id } },
    }),
    prisma.ignoreRule.findMany({
      where: { userId: user.id },
    }),
    prisma.recurringSuggestionDismissal.findMany({
      where: { userId: user.id },
    }),
    prisma.categoryMappingRule.findMany({
      where: { userId: user.id },
    }),
    prisma.categoryMappingDismissal.findMany({
      where: { userId: user.id },
    }),
    prisma.amazonOrder.findMany({
      where: { userId: user.id },
      include: { items: true },
    }),
    prisma.amazonOrderTransaction.findMany({
      where: { order: { userId: user.id } },
    }),
  ])

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    user: {
      timezone: userData?.timezone || 'America/New_York',
      currency: userData?.currency || 'USD',
    },
    preallocationSettings: preallocationSettings
      ? {
          charityPercent: preallocationSettings.charityPercent,
          retirementAmount: preallocationSettings.retirementAmount,
          otherSavingsAmount: preallocationSettings.otherSavingsAmount,
        }
      : null,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      displayAlias: a.displayAlias,
      last4: a.last4,
      active: a.active,
      invertAmounts: a.invertAmounts,
    })),
    budgetPeriods: budgetPeriods.map((p) => ({
      id: p.id,
      year: p.year,
      month: p.month,
      status: p.status,
      incomeItems: p.incomeItems.map((i) => ({
        id: i.id,
        date: i.date.toISOString(),
        source: i.source,
        amount: i.amount,
      })),
      categoryBudgets: p.categoryBudgets.map((cb) => ({
        category: cb.category,
        amountBudgeted: cb.amountBudgeted,
      })),
    })),
    transactions: transactions.map((t) => ({
      id: t.id,
      periodId: t.periodId,
      accountId: t.accountId,
      date: t.date.toISOString(),
      description: t.description,
      subDescription: t.subDescription,
      userDescription: t.userDescription,
      amount: t.amount,
      category: t.category,
      status: t.status,
      source: t.source,
      isIgnored: t.isIgnored,
      isRecurringInstance: t.isRecurringInstance,
      recurringDefinitionId: t.recurringDefinitionId,
      externalId: t.externalId,
      sourceImportHash: t.sourceImportHash,
    })),
    recurringDefinitions: recurringDefinitions.map((r) => ({
      id: r.id,
      category: r.category,
      merchantLabel: r.merchantLabel,
      displayLabel: r.displayLabel,
      nominalAmount: r.nominalAmount,
      frequency: r.frequency,
      schedulingRule: r.schedulingRule,
      active: r.active,
    })),
    transactionLinks: transactionLinks.map((l) => ({
      type: l.type,
      fromTransactionId: l.fromTransactionId,
      toTransactionId: l.toTransactionId,
      amount: l.amount,
    })),
    transferGroups: transferGroups.map((g) => ({
      periodId: g.periodId,
      reason: g.reason,
      leftTransactionId: g.leftTransactionId,
      rightTransactionId: g.rightTransactionId,
      status: g.status,
    })),
    ignoreRules: ignoreRules.map((r) => ({
      pattern: r.pattern,
      normalizedPattern: r.normalizedPattern,
      active: r.active,
    })),
    recurringSuggestionDismissals: recurringSuggestionDismissals.map((d) => ({
      suggestionKey: d.suggestionKey,
    })),
    categoryMappingRules: categoryMappingRules.map((r) => ({
      rawDescription: r.rawDescription,
      normalizedDescription: r.normalizedDescription,
      category: r.category,
      active: r.active,
    })),
    categoryMappingDismissals: categoryMappingDismissals.map((d) => ({
      normalizedDescription: d.normalizedDescription,
    })),
    amazonOrders: amazonOrders.map((o) => ({
      id: o.id,
      amazonOrderId: o.amazonOrderId,
      orderDate: o.orderDate.toISOString(),
      orderTotal: o.orderTotal,
      currency: o.currency,
      orderUrl: o.orderUrl,
      itemCount: o.itemCount,
      isIgnored: o.isIgnored,
      matchStatus: o.matchStatus,
      category: o.category,
      categoryConfidence: o.categoryConfidence,
      items: o.items.map((i) => ({
        title: i.title,
        quantity: i.quantity,
      })),
    })),
    amazonOrderTransactions: amazonOrderTransactions.map((aot) => ({
      orderId: aot.orderId,
      transactionId: aot.transactionId,
    })),
  }
}
