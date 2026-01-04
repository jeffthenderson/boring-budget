import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncPlaidTransactions } from '@/lib/plaid/sync'
import { getAccountByItemId } from '@/lib/actions/plaid'

// Plaid webhook types
type WebhookType = 'TRANSACTIONS' | 'ITEM' | 'AUTH' | 'ASSETS' | 'INVESTMENTS_TRANSACTIONS' | 'HOLDINGS'
type TransactionsWebhookCode =
  | 'SYNC_UPDATES_AVAILABLE'
  | 'RECURRING_TRANSACTIONS_UPDATE'
  | 'INITIAL_UPDATE'
  | 'HISTORICAL_UPDATE'
  | 'DEFAULT_UPDATE'
type ItemWebhookCode =
  | 'ERROR'
  | 'PENDING_EXPIRATION'
  | 'USER_PERMISSION_REVOKED'
  | 'WEBHOOK_UPDATE_ACKNOWLEDGED'

interface PlaidWebhook {
  webhook_type: WebhookType
  webhook_code: string
  item_id: string
  error?: {
    error_type: string
    error_code: string
    error_message: string
  }
  new_transactions?: number
  removed_transactions?: string[]
  consent_expiration_time?: string
}

export async function POST(request: Request) {
  try {
    const webhook: PlaidWebhook = await request.json()

    // Find the account associated with this item
    const account = await getAccountByItemId(webhook.item_id)

    if (!account) {
      console.warn(`Received webhook for unknown item_id: ${webhook.item_id}`)
      // Return 200 to acknowledge receipt even if we don't recognize the item
      return NextResponse.json({ received: true })
    }

    // Log the webhook
    await prisma.plaidWebhookLog.create({
      data: {
        userId: account.userId,
        itemId: webhook.item_id,
        webhookType: webhook.webhook_type,
        webhookCode: webhook.webhook_code,
        payload: webhook as any,
      },
    })

    // Handle different webhook types
    switch (webhook.webhook_type) {
      case 'TRANSACTIONS':
        await handleTransactionsWebhook(webhook, account.id)
        break

      case 'ITEM':
        await handleItemWebhook(webhook, account.id)
        break

      default:
        console.log(`Unhandled webhook type: ${webhook.webhook_type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Error processing webhook:', error)
    // Return 200 to prevent Plaid from retrying
    // Log the error for investigation
    return NextResponse.json({ received: true, error: 'Processing failed' })
  }
}

async function handleTransactionsWebhook(webhook: PlaidWebhook, accountId: string) {
  const code = webhook.webhook_code as TransactionsWebhookCode

  switch (code) {
    case 'SYNC_UPDATES_AVAILABLE':
      // New transactions are available, trigger a sync
      console.log(`Syncing transactions for account ${accountId}`)
      try {
        const result = await syncPlaidTransactions(accountId)
        console.log(`Sync complete for account ${accountId}:`, result)

        // Update the webhook log with success
        await prisma.plaidWebhookLog.updateMany({
          where: {
            itemId: webhook.item_id,
            webhookCode: code,
            processedAt: null,
          },
          data: {
            processedAt: new Date(),
          },
        })
      } catch (error) {
        console.error(`Sync failed for account ${accountId}:`, error)

        // Update the webhook log with error
        await prisma.plaidWebhookLog.updateMany({
          where: {
            itemId: webhook.item_id,
            webhookCode: code,
            processedAt: null,
          },
          data: {
            processedAt: new Date(),
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        })
      }
      break

    case 'INITIAL_UPDATE':
      // Initial transaction data is ready
      console.log(`Initial update complete for item ${webhook.item_id}`)
      break

    case 'HISTORICAL_UPDATE':
      // Historical transaction data is ready
      console.log(`Historical update complete for item ${webhook.item_id}`)
      // Trigger a sync to get the historical data
      try {
        await syncPlaidTransactions(accountId)
      } catch (error) {
        console.error(`Historical sync failed for account ${accountId}:`, error)
      }
      break

    case 'RECURRING_TRANSACTIONS_UPDATE':
      // Recurring transactions have been updated
      console.log(`Recurring transactions updated for item ${webhook.item_id}`)
      break

    default:
      console.log(`Unhandled transactions webhook code: ${code}`)
  }
}

async function handleItemWebhook(webhook: PlaidWebhook, accountId: string) {
  const code = webhook.webhook_code as ItemWebhookCode
  const itemId = webhook.item_id

  // Item webhooks affect all accounts with this Item ID (e.g., checking + savings from same bank)
  switch (code) {
    case 'ERROR':
      // There's an error with the item
      console.error(`Item error for ${itemId}:`, webhook.error)

      // If login is required, mark all accounts with this Item ID
      if (webhook.error?.error_code === 'ITEM_LOGIN_REQUIRED') {
        await prisma.account.updateMany({
          where: { plaidItemId: itemId },
          data: { plaidError: 'ITEM_LOGIN_REQUIRED' },
        })
      }
      break

    case 'PENDING_EXPIRATION':
      // User's consent is about to expire
      console.warn(`Consent expiring for item ${itemId} at ${webhook.consent_expiration_time}`)
      // Mark all accounts with this Item ID as needing attention soon
      await prisma.account.updateMany({
        where: { plaidItemId: itemId },
        data: { plaidError: 'PENDING_EXPIRATION' },
      })
      break

    case 'USER_PERMISSION_REVOKED':
      // User revoked permission
      console.log(`User revoked permission for item ${itemId}`)
      // Clear the Plaid data from all accounts with this Item ID
      await prisma.account.updateMany({
        where: { plaidItemId: itemId },
        data: {
          plaidItemId: null,
          plaidAccessToken: null,
          plaidAccountId: null,
          plaidSyncCursor: null,
          plaidLastSyncAt: null,
          plaidError: null,
        },
      })
      break

    default:
      console.log(`Unhandled item webhook code: ${code}`)
  }
}
