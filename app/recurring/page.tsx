'use client'

import { useState, useEffect } from 'react'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { formatCurrency, parseCurrency } from '@/lib/utils/currency'
import { formatDateDisplay } from '@/lib/utils/dates'
import Link from 'next/link'
import { TopNav } from '../components/TopNav'

const RECURRING_CATEGORIES = ['Recurring - Essential', 'Recurring - Non-Essential', 'Income']

interface RecurringSuggestion {
  key: string
  displayDescription: string
  matchDescription: string
  amountMedian: number
  amountMin: number
  amountMax: number
  dayOfMonthMedian: number
  dayOfMonthMin: number
  dayOfMonthMax: number
  months: Array<{ year: number; month: number; date: string; amount: number }>
  occurrences: Array<{ date: string; amount: number; description: string; subDescription?: string }>
  confidence: number
}

export default function RecurringPage() {
  const [definitions, setDefinitions] = useState<any[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<RecurringSuggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [hiddenSuggestions, setHiddenSuggestions] = useState<Set<string>>(new Set())
  const [collapsedSuggestions, setCollapsedSuggestions] = useState(false)
  const [expandedSuggestions, setExpandedSuggestions] = useState<Set<string>>(new Set())
  const [suggestionCategories, setSuggestionCategories] = useState<Record<string, string>>({})
  const [suggestionAmounts, setSuggestionAmounts] = useState<Record<string, string>>({})
  const [dontShowAgain, setDontShowAgain] = useState<Record<string, boolean>>({})
  const [savingSuggestionKeys, setSavingSuggestionKeys] = useState<Set<string>>(new Set())
  const [savingForm, setSavingForm] = useState(false)
  const [savingDefinitionIds, setSavingDefinitionIds] = useState<Set<string>>(new Set())
  const [matchingOpenPeriods, setMatchingOpenPeriods] = useState(false)
  const [matchSummary, setMatchSummary] = useState<{ matched: number; periodsChecked: number } | null>(null)

  const [merchantLabel, setMerchantLabel] = useState('')
  const [displayLabel, setDisplayLabel] = useState('')
  const [category, setCategory] = useState(RECURRING_CATEGORIES[0])
  const [nominalAmount, setNominalAmount] = useState('')
  const [frequency, setFrequency] = useState('monthly')
  const [dayOfMonth, setDayOfMonth] = useState('1')
  const [dayOfWeek, setDayOfWeek] = useState('1')
  const [firstDay, setFirstDay] = useState('1')
  const [secondDay, setSecondDay] = useState('15')

  useEffect(() => {
    loadDefinitions()
    loadSuggestions()
  }, [])

  async function loadDefinitions() {
    const res = await fetch('/api/recurring')
    const data = await res.json()
    setDefinitions(data)
  }

  async function loadSuggestions() {
    setLoadingSuggestions(true)
    const res = await fetch('/api/recurring/suggestions')
    const data = await res.json()
    setSuggestions(data)

    setSuggestionCategories(prev => {
      const next = { ...prev }
      data.forEach((suggestion: RecurringSuggestion) => {
        if (!next[suggestion.key]) {
          next[suggestion.key] = RECURRING_CATEGORIES[0]
        }
      })
      return next
    })

    setSuggestionAmounts(prev => {
      const next = { ...prev }
      data.forEach((suggestion: RecurringSuggestion) => {
        if (!next[suggestion.key]) {
          next[suggestion.key] = suggestion.amountMedian.toFixed(2)
        }
      })
      return next
    })

    setLoadingSuggestions(false)
  }

  async function handleAddSuggestion(suggestion: RecurringSuggestion) {
    const categoryChoice = suggestionCategories[suggestion.key] || RECURRING_CATEGORIES[0]
    const amountValue = parseCurrency(suggestionAmounts[suggestion.key] || suggestion.amountMedian.toFixed(2))
    const dayOfMonth = Math.round(suggestion.dayOfMonthMedian)

    setSavingSuggestionKeys(prev => new Set([...prev, suggestion.key]))

    try {
      await Promise.all([
        fetch('/api/recurring', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            merchantLabel: suggestion.matchDescription,
            displayLabel: suggestion.displayDescription,
            category: categoryChoice,
            nominalAmount: amountValue,
            frequency: 'monthly',
            schedulingRule: JSON.stringify({ type: 'monthly', dayOfMonth }),
          }),
        }),
        fetch('/api/recurring/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: suggestion.key }),
        }),
      ])

      setHiddenSuggestions(prev => new Set([...prev, suggestion.key]))
      await Promise.all([loadDefinitions(), loadSuggestions()])
    } catch (error) {
      alert('Failed to add recurring suggestion.')
      console.error(error)
    } finally {
      setSavingSuggestionKeys(prev => {
        const next = new Set(prev)
        next.delete(suggestion.key)
        return next
      })
    }
  }

  async function handleDismissSuggestion(suggestion: RecurringSuggestion) {
    const hideOnly = !dontShowAgain[suggestion.key]
    setHiddenSuggestions(prev => new Set([...prev, suggestion.key]))

    if (hideOnly) {
      return
    }

    setSavingSuggestionKeys(prev => new Set([...prev, suggestion.key]))

    try {
      await fetch('/api/recurring/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: suggestion.key }),
      })

      await loadSuggestions()
    } catch (error) {
      alert('Failed to dismiss suggestion.')
      console.error(error)
    } finally {
      setSavingSuggestionKeys(prev => {
        const next = new Set(prev)
        next.delete(suggestion.key)
        return next
      })
    }
  }

  function startEdit(def: any) {
    setShowForm(false)
    setEditingId(def.id)
    setMerchantLabel(def.merchantLabel)
    setDisplayLabel(def.displayLabel || def.merchantLabel)
    setCategory(def.category)
    setNominalAmount(def.nominalAmount.toString())
    setFrequency(def.frequency)

    try {
      const rule = JSON.parse(def.schedulingRule)
      setDayOfMonth(rule.dayOfMonth?.toString() || '1')
      setDayOfWeek((rule.weekday ?? rule.dayOfWeek)?.toString() || '1')
      setFirstDay(rule.firstDay?.toString() || '1')
      setSecondDay(rule.secondDay?.toString() || '15')
    } catch {
      setDayOfMonth('1')
    }
  }

  function cancelEdit() {
    setEditingId(null)
    setMerchantLabel('')
    setDisplayLabel('')
    setCategory(RECURRING_CATEGORIES[0])
    setNominalAmount('')
    setFrequency('monthly')
    setDayOfMonth('1')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSavingForm(true)

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
          anchorDate: new Date().toISOString().split('T')[0],
        }
        break
      case 'twice_monthly':
        schedulingRule = { type: 'twice_monthly', firstDay: parseInt(firstDay), secondDay: parseInt(secondDay) }
        break
    }

    const url = editingId ? `/api/recurring/${editingId}` : '/api/recurring'
    const method = editingId ? 'PATCH' : 'POST'

    try {
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantLabel,
          displayLabel,
          category,
          nominalAmount: parseCurrency(nominalAmount),
          frequency,
          schedulingRule: JSON.stringify(schedulingRule),
        }),
      })

      setMerchantLabel('')
      setDisplayLabel('')
      setNominalAmount('')
      setShowForm(false)
      setEditingId(null)
      await loadDefinitions()
    } catch (error) {
      alert('Failed to save recurring schedule.')
      console.error(error)
    } finally {
      setSavingForm(false)
    }
  }

  async function toggleActive(id: string, active: boolean) {
    setSavingDefinitionIds(prev => new Set([...prev, id]))
    try {
      await fetch(`/api/recurring/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !active }),
      })
      await loadDefinitions()
    } catch (error) {
      alert('Failed to update recurring schedule.')
      console.error(error)
    } finally {
      setSavingDefinitionIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this recurring item? (Type confirmation not required. We trust you.)')) return

    setSavingDefinitionIds(prev => new Set([...prev, id]))
    try {
      await fetch(`/api/recurring/${id}`, {
        method: 'DELETE',
      })
      await loadDefinitions()
    } catch (error) {
      alert('Failed to delete recurring schedule.')
      console.error(error)
    } finally {
      setSavingDefinitionIds(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  async function handleMatchOpenPeriods() {
    setMatchingOpenPeriods(true)
    setMatchSummary(null)
    try {
      const res = await fetch('/api/recurring/match', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to match recurring transactions.')
      }
      setMatchSummary({
        matched: data.matched || 0,
        periodsChecked: data.periodsChecked || 0,
      })
    } catch (error) {
      alert('Failed to match recurring transactions.')
      console.error(error)
    } finally {
      setMatchingOpenPeriods(false)
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <TopNav />
      <header className="mb-8">
        <Link href="/" className="text-dark hover:underline text-sm">← BACK TO BUDGET</Link>
        <h1 className="text-2xl uppercase tracking-widest font-medium text-dark mt-4 mb-2">
          Recurring Definitions
        </h1>
        <p className="text-sm text-monday-3pm">
            Manage recurring schedules (expenses + income). They'll appear automatically. (Whether you like it or not.)
        </p>
      </header>

      <div className="space-y-6">
        <Card title="Maintenance">
          <div className="space-y-3">
            <p className="text-sm text-monday-3pm">
              Match existing imported transactions to your current recurring schedules across all open months.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleMatchOpenPeriods} disabled={matchingOpenPeriods || savingForm}>
                {matchingOpenPeriods ? 'MATCHING...' : 'MATCH OPEN PERIODS'}
              </Button>
              {matchSummary && (
                <div className="text-xs text-monday-3pm">
                  Matched {matchSummary.matched} transactions across {matchSummary.periodsChecked} open periods.
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card title="Recurring Suggestions">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-monday-3pm">
              Monthly candidates detected from your imported transactions.
            </p>
            <Button
              variant="secondary"
              onClick={() => setCollapsedSuggestions(!collapsedSuggestions)}
            >
              {collapsedSuggestions ? 'SHOW' : 'HIDE'}
            </Button>
          </div>

          {!collapsedSuggestions && (
            <div className="mt-4 space-y-4">
              {loadingSuggestions ? (
                <div className="text-sm text-monday-3pm">
                  Scanning your transaction history...
                </div>
              ) : suggestions.filter(s => !hiddenSuggestions.has(s.key)).length === 0 ? (
                <div className="text-center py-6 text-monday-3pm">
                  No recurring suggestions right now. (Everything is chaos.)
                </div>
              ) : (
                suggestions
                  .filter(s => !hiddenSuggestions.has(s.key))
                  .map(suggestion => {
                    const isSavingSuggestion = savingSuggestionKeys.has(suggestion.key)

                    return (
                      <div
                        key={suggestion.key}
                        className="border-2 border-cubicle-taupe bg-white p-4 space-y-3"
                      >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="font-medium">{suggestion.displayDescription}</div>
                          {suggestion.matchDescription !== suggestion.displayDescription && (
                            <div className="text-xs text-monday-3pm">
                              Matches: {suggestion.matchDescription}
                            </div>
                          )}
                          <div className="text-xs text-monday-3pm">
                            Confidence: {suggestion.confidence}% · Seen {suggestion.months.length} months
                          </div>
                        </div>
                        <div className="text-sm text-dark">
                          {formatCurrency(suggestion.amountMedian)}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-monday-3pm">
                        <div>
                          Amount range: {formatCurrency(suggestion.amountMin)} – {formatCurrency(suggestion.amountMax)}
                        </div>
                        <div>
                          Day of month: {suggestion.dayOfMonthMin}–{suggestion.dayOfMonthMax}
                        </div>
                      </div>

                      <div className="text-xs text-monday-3pm">
                        Seen on: {suggestion.months.map(m => formatDateDisplay(m.date)).join(', ')}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-4 items-center">
                        <div>
                          <label className="text-xs uppercase tracking-wider text-dark font-medium">
                            Category
                          </label>
                          <select
                            value={suggestionCategories[suggestion.key] || RECURRING_CATEGORIES[0]}
                            onChange={(e) =>
                              setSuggestionCategories({
                                ...suggestionCategories,
                                [suggestion.key]: e.target.value,
                              })
                            }
                            disabled={isSavingSuggestion}
                            className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-dark focus:outline-none focus:border-dark w-full"
                          >
                            {RECURRING_CATEGORIES.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>

                        <Input
                          label="Nominal Amount"
                          type="text"
                          inputMode="decimal"
                          value={suggestionAmounts[suggestion.key] || suggestion.amountMedian.toFixed(2)}
                          onChange={(val) =>
                            setSuggestionAmounts({
                              ...suggestionAmounts,
                              [suggestion.key]: val,
                            })
                          }
                          disabled={isSavingSuggestion}
                        />

                        <div className="flex flex-col gap-2">
                          <Button onClick={() => handleAddSuggestion(suggestion)} disabled={isSavingSuggestion}>
                            {isSavingSuggestion ? 'ADDING...' : 'ADD RECURRING'}
                          </Button>
                          <div className="flex items-center gap-2 text-xs text-monday-3pm">
                            <input
                              type="checkbox"
                              checked={dontShowAgain[suggestion.key] || false}
                              disabled={isSavingSuggestion}
                              onChange={(e) =>
                                setDontShowAgain({
                                  ...dontShowAgain,
                                  [suggestion.key]: e.target.checked,
                                })
                              }
                            />
                            <span>Don’t show again</span>
                          </div>
                          <Button
                            variant="secondary"
                            onClick={() => handleDismissSuggestion(suggestion)}
                            disabled={isSavingSuggestion}
                          >
                            {isSavingSuggestion ? 'WORKING...' : 'DO NOT ADD'}
                          </Button>
                        </div>
                      </div>

                      <Button
                        variant="secondary"
                        onClick={() => {
                          const next = new Set(expandedSuggestions)
                          if (next.has(suggestion.key)) {
                            next.delete(suggestion.key)
                          } else {
                            next.add(suggestion.key)
                          }
                          setExpandedSuggestions(next)
                        }}
                      >
                        {expandedSuggestions.has(suggestion.key) ? 'HIDE DETAILS' : 'SHOW DETAILS'}
                      </Button>

                        {expandedSuggestions.has(suggestion.key) && (
                          <div className="mt-2 border-t border-cubicle-taupe pt-3 space-y-2 text-sm">
                            {suggestion.occurrences.map((occurrence, index) => (
                              <div key={`${suggestion.key}-${index}`} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <div>{formatDateDisplay(occurrence.date)}</div>
                                <div>{formatCurrency(occurrence.amount)}</div>
                                <div className="text-monday-3pm">
                                  <div>{occurrence.description}</div>
                                  {occurrence.subDescription && (
                                    <div className="text-xs">{occurrence.subDescription}</div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
              )}
            </div>
          )}
        </Card>

        <Card>
          <Button
            onClick={() => {
              if (showForm) {
                cancelEdit()
                setShowForm(false)
                return
              }
              if (editingId) {
                cancelEdit()
              }
              setShowForm(true)
            }}
            disabled={!!editingId || savingForm}
          >
            {showForm ? 'CANCEL' : editingId ? 'FINISH EDITING BELOW' : 'ADD RECURRING SCHEDULE'}
          </Button>

          {showForm && (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4 border-t-2 border-cubicle-taupe pt-4">
              {renderRecurringFields({
                merchantLabel,
                displayLabel,
                category,
                nominalAmount,
                frequency,
                dayOfMonth,
                dayOfWeek,
                firstDay,
                secondDay,
                onMerchantLabelChange: (val) => {
                  setMerchantLabel(val)
                  setDisplayLabel((prev) => (prev === '' || prev === merchantLabel ? val : prev))
                },
                onDisplayLabelChange: setDisplayLabel,
                onCategoryChange: setCategory,
                onNominalAmountChange: setNominalAmount,
                onFrequencyChange: setFrequency,
                onDayOfMonthChange: setDayOfMonth,
                onDayOfWeekChange: setDayOfWeek,
                onFirstDayChange: setFirstDay,
                onSecondDayChange: setSecondDay,
              })}
              <Button type="submit" disabled={savingForm}>
                {savingForm ? 'CREATING...' : 'CREATE SCHEDULE'}
              </Button>
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
                  className="border-b border-cubicle-taupe last:border-b-0 py-3"
                >
                  <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-4 items-start md:items-center">
                    <div>
                      <div className="font-medium">{def.displayLabel || def.merchantLabel}</div>
                      {(def.displayLabel && def.displayLabel !== def.merchantLabel) && (
                        <div className="text-xs text-monday-3pm">Matches: {def.merchantLabel}</div>
                      )}
                      <div className="text-xs text-monday-3pm">{def.category}</div>
                    </div>
                    <div>{formatCurrency(def.nominalAmount)}</div>
                    <div className="text-sm text-monday-3pm capitalize">{def.frequency}</div>
                    <div>
                      <span className={`px-2 py-1 text-xs uppercase ${def.active ? 'bg-ceiling-grey' : 'bg-background'}`}>
                        {def.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <Button
                        variant="secondary"
                        onClick={() => startEdit(def)}
                        disabled={savingDefinitionIds.has(def.id) || savingForm}
                      >
                        EDIT
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => toggleActive(def.id, def.active)}
                        disabled={savingDefinitionIds.has(def.id) || savingForm}
                      >
                        {savingDefinitionIds.has(def.id)
                          ? 'UPDATING...'
                          : def.active
                            ? 'DEACTIVATE'
                            : 'ACTIVATE'}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => handleDelete(def.id)}
                        disabled={savingDefinitionIds.has(def.id) || savingForm}
                      >
                        {savingDefinitionIds.has(def.id) ? 'DELETING...' : 'DELETE'}
                      </Button>
                    </div>
                  </div>

                  {editingId === def.id && (
                    <form onSubmit={handleSubmit} className="mt-4 space-y-4 border-2 border-cubicle-taupe bg-background p-4">
                      {renderRecurringFields({
                        merchantLabel,
                        displayLabel,
                        category,
                        nominalAmount,
                        frequency,
                        dayOfMonth,
                        dayOfWeek,
                        firstDay,
                        secondDay,
                        onMerchantLabelChange: (val) => {
                          setMerchantLabel(val)
                          setDisplayLabel((prev) => (prev === '' || prev === merchantLabel ? val : prev))
                        },
                        onDisplayLabelChange: setDisplayLabel,
                        onCategoryChange: setCategory,
                        onNominalAmountChange: setNominalAmount,
                        onFrequencyChange: setFrequency,
                        onDayOfMonthChange: setDayOfMonth,
                        onDayOfWeekChange: setDayOfWeek,
                        onFirstDayChange: setFirstDay,
                        onSecondDayChange: setSecondDay,
                      })}
                      <div className="flex flex-wrap gap-2">
                        <Button type="submit" disabled={savingForm}>
                          {savingForm ? 'SAVING...' : 'SAVE CHANGES'}
                        </Button>
                        <Button variant="secondary" type="button" onClick={cancelEdit} disabled={savingForm}>
                          CANCEL
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function renderRecurringFields({
  merchantLabel,
  displayLabel,
  category,
  nominalAmount,
  frequency,
  dayOfMonth,
  dayOfWeek,
  firstDay,
  secondDay,
  onMerchantLabelChange,
  onDisplayLabelChange,
  onCategoryChange,
  onNominalAmountChange,
  onFrequencyChange,
  onDayOfMonthChange,
  onDayOfWeekChange,
  onFirstDayChange,
  onSecondDayChange,
}: {
  merchantLabel: string
  displayLabel: string
  category: string
  nominalAmount: string
  frequency: string
  dayOfMonth: string
  dayOfWeek: string
  firstDay: string
  secondDay: string
  onMerchantLabelChange: (val: string) => void
  onDisplayLabelChange: (val: string) => void
  onCategoryChange: (val: string) => void
  onNominalAmountChange: (val: string) => void
  onFrequencyChange: (val: string) => void
  onDayOfMonthChange: (val: string) => void
  onDayOfWeekChange: (val: string) => void
  onFirstDayChange: (val: string) => void
  onSecondDayChange: (val: string) => void
}) {
  return (
    <>
      <Input
        label="Merchant Label (for matching)"
        value={merchantLabel}
        onChange={onMerchantLabelChange}
        placeholder="Netflix, Rent, etc."
        required
      />

      <Input
        label="Display Label (optional)"
        value={displayLabel}
        onChange={onDisplayLabelChange}
        placeholder="Paramount Plus, Spotify, etc."
      />

      <div className="flex flex-col gap-1">
        <label className="text-xs uppercase tracking-wider text-dark font-medium">
          Category (REQUIRED)
        </label>
        <select
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-dark focus:outline-none focus:border-dark"
        >
          {RECURRING_CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      <Input
        label="Nominal Amount"
        type="text"
        inputMode="decimal"
        value={nominalAmount}
        onChange={onNominalAmountChange}
        placeholder="0.00"
        required
      />

      <div className="flex flex-col gap-1">
        <label className="text-xs uppercase tracking-wider text-dark font-medium">
          Frequency (REQUIRED)
        </label>
        <select
          value={frequency}
          onChange={(e) => onFrequencyChange(e.target.value)}
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
          onChange={onDayOfMonthChange}
          required
        />
      )}

      {(frequency === 'weekly' || frequency === 'biweekly') && (
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wider text-dark font-medium">
            Day of Week (REQUIRED)
          </label>
          <select
            value={dayOfWeek}
            onChange={(e) => onDayOfWeekChange(e.target.value)}
            className="border-2 border-cubicle-taupe bg-white px-3 py-2 text-dark focus:outline-none focus:border-dark"
          >
            <option value="0">Sunday</option>
            <option value="1">Monday</option>
            <option value="2">Tuesday</option>
            <option value="3">Wednesday</option>
            <option value="4">Thursday</option>
            <option value="5">Friday</option>
            <option value="6">Saturday</option>
          </select>
        </div>
      )}

      {frequency === 'twice_monthly' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="First Day"
            type="number"
            min="1"
            max="31"
            value={firstDay}
            onChange={onFirstDayChange}
            required
          />
          <Input
            label="Second Day"
            type="number"
            min="1"
            max="31"
            value={secondDay}
            onChange={onSecondDayChange}
            required
          />
        </div>
      )}
    </>
  )
}
