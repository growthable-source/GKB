import { redirect } from 'next/navigation'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { saveBranding } from '../actions'
import { BrandingForm } from '@/components/dashboard/branding-form'

export const metadata = { title: 'Appearance — Growthable' }

export default async function AppearancePage() {
  const center = await getOwnedCenter()
  if (!center) redirect('/get/details')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Appearance</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Your name, logo, and colours. Your address is fixed for now — get in touch if you need it
          changed.
        </p>
      </div>
      <BrandingForm action={saveBranding} center={center} />
    </div>
  )
}
