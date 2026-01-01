'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import LogoutButton from './LogoutButton'

export default function AuthStatus() {
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    let isMounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setHasSession(Boolean(data.session))
      }
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session))
    })

    return () => {
      isMounted = false
      subscription?.subscription.unsubscribe()
    }
  }, [])

  if (!hasSession) return null

  return (
    <div className="px-6 py-3 text-right text-xs">
      <LogoutButton />
    </div>
  )
}
