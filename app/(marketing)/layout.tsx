import Link from 'next/link'

/**
 * The marketing and signup shell.
 *
 * Everything under /get is Growthable's own brand, not a tenant's, so this
 * layout is the one place in the app that sets a fixed palette. The variables
 * land here rather than in globals.css so the class rules in `.mk` stay
 * declarative and this file remains the single source of the colours.
 */
const PALETTE = {
  '--mk-paper': '#f2efee',
  '--mk-surface': '#fbfaf9',
  '--mk-ink': '#1a1416',
  '--mk-ink-soft': '#5c4f52',
  '--mk-ink-faint': '#8b7c7f',
  '--mk-rule': '#d8cfcf',
  '--mk-rule-strong': '#b9abac',
  '--mk-accent': '#7c2230',
  '--mk-accent-hover': '#5e1723',
  '--mk-brass': '#9a7c42',
  '--mk-on-accent': '#fbf6f2',
} as React.CSSProperties

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mk min-h-screen" style={PALETTE}>
      <header className="border-b border-[color:var(--mk-rule)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-baseline gap-x-5 gap-y-2 px-5 py-4 sm:px-8">
          <Link href="/get" className="mk-display text-xl">
            Growthable
          </Link>
          <span className="mk-mono text-xs text-[color:var(--mk-ink-faint)]">
            white-label help centres for GoHighLevel agencies
          </span>
        </div>
      </header>

      {children}

      <footer className="border-t border-[color:var(--mk-rule)]">
        <div className="mk-mono mx-auto flex max-w-5xl flex-wrap justify-between gap-x-6 gap-y-2 px-5 py-6 text-xs text-[color:var(--mk-ink-faint)] sm:px-8">
          <span>Growthable</span>
          <Link href="/login" className="hover:text-[color:var(--mk-accent)]">
            Already have a help centre? Sign in
          </Link>
        </div>
      </footer>
    </div>
  )
}
