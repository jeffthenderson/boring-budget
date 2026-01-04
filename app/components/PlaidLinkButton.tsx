'use client'

import { useCallback, useState } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { Button } from './Button'

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

      // Normal new connection flow
      setIsLoading(true)
      setError(null)

      try {
        const res = await fetch('/api/plaid/exchange-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicToken,
            accountId,
            institutionId: metadata.institution?.institution_id,
            institutionName: metadata.institution?.name,
            plaidAccountId: metadata.accounts?.[0]?.id,
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
    },
    [accountId, onSuccess, isFixing]
  )

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
  )
}
