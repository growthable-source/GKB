'use client'

import { useCallback, useEffect, useState } from 'react'

type Minted = { builderUrl?: string; error?: string }

async function mint(): Promise<Minted> {
  const response = await fetch('/api/dashboard/ai-widget/builder-link', { method: 'POST' })
  const body = (await response.json().catch(() => ({}))) as Minted
  if (!response.ok || !body.builderUrl) {
    return { error: body.error ?? 'We could not open the customiser right now.' }
  }
  return { builderUrl: body.builderUrl }
}

/**
 * Xovera's appearance builder, embedded.
 *
 * Two things this has to get right, both of which look like bugs if it doesn't:
 *
 *  1. The token is single-use and expires in 10 minutes, so the URL is minted on
 *     mount and never stored. A refresh remounts and mints again — caching it
 *     would show "this link is no longer valid" on the second open.
 *  2. The builder's session cookie is SameSite=None, so a browser blocking
 *     third-party cookies renders a "session has expired" panel inside the
 *     frame that we cannot detect from out here. The new-tab escape hatch is
 *     therefore always offered, not held back for an error state — top-level is
 *     first-party, so it works where the frame does not.
 */
export function AiWidgetBuilder() {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    let cancelled = false

    void mint().then((result) => {
      if (cancelled) return
      if (result.builderUrl) setUrl(result.builderUrl)
      else setError(result.error ?? null)
    })

    return () => {
      cancelled = true
    }
  }, [])

  // A second mint, because the one in the iframe has already been spent.
  const openInTab = useCallback(async () => {
    setOpening(true)
    const result = await mint()
    setOpening(false)

    if (result.builderUrl) window.open(result.builderUrl, '_blank', 'noopener,noreferrer')
    else setError(result.error ?? null)
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        {error ? (
          <p className="px-4 py-6 text-sm text-neutral-600">{error}</p>
        ) : url ? (
          <iframe
            src={url}
            title="Customise your AI chat widget"
            className="h-[820px] w-full border-0"
          />
        ) : (
          <p className="px-4 py-6 text-sm text-neutral-500">Opening the customiser…</p>
        )}
      </div>

      <p className="text-xs text-neutral-500">
        Panel blank or asking you to sign in? Your browser is blocking third-party cookies.{' '}
        <button
          type="button"
          onClick={() => void openInTab()}
          disabled={opening}
          className="cursor-pointer underline disabled:opacity-60"
        >
          {opening ? 'Opening…' : 'Open the customiser in a new tab'}
        </button>{' '}
        instead.
      </p>
    </div>
  )
}
