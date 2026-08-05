'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type Hit = { articleId: string; slug: string; title: string; headline: string }

/**
 * `basePath` is passed in rather than read from headers: this is a client
 * component, and a hardcoded "/" here would walk a visitor out of the
 * path-addressed help center they are searching and into the base center.
 */
export function SearchBox({
  autoFocus = false,
  basePath = '',
}: {
  autoFocus?: boolean
  basePath?: string
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()

    // The too-short check lives inside the timer rather than the effect body so
    // that no branch calls setState synchronously during the effect.
    const timer = setTimeout(async () => {
      if (query.trim().length < 2) {
        setHits([])
        return
      }

      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`Search request failed: ${response.status}`)
        const data = (await response.json()) as { hits: Hit[] }
        setHits(data.hits)
        setActive(0)
        setOpen(true)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          // Aborted by the next keystroke; nothing to show.
          return
        }
        // A real failure (network error, non-OK response, bad JSON): don't leave
        // stale hits on screen looking like they still match the current query.
        setHits([])
        setOpen(false)
      }
    }, 180)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => Math.min(i + 1, hits.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const hit = hits[active]
      router.push(
        hit ? `${basePath}/a/${hit.slug}` : `${basePath}/search?q=${encodeURIComponent(query)}`,
      )
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        value={query}
        autoFocus={autoFocus}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => hits.length > 0 && setOpen(true)}
        placeholder="Search for answers…"
        aria-label="Search articles"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls="search-box-listbox"
        aria-autocomplete="list"
        aria-activedescendant={
          open && hits.length > 0 ? `search-box-option-${hits[active]?.articleId}` : undefined
        }
        // text-neutral-900 is not redundant: this sits inside the hero, which
        // sets `color` for its own light-on-dark text. Without an explicit
        // colour the input inherits it and types white on its white background.
        className="hc-search-input w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base text-neutral-900 shadow-sm focus:outline-none"
      />

      {open && hits.length > 0 && (
        <ul
          id="search-box-listbox"
          role="listbox"
          // Same reason as the input above: white panel, inside a hero that has
          // set an inherited colour.
          className="absolute z-10 mt-2 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white text-neutral-900 shadow-lg"
        >
          {hits.map((hit, index) => (
            <li key={hit.articleId} id={`search-box-option-${hit.articleId}`} role="option" aria-selected={index === active}>
              <a
                href={`${basePath}/a/${hit.slug}`}
                className={`block px-4 py-3 ${index === active ? 'hc-search-active' : ''}`}
              >
                <span className="block text-sm font-medium">{hit.title}</span>
                <span
                  className="mt-1 block text-xs text-neutral-500"
                  // Headline comes from ts_headline over sanitized text; only <mark> is added.
                  dangerouslySetInnerHTML={{ __html: hit.headline }}
                />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
