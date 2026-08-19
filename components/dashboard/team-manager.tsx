'use client'

import { useActionState } from 'react'
import type { TeamActionState } from '@/app/dashboard/team/actions'

type Action = (prev: TeamActionState | null, formData: FormData) => Promise<TeamActionState>

const ROLE_HELP: Record<string, string> = {
  editor: 'writes, publishes, and can change centre settings',
  contributor: 'drafts articles for someone else to publish',
}

export function TeamManager({
  members,
  invites,
  viewerIsOwner,
  inviteAction,
  revokeAction,
  removeAction,
}: {
  members: Array<{ userId: string; role: string; email: string; isSelf: boolean; isOwner: boolean }>
  invites: Array<{ id: string; email: string; role: string; expiresAt: string }>
  viewerIsOwner: boolean
  inviteAction: Action
  revokeAction: Action
  removeAction: Action
}) {
  const [inviteState, inviteFormAction, inviting] = useActionState(inviteAction, null)
  const [revokeState, revokeFormAction] = useActionState(revokeAction, null)
  const [removeState, removeFormAction] = useActionState(removeAction, null)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Team</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Everyone with access to this help centre. Editors {ROLE_HELP.editor}; contributors {ROLE_HELP.contributor}.
        </p>
      </div>

      {!viewerIsOwner && (
        <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
          Only the help centre owner can invite or remove teammates. You can see who&rsquo;s on the team below.
        </p>
      )}

      {/* ── Invite (owner only) ────────────────────────────────────── */}
      {viewerIsOwner && (
      <form action={inviteFormAction} className="rounded-lg border border-neutral-200 bg-white p-5">
        <h2 className="text-sm font-semibold">Invite someone</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="email"
            name="email"
            required
            placeholder="teammate@youragency.com"
            className="w-72 rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          />
          <select name="role" defaultValue="editor" className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm">
            <option value="editor">Editor</option>
            <option value="contributor">Contributor</option>
          </select>
          <button
            type="submit"
            disabled={inviting}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {inviting ? 'Sending…' : 'Send invite'}
          </button>
        </div>
        {inviteState?.error && <p className="mt-2 text-sm text-red-600">{inviteState.error}</p>}
        {inviteState?.ok && <p className="mt-2 text-sm text-emerald-700">{inviteState.ok}</p>}
        <p className="mt-2 text-xs text-neutral-500">
          They get an email link that signs them in — no password to set up. Invites expire after 7 days.
        </p>
      </form>
      )}

      {/* ── Members ────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-neutral-200 bg-white">
        <div className="border-b border-neutral-200 px-5 py-3 text-sm font-semibold">Members</div>
        <ul className="divide-y divide-neutral-100">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 px-5 py-3">
              <span className="flex-1 text-sm">
                {m.email}
                {m.isSelf && <span className="ml-2 text-xs text-neutral-400">(you)</span>}
                {m.isOwner && <span className="ml-2 rounded-full bg-neutral-900 px-1.5 py-0.5 text-[10px] font-medium text-white">Owner</span>}
              </span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs capitalize text-neutral-600">{m.role}</span>
              {/* Owner-only, and never on the owner row. */}
              {viewerIsOwner && !m.isOwner && (
                <form action={removeFormAction}>
                  <input type="hidden" name="userId" value={m.userId} />
                  <button type="submit" className="text-xs text-red-600 hover:underline">Remove</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {removeState?.error && <p className="px-5 pb-3 text-sm text-red-600">{removeState.error}</p>}
      </div>

      {/* ── Pending invites (owner only) ───────────────────────────── */}
      {viewerIsOwner && invites.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-5 py-3 text-sm font-semibold">Pending invites</div>
          <ul className="divide-y divide-neutral-100">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                <span className="flex-1 text-sm">{i.email}</span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs capitalize text-neutral-600">{i.role}</span>
                <span className="text-xs text-neutral-400">expires {new Date(i.expiresAt).toLocaleDateString()}</span>
                <form action={revokeFormAction}>
                  <input type="hidden" name="inviteId" value={i.id} />
                  <button type="submit" className="text-xs text-red-600 hover:underline">Revoke</button>
                </form>
              </li>
            ))}
          </ul>
          {revokeState?.error && <p className="px-5 pb-3 text-sm text-red-600">{revokeState.error}</p>}
        </div>
      )}
    </div>
  )
}
