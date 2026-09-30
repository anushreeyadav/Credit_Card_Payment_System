import { useState } from 'react'

const pct = (part, whole) => `${Math.round((part / whole) * 10000) / 100}%` // 2 decimals: tidy markup

// Vertical (optionally stacked) bar chart in plain HTML, so it stays crisp at
// any width. One y-axis, a recessive grid, rounded data-ends, a 2px gap
// between stacked segments, and a tooltip on hover. Pair it with a data
// table for keyboard and screen-reader users (the chart itself is one image).
// data:   [{ key, label, tooltipLabel?, values: { [seriesKey]: number } }]
// series: [{ key, label, color }]
function niceMax(value) {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  return [1, 2, 2.5, 5, 10].find((s) => s * power >= value) * power
}

export default function BarChart({ data, series, format = (v) => String(v), height = 220, labelEvery = 1, ariaLabel }) {
  const [active, setActive] = useState(null)
  const totals = data.map((d) => series.reduce((sum, s) => sum + (d.values[s.key] ?? 0), 0))
  const max = niceMax(Math.max(0, ...totals))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)

  return (
    <div>
      {series.length > 1 && (
        <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-slate-600" aria-label="Legend">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2" role="img" aria-label={ariaLabel}>
        {/* y-axis labels */}
        <div className="relative w-14 shrink-0 text-right text-[11px] text-slate-400 tabular-nums" style={{ height }} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0" style={{ bottom: pct(t, max), transform: 'translateY(50%)' }}>
              {format(t)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height }}>
            {ticks.map((t) => (
              <div
                key={t}
                className={`absolute inset-x-0 border-t ${t === 0 ? 'border-slate-300' : 'border-dashed border-slate-200'}`}
                style={{ bottom: pct(t, max) }}
                aria-hidden="true"
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-[3px] sm:gap-1.5">
              {data.map((d, i) => {
                const total = totals[i]
                return (
                  <div
                    key={d.key}
                    className="group relative flex h-full min-w-0 flex-1 flex-col justify-end rounded-t-md hover:bg-slate-100/70"
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                  >
                    <div className="mx-auto flex w-full max-w-10 flex-col-reverse gap-[2px]" style={{ height: pct(total, max) }}>
                      {series.map((s, index) => {
                        const value = d.values[s.key] ?? 0
                        if (!value) return null
                        const isTop = series.slice(index + 1).every((next) => !(d.values[next.key] ?? 0))
                        return (
                          <div
                            key={s.key}
                            className={`w-full transition-opacity ${isTop ? 'rounded-t-[4px]' : ''} ${active !== null && active !== i ? 'opacity-40' : ''}`}
                            style={{ flexGrow: value, flexBasis: 0, minHeight: 3, backgroundColor: s.color }}
                          />
                        )
                      })}
                    </div>
                    {active === i && (
                      <div className="theme-fixed pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-48 -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
                        <p className="font-semibold">{d.tooltipLabel ?? d.label}</p>
                        {series.map((s) => (
                          <p key={s.key} className="mt-0.5 flex items-center gap-2 text-slate-200">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                            {s.label}: <span className="font-semibold text-white tabular-nums">{format(d.values[s.key] ?? 0)}</span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div className="mt-2 flex h-4 gap-[3px] text-[11px] text-slate-500 sm:gap-1.5" aria-hidden="true">
            {data.map((d, i) => (
              <span key={d.key} className="relative min-w-0 flex-1">
                {i % labelEvery === 0 && (
                  <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{d.label}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
