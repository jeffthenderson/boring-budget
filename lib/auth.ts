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
