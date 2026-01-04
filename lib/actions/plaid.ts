'use server'

import { prisma } from '@/lib/db'
import { getCurrentUser } from './user'
import { revalidatePath } from 'next/cache'
import { plaidClient, isPlaidConfigured } from '@/lib/plaid/client'
import { encryptAccessToken, decryptAccessToken } from '@/lib/plaid/encryption'
import { CountryCode, Products } from 'plaid'
import { requireMfa, checkMfaStatus } from '@/lib/auth'

const PLAID_WEBHOOK_URL = process.env.PLAID_WEBHOOK_URL
const REQUIRE_MFA_FOR_PLAID = process.env.REQUIRE_MFA_FOR_PLAID !== 'false'

/**
 * Check if user can use Plaid (has MFA if required)
 */
export async function canUsePlaid(): Promise<{ allowed: boolean; reason?: string }> {
  if (!REQUIRE_MFA_FOR_PLAID) {
    return { allowed: true }
  }

  const status = await checkMfaStatus()

  if (!status.enabled) {
    return {
      allowed: false,
      reason: 'Please enable two-factor authentication in Settings before connecting your bank.',
    }
  }

  if (!status.verified) {
    return {
      allowed: false,
      reason: 'Please verify your two-factor authentication to continue.',
    }
  }

  return { allowed: true }
}

/**
 * Creates a Plaid Link token for initiating the Link flow
 */
export async function createLinkToken() {
  if (!isPlaidConfigured()) {
    throw new Error('Plaid is not configured')
  }

  // Require MFA for Plaid operations
  if (REQUIRE_MFA_FOR_PLAID) {
    await requireMfa()
  }

  const user = await getCurrentUser()

  const response = await plaidClient.linkTokenCreate({
    user: {
      client_user_id: user.id,
    },
    client_name: 'Boring Budget',
    products: [Products.Transactions],
    country_codes: [CountryCode.Us, CountryCode.Ca],
    language: 'en',
    webhook: PLAID_WEBHOOK_URL,
    transactions: {
      days_requested: 90, // Start with 90 days, can increase later
    },
    account_filters: {
      depository: {
        account_subtypes: ['checking' as any, 'savings' as any],
      },
      credit: {
        account_subtypes: ['credit card' as any],
      },
    },
  })

  return {
    linkToken: response.data.link_token,
    expiration: response.data.expiration,
  }
}

/**
 * Creates a Plaid Link token in update mode for re-authenticating a broken connection
 */
export async function createUpdateModeLinkToken(accountId: string) {
  if (!isPlaidConfigured()) {
    throw new Error('Plaid is not configured')
  }

  const user = await getCurrentUser()

  // Get the account and verify ownership
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId: user.id },
  })

  if (!account) {
    throw new Error('Account not found')
  }

  if (!account.plaidAccessToken) {
    throw new Error('Account is not linked to Plaid')
  }

  const accessToken = decryptAccessToken(account.plaidAccessToken)

  const response = await plaidClient.linkTokenCreate({
    user: {
      client_user_id: user.id,
    },
    client_name: 'Boring Budget',
    country_codes: [CountryCode.Us, CountryCode.Ca],
    language: 'en',
    webhook: PLAID_WEBHOOK_URL,
    access_token: accessToken, // This puts Link in update mode
  })

  return {
    linkToken: response.data.link_token,
    expiration: response.data.expiration,
  }
}

/**
 * Marks an account as needing re-authentication
 */
export async function markAccountNeedsReauth(accountId: string) {
  const user = await getCurrentUser()

  await prisma.account.update({
    where: {
      id: accountId,
      userId: user.id,
    },
    data: {
      plaidError: 'ITEM_LOGIN_REQUIRED',
    },
  })

  revalidatePath('/accounts')
}

/**
 * Clears the reauth error after successful update
 * Clears errors for all accounts sharing the same Item ID
 */
export async function clearAccountError(accountId: string) {
  const user = await getCurrentUser()

  // Get the account to find its Item ID
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId: user.id },
    select: { plaidItemId: true },
  })

  if (!account?.plaidItemId) {
    // No Item ID, just clear this account's error
    await prisma.account.update({
      where: { id: accountId },
      data: { plaidError: null },
    })
  } else {
    // Clear errors for all accounts with this Item ID
    await prisma.account.updateMany({
      where: {
        userId: user.id,
        plaidItemId: account.plaidItemId,
      },
      data: {
        plaidError: null,
      },
    })
  }

  revalidatePath('/accounts')
}

/**
 * Exchanges a public token for an access token and stores it
 */
export async function exchangePublicToken(data: {
  publicToken: string
  accountId: string // Boring Budget account ID to link
  institutionId?: string
  institutionName?: string
  plaidAccountId?: string // Specific Plaid account ID if multiple
}) {
  if (!isPlaidConfigured()) {
    throw new Error('Plaid is not configured')
  }

  const user = await getCurrentUser()

  // Verify the account belongs to this user
  const account = await prisma.account.findFirst({
    where: { id: data.accountId, userId: user.id },
  })

  if (!account) {
    throw new Error('Account not found')
  }

  // Exchange public token for access token
  const tokenResponse = await plaidClient.itemPublicTokenExchange({
    public_token: data.publicToken,
  })

  const accessToken = tokenResponse.data.access_token
  const itemId = tokenResponse.data.item_id

  // Encrypt the access token before storing
  const encryptedToken = encryptAccessToken(accessToken)

  // Update the account with Plaid credentials
  const updated = await prisma.account.update({
    where: { id: account.id },
    data: {
      plaidItemId: itemId,
      plaidAccessToken: encryptedToken,
      plaidAccountId: data.plaidAccountId,
      plaidInstitutionId: data.institutionId,
      plaidInstitutionName: data.institutionName,
    },
  })

  revalidatePath('/accounts')

  return {
    success: true,
    itemId,
    accountId: updated.id,
  }
}

