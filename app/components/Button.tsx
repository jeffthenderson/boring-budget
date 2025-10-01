export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled = false,
  className = '',
}: {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  className?: string
}) {
  const baseStyles = 'px-4 py-2 border-2 font-sans uppercase tracking-wide text-sm font-medium transition-colors'

  const variantStyles = {
    primary: 'border-dark bg-white text-dark hover:bg-ceiling-grey',
    secondary: 'border-cubicle-taupe bg-white text-dark hover:bg-background',
    danger: 'border-dark bg-white text-dark hover:bg-monday-3pm hover:text-white',
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {children}
    </button>
  )
}
