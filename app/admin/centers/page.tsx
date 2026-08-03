import { serviceClient } from '@/lib/db/client'
import { CreateCenterForm } from '@/components/admin/create-center-form'
import { safeHex, DEFAULT_PRIMARY_HEX, DEFAULT_SECONDARY_HEX } from '@/lib/tenancy/color'
import { createHelpCenter } from './actions'

export default async function CentersPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string }>
}) {
  const { created } = await searchParams
  const db = serviceClient()

  const { data: centers, error } = await db
    .from('help_centers')
    .select('id, name, slug, is_base, primary_hex, secondary_hex, logo_url, favicon_url')
    .order('is_base', { ascending: false })
    .order('name', { ascending: true })
  if (error) throw new Error(`Could not load help centers: ${error.message}`)

  // One query for every placement row; counted per center in JS, same
  // approach as countArticlesPerCollection.
  const { data: placements, error: placementsError } = await db
    .from('help_center_articles')
    .select('help_center_id')
  if (placementsError) throw new Error(`Could not load article counts: ${placementsError.message}`)

  const articleCounts = new Map<string, number>()
  for (const row of placements ?? []) {
    articleCounts.set(row.help_center_id, (articleCounts.get(row.help_center_id) ?? 0) + 1)
  }

  const tenantDomain = process.env.NEXT_PUBLIC_TENANT_DOMAIN

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Help Centers</h1>

      {created && (
        <p className="rounded-md border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          Created &ldquo;{created}&rdquo;.
        </p>
      )}

      <CreateCenterForm action={createHelpCenter} />

      <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
        {(centers ?? []).length === 0 && (
          <li className="px-4 py-6 text-sm text-neutral-500">No help centers yet.</li>
        )}
        {(centers ?? []).map((center) => (
          <li key={center.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                <span
                  className="h-5 w-5 rounded-full border border-neutral-200"
                  style={{ backgroundColor: safeHex(center.primary_hex, DEFAULT_PRIMARY_HEX) }}
                  title={`Primary ${center.primary_hex}`}
                />
                <span
                  className="h-5 w-5 rounded-full border border-neutral-200"
                  style={{ backgroundColor: safeHex(center.secondary_hex, DEFAULT_SECONDARY_HEX) }}
                  title={`Secondary ${center.secondary_hex}`}
                />
              </div>
              {center.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={center.logo_url}
                  alt=""
                  className="h-5 w-5 object-contain"
                />
              )}
              {center.favicon_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={center.favicon_url}
                  alt=""
                  className="h-4 w-4 object-contain"
                />
              )}
              <div>
                <p className="flex items-center gap-2 font-medium">
                  {center.name}
                  {center.is_base && (
                    <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white">
                      BASE
                    </span>
                  )}
                </p>
                <p className="text-sm text-neutral-500">
                  {tenantDomain ? (
                    `https://${center.slug}.${tenantDomain}`
                  ) : (
                    <>
                      {center.slug}{' '}
                      <span className="text-neutral-400">(no tenant domain configured)</span>
                    </>
                  )}
                </p>
              </div>
            </div>
            <span className="text-sm text-neutral-500">
              {articleCounts.get(center.id) ?? 0} articles
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
