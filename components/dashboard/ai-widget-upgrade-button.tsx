'use client'

import { useCallback, useState } from 'react'

/**
 * Starts the Growthable checkout. A same-tab redirect, unlike the portal
 * and customiser buttons: Stripe Checkout is a full-page flow that
 * returns to /dashboard/ai-agent on its own success/cancel URLs, and a
 * popup checkout is where payments go to die.
 */
export function UpgradeButton({ label = 'Upgrade now' }: { label?: string }) {
  const [error, setError] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)

  const open = useCallback(() => {
    setError(null)
    setRedirecting(true)

    void fetch('/api/dashboard/ai-widget/checkout', { method: 'POST' })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
        if (!response.ok || !body.url) {
          setRedirecting(false)
          setError(body.error ?? 'We could not start the checkout. Please try again.')
          return
        }
        window.location.assign(body.url)
      })
      .catch(() => {
        setRedirecting(false)
        setError('We could not start the checkout. Please try again.')
      })
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={open}
        disabled={redirecting}
        className="w-fit cursor-pointer rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-default disabled:opacity-60"
      >
        {redirecting ? 'Taking you to checkout…' : label}
      </button>
      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
    </div>
  )
}
