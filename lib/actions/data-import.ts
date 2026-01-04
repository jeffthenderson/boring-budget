'use server'

import { prisma } from '@/lib/db'
import { getCurrentUser } from './user'
import { revalidatePath } from 'next/cache'
import type { ExportData } from './data-export'

/**
 * Clears all user data (for reset or before import)
 */
export async function clearUserData(): Promise<{ success: boolean; message: string }> {
  const user = await getCurrentUser()

  // Delete in order to respect foreign key constraints
  // Most dependent tables first
  await prisma.$transaction([
    // Amazon order transactions (join table)
    prisma.amazonOrderTransaction.deleteMany({
      where: { order: { userId: user.id } },
    }),
    // Amazon order items
    prisma.amazonOrderItem.deleteMany({
      where: { order: { userId: user.id } },
    }),
    // Amazon orders
    prisma.amazonOrder.deleteMany({
      where: { userId: user.id },
    }),
    // Transaction links
    prisma.transactionLink.deleteMany({
      where: { fromTransaction: { period: { userId: user.id } } },
    }),
    // Transfer groups
    prisma.transferGroup.deleteMany({
      where: { period: { userId: user.id } },
    }),
    // Raw import rows
    prisma.rawImportRow.deleteMany({
      where: { account: { userId: user.id } },
    }),
    // Import batches
    prisma.importBatch.deleteMany({
      where: { account: { userId: user.id } },
    }),
    // Transactions
    prisma.transaction.deleteMany({
      where: { period: { userId: user.id } },
    }),
    // Income items
    prisma.incomeItem.deleteMany({
      where: { period: { userId: user.id } },
    }),
    // Category budgets
    prisma.categoryBudget.deleteMany({
      where: { period: { userId: user.id } },
    }),
    // Budget periods
    prisma.budgetPeriod.deleteMany({
      where: { userId: user.id },
    }),
    // Recurring definitions
    prisma.recurringDefinition.deleteMany({
      where: { userId: user.id },
    }),
    // Accounts (this will cascade Plaid data)
    prisma.account.deleteMany({
      where: { userId: user.id },
    }),
    // Ignore rules
    prisma.ignoreRule.deleteMany({
      where: { userId: user.id },
    }),
    // Recurring suggestion dismissals
    prisma.recurringSuggestionDismissal.deleteMany({
      where: { userId: user.id },
    }),
    // Category mapping rules
    prisma.categoryMappingRule.deleteMany({
      where: { userId: user.id },
    }),
    // Category mapping dismissals
    prisma.categoryMappingDismissal.deleteMany({
      where: { userId: user.id },
    }),
    // Preallocation settings
    prisma.preallocationSettings.deleteMany({
      where: { userId: user.id },
    }),
    // Plaid webhook logs
    prisma.plaidWebhookLog.deleteMany({
      where: { userId: user.id },
    }),
  ])

  revalidatePath('/')

  return { success: true, message: 'All data cleared' }
}

/**
 * Imports user data from an export
 */
