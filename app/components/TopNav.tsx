'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/', label: 'BUDGET' },
  { href: '/recurring', label: 'RECURRING' },
  { href: '/accounts', label: 'ACCOUNTS' },
  { href: '/amazon', label: 'AMAZON' },
  { href: '/settings', label: 'SETTINGS' },
]

export function TopNav({ showBrand = true }: { showBrand?: boolean }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <div className="mb-6 border-b-4 border-dark pb-4">
      <div className="flex items-center justify-between gap-4">
        {showBrand && (
          <Link href="/" className="text-xs uppercase tracking-[0.3em] text-dark">
            Boring Budget
          </Link>
        )}
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          aria-expanded={open}
          aria-controls="top-nav"
          className="md:hidden border-2 border-cubicle-taupe p-2 text-dark"
        >
          <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
            <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <nav
        id="top-nav"
        className={`mt-4 ${open ? 'flex' : 'hidden'} flex-col gap-2 text-sm md:flex md:flex-row md:flex-wrap md:gap-4`}
      >
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`text-dark hover:underline ${isActive ? 'font-medium underline' : ''}`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
