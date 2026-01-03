'use client'

import { useEffect, useRef, useState, useId } from 'react'

export type SelectOption = {
  value: string
  label: string
  color?: string
}

export function SelectMenu({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select',
  disabled = false,
  className = '',
  compact = false,
}: {
  label?: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  useEffect(() => {
    if (!open) return

    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)

    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const selected = options.find(option => option.value === value)
  const paddingClass = compact ? 'px-2 py-1.5' : 'px-3 py-2'

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && <label className="mono-label mb-1 block">{label}</label>}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => !disabled && setOpen(prev => !prev)}
        disabled={disabled}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-white ${paddingClass} text-sm text-foreground transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-2 ${
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-accent-2 hover:bg-accent-2-soft/30'
        } ${open ? 'border-accent-2 ring-2 ring-accent-2-soft' : ''}`}
      >
        <span className="flex items-center gap-2 truncate">
          {selected?.color && (
            <span
              className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: selected.color }}
            />
          )}
          <span className={selected ? 'text-foreground' : 'text-monday-3pm'}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`flex-shrink-0 text-monday-3pm transition-transform duration-150 ${open ? 'rotate-180 text-accent-2' : ''}`}
        >
          <path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full min-w-[160px] rounded-lg border border-line bg-white shadow-lg shadow-black/5 animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <div className="max-h-64 overflow-y-auto py-1">
            {options.map(option => {
              const isSelected = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    isSelected
                      ? 'bg-accent-2-soft text-foreground font-medium'
                      : 'text-foreground hover:bg-accent-soft'
                  }`}
                >
                  {option.color && (
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: option.color }}
                    />
                  )}
                  <span className="flex-1">{option.label}</span>
                  {isSelected && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      className="text-accent-2 flex-shrink-0"
                    >
                      <path d="M11.5 4L5.5 10L2.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
