'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { isRecurringCategory } from '@/lib/constants/categories'
import { buildCompositeDescription, normalizeDescription } from '@/lib/utils/import/normalizer'

export async function addManualTransaction(periodId: string, data: {
  date: Date
  description: string
  amount: number
  category: string
}) {
  const transaction = await prisma.transaction.create({
    data: {
      periodId,
      date: data.date,
      description: data.description,
      amount: data.amount,
      category: data.category,
      status: 'posted',
      source: 'manual',
      isRecurringInstance: false,
    },
  })

  revalidatePath('/')
  return transaction
}

export async function markTransactionPosted(id: string, actualAmount?: number) {
  const transaction = await prisma.transaction.findUnique({
    where: { id },
  })

  if (!transaction) {
    throw new Error('Transaction not found')
  }

  const updated = await prisma.transaction.update({
    where: { id },
    data: {
      status: 'posted',
      amount: actualAmount ?? transaction.amount,
    },
  })

  revalidatePath('/')
  return updated
}

export async function deleteTransaction(id: string) {
  await prisma.transaction.delete({
    where: { id },
  })

  revalidatePath('/')
  return { success: true }
}

export async function getTransactionsByPeriod(periodId: string, filters?: {
  category?: string
  status?: string
}) {
  return prisma.transaction.findMany({
    where: {
      periodId,
      ...(filters?.category && { category: filters.category }),
      ...(filters?.status && { status: filters.status }),
    },
    include: {
      recurringDefinition: true,
    },
    orderBy: { date: 'asc' },
  })
}

export async function updateTransactionCategory(
  transactionId: string,
  newCategory: string,
  options?: { skipMappingSuggestion?: boolean }
): Promise<{
  success: boolean
  error?: string
  mappingSuggestion?: { description: string; subDescription?: string | null; category: string }
}> {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { period: true },
    })

    if (!transaction) {
      return { success: false, error: 'Transaction not found' }
    }

    if (transaction.category === newCategory) {
      return { success: true }
    }

    // Guard: prevent changing projected recurring placeholders
    if (transaction.status === 'projected' && transaction.source === 'recurring') {
      return { success: false, error: 'Cannot change category of projected recurring transaction. Post it or delete it first.' }
    }

    // Guard: prevent turning refunds into recurring
    if (isRecurringCategory(newCategory) && transaction.amount < 0) {
      return { success: false, error: 'Refunds cannot be made recurring' }
    }

    // If changing to non-recurring, unlink
    const wasRecurring = transaction.isRecurringInstance
    const isNowRecurring = isRecurringCategory(newCategory)

    if (wasRecurring && !isNowRecurring) {
      // Unlink from recurring
      await prisma.transaction.update({
        where: { id: transactionId },
        data: {
          category: newCategory,
          isRecurringInstance: false,
          recurringDefinitionId: null,
        },
      })

      return { success: true }
    }

    // If changing to recurring category, just update category
    // The modal will handle the actual linking/creation
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { category: newCategory },
    })

    const shouldSuggest = !options?.skipMappingSuggestion
      && transaction.source === 'import'
      && !transaction.isRecurringInstance
      && !transaction.isIgnored
      && newCategory !== 'Uncategorized'
      && !isRecurringCategory(newCategory)

    if (!shouldSuggest) {
      return { success: true }
    }

    const normalized = normalizeDescription(
      buildCompositeDescription(transaction.description, transaction.subDescription)
    )
    if (!normalized) {
      return { success: true }
    }

    const [existingRule, dismissal] = await Promise.all([
      prisma.categoryMappingRule.findUnique({
        where: {
          userId_normalizedDescription: {
            userId: transaction.period.userId,
            normalizedDescription: normalized,
          },
        },
      }),
      prisma.categoryMappingDismissal.findUnique({
        where: {
          userId_normalizedDescription: {
            userId: transaction.period.userId,
            normalizedDescription: normalized,
          },
        },
      }),
    ])

    if (existingRule || dismissal) {
      return { success: true }
    }

    const sameCategoryTransactions = await prisma.transaction.findMany({
      where: {
        period: { userId: transaction.period.userId },
        source: 'import',
        category: newCategory,
      },
      select: { description: true, subDescription: true },
    })

    const matchCount = sameCategoryTransactions.reduce((count, tx) => {
      const composite = buildCompositeDescription(tx.description, tx.subDescription)
      return count + (normalizeDescription(composite) === normalized ? 1 : 0)
    }, 0)

    if (matchCount < 2) {
      return { success: true }
    }

    return {
      success: true,
      mappingSuggestion: {
        description: transaction.description,
        subDescription: transaction.subDescription,
        category: newCategory,
      },
    }
  } catch (error: any) {
    console.error('Error updating category:', error)
    return { success: false, error: error.message }
  }
}

