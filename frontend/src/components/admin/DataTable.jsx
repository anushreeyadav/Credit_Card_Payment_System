// Dense admin table. Scrolls sideways inside its own box on narrow screens,
// so the page itself never overflows.
export default function DataTable({ columns, rows, rowKey, testId }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[720px] text-left text-sm" data-testid={testId}>
        <thead className="bg-slate-50 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" className={`px-3 py-3 whitespace-nowrap first:pl-5 last:pr-5 ${col.align === 'right' ? 'text-right' : ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="align-top hover:bg-slate-50/60" data-testid={`${testId}-row`}>
              {columns.map((col) => (
                <td key={col.key} className={`px-3 py-3 first:pl-5 last:pr-5 ${col.align === 'right' ? 'text-right tabular-nums' : ''} ${col.className ?? ''}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
