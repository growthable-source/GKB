import Link from 'next/link'
import { getActiveHelpCenter, getBasePath } from '@/lib/tenancy/active'
import { safeHex, DEFAULT_PRIMARY_HEX, DEFAULT_SECONDARY_HEX } from '@/lib/tenancy/color'
import { heroBackground, heroForeground, HERO_FOREGROUND_HEX } from '@/lib/tenancy/theme'
import { fontStack } from '@/lib/fonts/options'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [helpCenter, basePath] = await Promise.all([getActiveHelpCenter(), getBasePath()])

  return (
    <div
      className="hc-theme min-h-screen bg-white text-neutral-900"
      style={
        {
          '--hc-primary': safeHex(helpCenter.primaryHex, DEFAULT_PRIMARY_HEX),
          '--hc-secondary': safeHex(helpCenter.secondaryHex, DEFAULT_SECONDARY_HEX),
          '--hc-hero-bg': heroBackground(helpCenter),
          '--hc-hero-fg': HERO_FOREGROUND_HEX[heroForeground(helpCenter)],
          // headingFont falls back to the body font, so a center that picks one
          // font gets it everywhere.
          '--hc-font-heading': fontStack(helpCenter.headingFont ?? helpCenter.bodyFont),
          '--hc-font-body': fontStack(helpCenter.bodyFont),
          fontFamily: 'var(--hc-font-body)',
        } as React.CSSProperties
      }
    >
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-5 py-4">
          <Link href={`${basePath}/`} className="flex items-center gap-2 font-semibold">
            {helpCenter.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={helpCenter.logoUrl} alt={helpCenter.name} className="h-7 w-auto" />
            ) : (
              <span style={{ color: 'var(--hc-primary)' }}>{helpCenter.name}</span>
            )}
          </Link>
        </div>
      </header>

      {children}

      <footer className="mt-16 border-t border-neutral-200 py-8">
        <p className="hc-secondary-muted mx-auto max-w-4xl px-5 text-sm">{helpCenter.name}</p>
      </footer>
    </div>
  )
}
