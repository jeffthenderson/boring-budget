import type { InputHTMLAttributes } from 'react'

export function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
  required = false,
  disabled = false,
  min,
  max,
  step,
  maxLength,
  inputMode,
  pattern,
  className = '',
}: {
  label?: string
  value: string | number
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  min?: string | number
  max?: string | number
  step?: string | number
  maxLength?: number
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode']
  pattern?: string
  className?: string
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="mono-label">
          {label}
          {required && ' (required)'}
        </label>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        maxLength={maxLength}
        inputMode={inputMode}
        pattern={pattern}
        className={`rounded-md border border-line bg-white px-3 py-2 text-sm text-foreground shadow-sm transition duration-150 ease-out placeholder:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
          disabled ? 'opacity-60 cursor-not-allowed bg-surface-muted' : ''
        }`}
      />
    </div>
  )
}
