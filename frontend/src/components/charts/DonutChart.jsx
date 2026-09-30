import { useState } from 'react'

const round = (n) => Math.round(n * 100) / 100 // 2 decimals: tidy markup

// Part-to-whole ring with a legend (label + count + share), so colour is never
// the only cue. Hovering or focusing a legend row highlights its segment.
// segments: [{ key, label, value, color }]
export default function DonutChart({ segments, centerValue, centerLabel, size = 180, thickness = 22 }) {
  const [active, setActive] = useState(null)
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const radius = (size - thickness) / 2
  const circumference = round(2 * Math.PI * radius)
  const gap = total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 2 : 0 // 2px surface gap between segments

  const lengths = segments.map((s) => (total ? round((s.value / total) * circumference) : 0))
  const arcs = segments.map((s, i) => ({
    ...s,
    length: round(Math.max(0, lengths[i] - gap)),
    offset: round(lengths.slice(0, i).reduce((sum, l) => sum + l, 0)),
  }))

  const shown = active ? segments.find((s) => s.key === active) : null
  const summary = segments.map((s) => `${s.label} ${s.value}`).join(', ')

  return (
    <div className="@container">
      <div className="flex flex-col items-center gap-6 @md:flex-row @md:items-center">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-90"
            role="img"
            aria-label={`${centerLabel}: ${summary}`}
          >
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" className="text-slate-100" strokeWidth={thickness} />
            {arcs.map((arc) =>
              arc.length > 0 ? (
                <circle
                  key={arc.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={active === arc.key ? thickness + 4 : thickness}
                  strokeDasharray={`${arc.length} ${circumference}`}
                  strokeDashoffset={-arc.offset}
                  className="transition-all duration-200"
                  opacity={active && active !== arc.key ? 0.35 : 1}
                  onMouseEnter={() => setActive(arc.key)}
                  onMouseLeave={() => setActive(null)}
                />
              ) : null,
            )}
          </svg>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-3xl font-bold text-slate-900 tabular-nums">{shown ? shown.value : centerValue}</p>
              <p className="text-xs font-medium text-slate-500">{shown ? shown.label : centerLabel}</p>
            </div>
          </div>
        </div>

        <ul className="w-full min-w-0 flex-1 space-y-1.5">
          {segments.map((s) => {
            const share = total ? Math.round((s.value / total) * 100) : 0
            return (
              <li
                key={s.key}
                tabIndex={0}
                onMouseEnter={() => setActive(s.key)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(s.key)}
                onBlur={() => setActive(null)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${active === s.key ? 'bg-slate-100' : ''}`}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden="true"
                />
                <span className="flex-1 font-medium text-slate-700">{s.label}</span>
                <span className="font-semibold text-slate-900 tabular-nums">{s.value}</span>
                <span className="w-10 text-right text-xs text-slate-500 tabular-nums">{share}%</span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