/**
 * Gets the decrypted access token for an account
 * Internal use only - never expose to client
 */
export async function getAccessToken(accountId: string): Promise<string | null> {
  const user = await getCurrentUser()

  const account = await prisma.account.findFirst({
    where: { id: accountId, userId: user.id },
  })

  if (!account?.plaidAccessToken) {
    return null
  }

  return decryptAccessToken(account.plaidAccessToken)
}

/**
 * Unlinks a Plaid connection from an account
 */
export async function unlinkPlaidAccount(accountId: string) {
  const user = await getCurrentUser()

  const account = await prisma.account.findFirst({
    where: { id: accountId, userId: user.id },
  })

  if (!account) {
    throw new Error('Account not found')
  }

  // If there's an access token, revoke it with Plaid
  if (account.plaidAccessToken) {
    try {
      const accessToken = decryptAccessToken(account.plaidAccessToken)
      await plaidClient.itemRemove({
        access_token: accessToken,
      })
    } catch (error) {
      // Log but don't fail - we still want to clear local data
      console.error('Error revoking Plaid access token:', error)
    }
  }

  // Clear Plaid data from account
  await prisma.account.update({
    where: { id: account.id },
    data: {
      plaidItemId: null,
      plaidAccessToken: null,
      plaidAccountId: null,
      plaidSyncCursor: null,
      plaidLastSyncAt: null,
      plaidInstitutionId: null,
      plaidInstitutionName: null,
    },
  })

  revalidatePath('/accounts')

  return { success: true }
}

/**
 * Gets the Plaid link status for all accounts
 */
export async function getPlaidStatus() {
  const user = await getCurrentUser()

  const accounts = await prisma.account.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      plaidItemId: true,
      plaidInstitutionName: true,
      plaidLastSyncAt: true,
    },
  })

  return accounts.map(account => ({
    id: account.id,
    name: account.name,
    isLinked: Boolean(account.plaidItemId),
    institutionName: account.plaidInstitutionName,
    lastSyncAt: account.plaidLastSyncAt,
  }))
}

/**
 * Finds an account by Plaid Item ID
 * Note: Multiple accounts can share the same Item ID (e.g., checking + savings from same bank)
 * This returns the first one found, which is sufficient for webhook handling
 */
export async function getAccountByItemId(itemId: string) {
  return prisma.account.findFirst({
    where: { plaidItemId: itemId },
    include: { user: true },
  })
}

/**
 * Creates multiple accounts from Plaid Link
 */
export async function createAccountsFromPlaid(data: {
  publicToken: string
  institutionId: string
  institutionName: string
  accounts: Array<{
    plaidAccountId: string
    name: string
    mask: string
    type: 'depository' | 'credit'
    subtype: string
  }>
}) {
  if (!isPlaidConfigured()) {
    throw new Error('Plaid is not configured')
  }

  // Require MFA for Plaid operations
  if (REQUIRE_MFA_FOR_PLAID) {
    await requireMfa()
  }

  const user = await getCurrentUser()

  if (!data.accounts || data.accounts.length === 0) {
    throw new Error('No accounts provided')
  }

  // Check for duplicate accounts (same Plaid account ID already linked)
  const plaidAccountIds = data.accounts.map(a => a.plaidAccountId)
  const existingAccounts = await prisma.account.findMany({
    where: {
      userId: user.id,
      plaidAccountId: { in: plaidAccountIds },
    },
    select: {
      id: true,
      name: true,
      plaidAccountId: true,
    },
  })

  if (existingAccounts.length > 0) {
    const duplicateNames = existingAccounts.map(a => a.name).join(', ')
    throw new Error(`These accounts are already connected: ${duplicateNames}`)
  }

  // Exchange public token for access token (only once for all accounts)
  const exchangeResponse = await plaidClient.itemPublicTokenExchange({
    public_token: data.publicToken,
  })

  const accessToken = exchangeResponse.data.access_token
  const itemId = exchangeResponse.data.item_id
  const encryptedToken = encryptAccessToken(accessToken)

  // Create all accounts in the database
  const createdAccountIds: string[] = []

  for (const account of data.accounts) {
    // Determine account type
    // Note: Plaid already uses correct sign convention (positive = expense)
    // so we never need to invert amounts for Plaid-linked accounts
    const isCredit = account.type === 'credit'
    const accountType = isCredit ? 'credit_card' : 'bank'

    const createdAccount = await prisma.account.create({
      data: {
        userId: user.id,
        name: account.name,
        type: accountType,
        active: true,
        last4: account.mask,
        plaidItemId: itemId,
        plaidAccessToken: encryptedToken,
        plaidAccountId: account.plaidAccountId,
        plaidInstitutionId: data.institutionId,
        plaidInstitutionName: data.institutionName,
        invertAmounts: false, // Plaid uses correct convention, never invert
      },
    })

    createdAccountIds.push(createdAccount.id)
  }

  revalidatePath('/accounts')

  return {
    success: true,
    accountIds: createdAccountIds,
    itemId,
  }
}

/**
 * Resets the sync cursor for all Plaid-connected accounts
 * This forces a full re-sync on the next sync operation
 */
export async function resetPlaidSyncCursors() {
  const user = await getCurrentUser()

  const result = await prisma.account.updateMany({
    where: {
      userId: user.id,
      plaidItemId: { not: null },
    },
    data: {
      plaidSyncCursor: null,
    },
  })

  revalidatePath('/accounts')

  return {
    success: true,
    accountsReset: result.count,
  }
}
