'use client'

import { useState, useEffect } from 'react'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import Link from 'next/link'

export default function SettingsPage() {
  const [charityPercent, setCharityPercent] = useState('0')
  const [retirementAmount, setRetirementAmount] = useState('0')
  const [otherSavingsAmount, setOtherSavingsAmount] = useState('0')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        setCharityPercent(data.charityPercent.toString())
        setRetirementAmount(data.retirementAmount.toString())
        setOtherSavingsAmount(data.otherSavingsAmount.toString())
      })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        charityPercent: parseFloat(charityPercent),
        retirementAmount: parseFloat(retirementAmount),
        otherSavingsAmount: parseFloat(otherSavingsAmount),
      }),
    })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
            type="number"
            step="0.01"
            min="0"
            max="100"
            value={charityPercent}
            onChange={setCharityPercent}
            required
          />

          <Input
            label="Retirement Amount"
            type="number"
            step="0.01"
            min="0"
            value={retirementAmount}
            onChange={setRetirementAmount}
            required
          />

          <Input
            label="Other Savings Amount"
            type="number"
            step="0.01"
            min="0"
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
    </div>
  )
}
