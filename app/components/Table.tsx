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
    <div className={`border-2 border-dark overflow-x-auto ${className}`}>
      <table className="w-full min-w-[300px] sm:min-w-[480px] table-fixed">
        <thead className="bg-ceiling-grey border-b-2 border-dark">
          <tr>
            {headers.map((header, i) => (
              <th
                key={i}
                className="px-1 py-2 text-left text-[8px] uppercase tracking-wider font-medium text-dark sm:px-4 sm:text-xs"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white">
          {rows.map((row, i) => (
            <tr
              key={i}
              className={`border-b border-cubicle-taupe last:border-b-0 ${rowClassNames[i] ?? ''}`}
            >
              {row.map((cell, j) => (
                <td key={j} className="px-1 py-2 text-[10px] text-dark sm:px-4 sm:py-3 sm:text-sm">
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
