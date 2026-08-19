'use client'

import { useActionState, useState } from 'react'
import type { DeleteHelpCenterState } from '@/app/admin/centers/actions'

/**
 * The danger zone on the admin centre detail page. Three deliberate
 * steps between a stray click and a deleted tenant: expand the panel,
 * read the consequences, and type the centre's slug back exactly —
 * the server action re-checks the slug too, so the guard holds even
 * against a hand-crafted request.
 */
export function DeleteCenterPanel({
  action,
  center,
  hasWidget,
  hasActiveSubscription,
}: {
  action: (prev: DeleteHelpCenterState | null, formData: FormData) => Promise<DeleteHelpCenterState>
  center: { id: string; slug: string; name: string }
  hasWidget: boolean
  hasActiveSubscription: boolean
}) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [state, formAction, pending] = useActionState(action, null)
  const confirmed = typed.trim() === center.slug

  if (!open) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50/50 p-5">
        <h2 className="text-sm font-semibold text-red-700">Danger zone</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Permanently delete this help centre, its articles, members, domains and widget install.
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
        >
          Delete this help centre…
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-5">
      <h2 className="text-sm font-semibold text-red-700">Delete “{center.name}”</h2>
      <ul className="mt-2 list-disc pl-5 text-sm text-neutral-700">
        <li>Every article and collection this centre owns is deleted.</li>
        <li>All member access and pending invites are removed.</li>
        <li>Custom domains stop resolving.</li>
        {hasWidget && <li>The AI chat widget is deactivated on Xovera (recoverable on their side).</li>}
        <li>This cannot be undone from this admin.</li>
      </ul>
      {hasActiveSubscription && (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ This centre has an <strong>active Agency AI subscription</strong>. Deleting does NOT cancel
          Stripe billing — cancel the subscription in Stripe first (or expect an angry email).
        </p>
      )}
      <form action={formAction} className="mt-4 flex flex-col gap-2">
        <input type="hidden" name="id" value={center.id} />
        <label className="text-sm text-neutral-700">
          Type <code className="rounded bg-white px-1 font-mono text-red-700">{center.slug}</code> to confirm:
        </label>
        <input
          name="confirmSlug"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder={center.slug}
          className="w-72 rounded-md border border-neutral-300 px-3 py-1.5 font-mono text-sm"
        />
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        <div className="mt-1 flex gap-2">
          <button
            type="submit"
            disabled={!confirmed || pending}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? 'Deleting…' : 'I understand — delete it'}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setTyped('') }}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
