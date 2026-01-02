export function Table({
  headers,
  rows,
  rowClassNames = [],
  className = '',
}: {
  headers: React.ReactNode[]
  rows: React.ReactNode[][]
  rowClassNames?: string[]
  className?: string
}) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-line bg-surface ${className}`}>
      <table className="w-full min-w-[300px] sm:min-w-[480px] table-fixed">
        <thead className="bg-surface-muted border-b border-line">
          <tr>
            {headers.map((header, i) => (
              <th
                key={i}
                className="mono-label px-2 py-3 text-left sm:px-4"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-surface">
          {rows.map((row, i) => (
            <tr
              key={i}
              className={`border-b border-line last:border-b-0 transition-colors hover:bg-surface-muted ${rowClassNames[i] ?? ''}`}
            >
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-2 text-[11px] text-foreground sm:px-4 sm:py-3 sm:text-sm">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
