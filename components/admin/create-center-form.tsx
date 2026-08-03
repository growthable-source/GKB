'use client'

import { useActionState, useState } from 'react'
import { slugify } from '@/lib/content/slug'
import type { CreateHelpCenterState } from '@/app/admin/centers/actions'

type Props = {
  action: (
    prev: CreateHelpCenterState | null,
    formData: FormData,
  ) => Promise<CreateHelpCenterState>
}

type BrandingUploadFieldProps = {
  label: string
  fieldName: string
  accept: string
  onUploadingChange: (uploading: boolean) => void
}

/** A file input that uploads on select and stores the resulting URL in a
 * hidden field, so the surrounding form keeps posting the same plain
 * FormData key (`logoUrl` / `faviconUrl`) the server action already reads.
 * Reports its uploading state up so the submit button can be disabled while
 * any branding upload is in flight. */
function BrandingUploadField({ label, fieldName, accept, onUploadingChange }: BrandingUploadFieldProps) {
  const [url, setUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setUploading(true)
    onUploadingChange(true)
    setError(null)
    const body = new FormData()
    body.append('file', file)

    const response = await fetch('/api/uploads/branding', { method: 'POST', body })
    const result = (await response.json()) as { url?: string; error?: string }

    if (!response.ok || !result.url) {
      setError(result.error ?? 'Upload failed')
      setUploading(false)
      onUploadingChange(false)
      return
    }

    setUrl(result.url)
    setUploading(false)
    onUploadingChange(false)
  }

  return (
    <div className="flex items-center gap-3">
      <input type="hidden" name={fieldName} value={url} />
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`${label} preview`}
            className="h-10 w-10 object-contain rounded border border-neutral-200"
          />
          <button
            type="button"
            onClick={() => setUrl('')}
            className="text-sm text-neutral-500 underline"
          >
            Remove
          </button>
        </>
      ) : (
        <label className="w-fit cursor-pointer rounded-md border border-neutral-300 px-3 py-2 text-sm">
          {uploading ? 'Uploading…' : `${label} (optional)`}
          <input
            type="file"
            accept={accept}
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

export function CreateCenterForm({ action }: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [faviconUploading, setFaviconUploading] = useState(false)

  function onNameChange(value: string) {
    setName(value)
    if (!slugTouched) setSlug(slugify(value))
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="name"
          required
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="Help center name"
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
        <input
          name="slug"
          required
          value={slug}
          onChange={(event) => {
            setSlugTouched(true)
            setSlug(event.target.value)
          }}
          placeholder="subdomain-slug"
          className="rounded-md border border-neutral-300 px-3 py-2"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          Primary color
          <input
            type="color"
            name="primaryHex"
            defaultValue="#1f6feb"
            className="h-9 w-16 rounded border border-neutral-300"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          Secondary color
          <input
            type="color"
            name="secondaryHex"
            defaultValue="#6e7781"
            className="h-9 w-16 rounded border border-neutral-300"
          />
        </label>
      </div>

      <BrandingUploadField
        label="Logo"
        fieldName="logoUrl"
        accept="image/png,image/jpeg,image/webp"
        onUploadingChange={setLogoUploading}
      />
      <BrandingUploadField
        label="Favicon"
        fieldName="faviconUrl"
        accept="image/png,image/x-icon,image/vnd.microsoft.icon"
        onUploadingChange={setFaviconUploading}
      />

      <input
        name="headline"
        placeholder="Homepage headline (optional)"
        className="rounded-md border border-neutral-300 px-3 py-2"
      />
      <input
        name="subtitle"
        placeholder="Homepage subtitle (optional)"
        className="rounded-md border border-neutral-300 px-3 py-2"
      />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || logoUploading || faviconUploading}
          className="w-fit rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create help center'}
        </button>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  )
}