export async function importUserData(
  data: ExportData
): Promise<{ success: boolean; message: string; stats?: Record<string, number> }> {
  const user = await getCurrentUser()

  if (data.version !== 1) {
    return { success: false, message: `Unsupported export version: ${data.version}` }
  }

  // Maps from old IDs to new IDs
  const accountIdMap = new Map<string, string>()
  const periodIdMap = new Map<string, string>()
  const transactionIdMap = new Map<string, string>()
  const recurringIdMap = new Map<string, string>()
  const amazonOrderIdMap = new Map<string, string>()

  const stats: Record<string, number> = {}

  try {
    // Update user settings
    await prisma.user.update({
      where: { id: user.id },
      data: {
        timezone: data.user.timezone,
        currency: data.user.currency,
      },
    })

    // Create preallocation settings
    if (data.preallocationSettings) {
      await prisma.preallocationSettings.create({
        data: {
          userId: user.id,
          charityPercent: data.preallocationSettings.charityPercent,
          retirementAmount: data.preallocationSettings.retirementAmount,
          otherSavingsAmount: data.preallocationSettings.otherSavingsAmount,
        },
      })
      stats.preallocationSettings = 1
    }

    // Create accounts
    for (const account of data.accounts) {
      const created = await prisma.account.create({
        data: {
          userId: user.id,
          name: account.name,
          type: account.type,
          displayAlias: account.displayAlias,
          last4: account.last4,
          active: account.active,
          invertAmounts: account.invertAmounts,
        },
      })
      accountIdMap.set(account.id, created.id)
    }
    stats.accounts = data.accounts.length

    // Create recurring definitions
    for (const recurring of data.recurringDefinitions) {
      const created = await prisma.recurringDefinition.create({
        data: {
          userId: user.id,
          category: recurring.category,
          merchantLabel: recurring.merchantLabel,
          displayLabel: recurring.displayLabel,
          nominalAmount: recurring.nominalAmount,
          frequency: recurring.frequency,
          schedulingRule: recurring.schedulingRule,
          active: recurring.active,
        },
      })
      recurringIdMap.set(recurring.id, created.id)
    }
    stats.recurringDefinitions = data.recurringDefinitions.length

    // Create budget periods with income items and category budgets
    for (const period of data.budgetPeriods) {
      const created = await prisma.budgetPeriod.create({
        data: {
          userId: user.id,
          year: period.year,
          month: period.month,
          status: period.status,
          incomeItems: {
            create: period.incomeItems.map((i) => ({
              date: new Date(i.date),
              source: i.source,
              amount: i.amount,
            })),
          },
          categoryBudgets: {
            create: period.categoryBudgets.map((cb) => ({
              category: cb.category,
              amountBudgeted: cb.amountBudgeted,
            })),
          },
        },
      })
      periodIdMap.set(period.id, created.id)
    }
    stats.budgetPeriods = data.budgetPeriods.length

    // Create transactions
    for (const tx of data.transactions) {
      const newPeriodId = periodIdMap.get(tx.periodId)
      if (!newPeriodId) continue

      const created = await prisma.transaction.create({
        data: {
          periodId: newPeriodId,
          accountId: tx.accountId ? accountIdMap.get(tx.accountId) : null,
          date: new Date(tx.date),
          description: tx.description,
          subDescription: tx.subDescription,
          userDescription: tx.userDescription,
          amount: tx.amount,
          category: tx.category,
          status: tx.status,
          source: tx.source,
          isIgnored: tx.isIgnored,
          isRecurringInstance: tx.isRecurringInstance,
          recurringDefinitionId: tx.recurringDefinitionId
            ? recurringIdMap.get(tx.recurringDefinitionId)
            : null,
          externalId: tx.externalId,
          sourceImportHash: tx.sourceImportHash,
        },
      })
      transactionIdMap.set(tx.id, created.id)
    }
    stats.transactions = data.transactions.length

    // Create transaction links
    for (const link of data.transactionLinks) {
      const fromId = transactionIdMap.get(link.fromTransactionId)
      const toId = transactionIdMap.get(link.toTransactionId)
      if (!fromId || !toId) continue

      await prisma.transactionLink.create({
        data: {
          type: link.type,
          fromTransactionId: fromId,
          toTransactionId: toId,
          amount: link.amount,
        },
      })
    }
    stats.transactionLinks = data.transactionLinks.length

    // Create transfer groups
    for (const group of data.transferGroups) {
      const newPeriodId = periodIdMap.get(group.periodId)
      if (!newPeriodId) continue

      await prisma.transferGroup.create({
        data: {
          periodId: newPeriodId,
          reason: group.reason,
          leftTransactionId: group.leftTransactionId
            ? transactionIdMap.get(group.leftTransactionId)
            : null,
          rightTransactionId: group.rightTransactionId
            ? transactionIdMap.get(group.rightTransactionId)
            : null,
          status: group.status,
        },
      })
    }
    stats.transferGroups = data.transferGroups.length

    // Create ignore rules
    for (const rule of data.ignoreRules) {
      await prisma.ignoreRule.create({
        data: {
          userId: user.id,
          pattern: rule.pattern,
          normalizedPattern: rule.normalizedPattern,
          active: rule.active,
        },
      })
    }
    stats.ignoreRules = data.ignoreRules.length

    // Create recurring suggestion dismissals
    for (const dismissal of data.recurringSuggestionDismissals) {
      await prisma.recurringSuggestionDismissal.create({
        data: {
          userId: user.id,
          suggestionKey: dismissal.suggestionKey,
        },
      })
    }
    stats.recurringSuggestionDismissals = data.recurringSuggestionDismissals.length

    // Create category mapping rules
    for (const rule of data.categoryMappingRules) {
      await prisma.categoryMappingRule.create({
        data: {
          userId: user.id,
          rawDescription: rule.rawDescription,
          normalizedDescription: rule.normalizedDescription,
          category: rule.category,
          active: rule.active,
        },
      })
    }
    stats.categoryMappingRules = data.categoryMappingRules.length

    // Create category mapping dismissals
    for (const dismissal of data.categoryMappingDismissals) {
      await prisma.categoryMappingDismissal.create({
        data: {
          userId: user.id,
          normalizedDescription: dismissal.normalizedDescription,
        },
      })
    }
    stats.categoryMappingDismissals = data.categoryMappingDismissals.length

    // Create Amazon orders
    for (const order of data.amazonOrders) {
      const created = await prisma.amazonOrder.create({
        data: {
          userId: user.id,
          amazonOrderId: order.amazonOrderId,
          orderDate: new Date(order.orderDate),
          orderTotal: order.orderTotal,
          currency: order.currency,
          orderUrl: order.orderUrl,
          itemCount: order.itemCount,
          isIgnored: order.isIgnored,
          matchStatus: order.matchStatus,
          category: order.category,
          categoryConfidence: order.categoryConfidence,
          items: {
            create: order.items.map((i) => ({
              title: i.title,
              quantity: i.quantity,
            })),
          },
        },
      })
      amazonOrderIdMap.set(order.id, created.id)
    }
    stats.amazonOrders = data.amazonOrders.length

    // Create Amazon order transactions
    for (const aot of data.amazonOrderTransactions) {
      const newOrderId = amazonOrderIdMap.get(aot.orderId)
      const newTransactionId = transactionIdMap.get(aot.transactionId)
      if (!newOrderId || !newTransactionId) continue

      await prisma.amazonOrderTransaction.create({
        data: {
          orderId: newOrderId,
          transactionId: newTransactionId,
        },
      })
    }
    stats.amazonOrderTransactions = data.amazonOrderTransactions.length

    revalidatePath('/')

    return {
      success: true,
      message: 'Import complete',
      stats,
    }
  } catch (error) {
    console.error('Import error:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Import failed',
    }
  }
}
