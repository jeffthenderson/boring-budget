'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '../components/Card'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [needsMfa, setNeedsMfa] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const supabase = createSupabaseBrowserClient()

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(signInError.message)
        return
      }

      if (data.session) {
        router.push('/')
        router.refresh()
        return
      }

      const factors = data.user?.factors ?? []
      const totpFactor = factors.find(factor => factor.factor_type === 'totp')
      if (!totpFactor) {
        setError('Multi-factor verification required, but no factor is available.')
        return
      }

      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id,
      })

      if (challengeError) {
        setError(challengeError.message)
        return
      }

      setNeedsMfa(true)
      setMfaFactorId(totpFactor.id)
      setMfaChallengeId(challengeData.id)
    } catch (err: any) {
      setError(err?.message || 'Login failed.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyMfa(e: React.FormEvent) {
    e.preventDefault()
    if (!mfaFactorId || !mfaChallengeId) return

    setLoading(true)
    setError('')

    try {
      const supabase = createSupabaseBrowserClient()
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId: mfaChallengeId,
        code: mfaCode,
      })

      if (verifyError) {
        setError(verifyError.message)
        return
      }

      router.push('/')
      router.refresh()
    } catch (err: any) {
      setError(err?.message || 'MFA verification failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <Card title="Login">
        {!needsMfa ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              required
            />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              required
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? 'CHECKING...' : 'SIGN IN'}
              </Button>
            </div>
            <div className="text-xs text-monday-3pm">
              Invite-only access. Ask an admin for an invite.
            </div>
            {error && (
              <div className="text-sm text-monday-3pm">{error}</div>
            )}
          </form>
        ) : (
          <form onSubmit={handleVerifyMfa} className="space-y-4">
            <Input
              label="Authentication Code"
              type="text"
              inputMode="numeric"
              value={mfaCode}
              onChange={setMfaCode}
              required
            />
            <Button type="submit" disabled={loading}>
              {loading ? 'VERIFYING...' : 'VERIFY MFA'}
            </Button>
            {error && (
              <div className="text-sm text-monday-3pm">{error}</div>
            )}
          </form>
        )}
      </Card>
    </div>
  )
}
