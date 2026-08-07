'use client'

import { useState } from 'react'

/**
 * The embed code, for placements we do not render ourselves.
 *
 * The help centre deliberately does NOT use this — it renders the widget from
 * validated parts, and showing a snippet for the one surface we already control
 * would be the exact "here, paste this yourself" step the integration exists to
 * remove. This is for the customer's own HighLevel agency, where we have no
 * pages to inject into and they do have somewhere to paste.
 */
export function AiWidgetSnippet({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused (permissions, an insecure origin). The
      // snippet is on screen and selectable, so there is still a way through.
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <pre className="overflow-x-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-800">
        <code>{snippet}</code>
      </pre>
      <button
        type="button"
        onClick={() => void copy()}
        className="w-fit cursor-pointer rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
      >
        {copied ? 'Copied' : 'Copy the code'}
      </button>
    </div>
  )
}
