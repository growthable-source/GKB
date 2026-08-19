'use client'

import { useActionState } from 'react'
import type { SyncCenterState } from '@/app/admin/centers/actions'

/**
 * "Sync from Xovera" — the manual twin of the automatic post-unlock
 * push. Click it when a centre was unlocked on Xovera's side and the
 * widget/Pro state hasn't landed here (e.g. the push env isn't set up).
 */
export function SyncCenterButton({
  action,
  centerId,
}: {
  action: (prev: SyncCenterState | null, formData: FormData) => Promise<SyncCenterState>
  centerId: string
}) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form action={formAction} className="flex items-center gap-3">
      <input type="hidden" name="id" value={centerId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
      >
        {pending ? 'Syncing…' : 'Sync from Xovera'}
      </button>
      {state?.ok && <span className="text-sm text-emerald-700">{state.ok}</span>}
      {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
    </form>
  )
}
