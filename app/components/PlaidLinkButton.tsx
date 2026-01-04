'use client'

import { useCallback, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { Button } from './Button'
import { PlaidAccountMappingDialog } from './PlaidAccountMappingDialog'

interface PlaidAccountOption {
  plaidAccountId: string
  name: string
  mask: string
  type: 'depository' | 'credit'
  subtype: string
}

interface PlaidLinkButtonProps {
  accountId: string
  accountName: string
  isLinked: boolean
  institutionName?: string | null
  lastSyncAt?: Date | null
  plaidError?: string | null
  onSuccess: () => void
}

export function PlaidLinkButton({
  accountId,
  accountName,
  isLinked,
  institutionName,
  lastSyncAt,
  plaidError,
  onSuccess,
}: PlaidLinkButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isFixing, setIsFixing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // State for account mapping dialog
  const [showMappingDialog, setShowMappingDialog] = useState(false)
  const [pendingPublicToken, setPendingPublicToken] = useState<string>('')
  const [pendingInstitution, setPendingInstitution] = useState<{ id: string; name: string } | null>(null)
  const [pendingPlaidAccounts, setPendingPlaidAccounts] = useState<PlaidAccountOption[]>([])

  // Determine if we need to show error state
  const hasConnectionError = Boolean(plaidError)
  const errorMessage = plaidError === 'ITEM_LOGIN_REQUIRED'
    ? 'Login required'
    : plaidError === 'PENDING_EXPIRATION'
    ? 'Consent expiring'
    : plaidError

  // Fetch link token when user wants to connect
  const fetchLinkToken = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/plaid/link-token', {
        method: 'POST',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create link token')
      }

      setLinkToken(data.linkToken)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize Plaid'
      // Check for MFA-related errors and provide a clearer message
      if (message.includes('MFA_VERIFICATION_REQUIRED') || message.includes('verify your two-factor')) {
        setError('Log out and back in to activate 2FA')
      } else if (message.includes('MFA_REQUIRED') || message.includes('enable two-factor')) {
        setError('Enable 2FA in Settings to link bank')
      } else {
        setError(message)
      }
      console.error('Error fetching link token:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch update mode link token for fixing broken connections
  const fetchUpdateModeLinkToken = useCallback(async () => {
    setIsFixing(true)
    setError(null)

    try {
      const res = await fetch('/api/plaid/update-link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create update link token')
      }

      const data = await res.json()
      setLinkToken(data.linkToken)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize Plaid')
      console.error('Error fetching update link token:', err)
      setIsFixing(false)
    }
  }, [accountId])

  // Handle successful Plaid Link connection
  const handleOnSuccess = useCallback(
    async (publicToken: string, metadata: any) => {
      // If we were in update/fix mode, there's no public token exchange needed
      // The user just re-authenticated, so we clear the error and sync
      if (isFixing) {
        try {
          // Clear the error on the account
          await fetch('/api/plaid/clear-error', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId }),
          })

          // Trigger a sync to get latest transactions
          await fetch('/api/plaid/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId }),
          })

          onSuccess()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to complete re-authentication')
          console.error('Error completing re-auth:', err)
        } finally {
          setIsFixing(false)
          setLinkToken(null)
        }
        return
      }

      // Normal new connection flow - show mapping dialog to let user pick the right account
      const accounts: PlaidAccountOption[] = metadata.accounts?.map((account: any) => ({
        plaidAccountId: account.id,
        name: account.name,
        mask: account.mask || '',
        type: account.type,
        subtype: account.subtype,
      })) || []

      if (accounts.length === 0) {
        setError('No accounts were returned from Plaid')
        setLinkToken(null)
        return
      }

      // If only one account, skip the dialog and link directly
      if (accounts.length === 1) {
        await completeAccountLink(publicToken, accounts[0].plaidAccountId, metadata.institution)
        return
      }

      // Multiple accounts - show mapping dialog
      setPendingPublicToken(publicToken)
      setPendingInstitution({
        id: metadata.institution?.institution_id || '',
        name: metadata.institution?.name || 'Unknown Bank',
      })
      setPendingPlaidAccounts(accounts)
      setShowMappingDialog(true)
      setLinkToken(null)
    },
    [accountId, onSuccess, isFixing]
  )

  // Complete the account linking after user selects which Plaid account to map
  const completeAccountLink = async (
    publicToken: string,
    plaidAccountId: string,
    institution?: { institution_id?: string; name?: string }
  ) => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/plaid/exchange-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicToken,
          accountId,
          institutionId: institution?.institution_id,
          institutionName: institution?.name,
          plaidAccountId,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to link account')
      }

      // Trigger initial sync
      await fetch('/api/plaid/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })

      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete linking')
      console.error('Error exchanging token:', err)
    } finally {
      setIsLoading(false)
      setLinkToken(null)
    }
  }

  // Handle mapping dialog confirmation
  const handleMappingConfirm = async (selectedPlaidAccountId: string) => {
    setShowMappingDialog(false)
    await completeAccountLink(
      pendingPublicToken,
      selectedPlaidAccountId,
      pendingInstitution ? { institution_id: pendingInstitution.id, name: pendingInstitution.name } : undefined
    )
    // Clear pending state
    setPendingPublicToken('')
    setPendingInstitution(null)
    setPendingPlaidAccounts([])
  }

  // Handle mapping dialog cancel
  const handleMappingCancel = () => {
    setShowMappingDialog(false)
    setPendingPublicToken('')
    setPendingInstitution(null)
    setPendingPlaidAccounts([])
  }

  const handleOnExit = useCallback(() => {
    setLinkToken(null)
    setIsFixing(false)
  }, [])

  // Configure Plaid Link
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: handleOnSuccess,
    onExit: handleOnExit,
  })

  // Open Plaid Link when token is ready
  const handleConnect = useCallback(async () => {
    if (linkToken && ready) {
      open()
    } else {
      await fetchLinkToken()
    }
  }, [linkToken, ready, open, fetchLinkToken])

  // When link token changes and is ready, open Plaid Link
  const handleOpenLink = useCallback(() => {
    if (linkToken && ready) {
      open()
    }
  }, [linkToken, ready, open])

  // Auto-open when token is fetched
  if (linkToken && ready && !isLoading) {
    // Use setTimeout to avoid state update during render
    setTimeout(handleOpenLink, 0)
  }

  // Handle manual sync
  const handleSync = useCallback(async () => {
    setIsSyncing(true)
    setError(null)

    try {
      const res = await fetch('/api/plaid/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })

      if (!res.ok) {
        throw new Error('Sync failed')
      }

      const result = await res.json()
      console.log('Sync result:', result)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setIsSyncing(false)
    }
  }, [accountId, onSuccess])

  // Handle unlink
  const handleUnlink = useCallback(async () => {
    if (!confirm(`Disconnect ${institutionName || 'bank'} from ${accountName}?`)) {
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/plaid/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      })

      if (!res.ok) {
        throw new Error('Failed to unlink')
      }

      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink')
    } finally {
      setIsLoading(false)
    }
  }, [accountId, accountName, institutionName, onSuccess])

  if (isLinked) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {hasConnectionError ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {errorMessage}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {institutionName || 'Connected'}
            </span>
          )}
          {lastSyncAt && (
            <span className="text-xs text-monday-3pm">
              Synced {new Date(lastSyncAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {hasConnectionError ? (
            <Button
              variant="primary"
              onClick={fetchUpdateModeLinkToken}
              disabled={isFixing}
            >
              {isFixing ? 'Opening...' : 'Fix Connection'}
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={handleSync}
              disabled={isSyncing}
            >
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleUnlink}
            disabled={isLoading}
          >
            Disconnect
          </Button>
        </div>
        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <Button
          variant="primary"
          onClick={handleConnect}
          disabled={isLoading}
        >
          {isLoading ? 'Connecting...' : 'Link Bank'}
        </Button>
        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}
      </div>

      {showMappingDialog && pendingInstitution && (
        <PlaidAccountMappingDialog
          existingAccountName={accountName}
          institutionName={pendingInstitution.name}
          plaidAccounts={pendingPlaidAccounts}
          onConfirm={handleMappingConfirm}
          onCancel={handleMappingCancel}
        />
      )}
    </>
  )
}
