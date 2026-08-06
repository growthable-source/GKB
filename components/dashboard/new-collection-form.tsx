'use client'

import { useActionState } from 'react'
import type { CollectionState } from '@/app/dashboard/collections/actions'

const FIELD = 'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm'

export function NewCollectionForm({
  action,
}: {
  action: (prev: CollectionState | null, formData: FormData) => Promise<CollectionState>
}) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4"
    >
      <div className="grid gap-3 sm:grid-cols-[6rem_1fr]">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-neutral-600">Icon</span>
          <input name="icon" placeholder="⭐" maxLength={4} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-neutral-600">Section name</span>
          <input name="title" required placeholder="About our agency" className={FIELD} />
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-neutral-600">Description</span>
        <input name="description" placeholder="What this section covers" className={FIELD} />
      </label>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-fit cursor-pointer rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {pending ? 'Adding…' : 'Add section'}
      </button>
    </form>
  )
}
