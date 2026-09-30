// Grey placeholder blocks shown while data loads (instead of a blank page).
export default function Skeleton({ className = 'h-4 w-full' }) {
  return <span className={`block animate-pulse rounded-lg bg-slate-200/80 ${className}`} aria-hidden="true" />
}

export function SkeletonCard({ lines = 2 }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" aria-hidden="true">
      <Skeleton className="h-10 w-10 rounded-2xl" />
      <Skeleton className="mt-4 h-7 w-24" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="mt-2 h-3 w-32" />
      ))}
    </div>
  )
}
