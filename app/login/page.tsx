'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'

export default function LoginPage() {
  const router = useRouter()
  const [passcode, setPasscode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      })

      if (!response.ok) {
        setError('Incorrect passcode. (Try again.)')
        return
      }

      router.push('/')
      router.refresh()
    } catch (err: any) {
      setError(err?.message || 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <Card title="Login">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Passcode"
            type="password"
            value={passcode}
            onChange={setPasscode}
            required
          />
          <Button type="submit" disabled={loading}>
            {loading ? 'CHECKING...' : 'UNLOCK'}
          </Button>
          {error && (
            <div className="text-sm text-monday-3pm">{error}</div>
          )}
        </form>
      </Card>
    </div>
  )
}
