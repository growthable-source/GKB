import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentActor } from '@/lib/authz/authorize'

const NAV = [
  { href: '/admin/articles', label: 'Articles' },
  { href: '/admin/collections', label: 'Collections' },
  { href: '/admin/centers', label: 'Help Centers' },
  { href: '/admin/ops', label: 'Content Ops' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor()
  if (!actor.userId) redirect('/login')
  if (actor.memberships.length === 0) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-xl font-semibold">No access</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Your account is not a member of any help center yet.
        </p>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <span className="font-semibold">Help Center Admin</span>
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm text-neutral-600 hover:text-neutral-900">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
