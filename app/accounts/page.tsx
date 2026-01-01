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
    <div className="min-h-screen p-4 md:p-8">
      <TopNav />
      <header className="mb-8">
        <h1 className="text-2xl uppercase tracking-widest font-medium text-dark mt-4 mb-2">
          Account Management
        </h1>
        <p className="text-sm text-monday-3pm">
          Configure accounts for CSV imports. (How organized of you.)
        </p>
      </header>

      <div className="space-y-6">
        <Card>
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? 'CANCEL' : 'ADD ACCOUNT'}
          </Button>

          {showForm && (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4 border-t-2 border-cubicle-taupe pt-4">
              <Input
                label="Account Name"
                value={name}
                onChange={setName}
                placeholder="Powerchequing, Scene Visa, etc."
                required
              />

              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-wider text-dark font-medium">
                  Account Type (REQUIRED)
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as 'credit_card' | 'bank')}
                  className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-dark focus:outline-none focus:border-dark"
                >
                  <option value="bank">Bank Account</option>
                  <option value="credit_card">Credit Card</option>
                </select>
              </div>

              <Input
                label="Display Alias (for transfer detection)"
                value={displayAlias}
                onChange={setDisplayAlias}
                placeholder="e.g., 'chequing', 'visa'"
              />

              <Input
                label="Last 4 Digits (optional, for matching)"
                value={last4}
                onChange={setLast4}
                placeholder="9084"
                maxLength={4}
              />

              <Button type="submit">CREATE ACCOUNT</Button>
            </form>
          )}
        </Card>

        <Card title="Your Accounts">
          {accounts.length === 0 ? (
            <div className="text-center py-8 text-monday-3pm">
              No accounts yet. Add one to start importing. (Eventually.)
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-start md:items-center py-3 border-b border-cubicle-taupe last:border-b-0"
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
                    <span className={`px-2 py-1 text-xs uppercase ${account.active ? 'bg-ceiling-grey' : 'bg-background'}`}>
                      {account.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Link href={`/import?account=${account.id}`}>
                      <Button variant="secondary">
                        IMPORT CSV
                      </Button>
                    </Link>
                    <Button
                      variant="secondary"
                      onClick={() => toggleActive(account.id, account.active)}
                    >
                      {account.active ? 'DEACTIVATE' : 'ACTIVATE'}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => handleDelete(account.id)}
                    >
                      DELETE
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="p-4 border-2 border-cubicle-taupe bg-white">
          <h3 className="text-sm uppercase font-medium mb-2">About CSV Imports</h3>
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
