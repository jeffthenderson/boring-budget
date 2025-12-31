export function Table({
  headers,
  rows,
  className = '',
}: {
  headers: string[]
  rows: React.ReactNode[][]
  className?: string
}) {
  return (
    <div className={`border-2 border-dark overflow-hidden ${className}`}>
      <table className="w-full">
        <thead className="bg-ceiling-grey border-b-2 border-dark">
          <tr>
            {headers.map((header, i) => (
              <th
                key={i}
                className="px-4 py-2 text-left text-xs uppercase tracking-wider font-medium text-dark"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white">
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-cubicle-taupe last:border-b-0">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-sm text-dark">
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
