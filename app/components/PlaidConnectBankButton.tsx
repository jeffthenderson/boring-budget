'use client'

import { useCallback, useState, useEffect } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { Button } from './Button'
import { AccountConfirmationDialog, PlaidAccountToCreate } from './AccountConfirmationDialog'
import { PlaidConsentDialog } from './PlaidConsentDialog'
import { canUsePlaid } from '@/lib/actions/plaid'
import Link from 'next/link'

interface PlaidConnectBankButtonProps {
  onSuccess: () => void
}

export function PlaidConnectBankButton({ onSuccess }: PlaidConnectBankButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mfaStatus, setMfaStatus] = useState<{ allowed: boolean; reason?: string } | null>(null)

  // Check MFA status on mount
  useEffect(() => {
    canUsePlaid().then(setMfaStatus)
  }, [])

  // State for consent dialog
  const [showConsent, setShowConsent] = useState(false)

  // State for confirmation dialog
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [pendingAccounts, setPendingAccounts] = useState<PlaidAccountToCreate[]>([])
  const [pendingPublicToken, setPendingPublicToken] = useState<string>('')
  const [pendingInstitution, setPendingInstitution] = useState<{
    id: string
    name: string
  } | null>(null)

  // Fetch link token when user wants to connect
  const fetchLinkToken = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/plaid/link-token', {
        method: 'POST',
      })

      if (!res.ok) {
        throw new Error('Failed to create link token')
      }

      const data = await res.json()
      setLinkToken(data.linkToken)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize Plaid')
      console.error('Error fetching link token:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Handle successful Plaid Link connection
  const handleOnSuccess = useCallback(
    async (publicToken: string, metadata: any) => {
      setLinkToken(null)

      // Extract accounts from metadata
      const accounts: PlaidAccountToCreate[] = metadata.accounts?.map((account: any) => ({
        plaidAccountId: account.id,
        name: account.name,
        mask: account.mask || '',
        type: account.type,
        subtype: account.subtype,
      })) || []

      if (accounts.length === 0) {
        setError('No accounts were selected')
        return
      }

      // Store pending data and show confirmation dialog
      setPendingPublicToken(publicToken)
      setPendingInstitution({
        id: metadata.institution?.institution_id || '',
        name: metadata.institution?.name || 'Unknown Bank',
      })
      setPendingAccounts(accounts)
      setShowConfirmation(true)
    },
    []
  )

  const handleConfirm = async (selectedAccounts: PlaidAccountToCreate[]) => {
    setShowConfirmation(false)
    setIsCreating(true)
    setError(null)

    try {
      const res = await fetch('/api/plaid/create-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicToken: pendingPublicToken,
          institutionId: pendingInstitution?.id,
          institutionName: pendingInstitution?.name,
          accounts: selectedAccounts,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        throw new Error(result.error || 'Failed to create accounts')
      }

      // Check for sync errors
      const syncErrors = result.syncResults?.filter((r: any) => r.errors.length > 0) || []
      if (syncErrors.length > 0) {
        console.warn('Some accounts had sync errors:', syncErrors)
      }

      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create accounts')
      console.error('Error creating accounts:', err)
    } finally {
      setIsCreating(false)
      setPendingPublicToken('')
      setPendingInstitution(null)
      setPendingAccounts([])
    }
  }

  const handleCancel = () => {
    setShowConfirmation(false)
    setPendingPublicToken('')
    setPendingInstitution(null)
    setPendingAccounts([])
  }

  const handleOnExit = useCallback(() => {
    setLinkToken(null)
  }, [])

  // Show consent dialog first
  const handleShowConsent = () => {
    setShowConsent(true)
  }

  const handleConsentConfirm = async () => {
    setShowConsent(false)
    await fetchLinkToken()
  }

  const handleConsentCancel = () => {
    setShowConsent(false)
  }

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
      // Show consent dialog first if we don't have a token yet
      handleShowConsent()
    }
  }, [linkToken, ready, open])

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

  // If MFA is required but not enabled, show a message instead of the button
  if (mfaStatus && !mfaStatus.allowed) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="primary" disabled>
          Connect Bank
        </Button>
        <span className="text-xs text-monday-3pm">
          <Link href="/settings" className="underline hover:text-foreground">
            Enable 2FA
          </Link>{' '}
          to connect your bank
        </span>
      </div>
    )
  }

  return (
    <>
      <Button
        variant="primary"
        onClick={handleConnect}
        disabled={isLoading || isCreating || mfaStatus === null}
      >
        {isLoading && 'Opening...'}
        {isCreating && 'Creating accounts...'}
        {!isLoading && !isCreating && 'Connect Bank'}
      </Button>

      {error && (
        <p className="text-xs text-red-600 mt-2">{error}</p>
      )}

      {showConsent && (
        <PlaidConsentDialog
          onConfirm={handleConsentConfirm}
          onCancel={handleConsentCancel}
        />
      )}

      {showConfirmation && pendingInstitution && (
        <AccountConfirmationDialog
          institutionName={pendingInstitution.name}
          accounts={pendingAccounts}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </>
  )
}
