export function Card({
  title,
  children,
  className = '',
  accent = false,
}: {
  title?: string
  children: React.ReactNode
  className?: string
  accent?: boolean
}) {
  return (
    <div className={`rounded-lg border border-line bg-surface shadow-sm ${accent ? 'border-l-2 border-l-accent-2' : ''} ${className}`}>
      {title && (
        <div className="border-b border-line bg-surface-muted px-4 py-3">
          <h2 className="mono-label">
            {title}
          </h2>
        </div>
      )}
      <div className="p-4">
        {children}
      </div>
    </div>
  )
}
