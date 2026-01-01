'use client'

import { useState, useEffect } from 'react'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { parseCurrency } from '@/lib/utils/currency'
import { useRouter } from 'next/navigation'
import { TopNav } from '../components/TopNav'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export default function SettingsPage() {
  const [charityPercent, setCharityPercent] = useState('0')
  const [retirementAmount, setRetirementAmount] = useState('0')
  const [otherSavingsAmount, setOtherSavingsAmount] = useState('0')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [ignoreRules, setIgnoreRules] = useState<any[]>([])
  const [ignorePattern, setIgnorePattern] = useState('')
  const [savingIgnore, setSavingIgnore] = useState(false)
  const [resetPhrase, setResetPhrase] = useState('')
  const [resetting, setResetting] = useState(false)
  const [mfaFactors, setMfaFactors] = useState<any[]>([])
  const [mfaLoading, setMfaLoading] = useState(false)
  const [mfaError, setMfaError] = useState('')
  const [enrollQr, setEnrollQr] = useState<string | null>(null)
  const [enrollSecret, setEnrollSecret] = useState<string | null>(null)
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null)
  const [enrollCode, setEnrollCode] = useState('')
  const router = useRouter()

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        setCharityPercent(data.charityPercent.toString())
        setRetirementAmount(data.retirementAmount.toString())
        setOtherSavingsAmount(data.otherSavingsAmount.toString())
      })

    loadIgnoreRules()
    loadMfaFactors()
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

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()

    if (resetPhrase !== 'RESET MY BUDGET') {
      alert('Incorrect confirmation phrase. Try again. (Take your time.)')
      return
    }

    if (!confirm('This will delete ALL data. Are you absolutely certain? (This is your last warning.)')) {
      return
    }

    setResetting(true)

    try {
      const response = await fetch('/api/reset', {
        method: 'POST',
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        const message = data?.error || `Reset failed (${response.status}).`
        alert(message)
        return
      }

      alert('Budget reset successfully. Nothing to see here. Move along.')
      router.push('/settings')
    } catch (error: any) {
      alert(error?.message || 'Failed to reset budget.')
    } finally {
      setResetting(false)
    }
  }

  async function loadMfaFactors() {
    setMfaLoading(true)
    setMfaError('')
    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) {
        setMfaError(error.message)
        return
      }
      setMfaFactors(data?.totp ?? [])
    } catch (err: any) {
      setMfaError(err?.message || 'Failed to load MFA factors.')
    } finally {
      setMfaLoading(false)
    }
  }

  async function handleEnrollMfa() {
    setMfaLoading(true)
    setMfaError('')
    try {
      const supabase = createSupabaseBrowserClient()
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error) {
        setMfaError(error.message)
        return
      }
      setEnrollFactorId(data.id)
      setEnrollQr(data.totp.qr_code)
      setEnrollSecret(data.totp.secret)
    } catch (err: any) {
      setMfaError(err?.message || 'Failed to start MFA enrollment.')
    } finally {
      setMfaLoading(false)
    }
  }

  async function handleVerifyMfa(e: React.FormEvent) {
    e.preventDefault()
    if (!enrollFactorId) return

    setMfaLoading(true)
    setMfaError('')
    try {
      const supabase = createSupabaseBrowserClient()
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: enrollFactorId,
      })
      if (challengeError) {
        setMfaError(challengeError.message)
        return
      }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: enrollFactorId,
        challengeId: challengeData.id,
        code: enrollCode,
      })
      if (verifyError) {
        setMfaError(verifyError.message)
        return
      }

      setEnrollQr(null)
      setEnrollSecret(null)
      setEnrollFactorId(null)
      setEnrollCode('')
      await loadMfaFactors()
    } catch (err: any) {
      setMfaError(err?.message || 'Failed to verify MFA enrollment.')
    } finally {
      setMfaLoading(false)
    }
  }

  async function handleDisableMfa(factorId: string) {
    setMfaLoading(true)
    setMfaError('')
    try {
      const supabase = createSupabaseBrowserClient()
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) {
        setMfaError(error.message)
        return
      }
      await loadMfaFactors()
    } catch (err: any) {
      setMfaError(err?.message || 'Failed to disable MFA.')
    } finally {
      setMfaLoading(false)
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <TopNav />
      <header className="mb-8">
        <h1 className="text-2xl uppercase tracking-widest font-medium text-dark mb-2">
          Settings & Admin
        </h1>
        <p className="text-sm text-monday-3pm">
          Configure your monthly pre-allocations and admin tools. (Riveting stuff.)
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
                className="grid grid-cols-1 md:grid-cols-[2fr_auto_auto] gap-3 items-start md:items-center py-2 border-b border-cubicle-taupe last:border-b-0"
              >
                <div>
                  <div className="font-medium">{rule.pattern}</div>
                  <div className="text-xs text-monday-3pm">
                    {rule.active ? 'Active' : 'Inactive'}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
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
              </div>
            ))
          )}
        </div>

        <div className="mt-4 text-sm text-monday-3pm">
          Ignored rules apply during CSV import and will remove matching imported transactions.
        </div>
      </Card>

      <Card title="Security">
        <div className="space-y-4">
          <p className="text-sm text-monday-3pm">
            Add an authenticator app for multi-factor authentication. (Extra tedium, maximum safety.)
          </p>

          {mfaError && (
            <div className="text-sm text-monday-3pm">{mfaError}</div>
          )}

          {mfaFactors.length > 0 ? (
            <div className="space-y-2">
              {mfaFactors.map(factor => (
                <div key={factor.id} className="flex items-center justify-between text-sm">
                  <span>Authenticator app enabled</span>
                  <Button
                    type="button"
                    disabled={mfaLoading}
                    onClick={() => handleDisableMfa(factor.id)}
                  >
                    {mfaLoading ? 'WORKING...' : 'DISABLE MFA'}
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <Button type="button" disabled={mfaLoading} onClick={handleEnrollMfa}>
              {mfaLoading ? 'WORKING...' : 'ENABLE MFA'}
            </Button>
          )}

          {enrollQr && enrollFactorId && (
            <div className="space-y-3 border border-dashed border-monday-3pm/40 p-4">
              <p className="text-sm text-monday-3pm">
                Scan this QR code in your authenticator app, then enter the 6-digit code to confirm.
              </p>
              <img
                src={enrollQr}
                alt="MFA QR Code"
                className="h-40 w-40 bg-white p-2"
              />
              {enrollSecret && (
                <div className="text-xs text-monday-3pm">
                  Manual setup key: <span className="font-mono">{enrollSecret}</span>
                </div>
              )}
              <form onSubmit={handleVerifyMfa} className="space-y-3">
                <Input
                  label="Verification Code"
                  type="text"
                  inputMode="numeric"
                  value={enrollCode}
                  onChange={setEnrollCode}
                  required
                />
                <Button type="submit" disabled={mfaLoading}>
                  {mfaLoading ? 'VERIFYING...' : 'VERIFY MFA'}
                </Button>
              </form>
            </div>
          )}
        </div>
      </Card>

      <Card title="Reset All Data">
        <div className="space-y-4">
          <p className="text-sm text-monday-3pm">
            This will permanently delete all budget periods, income items, category budgets,
            recurring definitions, transactions, import data, accounts, ignore rules, and pre-allocation settings. There is no undo.
          </p>

          <p className="text-sm text-monday-3pm">
            (Are you sure about this?)
          </p>

          <form onSubmit={handleReset} className="space-y-4 border-t-2 border-dark pt-4">
            <Input
              label='Type "RESET MY BUDGET" to confirm'
              value={resetPhrase}
              onChange={setResetPhrase}
              placeholder="RESET MY BUDGET"
              required
            />

            <Button type="submit" variant="danger" disabled={resetting}>
              {resetting ? 'RESETTING...' : 'RESET EVERYTHING'}
            </Button>
          </form>
        </div>
      </Card>

      <div className="mt-8 p-4 border-2 border-cubicle-taupe bg-white">
        <h3 className="text-sm uppercase font-medium mb-2">About Boring Budget</h3>
        <p className="text-sm text-monday-3pm mb-2">
          Version 1.0.0 (Unremarkable Edition)
        </p>
        <p className="text-sm text-monday-3pm">
          A single-user budgeting app that's thrillingly tedious and professionally boring.
        </p>
        <p className="text-sm text-monday-3pm mt-4">
          Built with Next.js, Prisma, SQLite, and an unhealthy appreciation for monotony.
        </p>
      </div>
    </div>
  )
}
