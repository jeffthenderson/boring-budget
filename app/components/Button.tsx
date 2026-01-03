export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled = false,
  className = '',
}: {
  children: React.ReactNode
  onClick?: (e?: React.FormEvent) => void
  variant?: 'primary' | 'secondary' | 'danger' | 'outline'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  className?: string
}) {
  const baseStyles = 'inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-[12px] font-mono uppercase tracking-[0.08em] transition duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-2 active:translate-y-[1px] active:scale-[0.99]'

  const variantStyles = {
    primary: 'border-[color:var(--accent)] bg-[color:var(--accent)] text-white shadow-sm hover:bg-[color:var(--accent-strong)] hover:border-[color:var(--accent-strong)]',
    secondary: 'border-line bg-white text-foreground hover:bg-accent-2-soft',
    danger: 'border-[color:var(--danger)] bg-[color:var(--danger)] text-white hover:bg-[color:var(--danger-strong)]',
    outline: 'border-line bg-transparent text-foreground hover:bg-accent-2-soft',
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${disabled ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''} ${className}`}
    >
      {children}
    </button>
  )
}
