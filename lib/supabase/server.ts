import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

type SupabaseServerClientOptions = {
  allowMissing?: boolean
}

export async function createSupabaseServerClient(
  options: SupabaseServerClientOptions = {}
) {
  const cookieStore = await cookies()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    if (options.allowMissing) {
      return null
    }
    throw new Error('Supabase env vars are not configured.')
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name) {
        return cookieStore.get(name)?.value
      },
      set(name, value, options) {
        cookieStore.set({ name, value, ...options })
      },
      remove(name, options) {
        cookieStore.set({ name, value: '', ...options })
      },
    },
  })
}
