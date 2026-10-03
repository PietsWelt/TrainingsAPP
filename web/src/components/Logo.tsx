import { useId } from 'react'

/** Logo: Readiness-Ring mit Pulslinie. Der Verlauf folgt dem Modus (Holo hell, Aurora dunkel). */
export function Logo({ size = 28 }: { size?: number }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--g1)" />
          <stop offset=".5" stopColor="var(--g2)" />
          <stop offset="1" stopColor="var(--g3)" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="var(--surface-solid)" />
      <path d="M24 9.5a14.5 14.5 0 1 1-14.1 11.2" fill="none" stroke={`url(#${id})`} strokeWidth="4.2" strokeLinecap="round" />
      <path d="M14.5 26.5h5l2.8-7.5 3.9 12 2.8-5.5h4.5" fill="none" stroke="var(--text)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
