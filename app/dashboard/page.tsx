import { redirect } from 'next/navigation'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { saveBranding } from './actions'
import { BrandingForm } from '@/components/dashboard/branding-form'

export const metadata = { title: 'Your help centre — Growthable' }

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>
}) {
  const [center, { notice }] = await Promise.all([getOwnedCenter(), searchParams])
  if (!center) redirect('/get/details')

  const url = `/hc/${center.slug}`

  return (
    <div className="flex flex-col gap-8">
      {notice && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {notice}
        </p>
      )}

      <section className="rounded-lg border border-neutral-200 bg-white p-5">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Your help centre is live</p>
        <a
          href={url}
          className="mt-1 block font-mono text-lg text-neutral-900 underline decoration-neutral-300 underline-offset-4 hover:decoration-neutral-900"
        >
          {url}
        </a>
        <p className="mt-3 text-sm text-neutral-600">
          Every published article is already in there. Anything you change below shows up
          immediately.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Branding</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Your name, logo, and colours. Your address is fixed for now — get in touch if you need it
          changed.
        </p>
        <div className="mt-4">
          <BrandingForm action={saveBranding} center={center} />
        </div>
      </section>
    </div>
  )
}
