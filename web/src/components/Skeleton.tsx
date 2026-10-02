/** Platzhalter, solange Daten laden – zeigt die Form der Seite statt eines leeren Bildschirms. */
export function SkeletonPage() {
  return (
    <div className="space-y-3" aria-label="Lade Daten" role="status">
      <div className="skeleton h-36 rounded-[22px]" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28 rounded-[22px]" />
        ))}
      </div>
      <div className="skeleton h-40 rounded-[22px]" />
    </div>
  )
}
