import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentActor } from '@/lib/authz/authorize'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { trialBannerForCenter } from '@/lib/agency-plan/banner'

const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/articles', label: 'Articles' },
  { href: '/dashboard/collections', label: 'Sections' },
  { href: '/dashboard/appearance', label: 'Appearance' },
  { href: '/dashboard/ai-agent', label: 'AI chat widget' },
  // Real pages that gate themselves: Pro centres get the feature, free
  // centres get the pitch — better funnel than a dead "coming soon" span.
  { href: '/dashboard/domain', label: 'Domain' },
  { href: '/dashboard/team', label: 'Team' },
  { href: '/dashboard/billing', label: 'Billing' },
]

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
  const isStaff = actor.memberships.some((membership) => membership.helpCenterId === null)
  if (!hasOwnCenter) {
    if (isStaff) redirect('/admin/articles')
    redirect('/get/details')
  }

  // The one thing a customer must never be able to miss: they are on a
  // trial, and exactly when it converts into a charge. Layout-level so it is
  // on every dashboard page, not just the ones that mention billing.
  // getOwnedCenter() is request-cached, so the page's own call is free.
  const center = await getOwnedCenter()
  const trial = center ? await trialBannerForCenter(center.id) : null

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

          {/* Staff who also own a centre land here, not on the staff-only
              redirect above — without this link the internal tools are
              unreachable except by typing the URL. */}
          {isStaff && (
            <Link
              href="/admin/provision"
              className="ml-auto rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Admin
            </Link>
          )}
        </nav>
      </header>
      {trial && trial.tone === 'countdown' && (
        <div className="border-b border-amber-200 bg-amber-50">
          <p className="mx-auto max-w-5xl px-6 py-3 text-sm text-amber-900">
            <span className="font-semibold">
              Free trial — {trial.daysLeft} {trial.daysLeft === 1 ? 'day' : 'days'} left.
            </span>{' '}
            {trial.priceLabel
              ? `First charge of ${trial.priceLabel} on ${trial.chargeDate}.`
              : `Your first charge lands on ${trial.chargeDate}.`}{' '}
            <Link href="/dashboard/billing" className="font-medium underline">
              Cancel anytime before then — you won&apos;t be charged
            </Link>
            .
          </p>
        </div>
      )}
      {trial && trial.tone === 'canceled' && (
        <div className="border-b border-neutral-200 bg-neutral-100">
          <p className="mx-auto max-w-5xl px-6 py-3 text-sm text-neutral-700">
            <span className="font-semibold">Trial cancelled — you won&apos;t be charged.</span>{' '}
            Everything works until {trial.chargeDate}.{' '}
            <Link href="/dashboard/billing" className="font-medium underline">
              Changed your mind? Resume here
            </Link>
            .
          </p>
        </div>
      )}
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  )
}
