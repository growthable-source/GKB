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

export function CreateCenterForm({ action }: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)

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

      <input
        name="logoUrl"
        placeholder="Logo URL (optional)"
        className="rounded-md border border-neutral-300 px-3 py-2"
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
          disabled={pending}
          className="w-fit rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create help center'}
        </button>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  )
}
