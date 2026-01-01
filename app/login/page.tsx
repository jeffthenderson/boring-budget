'use client'

import { useEffect, useState } from 'react'
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
  const [inviteType, setInviteType] = useState<'invite' | 'recovery' | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [invitePassword, setInvitePassword] = useState('')
  const [invitePasswordConfirm, setInvitePasswordConfirm] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)
    const hashParams = new URLSearchParams(url.hash.slice(1))
    const searchParams = url.searchParams

    const type = hashParams.get('type') ?? searchParams.get('type')
    if (type !== 'invite' && type !== 'recovery') return

    const errorCode = hashParams.get('error') ?? searchParams.get('error')
    const errorDescription = hashParams.get('error_description') ?? searchParams.get('error_description')
    if (errorCode || errorDescription) {
      const message = errorDescription
        ? decodeURIComponent(errorDescription.replace(/\+/g, ' '))
        : 'Invite link is invalid or expired.'
      setError(message)
      return
    }

    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    const code = searchParams.get('code')

    setLoading(true)
    setError('')

    const supabase = createSupabaseBrowserClient()
    const fallbackMessage = type === 'recovery'
      ? 'Recovery link is invalid or expired.'
      : 'Invite link is invalid or expired.'

    const exchangeSession = async () => {
      if (code) {
        return supabase.auth.exchangeCodeForSession(code)
      }
      if (accessToken && refreshToken) {
        return supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
      }
      return supabase.auth.getSession()
    }

    exchangeSession()
      .then(({ data, error: sessionError }) => {
        if (sessionError || !data?.session) {
          setError(sessionError?.message || fallbackMessage)
          return
        }
        setInviteType(type)
        setInviteEmail(data.session.user.email ?? '')
      })
      .catch((err: any) => {
        setError(err?.message || 'Failed to load invite session.')
      })
      .finally(() => {
        setLoading(false)
      })

    const cleanUrl = new URL(window.location.href)
    cleanUrl.hash = ''
    cleanUrl.searchParams.delete('code')
    cleanUrl.searchParams.delete('type')
    cleanUrl.searchParams.delete('error')
    cleanUrl.searchParams.delete('error_description')
    window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search)
  }, [])

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

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteType) return

    if (invitePassword !== invitePasswordConfirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const supabase = createSupabaseBrowserClient()
      const { error: updateError } = await supabase.auth.updateUser({
        password: invitePassword,
      })

      if (updateError) {
        setError(updateError.message)
        return
      }

      router.push('/')
      router.refresh()
    } catch (err: any) {
      setError(err?.message || 'Failed to set password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <Card title={inviteType ? 'Set Password' : 'Login'}>
        {inviteType ? (
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div className="text-xs text-monday-3pm">
              {inviteType === 'invite'
                ? 'Finish your invite by setting a password.'
                : 'Set a new password to regain access.'}
              {inviteEmail ? ` Signed in as ${inviteEmail}.` : ''}
            </div>
            <Input
              label="Password"
              type="password"
              value={invitePassword}
              onChange={setInvitePassword}
              required
            />
            <Input
              label="Confirm Password"
              type="password"
              value={invitePasswordConfirm}
              onChange={setInvitePasswordConfirm}
              required
            />
            <Button type="submit" disabled={loading}>
              {loading ? 'SAVING...' : 'SET PASSWORD'}
            </Button>
            {error && (
              <div className="text-sm text-monday-3pm">{error}</div>
            )}
          </form>
        ) : !needsMfa ? (
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
