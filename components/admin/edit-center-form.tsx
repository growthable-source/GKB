'use client'

import { useActionState, useState } from 'react'
import { AppearanceFields, type AppearanceDefaults } from './appearance-fields'
import type { EditHelpCenterState } from '@/app/admin/centers/actions'

export type EditCenterDefaults = AppearanceDefaults & {
  id: string
  name: string
  slug: string
  isBase: boolean
  logoUrl: string | null
  faviconUrl: string | null
  headline: string
  subtitle: string
}

type Props = {
  action: (prev: EditHelpCenterState | null, formData: FormData) => Promise<EditHelpCenterState>
  center: EditCenterDefaults
}

export function EditCenterForm({ action, center }: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [slug, setSlug] = useState(center.slug)

  const slugChanged = slug !== center.slug

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-lg border border-neutral-200 bg-white p-5"
    >
      <input type="hidden" name="id" value={center.id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-700">Name</span>
          <input
            name="name"
            required
            defaultValue={center.name}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-700">Subdomain</span>
          <input
            name="slug"
            required
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
          {slugChanged && (
            <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
              Renaming changes this center&rsquo;s public URL. The old address stops working
              immediately &mdash; there is no redirect.
            </span>
          )}
        </label>
      </div>

      <AppearanceFields defaults={center} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-700">Homepage headline</span>
          <input
            name="headline"
            defaultValue={center.headline}
            placeholder="How can we help?"
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-neutral-700">Homepage subtitle</span>
          <input
            name="subtitle"
            defaultValue={center.subtitle}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
      </div>

      {/* Uploading a new logo is a separate flow; keep the existing URLs so a
          save never silently clears them. */}
      <input type="hidden" name="logoUrl" value={center.logoUrl ?? ''} />
      <input type="hidden" name="faviconUrl" value={center.faviconUrl ?? ''} />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state?.saved && !state.error && <p className="text-sm text-green-700">Saved.</p>}
      </div>
    </form>
  )
}
