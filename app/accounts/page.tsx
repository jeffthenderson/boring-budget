'use client'

import { useState, useEffect } from 'react'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import Link from 'next/link'
import { TopNav } from '../components/TopNav'

interface Account {
  id: string
  name: string
  type: string
  displayAlias?: string
  last4?: string
  active: boolean
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [showForm, setShowForm] = useState(false)

  const [name, setName] = useState('')
  const [type, setType] = useState<'credit_card' | 'bank'>('bank')
  const [displayAlias, setDisplayAlias] = useState('')
  const [last4, setLast4] = useState('')

  useEffect(() => {
    loadAccounts()
  }, [])

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
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Add account'}
          </Button>

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
            <div className="space-y-2">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-start md:items-center py-3 border-b border-line last:border-b-0"
                >
                  <div>
                    <div className="font-medium">{account.name}</div>
                    <div className="text-xs text-monday-3pm">
                      {account.type === 'credit_card' ? 'Credit Card' : 'Bank Account'}
                      {account.last4 && ` (...${account.last4})`}
                    </div>
                  </div>
                  <div className="text-sm text-monday-3pm">
                    {account.displayAlias || '(no alias)'}
                  </div>
                  <div>
                    <span className="rounded-full bg-accent-soft px-2 py-1 mono-label">
                      {account.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Link href={`/import?account=${account.id}`}>
                      <Button variant="secondary">
                        Import CSV
                      </Button>
                    </Link>
                    <Button
                      variant="secondary"
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
              ))}
            </div>
          )}
        </Card>

        <div className="rounded-md border border-line bg-white p-4">
          <h3 className="text-sm font-semibold text-foreground mb-2">About CSV imports</h3>
          <p className="text-sm text-monday-3pm mb-2">
            Upload CSV files from your bank or credit card to automatically import transactions.
          </p>
          <p className="text-sm text-monday-3pm">
            The importer will normalize signs, detect transfers, prevent duplicates, and suggest matches to recurring expenses.
          </p>
        </div>
      </div>
    </div>
  )
}
