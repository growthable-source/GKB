'use client'

export type SelectableCenter = { id: string; name: string; slug: string }

type Props = {
  centers: SelectableCenter[]
  excludedIds: string[]
  onChange: (excludedIds: string[]) => void
}

/**
 * Which help centers may show this article.
 *
 * Framed as exclusions, matching the storage: an article is on every center by
 * default and only the exceptions are recorded. The base center is deliberately
 * absent from `centers` — hiding an article there would remove it from the pool
 * every center reads through, which is what unpublishing is for.
 */
export function CenterVisibility({ centers, excludedIds, onChange }: Props) {
  if (centers.length === 0) return null

  const excluded = new Set(excludedIds)

  function toggle(id: string) {
    const next = new Set(excluded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange([...next])
  }

  return (
    <fieldset className="rounded-md border border-neutral-200 p-3">
      <legend className="px-1 text-sm font-medium text-neutral-700">Help centers</legend>

      <p className="mb-2 text-sm text-neutral-600">
        {excluded.size === 0
          ? 'Visible in all help centers.'
          : `Hidden from ${excluded.size} of ${centers.length}.`}
      </p>

      <ul className="flex flex-col gap-1">
        {centers.map((center) => (
          <li key={center.id}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!excluded.has(center.id)}
                onChange={() => toggle(center.id)}
                className="h-4 w-4"
              />
              <span className={excluded.has(center.id) ? 'text-neutral-400 line-through' : ''}>
                {center.name}
              </span>
              <span className="text-xs text-neutral-400">/{center.slug}</span>
            </label>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-xs text-neutral-500">
        Unticking hides this article from that center&rsquo;s listings, search and direct URL. To
        take it off every center, unpublish it instead.
      </p>
    </fieldset>
  )
}
