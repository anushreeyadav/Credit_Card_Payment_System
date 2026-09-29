// Temporary page body used until each page is built.
export default function PagePlaceholder({ title, description, apiNote, children }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-2 text-slate-600">{description}</p>
      {apiNote && (
        <p className="mt-4 inline-block rounded-md bg-slate-100 px-3 py-1.5 font-mono text-xs text-slate-700">
          {apiNote}
        </p>
      )}
      {children}
      <p className="mt-6 text-sm font-medium text-amber-700">Placeholder – not implemented yet.</p>
    </section>
  )
}
