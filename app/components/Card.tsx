export function Card({
  title,
  children,
  className = '',
}: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`border-2 border-dark bg-white ${className}`}>
      {title && (
        <div className="border-b-2 border-dark bg-ceiling-grey px-4 py-3">
          <h2 className="text-sm uppercase tracking-wider font-medium text-dark">
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
