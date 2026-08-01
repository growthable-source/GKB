import Link from 'next/link'
import { getActiveHelpCenter } from '@/lib/tenancy/active'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const helpCenter = await getActiveHelpCenter()

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-5 py-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            {helpCenter.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={helpCenter.logoUrl} alt={helpCenter.name} className="h-7 w-auto" />
            ) : (
              helpCenter.name
            )}
          </Link>
        </div>
      </header>

      {children}

      <footer className="mt-16 border-t border-neutral-200 py-8">
        <p className="mx-auto max-w-4xl px-5 text-sm text-neutral-500">
          {helpCenter.name}
        </p>
      </footer>
    </div>
  )
}
