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
  const [showPasswordReset, setShowPasswordReset] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetMessage, setResetMessage] = useState('')
  const [resetCooldown, setResetCooldown] = useState(0)
  const [resetLoading, setResetLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)
    const hashParams = new URLSearchParams(url.hash.slice(1))
    const searchParams = url.searchParams

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
    const typeParam = hashParams.get('type') ?? searchParams.get('type')
    const hasAuthParams = Boolean(code || (accessToken && refreshToken))
    const type = typeParam === 'invite' || typeParam === 'recovery'
      ? typeParam
      : (hasAuthParams ? 'recovery' : null)
    if (!type) return

    setLoading(true)
    setError('')

    const supabase = createSupabaseBrowserClient()
    const fallbackMessage = type === 'recovery'
      ? 'Recovery link is invalid or expired.'
      : 'Invite link is invalid or expired.'

    const exchangeSession = async () => {
      if (code) {
        const exchange = await supabase.auth.exchangeCodeForSession(code)
        if (!exchange.error && exchange.data?.session) {
          return exchange
        }
      }
      if (accessToken && refreshToken) {
        const session = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (!session.error && session.data?.session) {
          return session
        }
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

  useEffect(() => {
    if (resetCooldown <= 0) return

    const timer = setInterval(() => {
      setResetCooldown(prev => Math.max(0, prev - 1))
    }, 1000)

    return () => clearInterval(timer)
  }, [resetCooldown])

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

      // Check if user has MFA factors enrolled
      const { data: factorsData } = await supabase.auth.mfa.listFactors()
      const verifiedTotpFactor = factorsData?.totp?.find(f => f.status === 'verified')

      // If user has verified MFA, require it even if Supabase returned a session
      if (verifiedTotpFactor) {
        const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
          factorId: verifiedTotpFactor.id,
        })

        if (challengeError) {
          setError(challengeError.message)
          return
        }

        setNeedsMfa(true)
        setMfaFactorId(verifiedTotpFactor.id)
        setMfaChallengeId(challengeData.id)
        return
      }

      // No MFA enrolled, proceed with session
      if (data.session) {
        router.push('/')
        router.refresh()
        return
      }

      // Fallback: check factors from signIn response (shouldn't reach here normally)
      const factors = data.user?.factors ?? []
      const totpFactor = factors.find(factor => factor.factor_type === 'totp')
      if (totpFactor) {
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
        return
      }

      setError('Login succeeded but no session was created.')
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

  function handleTogglePasswordReset(nextState?: boolean) {
    setShowPasswordReset(prev => {
      const next = nextState ?? !prev
      if (next) {
        setResetEmail(email)
        setResetMessage('')
      }
      return next
    })
    setError('')
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault()

    if (!resetEmail.trim() || resetCooldown > 0) return

    setResetLoading(true)
    setResetMessage('')

    try {
      const supabase = createSupabaseBrowserClient()
      await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: `${window.location.origin}/login`,
      })
    } catch (_err) {
      // Always respond with the same message to avoid user enumeration.
    } finally {
      setResetLoading(false)
      setResetCooldown(30)
      setResetMessage('If that address exists, a reset link is on the way. Hold your applause.')
    }
  }

  return (
    <div className="min-h-screen px-4 py-10 md:py-16">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Boring Budget</h1>
          <p className="text-sm text-monday-3pm">Quiet money. Quietly updated.</p>
        </div>
        <Card title={inviteType ? 'Set password' : 'Login'}>
        {inviteType ? (
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div className="text-xs text-monday-3pm">
              {inviteType === 'invite'
                ? 'Set a password to accept the invite. No confetti.'
                : 'Set a new password to regain access. Still calm.'}
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
              {loading ? 'Saving...' : 'Set password'}
            </Button>
            {error && (
              <div className="text-sm text-monday-3pm">{error}</div>
            )}
          </form>
        ) : needsMfa ? (
          <form onSubmit={handleVerifyMfa} className="space-y-4">
            <Input
              label="Authentication code"
              type="text"
              inputMode="numeric"
              value={mfaCode}
              onChange={setMfaCode}
              required
            />
            <Button type="submit" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify MFA'}
            </Button>
            {error && (
              <div className="text-sm text-monday-3pm">{error}</div>
            )}
          </form>
        ) : showPasswordReset ? (
          <form onSubmit={handlePasswordReset} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={resetEmail}
              onChange={setResetEmail}
              required
            />
            <Button type="submit" disabled={resetLoading || resetCooldown > 0}>
              {resetLoading
                ? 'Sending...'
                : resetCooldown > 0
                  ? `Try again in ${resetCooldown}s`
                  : 'Send reset link'}
            </Button>
            <div className="text-xs text-monday-3pm">
              If the address exists, you will get a link. The latest one wins.
            </div>
            {resetMessage && (
              <div className="text-sm text-monday-3pm">{resetMessage}</div>
            )}
            <button
              type="button"
              onClick={() => handleTogglePasswordReset(false)}
              className="text-xs text-monday-3pm underline underline-offset-4"
            >
              Back to sign in
            </button>
          </form>
        ) : (
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
                {loading ? 'Checking...' : 'Sign in'}
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-monday-3pm">
              <span>Invite-only access. Ask nicely.</span>
              <button
                type="button"
                onClick={() => handleTogglePasswordReset(true)}
                className="text-accent-2 underline underline-offset-4"
              >
                Forgot password?
              </button>
            </div>
            {error && (
              <div className="text-sm text-monday-3pm">{error}</div>
            )}
          </form>
        )}
        </Card>
      </div>
    </div>
  )
}
