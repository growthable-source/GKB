import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentActor } from '@/lib/authz/authorize'

const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/articles', label: 'Articles' },
  { href: '/dashboard/collections', label: 'Sections' },
  { href: '/dashboard/appearance', label: 'Appearance' },
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
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  )
}
