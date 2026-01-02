'use client'

import { useEffect, useState } from 'react'
import { LOADING_MESSAGES } from '@/lib/constants/messages'

export function Loading() {
  const [message, setMessage] = useState(LOADING_MESSAGES[0])

  useEffect(() => {
    const interval = setInterval(() => {
      setMessage(LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)])
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="text-center">
        <div className="text-sm text-monday-3pm">{message}</div>
        <div className="mt-3 flex justify-center gap-2">
          <div className="h-2 w-2 rounded-full bg-line animate-pulse"></div>
          <div className="h-2 w-2 rounded-full bg-line animate-pulse delay-75"></div>
          <div className="h-2 w-2 rounded-full bg-accent animate-pulse delay-150"></div>
        </div>
      </div>
    </div>
  )
}
