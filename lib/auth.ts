import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function getCurrentSupabaseUser() {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user ?? null
}

export async function requireUserId() {
  const user = await getCurrentSupabaseUser()
  if (!user) {
    throw new Error('Unauthorized')
  }
  return user.id
}

/**
 * Checks if the current user has MFA enabled and verified
 */
export async function checkMfaStatus(): Promise<{
  enabled: boolean
  verified: boolean
}> {
  const supabase = await createSupabaseServerClient()

  // Get the current session to check AMR claims
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return { enabled: false, verified: false }
  }

  // Check if user has MFA factors enrolled
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const hasEnabledFactor = factors?.totp?.some(f => f.status === 'verified') ?? false

  // Check if MFA was used in the current session (via AMR claims)
  // AMR is on session.user but not typed in Supabase types
  const amr = (session.user as any)?.amr ?? []
  const mfaVerifiedInSession = amr.some(
    (method: { method: string }) => method.method === 'totp' || method.method === 'mfa'
  )

  return {
    enabled: hasEnabledFactor,
    verified: mfaVerifiedInSession,
  }
}

/**
 * Requires that the user has MFA enabled and verified for the current session
 */
export async function requireMfa() {
  const status = await checkMfaStatus()

  if (!status.enabled) {
    throw new Error('MFA_REQUIRED: Please enable two-factor authentication in Settings before connecting your bank.')
  }

  if (!status.verified) {
    throw new Error('MFA_VERIFICATION_REQUIRED: Please verify your two-factor authentication to continue.')
  }
}
