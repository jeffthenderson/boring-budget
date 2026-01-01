import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

type SupabaseServerClientOptions = {
  allowMissing?: boolean
}

type SupabaseServerClient = ReturnType<typeof createServerClient>

export async function createSupabaseServerClient(): Promise<SupabaseServerClient>
export async function createSupabaseServerClient(
  options: SupabaseServerClientOptions & { allowMissing?: false }
): Promise<SupabaseServerClient>
export async function createSupabaseServerClient(
  options: SupabaseServerClientOptions & { allowMissing: true }
): Promise<SupabaseServerClient | null>
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
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: CookieOptions) {
        cookieStore.set({ name, value, ...options })
      },
      remove(name: string, options: CookieOptions) {
        cookieStore.set({ name, value: '', ...options })
      },
    },
  })
}
