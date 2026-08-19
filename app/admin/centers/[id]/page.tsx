import Link from 'next/link'
import { notFound } from 'next/navigation'
import { serviceClient } from '@/lib/db/client'
import { parseHeroStyle } from '@/lib/tenancy/theme'
import { EditCenterForm } from '@/components/admin/edit-center-form'
import { DeleteCenterPanel } from '@/components/admin/delete-center-panel'
import { SyncCenterButton } from '@/components/admin/sync-center-button'
import { editHelpCenter, deleteHelpCenter, syncCenterFromXovera } from '../actions'

export default async function EditCenterPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const { data, error } = await serviceClient()
    .from('help_centers')
    .select(
      'id, name, slug, is_base, primary_hex, secondary_hex, logo_url, favicon_url, settings, hero_style, hero_from_hex, hero_to_hex, hero_angle, font_family, heading_font, tiles_per_row',
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Could not load help center: ${error.message}`)
  if (!data) notFound()

  const settings = (data.settings ?? {}) as { headline?: string; subtitle?: string }

  // Danger-zone context: does deleting this centre also touch a live
  // widget, and is Stripe still billing it? Both drive warnings only.
  const [{ data: install }, { data: subscription }] = await Promise.all([
    serviceClient()
      .from('ai_widget_installs')
      .select('status')
      .eq('help_center_id', data.id)
      .maybeSingle(),
    serviceClient()
      .from('agency_subscriptions')
      .select('status')
      .eq('help_center_id', data.id)
      .in('status', ['trialing', 'active'])
      .maybeSingle(),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/centers" className="text-sm text-neutral-500 hover:underline">
          ← Help Centers
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold">
          {data.name}
          {data.is_base && (
            <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white">
              BASE
            </span>
          )}
        </h1>
      </div>

      <EditCenterForm
        action={editHelpCenter}
        center={{
          id: data.id,
          name: data.name,
          slug: data.slug,
          isBase: data.is_base,
          logoUrl: data.logo_url,
          faviconUrl: data.favicon_url,
          headline: settings.headline ?? '',
          subtitle: settings.subtitle ?? '',
          primaryHex: data.primary_hex,
          secondaryHex: data.secondary_hex,
          heroStyle: parseHeroStyle(data.hero_style),
          heroFromHex: data.hero_from_hex,
          heroToHex: data.hero_to_hex,
          heroAngle: data.hero_angle,
          bodyFont: data.font_family,
          headingFont: data.heading_font,
          tilesPerRow: data.tiles_per_row,
        }}
      />

      {!data.is_base && (
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <h2 className="text-sm font-semibold">AI widget & plan</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Unlocked this centre on Xovera? Pull the widget install and Pro flag across now —
            it also happens automatically when the unlock push is configured.
          </p>
          <div className="mt-3">
            <SyncCenterButton action={syncCenterFromXovera} centerId={data.id} />
          </div>
        </div>
      )}

      {!data.is_base && (
        <DeleteCenterPanel
          action={deleteHelpCenter}
          center={{ id: data.id, slug: data.slug, name: data.name }}
          hasWidget={!!install && install.status !== 'disabled'}
          hasActiveSubscription={!!subscription}
        />
      )}
    </div>
  )
}
