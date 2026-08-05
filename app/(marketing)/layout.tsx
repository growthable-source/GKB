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
  // Measured off growthable.io, so the funnel is the same brand rather than a
  // near miss: warm off-white page, navy headings, the pink CTA, and the blush
  // tint used behind accented blocks.
  '--mk-paper': '#fbfaf8',
  '--mk-surface': '#ffffff',
  '--mk-surface-alt': '#f2f1ed',
  '--mk-tint': '#fdedf1',
  '--mk-heading': '#34475b',
  '--mk-ink': '#25313d',
  '--mk-ink-soft': '#5b6875',
  '--mk-ink-faint': '#8b949e',
  '--mk-rule': '#e4e2dc',
  '--mk-rule-strong': '#cfccc4',
  '--mk-accent': '#f03e6a',
  '--mk-accent-hover': '#d62d56',
  '--mk-on-accent': '#ffffff',
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
