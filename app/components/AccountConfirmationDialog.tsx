'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import { Input } from './Input'

export interface PlaidAccountToCreate {
  plaidAccountId: string
  name: string
  mask: string
  type: 'depository' | 'credit'
  subtype: string
}

interface AccountConfirmationDialogProps {
  institutionName: string
  accounts: PlaidAccountToCreate[]
  onConfirm: (selectedAccounts: PlaidAccountToCreate[]) => void
  onCancel: () => void
}

export function AccountConfirmationDialog({
  institutionName,
  accounts,
  onConfirm,
  onCancel,
}: AccountConfirmationDialogProps) {
  const [selectedAccounts, setSelectedAccounts] = useState<Map<string, PlaidAccountToCreate>>(
    new Map(accounts.map(account => [account.plaidAccountId, { ...account }]))
  )
  const [mounted, setMounted] = useState(false)

  // Handle mounting for portal
  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  // Lock body scroll when dialog is open
  useEffect(() => {
    // Add a data attribute to track that this dialog locked scroll
    document.body.setAttribute('data-dialog-scroll-lock', 'true')
    document.body.style.overflow = 'hidden'

    return () => {
      // Only restore if we were the ones who locked it
      if (document.body.getAttribute('data-dialog-scroll-lock') === 'true') {
        document.body.removeAttribute('data-dialog-scroll-lock')
        document.body.style.overflow = ''
      }
    }
  }, [])

  const handleToggle = (plaidAccountId: string) => {
    const newSelected = new Map(selectedAccounts)
    if (newSelected.has(plaidAccountId)) {
      newSelected.delete(plaidAccountId)
    } else {
      const original = accounts.find(a => a.plaidAccountId === plaidAccountId)
      if (original) {
        newSelected.set(plaidAccountId, { ...original })
      }
    }
    setSelectedAccounts(newSelected)
  }

  const handleNameChange = (plaidAccountId: string, newName: string) => {
    const newSelected = new Map(selectedAccounts)
    const account = newSelected.get(plaidAccountId)
    if (account) {
      newSelected.set(plaidAccountId, { ...account, name: newName })
    }
    setSelectedAccounts(newSelected)
  }

  const getAccountTypeLabel = (account: PlaidAccountToCreate) => {
    if (account.type === 'credit') {
      return 'Credit Card'
    }
    if (account.subtype === 'checking') {
      return 'Checking Account'
    }
    if (account.subtype === 'savings') {
      return 'Savings Account'
    }
    return 'Bank Account'
  }

  const selectedCount = selectedAccounts.size

  const dialogContent = (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-line p-6">
          <h2 className="text-xl font-semibold text-foreground">
            Create {accounts.length} account{accounts.length !== 1 ? 's' : ''} from {institutionName}?
          </h2>
          <p className="text-sm text-monday-3pm mt-2">
            Review and select which accounts to add. Accounts will sync automatically when new transactions are available.
          </p>
        </div>

        {/* Account List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {accounts.map((account) => {
            const isSelected = selectedAccounts.has(account.plaidAccountId)
            const currentAccount = selectedAccounts.get(account.plaidAccountId) || account

            return (
              <div
                key={account.plaidAccountId}
                className={`rounded-lg border ${
                  isSelected ? 'border-accent-2 bg-accent-soft' : 'border-line bg-gray-50'
                } p-4`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggle(account.plaidAccountId)}
                    className="mt-1 h-5 w-5 rounded border-line text-accent-2 focus:ring-accent-2"
                  />

                  {/* Account Details */}
                  <div className="flex-1 space-y-3">
                    {/* Account Name Input */}
                    <div>
                      <Input
                        label="Account name"
                        value={currentAccount.name}
                        onChange={(value) => handleNameChange(account.plaidAccountId, value)}
                        disabled={!isSelected}
                        placeholder="Enter account name"
                      />
                    </div>

                    {/* Account Type & Mask */}
                    <div className="flex items-center gap-4 text-sm">
                      <span className="rounded-full bg-white px-3 py-1 border border-line">
                        {getAccountTypeLabel(account)}
                      </span>
                      {account.mask && (
                        <span className="text-monday-3pm">
                          (...{account.mask})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-line p-6 flex items-center justify-between">
          <div className="text-sm text-monday-3pm">
            {selectedCount === 0 && 'No accounts selected'}
            {selectedCount === 1 && '1 account selected'}
            {selectedCount > 1 && `${selectedCount} accounts selected`}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => onConfirm(Array.from(selectedAccounts.values()))}
              disabled={selectedCount === 0}
            >
              Create {selectedCount} Account{selectedCount !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )

  // Use portal to render at document body level for better cleanup
  if (!mounted) return null
  return createPortal(dialogContent, document.body)
}
