'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/', label: 'Budget' },
  { href: '/recurring', label: 'Recurring' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/amazon', label: 'Amazon' },
  { href: '/settings', label: 'Settings' },
]

export function TopNav({ showBrand = true }: { showBrand?: boolean }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <div className="mb-6 border-b border-line pb-4">
      <div className="flex items-center justify-between gap-4">
        {showBrand && (
          <div className="flex flex-col">
            <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
              Boring Budget
            </Link>
            <span className="text-[11px] text-monday-3pm">
              Financially unexciting, on purpose.
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen(prev => !prev)}
          aria-expanded={open}
          aria-controls="top-nav"
          className="md:hidden rounded-md border border-line bg-white px-3 py-2 text-[11px] font-mono uppercase tracking-[0.08em] text-foreground transition hover:bg-accent-soft"
        >
          {open ? 'Close' : 'Menu'}
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
              className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] transition ${
                isActive
                  ? 'bg-accent-soft text-foreground'
                  : 'text-monday-3pm hover:bg-accent-soft hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
