import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentActor } from '@/lib/authz/authorize'

const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/articles', label: 'Articles' },
  { href: '/dashboard/collections', label: 'Sections' },
  { href: '/dashboard/appearance', label: 'Appearance' },
  { href: '/dashboard/ai-agent', label: 'AI chat widget' },
]

// Rendered as plain text, not links: nothing behind them exists yet, and a nav
// item that looks clickable and does nothing is worse than one that is visibly
// not ready. They sit here rather than only on the overview because this is
// where someone goes looking for "where do I set my domain".
const COMING_SOON = ['Domain', 'Team']

/**
 * The customer surface.
 *
 * Deliberately separate from /admin: everything here is scoped to the single
 * centre the signed-in person owns, and nothing here can reach the shared
 * content library except to hide parts of it. Staff, who hold a global
 * membership and no scoped one, are sent to the internal tools instead — two
 * audiences, two surfaces, no overlap.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor()
  if (!actor.userId) redirect('/login?next=/dashboard')

  const hasOwnCenter = actor.memberships.some((membership) => membership.helpCenterId !== null)
  if (!hasOwnCenter) {
    const isStaff = actor.memberships.some((membership) => membership.helpCenterId === null)
    if (isStaff) redirect('/admin/articles')
    redirect('/get/details')
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
          <Link href="/dashboard" className="font-semibold">
            Your help centre
          </Link>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm text-neutral-600 hover:text-neutral-900"
            >
              {item.label}
            </Link>
          ))}

          {COMING_SOON.map((label) => (
            <span
              key={label}
              aria-disabled="true"
              title="Coming soon on Pro"
              className="flex cursor-default items-center gap-1.5 text-sm text-neutral-400"
            >
              {label}
              <span className="rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
                Pro
              </span>
            </span>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  )
}
