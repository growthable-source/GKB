'use client'

import { useActionState } from 'react'
import type { AiWidgetState } from '@/app/dashboard/ai-agent/actions'

/**
 * The server actions take no arguments — everything they need is in the
 * session. useActionState insists on passing (prevState, formData), so each
 * call site drops both rather than the action pretending to accept them.
 */
type Action = () => Promise<AiWidgetState>

function Error({ state }: { state: AiWidgetState | null }) {
  if (!state?.error) return null
  return (
    <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
      {state.error}
    </p>
  )
}

/**
 * The buy button.
 *
 * Disabled while pending, which is load-bearing rather than cosmetic:
 * provisioning can take most of a minute and a second click would spend another
 * of the 60-per-10-minutes write budget shared across every customer. It would
 * not create a second workspace — Xovera is idempotent on externalId — but it
 * would still be a wasted call.
 */
export function AddWidgetButton({ action, label }: { action: Action; label: string }) {
  const [state, submit, pending] = useActionState<AiWidgetState | null, FormData>(
    () => action(),
    null,
  )

  return (
    <form action={submit} className="flex flex-col gap-3">
      <Error state={state} />
      <button
        type="submit"
        disabled={pending}
        className="w-fit cursor-pointer rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-default disabled:opacity-60"
      >
        {pending ? 'Setting up your widget…' : label}
      </button>
      {pending && (
        <p className="text-xs text-neutral-500">
          This takes a few seconds. Don&rsquo;t close the tab.
        </p>
      )}
    </form>
  )
}

export function RemoveWidgetButton({ action }: { action: Action }) {
  const [state, submit, pending] = useActionState<AiWidgetState | null, FormData>(
    () => action(),
    null,
  )

  return (
    <form action={submit} className="flex flex-col gap-2">
      <Error state={state} />
      <button
        type="submit"
        disabled={pending}
        className="w-fit cursor-pointer text-sm text-neutral-500 underline disabled:opacity-60"
      >
        {pending ? 'Removing…' : 'Remove the AI chat widget'}
      </button>
      <p className="text-xs text-neutral-500">
        The widget stops appearing on your help centre. Your conversation history is kept, so
        adding it back later picks up where you left off.
      </p>
    </form>
  )
}
