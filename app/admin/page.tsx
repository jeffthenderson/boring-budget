'use client'

import { useState } from 'react'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function AdminPage() {
  const [resetPhrase, setResetPhrase] = useState('')
  const [resetting, setResetting] = useState(false)
  const router = useRouter()

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

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <Link href="/" className="text-dark hover:underline text-sm">← BACK TO BUDGET</Link>
        <h1 className="text-2xl uppercase tracking-widest font-medium text-dark mt-4 mb-2">
          Admin
        </h1>
        <p className="text-sm text-monday-3pm">
          Proceed with caution. (Or don't. We're not your supervisor.)
        </p>
      </header>

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
