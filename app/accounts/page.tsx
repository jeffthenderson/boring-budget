'use client'

import { useState, useEffect } from 'react'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { PlaidLinkButton } from '../components/PlaidLinkButton'
import { PlaidConnectBankButton } from '../components/PlaidConnectBankButton'
import Link from 'next/link'
import { TopNav } from '../components/TopNav'
import { resetPlaidSyncCursors } from '@/lib/actions/plaid'

interface Account {
  id: string
  name: string
  type: string
  displayAlias?: string
  last4?: string
  active: boolean
  plaidItemId?: string | null
  plaidInstitutionName?: string | null
  plaidLastSyncAt?: string | null
  plaidError?: string | null
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [showForm, setShowForm] = useState(false)
  const [isResyncing, setIsResyncing] = useState(false)

  const [name, setName] = useState('')
  const [type, setType] = useState<'credit_card' | 'bank'>('bank')
  const [displayAlias, setDisplayAlias] = useState('')
  const [last4, setLast4] = useState('')

  useEffect(() => {
    loadAccounts()
  }, [])

  const hasPlaidAccounts = accounts.some(a => a.plaidItemId)

  async function handleForceResync() {
    if (!confirm('Re-download all transactions from connected banks? This may take a moment.')) return

    setIsResyncing(true)
    try {
      // Reset cursors
      await resetPlaidSyncCursors()

      // Trigger sync for each Plaid-connected account
      const plaidAccounts = accounts.filter(a => a.plaidItemId)
      for (const account of plaidAccounts) {
        await fetch('/api/plaid/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: account.id }),
        })
      }

      loadAccounts()
      alert('Full resync complete!')
    } catch (error) {
      console.error('Resync failed:', error)
      alert('Resync failed. Check console for details.')
    } finally {
      setIsResyncing(false)
    }
  }

  async function loadAccounts() {
    const res = await fetch('/api/accounts')
    const data = await res.json()
    setAccounts(data)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        type,
        displayAlias: displayAlias || undefined,
        last4: last4 || undefined,
      }),
    })

    setName('')
    setDisplayAlias('')
    setLast4('')
    setShowForm(false)
    loadAccounts()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this account? (Imports will remain but will not be linked.)')) return

    await fetch(`/api/accounts/${id}`, {
      method: 'DELETE',
    })
    loadAccounts()
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !active }),
    })
    loadAccounts()
  }

  return (
    <div className="min-h-screen max-w-6xl mx-auto p-4 md:p-8">
      <TopNav />
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground mt-4 mb-2">
          Accounts
        </h1>
        <p className="text-sm text-monday-3pm">
          Where the money lives. Or lived.
        </p>
      </header>

      <div className="space-y-6">
        <Card>
          <div className="flex flex-wrap gap-3">
            <PlaidConnectBankButton onSuccess={loadAccounts} />
            <Button onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Cancel' : 'Add account manually'}
            </Button>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4 border-t border-line pt-4">
              <Input
                label="Account name"
                value={name}
                onChange={setName}
                placeholder="Powerchequing, Scene Visa, etc."
                required
              />

              <div className="flex flex-col gap-1">
                <label className="mono-label">
                  account type (required)
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as 'credit_card' | 'bank')}
                  className="rounded-md border border-line bg-white px-3 py-2 text-foreground focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-2"
                >
                  <option value="bank">Bank account</option>
                  <option value="credit_card">Credit card</option>
                </select>
              </div>

              <Input
                label="Display alias (for transfer detection)"
                value={displayAlias}
                onChange={setDisplayAlias}
                placeholder="e.g., 'chequing', 'visa'"
              />

              <Input
                label="Last 4 digits (optional, for matching)"
                value={last4}
                onChange={setLast4}
                placeholder="9084"
                maxLength={4}
              />

              <Button type="submit">Create account</Button>
            </form>
          )}
        </Card>

        <Card title="Your accounts">
          {accounts.length === 0 ? (
            <div className="text-center py-8 text-monday-3pm">
              No accounts yet. Add one to import.
            </div>
          ) : (
            <div className="space-y-4">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="rounded-lg border border-line p-4"
                >
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                    {/* Account Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{account.name}</span>
                        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs">
                          {account.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="text-xs text-monday-3pm">
                        {account.type === 'credit_card' ? 'Credit Card' : 'Bank Account'}
                        {account.last4 && ` (...${account.last4})`}
                        {account.displayAlias && ` · ${account.displayAlias}`}
                      </div>
                    </div>

                    {/* Plaid Connection */}
                    <div className="md:w-48">
                      <PlaidLinkButton
                        accountId={account.id}
                        accountName={account.name}
                        isLinked={Boolean(account.plaidItemId)}
                        institutionName={account.plaidInstitutionName}
                        lastSyncAt={account.plaidLastSyncAt ? new Date(account.plaidLastSyncAt) : null}
                        plaidError={account.plaidError}
                        onSuccess={loadAccounts}
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <Link href={`/import?account=${account.id}`}>
                        <Button variant="secondary">
                          Import CSV
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        onClick={() => toggleActive(account.id, account.active)}
                      >
                        {account.active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => handleDelete(account.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="rounded-md border border-line bg-white p-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">Getting started</h3>
          <div className="space-y-3 text-sm text-monday-3pm">
            <div>
              <span className="font-medium text-foreground">Connect Bank:</span>{' '}
              Connect your bank and select which accounts to import. All selected accounts will be created and synced automatically.
            </div>
            <div>
              <span className="font-medium text-foreground">Link to Bank (existing accounts):</span>{' '}
              If you already have accounts, use the "Link to Bank" button on each account to connect them to Plaid for automatic syncing.
            </div>
            <div>
              <span className="font-medium text-foreground">Import CSV:</span>{' '}
              Upload CSV files exported from your bank or credit card for manual import.
            </div>
            <div>
              All methods normalize signs, detect transfers, prevent duplicates, and match recurring expenses.
            </div>
            {hasPlaidAccounts && (
              <div className="pt-2 border-t border-line mt-3">
                <span className="font-medium text-foreground">Troubleshooting:</span>{' '}
                <button
                  type="button"
                  onClick={handleForceResync}
                  disabled={isResyncing}
                  className="underline hover:text-foreground disabled:opacity-50"
                >
                  {isResyncing ? 'Re-downloading...' : 'Re-download all transactions'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