export async function updateTransactionNote(
  transactionId: string,
  note: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { userDescription: note },
    })

    return { success: true }
  } catch (error: any) {
    console.error('Error updating description:', error)
    return { success: false, error: error.message }
  }
}

export async function linkTransactionToRecurring(
  transactionId: string,
  recurringDefinitionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    })

    if (!transaction) {
      return { success: false, error: 'Transaction not found' }
    }

    const definition = await prisma.recurringDefinition.findUnique({
      where: { id: recurringDefinitionId },
    })

    if (!definition) {
      return { success: false, error: 'Recurring definition not found' }
    }

    // Find and remove any projected placeholder for this definition in this month
    const projectedPlaceholder = await prisma.transaction.findFirst({
      where: {
        periodId: transaction.periodId,
        recurringDefinitionId,
        status: 'projected',
        source: 'recurring',
      },
    })

    if (projectedPlaceholder) {
      await prisma.transaction.delete({
        where: { id: projectedPlaceholder.id },
      })
    }

    // Link transaction to definition
    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        category: definition.category,
        isRecurringInstance: true,
        recurringDefinitionId,
        status: 'posted',
      },
    })

    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    console.error('Error linking transaction:', error)
    return { success: false, error: error.message }
  }
}

export async function createRecurringFromTransaction(
  transactionId: string,
  data: {
    merchantLabel: string
    displayLabel?: string
    nominalAmount: number
    frequency: string
    schedulingRule: string
    category?: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { period: { include: { user: true } } },
    })

    if (!transaction) {
      return { success: false, error: 'Transaction not found' }
    }

    // Create the recurring definition with provided category or transaction's current category
    const merchantLabel = data.merchantLabel.trim()
    const displayLabel = (data.displayLabel ?? '').trim() || merchantLabel

  const definition = await prisma.recurringDefinition.create({
    data: {
      userId: transaction.period.userId,
      category: data.category || transaction.category,
        merchantLabel,
        displayLabel,
        nominalAmount: data.nominalAmount,
        frequency: data.frequency,
        schedulingRule: data.schedulingRule,
        active: true,
    },
  })

  // Link transaction to the new definition
  await linkTransactionToRecurring(transactionId, definition.id)

  revalidatePath('/')
  revalidatePath('/recurring')
  return { success: true }
  } catch (error: any) {
    console.error('Error creating recurring:', error)
    return { success: false, error: error.message }
  }
}

export async function getActiveRecurringDefinitions(
  userId: string,
  category?: string
): Promise<Array<{ id: string; merchantLabel: string; displayLabel: string | null; nominalAmount: number; frequency: string; category: string }>> {
  const definitions = await prisma.recurringDefinition.findMany({
    where: {
      userId,
      ...(category && { category }),
      active: true,
    },
    select: {
      id: true,
      merchantLabel: true,
      displayLabel: true,
      nominalAmount: true,
      frequency: true,
      category: true,
    },
    orderBy: { merchantLabel: 'asc' },
  })

  return definitions
}

export async function setTransactionIgnored(
  transactionId: string,
  ignored: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { isIgnored: ignored },
    })

    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    console.error('Error updating ignored status:', error)
    return { success: false, error: error.message }
  }
}
