'use client'

import { useState, useEffect } from 'react'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import Link from 'next/link'
import { parseCurrency } from '@/lib/utils/currency'

export default function SettingsPage() {
  const [charityPercent, setCharityPercent] = useState('0')
  const [retirementAmount, setRetirementAmount] = useState('0')
  const [otherSavingsAmount, setOtherSavingsAmount] = useState('0')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [ignoreRules, setIgnoreRules] = useState<any[]>([])
  const [ignorePattern, setIgnorePattern] = useState('')
  const [savingIgnore, setSavingIgnore] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        setCharityPercent(data.charityPercent.toString())
        setRetirementAmount(data.retirementAmount.toString())
        setOtherSavingsAmount(data.otherSavingsAmount.toString())
      })

    loadIgnoreRules()
  }, [])

  async function loadIgnoreRules() {
    const res = await fetch('/api/ignore-rules')
    const data = await res.json()
    setIgnoreRules(data)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        charityPercent: parseCurrency(charityPercent),
        retirementAmount: parseCurrency(retirementAmount),
        otherSavingsAmount: parseCurrency(otherSavingsAmount),
      }),
    })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleAddIgnoreRule(e: React.FormEvent) {
    e.preventDefault()
    if (!ignorePattern.trim()) return

    setSavingIgnore(true)
    const res = await fetch('/api/ignore-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: ignorePattern }),
    })

    const result = await res.json()
    if (!result.created) {
      alert('Ignore rule already exists.')
    } else if (result.deletedTransactions > 0) {
      alert(`Ignored ${result.deletedTransactions} existing imported transactions.`)
    }

    setIgnorePattern('')
    setSavingIgnore(false)
    loadIgnoreRules()
  }

  async function handleDeleteIgnoreRule(id: string) {
    await fetch(`/api/ignore-rules/${id}`, { method: 'DELETE' })
    loadIgnoreRules()
  }

  async function handleToggleIgnoreRule(id: string, active: boolean) {
    await fetch(`/api/ignore-rules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !active }),
    })
    loadIgnoreRules()
  }

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <Link href="/" className="text-dark hover:underline text-sm">← BACK TO BUDGET</Link>
        <h1 className="text-2xl uppercase tracking-widest font-medium text-dark mt-4 mb-2">
          Pre-allocation Settings
        </h1>
        <p className="text-sm text-monday-3pm">
          Configure your monthly pre-allocations. (Riveting stuff.)
        </p>
      </header>

      <Card title="First-Run Setup">
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Charity Percent"
            type="text"
            inputMode="decimal"
            value={charityPercent}
            onChange={setCharityPercent}
            required
          />

          <Input
            label="Retirement Amount"
            type="text"
            inputMode="decimal"
            value={retirementAmount}
            onChange={setRetirementAmount}
            required
          />

          <Input
            label="Other Savings Amount"
            type="text"
            inputMode="decimal"
            value={otherSavingsAmount}
            onChange={setOtherSavingsAmount}
            required
          />

          <Button type="submit" disabled={saving}>
            {saving ? 'SAVING...' : saved ? 'SAVED' : 'SAVE SETTINGS'}
          </Button>

          {saved && (
            <div className="text-sm text-monday-3pm mt-2">
              Changes saved. We're as thrilled as you are. (We're not.)
            </div>
          )}
        </form>
      </Card>

      <Card title="Ignore Rules">
        <form onSubmit={handleAddIgnoreRule} className="space-y-4">
          <Input
            label="Ignore transactions containing"
            value={ignorePattern}
            onChange={setIgnorePattern}
            placeholder="e.g., scotiaonline, credit card payment"
            required
          />
          <Button type="submit" disabled={savingIgnore}>
            {savingIgnore ? 'ADDING...' : 'ADD IGNORE RULE'}
          </Button>
        </form>

        <div className="mt-6 space-y-2">
          {ignoreRules.length === 0 ? (
            <div className="text-center py-6 text-monday-3pm">
              No ignore rules yet. (Everything counts for now.)
            </div>
          ) : (
            ignoreRules.map(rule => (
              <div
                key={rule.id}
                className="grid grid-cols-[2fr_auto_auto] gap-4 items-center py-2 border-b border-cubicle-taupe last:border-b-0"
              >
                <div>
                  <div className="font-medium">{rule.pattern}</div>
                  <div className="text-xs text-monday-3pm">
                    {rule.active ? 'Active' : 'Inactive'}
                  </div>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => handleToggleIgnoreRule(rule.id, rule.active)}
                >
                  {rule.active ? 'DEACTIVATE' : 'ACTIVATE'}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => handleDeleteIgnoreRule(rule.id)}
                >
                  DELETE
                </Button>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 text-sm text-monday-3pm">
          Ignored rules apply during CSV import and will remove matching imported transactions.
        </div>
      </Card>
    </div>
  )
}
