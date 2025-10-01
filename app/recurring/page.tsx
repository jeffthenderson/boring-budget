'use client'

import { useState, useEffect } from 'react'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { formatCurrency } from '@/lib/utils/currency'
import Link from 'next/link'

const RECURRING_CATEGORIES = ['Recurring - Essential', 'Recurring - Non-Essential']

export default function RecurringPage() {
  const [definitions, setDefinitions] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)

  const [merchantLabel, setMerchantLabel] = useState('')
  const [category, setCategory] = useState(RECURRING_CATEGORIES[0])
  const [nominalAmount, setNominalAmount] = useState('')
  const [frequency, setFrequency] = useState('monthly')
  const [dayOfMonth, setDayOfMonth] = useState('1')

  useEffect(() => {
    loadDefinitions()
  }, [])

  async function loadDefinitions() {
    const res = await fetch('/api/recurring')
    const data = await res.json()
    setDefinitions(data)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const schedulingRule = {
      type: frequency,
      dayOfMonth: parseInt(dayOfMonth),
    }

    await fetch('/api/recurring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantLabel,
        category,
        nominalAmount: parseFloat(nominalAmount),
        frequency,
        schedulingRule,
      }),
    })

    setMerchantLabel('')
    setNominalAmount('')
    setShowForm(false)
    loadDefinitions()
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/recurring/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !active }),
    })
    loadDefinitions()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this recurring item? (Type confirmation not required. We trust you.)')) return

    await fetch(`/api/recurring/${id}`, {
      method: 'DELETE',
    })
    loadDefinitions()
  }

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <Link href="/" className="text-dark hover:underline text-sm">← BACK TO BUDGET</Link>
        <h1 className="text-2xl uppercase tracking-widest font-medium text-dark mt-4 mb-2">
          Recurring Definitions
        </h1>
        <p className="text-sm text-monday-3pm">
          Manage recurring expenses. They'll appear automatically. (Whether you like it or not.)
        </p>
      </header>

      <div className="space-y-6">
        <Card>
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? 'CANCEL' : 'ADD RECURRING ITEM'}
          </Button>

          {showForm && (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4 border-t-2 border-cubicle-taupe pt-4">
              <Input
                label="Merchant Label"
                value={merchantLabel}
                onChange={setMerchantLabel}
                placeholder="Netflix, Rent, etc."
                required
              />

              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-wider text-dark font-medium">
                  Category (REQUIRED)
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-dark focus:outline-none focus:border-dark"
                >
                  {RECURRING_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <Input
                label="Nominal Amount"
                type="number"
                step="0.01"
                min="0"
                value={nominalAmount}
                onChange={setNominalAmount}
                placeholder="0.00"
                required
              />

              <div className="flex flex-col gap-1">
                <label className="text-xs uppercase tracking-wider text-dark font-medium">
                  Frequency (REQUIRED)
                </label>
                <select
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                  className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-dark focus:outline-none focus:border-dark"
                >
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="twice_monthly">Twice Monthly</option>
                </select>
              </div>

              {frequency === 'monthly' && (
                <Input
                  label="Day of Month"
                  type="number"
                  min="1"
                  max="31"
                  value={dayOfMonth}
                  onChange={setDayOfMonth}
                  required
                />
              )}

              <Button type="submit">CREATE RECURRING ITEM</Button>
            </form>
          )}
        </Card>

        <Card title="Active Recurring Items">
          {definitions.length === 0 ? (
            <div className="text-center py-8 text-monday-3pm">
              No recurring items yet. How... peaceful.
            </div>
          ) : (
            <div className="space-y-2">
              {definitions.map((def: any) => (
                <div
                  key={def.id}
                  className="grid grid-cols-[2fr_1fr_1fr_auto_auto_auto] gap-4 items-center py-3 border-b border-cubicle-taupe last:border-b-0"
                >
                  <div>
                    <div className="font-medium">{def.merchantLabel}</div>
                    <div className="text-xs text-monday-3pm">{def.category}</div>
                  </div>
                  <div>{formatCurrency(def.nominalAmount)}</div>
                  <div className="text-sm text-monday-3pm capitalize">{def.frequency}</div>
                  <div>
                    <span className={`px-2 py-1 text-xs uppercase ${def.active ? 'bg-ceiling-grey' : 'bg-background'}`}>
                      {def.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => toggleActive(def.id, def.active)}
                  >
                    {def.active ? 'DEACTIVATE' : 'ACTIVATE'}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => handleDelete(def.id)}
                  >
                    DELETE
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
