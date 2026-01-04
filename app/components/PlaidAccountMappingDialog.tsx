'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

interface PlaidAccountOption {
  plaidAccountId: string
  name: string
  mask: string
  type: 'depository' | 'credit'
  subtype: string
}

interface PlaidAccountMappingDialogProps {
  existingAccountName: string
  institutionName: string
  plaidAccounts: PlaidAccountOption[]
  onConfirm: (selectedPlaidAccountId: string) => void
  onCancel: () => void
}

export function PlaidAccountMappingDialog({
  existingAccountName,
  institutionName,
  plaidAccounts,
  onConfirm,
  onCancel,
}: PlaidAccountMappingDialogProps) {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    // Auto-select if only one account
    plaidAccounts.length === 1 ? plaidAccounts[0].plaidAccountId : null
  )
  const [mounted, setMounted] = useState(false)

  // Handle mounting for portal
  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  // Lock body scroll when dialog is open
  useEffect(() => {
    document.body.setAttribute('data-dialog-scroll-lock', 'true')
    document.body.style.overflow = 'hidden'

    return () => {
      if (document.body.getAttribute('data-dialog-scroll-lock') === 'true') {
        document.body.removeAttribute('data-dialog-scroll-lock')
        document.body.style.overflow = ''
      }
    }
  }, [])

  const getAccountTypeLabel = (account: PlaidAccountOption) => {
    if (account.type === 'credit') {
      return 'Credit Card'
    }
    if (account.subtype === 'checking') {
      return 'Checking'
    }
    if (account.subtype === 'savings') {
      return 'Savings'
    }
    return 'Bank Account'
  }

  const dialogContent = (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-line p-6">
          <h2 className="text-xl font-semibold text-foreground">
            Link to which account?
          </h2>
          <p className="text-sm text-monday-3pm mt-2">
            Select the {institutionName} account that matches "{existingAccountName}".
          </p>
        </div>

        {/* Account List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {plaidAccounts.map((account) => {
            const isSelected = selectedAccountId === account.plaidAccountId

            return (
              <label
                key={account.plaidAccountId}
                className={`flex items-center gap-4 rounded-lg border p-4 cursor-pointer transition-colors ${
                  isSelected
                    ? 'border-accent-2 bg-accent-soft'
                    : 'border-line hover:border-gray-300 bg-white'
                }`}
              >
                <input
                  type="radio"
                  name="plaid-account"
                  checked={isSelected}
                  onChange={() => setSelectedAccountId(account.plaidAccountId)}
                  className="h-5 w-5 border-line text-accent-2 focus:ring-accent-2"
                />
                <div className="flex-1">
                  <div className="font-medium">{account.name}</div>
                  <div className="text-sm text-monday-3pm">
                    {getAccountTypeLabel(account)}
                    {account.mask && ` (...${account.mask})`}
                  </div>
                </div>
              </label>
            )
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-line p-6 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => selectedAccountId && onConfirm(selectedAccountId)}
            disabled={!selectedAccountId}
          >
            Link account
          </Button>
        </div>
      </div>
    </div>
  )

  if (!mounted) return null
  return createPortal(dialogContent, document.body)
}
