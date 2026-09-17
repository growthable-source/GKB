'use client'

import { useActionState, useCallback, useState } from 'react'
import type { BillingActionState } from '@/app/dashboard/billing/actions'

type Action = (prev: BillingActionState, formData: FormData) => Promise<BillingActionState>

/**
 * The cancel control. Two-step on purpose — but the second step is a plain
 * inline confirm, not a modal or a typed phrase: the promise is "cancel in
 * one click", and the confirm exists only to stop a stray tap, never to
 * talk anyone out of leaving.
 */
export function CancelPlanButton({
  action,
  chargeDate,
  immediate = false,
}: {
  action: Action
  chargeDate: string | null
  /** past_due: the cancel ends the plan today and voids the open payment. */
  immediate?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [state, formAction, pending] = useActionState(action, null)

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-fit cursor-pointer rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          Cancel plan
        </button>
        {state?.error && (
          <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
            {state.error}
          </p>
        )}
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <p className="text-sm text-neutral-700">
        {immediate
          ? 'Your plan ends today, the outstanding payment is voided, and nothing further is collected.'
          : chargeDate
            ? `You won't be charged. Everything keeps working until ${chargeDate}, then your help centre drops to the free plan.`
            : 'Your plan will end at the close of the current billing period — no further charges.'}
      </p>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="w-fit cursor-pointer rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-default disabled:opacity-60"
        >
          {pending ? 'Cancelling…' : 'Yes, cancel — no charge'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="cursor-pointer text-sm text-neutral-600 hover:text-neutral-900"
        >
          Keep my plan
        </button>
      </div>
      {state?.error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {state.error}
        </p>
      )}
    </form>
  )
}

/** Undoes a scheduled cancellation. */
export function ResumePlanButton({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <button
        type="submit"
        disabled={pending}
        className="w-fit cursor-pointer rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-default disabled:opacity-60"
      >
        {pending ? 'Resuming…' : 'Resume my plan'}
      </button>
      {state?.error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {state.error}
        </p>
      )}
    </form>
  )
}

/**
 * Opens the Stripe billing portal (card, invoices). Same popup-safe shape as
 * ai-widget-portal-button.tsx: tab opened inside the click, URL minted per
 * click, blocked popup degrades to a handed-over link.
 */
export function StripePortalButton() {
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [manualUrl, setManualUrl] = useState<string | null>(null)

  const open = useCallback(() => {
    setError(null)
    setManualUrl(null)
    setOpening(true)

    const tab = window.open('', '_blank')
    if (tab) tab.opener = null

    void fetch('/api/dashboard/billing/portal', { method: 'POST' })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
        setOpening(false)

        if (!response.ok || !body.url) {
          tab?.close()
          setError(body.error ?? 'We could not open billing right now.')
          return
        }
        if (tab) tab.location.href = body.url
        else setManualUrl(body.url)
      })
      .catch(() => {
        setOpening(false)
        tab?.close()
        setError('We could not open billing right now.')
      })
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={open}
        disabled={opening}
        className="w-fit cursor-pointer rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 disabled:cursor-default disabled:opacity-60"
      >
        {opening ? 'Opening…' : 'Card & invoices'}
      </button>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}

      {manualUrl && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your browser blocked the new tab.{' '}
          <a href={manualUrl} target="_blank" rel="noreferrer" className="font-medium underline">
            Open billing
          </a>
          . This link works once — use it now.
        </p>
      )}
    </div>
  )
}
