'use client'

import { useCallback, useState } from 'react'

/**
 * Opens the customer's client portal, signed in.
 *
 * Same shape as the customiser button (see ai-widget-builder.tsx for why
 * each move is made): the tab opens synchronously inside the click so
 * popup blockers allow it, the single-use URL is minted per click and
 * never stored, and a blocked popup hands over the link instead of
 * silently spending the token.
 */
export function OpenPortalButton() {
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [manualUrl, setManualUrl] = useState<string | null>(null)

  const open = useCallback(() => {
    setError(null)
    setManualUrl(null)
    setOpening(true)

    const tab = window.open('', '_blank')
    if (tab) tab.opener = null

    void fetch('/api/dashboard/ai-widget/portal-link', { method: 'POST' })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { portalUrl?: string; error?: string }
        setOpening(false)

        if (!response.ok || !body.portalUrl) {
          tab?.close()
          setError(body.error ?? 'We could not open your portal right now.')
          return
        }
        if (tab) tab.location.href = body.portalUrl
        else setManualUrl(body.portalUrl)
      })
      .catch(() => {
        setOpening(false)
        tab?.close()
        setError('We could not open your portal right now.')
      })
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={open}
        disabled={opening}
        className="w-fit cursor-pointer rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-default disabled:opacity-60"
      >
        {opening ? 'Opening…' : 'Open your portal'}
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
            Open your portal
          </a>
          . This link works once — use it now.
        </p>
      )}
    </div>
  )
}
