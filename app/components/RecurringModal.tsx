'use client'

import { useState } from 'react'
import { Button } from './Button'
import { parseCurrency } from '@/lib/utils/currency'

export interface RecurringDefinition {
  id: string
  merchantLabel: string
  displayLabel?: string | null
  nominalAmount: number
  frequency: string
  category: string
}

interface RecurringModalProps {
  isOpen: boolean
  onClose: () => void
  transactionId: string
  transactionAmount: number
  transactionDescription: string
  transactionRawDescription: string
  transactionDate: Date
  category: string
  existingDefinitions: RecurringDefinition[]
  onLink: (transactionId: string, definitionId: string) => Promise<void>
  onCreate: (transactionId: string, data: {
    merchantLabel: string
    displayLabel?: string
    nominalAmount: number
    frequency: string
    schedulingRule: string
    category?: string
  }) => Promise<void>
}

export function RecurringModal({
  isOpen,
  onClose,
  transactionId,
  transactionAmount,
  transactionDescription,
  transactionRawDescription,
  transactionDate,
  category,
  existingDefinitions,
  onLink,
  onCreate,
}: RecurringModalProps) {
  const txDate = new Date(transactionDate)
  const txDayOfMonth = txDate.getDate()
  const txDayOfWeek = txDate.getDay()

  const [mode, setMode] = useState<'choose' | 'link' | 'create'>('choose')
  const [selectedDefinitionId, setSelectedDefinitionId] = useState('')
  const [merchantLabel, setMerchantLabel] = useState(transactionRawDescription)
  const [displayLabel, setDisplayLabel] = useState(transactionDescription)
  const [nominalAmount, setNominalAmount] = useState(Math.abs(transactionAmount).toFixed(2))
  const [frequency, setFrequency] = useState('monthly')
  const [dayOfMonth, setDayOfMonth] = useState(String(txDayOfMonth))
  const [dayOfWeek, setDayOfWeek] = useState(String(txDayOfWeek))
  const [firstDay, setFirstDay] = useState(String(txDayOfMonth))
  const [secondDay, setSecondDay] = useState(String(txDayOfMonth <= 15 ? 15 : txDayOfMonth))
  const [isLoading, setIsLoading] = useState(false)

  if (!isOpen) return null

  const handleLink = async () => {
    if (!selectedDefinitionId) return
    setIsLoading(true)
    try {
      await onLink(transactionId, selectedDefinitionId)
      onClose()
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async () => {
    const parsedNominal = parseCurrency(nominalAmount)
    const trimmedMerchant = merchantLabel.trim()
    if (!trimmedMerchant || parsedNominal <= 0) return

    const trimmedDisplay = displayLabel.trim()
    const finalDisplayLabel = trimmedDisplay || trimmedMerchant

    let schedulingRule: any = {}
    switch (frequency) {
      case 'monthly':
        schedulingRule = { type: 'monthly', dayOfMonth: parseInt(dayOfMonth) }
        break
      case 'weekly':
        schedulingRule = { type: 'weekly', weekday: parseInt(dayOfWeek) }
        break
      case 'biweekly':
        schedulingRule = {
          type: 'biweekly',
          weekday: parseInt(dayOfWeek),
          anchorDate: txDate.toISOString().split('T')[0],
        }
        break
      case 'twice_monthly':
        schedulingRule = { type: 'twice_monthly', firstDay: parseInt(firstDay), secondDay: parseInt(secondDay) }
        break
    }

    setIsLoading(true)
    try {
      await onCreate(transactionId, {
        merchantLabel: trimmedMerchant,
        displayLabel: finalDisplayLabel,
        nominalAmount: parsedNominal,
        frequency,
        schedulingRule: JSON.stringify(schedulingRule),
        category,
      })
      onClose()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-line bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold mb-1">Link a recurring schedule</h2>
        <p className="text-xs text-monday-3pm mb-4">Make it official. Quietly.</p>

        {mode === 'choose' && (
          <div className="space-y-4">
            <p className="text-sm text-monday-3pm">
              Link this transaction to a schedule. It becomes the posted instance for this month.
            </p>

            <div className="flex flex-col gap-3">
              {existingDefinitions.length > 0 && (
                <Button onClick={() => setMode('link')}>
                  Link existing schedule
                </Button>
              )}
              <Button onClick={() => setMode('create')} variant="secondary">
                Create schedule
              </Button>
            </div>

            <Button onClick={onClose} variant="outline" className="w-full">
              Cancel
            </Button>
          </div>
        )}

        {mode === 'link' && (
          <div className="space-y-4">
            <div>
              <label className="mono-label block mb-2">
                Select a schedule
              </label>
              <select
                value={selectedDefinitionId}
                onChange={(e) => setSelectedDefinitionId(e.target.value)}
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <option value="">Choose</option>
                {existingDefinitions.map((def) => {
                  const label = def.displayLabel && def.displayLabel !== def.merchantLabel
                    ? `${def.displayLabel} (match: ${def.merchantLabel})`
                    : def.merchantLabel
                  return (
                    <option key={def.id} value={def.id}>
                      {label} - ${def.nominalAmount.toFixed(2)} {def.frequency} ({def.category})
                    </option>
                  )
                })}
              </select>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => setMode('choose')} variant="outline">
                Back
              </Button>
              <Button onClick={handleLink} disabled={!selectedDefinitionId || isLoading}>
                {isLoading ? 'Linking...' : 'Link'}
              </Button>
            </div>
          </div>
        )}

        {mode === 'create' && (
          <div className="space-y-4">
            <div>
              <label className="mono-label block mb-1">merchant label (for matching) *</label>
              <input
                type="text"
                value={merchantLabel}
                onChange={(e) => {
                  const value = e.target.value
                  setMerchantLabel(value)
                  setDisplayLabel(prev => (prev === '' || prev === merchantLabel ? value : prev))
                }}
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                placeholder="e.g., Netflix"
              />
            </div>

            <div>
              <label className="mono-label block mb-1">display label (optional)</label>
              <input
                type="text"
                value={displayLabel}
                onChange={(e) => setDisplayLabel(e.target.value)}
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                placeholder="e.g., Paramount Plus"
              />
            </div>

            <div>
              <label className="mono-label block mb-1">nominal amount *</label>
              <input
                type="text"
                value={nominalAmount}
                onChange={(e) => setNominalAmount(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              />
            </div>

            <div>
              <label className="mono-label block mb-1">frequency *</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="twice_monthly">Twice monthly</option>
              </select>
            </div>

            {frequency === 'monthly' && (
              <div>
                <label className="mono-label block mb-1">day of month</label>
                <input
                  type="number"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                  min="1"
                  max="31"
                  className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                />
              </div>
            )}

            {(frequency === 'weekly' || frequency === 'biweekly') && (
              <div>
                <label className="mono-label block mb-1">day of week</label>
                <select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(e.target.value)}
                  className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <option value="1">Monday</option>
                  <option value="2">Tuesday</option>
                  <option value="3">Wednesday</option>
                  <option value="4">Thursday</option>
                  <option value="5">Friday</option>
                  <option value="6">Saturday</option>
                  <option value="0">Sunday</option>
                </select>
              </div>
            )}

            {frequency === 'twice_monthly' && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mono-label block mb-1">first day</label>
                  <input
                    type="number"
                    value={firstDay}
                    onChange={(e) => setFirstDay(e.target.value)}
                    min="1"
                    max="31"
                    className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  />
                </div>
                <div className="flex-1">
                  <label className="mono-label block mb-1">second day</label>
                  <input
                    type="number"
                    value={secondDay}
                    onChange={(e) => setSecondDay(e.target.value)}
                    min="1"
                    max="31"
                    className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={() => setMode('choose')} variant="outline">
                Back
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!merchantLabel.trim() || parseCurrency(nominalAmount) <= 0 || isLoading}
              >
                {isLoading ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
