'use client'

import { useCallback, useState } from 'react'

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
 * Opens Xovera's appearance builder in a new tab.
 *
 * It used to be an iframe, which is what their brief suggests. In practice the
 * builder's session cookie is SameSite=None, so any browser blocking
 * third-party cookies — Safari by default, Chrome increasingly — showed their
 * "session has expired" padlock instead of the builder. The frame is
 * cross-origin, so we could not detect that and react to it; the customer just
 * saw a broken panel. Top-level makes Xovera first-party, so it works
 * everywhere, and one extra click beats a coin flip on whether the panel loads.
 *
 * The link is minted on click rather than on mount. That is also why this is
 * cheaper than the iframe was: minting is a write against Xovera's 60-per-10-
 * minutes budget shared across all customers, and the old version spent one
 * every time anyone loaded this page.
 */
export function AiWidgetBuilder() {
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  /** Set only when the popup blocker beat us, so the customer can click through manually. */
  const [manualUrl, setManualUrl] = useState<string | null>(null)

  const open = useCallback(() => {
    setError(null)
    setManualUrl(null)
    setOpening(true)

    // Opened synchronously, inside the click, because a popup blocker rejects a
    // window.open that happens after an await. It is navigated once the link
    // arrives. Not passing 'noopener' here on purpose: that makes window.open
    // return null, leaving nothing to navigate — so the opener link is severed
    // on the handle instead.
    const tab = window.open('', '_blank')
    if (tab) tab.opener = null

    void mint().then((result) => {
      setOpening(false)

      if (!result.builderUrl) {
        tab?.close()
        setError(result.error ?? 'We could not open the customiser right now.')
        return
      }

      if (tab) tab.location.href = result.builderUrl
      // The tab never opened, so hand the link over rather than silently
      // spending a single-use token on nothing.
      else setManualUrl(result.builderUrl)
    })
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={open}
        disabled={opening}
        className="w-fit cursor-pointer rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-default disabled:opacity-60"
      >
        {opening ? 'Opening…' : 'Open the customiser'}
      </button>

      <p className="text-xs text-neutral-500">
        Opens in a new tab. Come back to this one when you&rsquo;re done — your changes go live
        straight away.
      </p>

      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}

      {manualUrl && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your browser blocked the new tab.{' '}
          <a href={manualUrl} target="_blank" rel="noreferrer" className="font-medium underline">
            Open the customiser
          </a>
          . This link works once, so use it now rather than saving it.
        </p>
      )}
    </div>
  )
}
