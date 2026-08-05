'use client'

import { useActionState, useState } from 'react'
import { AppearanceFields } from '@/components/admin/appearance-fields'
import type { OwnedCenter } from '@/lib/dashboard/owned-center'
import type { DashboardState } from '@/app/dashboard/actions'

const FIELD = 'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm'

function LogoField({ initial }: { initial: string | null }) {
  const [url, setUrl] = useState(initial ?? '')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setUploading(true)
    setError(null)
    const body = new FormData()
    body.append('file', file)

    const response = await fetch('/api/dashboard/branding', { method: 'POST', body })
    const result = (await response.json()) as { url?: string; error?: string }

    if (!response.ok || !result.url) setError(result.error ?? 'Upload failed')
    else setUrl(result.url)
    setUploading(false)
  }

  return (
    <div className="flex items-center gap-3">
      <input type="hidden" name="logoUrl" value={url} />
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Your logo"
            className="h-10 w-10 rounded border border-neutral-200 object-contain"
          />
          <button
            type="button"
            onClick={() => setUrl('')}
            className="cursor-pointer text-sm text-neutral-500 underline"
          >
            Remove
          </button>
        </>
      ) : (
        <label className="w-fit cursor-pointer rounded-md border border-neutral-300 px-3 py-2 text-sm">
          {uploading ? 'Uploading…' : 'Upload a logo'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
              event.target.value = ''
            }}
          />
        </label>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}

export function BrandingForm({
  action,
  center,
}: {
  action: (prev: DashboardState | null, formData: FormData) => Promise<DashboardState>
  center: OwnedCenter
}) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm text-neutral-600">Name</span>
        <input name="name" defaultValue={center.name} required className={FIELD} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-neutral-600">Headline</span>
          <input
            name="headline"
            defaultValue={center.headline ?? ''}
            placeholder="How can we help?"
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm text-neutral-600">Subtitle</span>
          <input name="subtitle" defaultValue={center.subtitle ?? ''} className={FIELD} />
        </label>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm text-neutral-600">Logo</span>
        <LogoField initial={center.logoUrl} />
      </div>

      <input type="hidden" name="faviconUrl" value={center.faviconUrl ?? ''} />

      <AppearanceFields
        defaults={{
          primaryHex: center.primaryHex,
          secondaryHex: center.secondaryHex,
          heroStyle: center.heroStyle === 'solid' ? 'solid' : 'gradient',
          heroFromHex: null,
          heroToHex: null,
          heroAngle: center.heroAngle,
          bodyFont: center.bodyFont,
          headingFont: center.headingFont,
          tilesPerRow: center.tilesPerRow,
        }}
      />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="w-fit cursor-pointer rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        {state?.saved && <span className="text-sm text-green-700">Saved</span>}
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
      </div>
    </form>
  )
}
