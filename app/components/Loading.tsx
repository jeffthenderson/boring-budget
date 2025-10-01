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
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="text-monday-3pm text-base mb-2">{message}</div>
        <div className="flex gap-1 justify-center">
          <div className="w-2 h-2 bg-cubicle-taupe animate-pulse"></div>
          <div className="w-2 h-2 bg-cubicle-taupe animate-pulse delay-75"></div>
          <div className="w-2 h-2 bg-cubicle-taupe animate-pulse delay-150"></div>
        </div>
      </div>
    </div>
  )
}
