'use client'

import { useActionState, useEffect, useState } from 'react'
import { slugify } from '@/lib/content/slug'
import { FONT_OPTIONS, fontStack } from '@/lib/fonts/options'
import type { FunnelState } from '@/app/(marketing)/get/actions'

type PreviewCollection = { title: string; icon: string | null; count: number }

type Defaults = {
  centerName: string
  slug: string
  primaryHex: string
  secondaryHex: string
  logoUrl: string
  heroStyle: string
  headline: string
  bodyFont: string
  headingFont: string
  tilesPerRow: number
}

const FIELD =
  'w-full rounded-lg border border-[color:var(--mk-rule-strong)] bg-[color:var(--mk-surface)] px-3 py-2.5 text-sm text-[color:var(--mk-ink)] focus:outline-2 focus:outline-offset-1 focus:outline-[color:var(--mk-accent)]'
const LABEL = 'text-xs text-[color:var(--mk-ink-soft)]'

export function BuilderForm({
  action,
  collections,
  defaults,
}: {
  action: (prev: FunnelState | null, formData: FormData) => Promise<FunnelState>
  collections: PreviewCollection[]
  defaults: Defaults
}) {
  const [state, formAction, pending] = useActionState(action, null)

  const [name, setName] = useState(defaults.centerName)
  const [slug, setSlug] = useState(defaults.slug)
  const [slugTouched, setSlugTouched] = useState(Boolean(defaults.slug))
  const [availability, setAvailability] = useState<{ available: boolean; reason?: string } | null>(
    null,
  )
  const [primary, setPrimary] = useState(defaults.primaryHex)
  const [secondary, setSecondary] = useState(defaults.secondaryHex)
  const [heroStyle, setHeroStyle] = useState(defaults.heroStyle)
  const [headline, setHeadline] = useState(defaults.headline)
  const [bodyFont, setBodyFont] = useState(defaults.bodyFont)
  const [headingFont, setHeadingFont] = useState(defaults.headingFont)
  const [tiles, setTiles] = useState(defaults.tilesPerRow)
  const [logoUrl, setLogoUrl] = useState(defaults.logoUrl)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    // The empty check lives inside the timer, not the effect body, so no branch
    // calls setState synchronously during the effect — same shape as
    // components/public/search-box.tsx.
    const timer = setTimeout(async () => {
      const value = slug.trim()
      if (!value) {
        setAvailability(null)
        return
      }

      try {
        const response = await fetch(`/api/signup/slug?value=${encodeURIComponent(value)}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(String(response.status))
        setAvailability(await response.json())
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        // Don't claim an address is free when we could not ask. The server
        // checks again on submit either way.
        setAvailability(null)
      }
    }, 250)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [slug])

  async function uploadLogo(file: File) {
    setUploading(true)
    const body = new FormData()
    body.append('file', file)
    const response = await fetch('/api/signup/branding', { method: 'POST', body })
    const result = (await response.json()) as { url?: string }
    if (result.url) setLogoUrl(result.url)
    setUploading(false)
  }

  const heroBackground =
    heroStyle === 'solid' ? primary : `linear-gradient(135deg, ${primary}, ${secondary})`

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[minmax(0,340px)_1fr]">
      <input type="hidden" name="primaryHex" value={primary} />
      <input type="hidden" name="secondaryHex" value={secondary} />
      <input type="hidden" name="logoUrl" value={logoUrl} />
      <input type="hidden" name="heroStyle" value={heroStyle} />
      <input type="hidden" name="heroAngle" value="135" />
      <input type="hidden" name="bodyFont" value={bodyFont} />
      <input type="hidden" name="headingFont" value={headingFont} />
      <input type="hidden" name="tilesPerRow" value={tiles} />

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Help centre name</span>
          <input
            name="centerName"
            required
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              if (!slugTouched) setSlug(slugify(event.target.value))
            }}
            placeholder="Acme Agency"
            className={FIELD}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>Address</span>
          <div className="flex items-center gap-1.5 rounded-lg border border-[color:var(--mk-rule-strong)] bg-[color:var(--mk-surface)] px-3 py-2.5 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[color:var(--mk-accent)]">
            <span className="mk-mono text-sm text-[color:var(--mk-ink-faint)]">/hc/</span>
            <input
              name="slug"
              required
              value={slug}
              onChange={(event) => {
                setSlugTouched(true)
                setSlug(slugify(event.target.value))
              }}
              placeholder="acme"
              className="mk-mono min-w-0 flex-1 bg-transparent text-sm text-[color:var(--mk-ink)] focus:outline-none"
            />
          </div>
          {availability && (
            <span
              className={`text-xs ${
                availability.available
                  ? 'text-[color:var(--mk-heading)]'
                  : 'text-[color:var(--mk-accent)]'
              }`}
            >
              {availability.available ? 'Available' : availability.reason}
            </span>
          )}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Headline</span>
          <input
            name="headline"
            value={headline}
            onChange={(event) => setHeadline(event.target.value)}
            placeholder="How can we help?"
            className={FIELD}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>Logo</span>
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt="Your logo"
                  className="h-10 w-10 rounded-lg border border-[color:var(--mk-rule)] object-contain"
                />
                <button
                  type="button"
                  onClick={() => setLogoUrl('')}
                  className="cursor-pointer text-xs text-[color:var(--mk-ink-faint)] underline"
                >
                  Remove
                </button>
              </>
            ) : (
              <label className="w-fit cursor-pointer rounded-lg border border-[color:var(--mk-rule-strong)] px-3 py-2 text-sm">
                {uploading ? 'Uploading…' : 'Upload a logo'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void uploadLogo(file)
                    event.target.value = ''
                  }}
                />
              </label>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Primary colour</span>
            <input
              type="color"
              value={primary}
              onChange={(event) => setPrimary(event.target.value)}
              className="h-10 w-full cursor-pointer rounded-lg border border-[color:var(--mk-rule-strong)] bg-[color:var(--mk-surface)]"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Secondary colour</span>
            <input
              type="color"
              value={secondary}
              onChange={(event) => setSecondary(event.target.value)}
              className="h-10 w-full cursor-pointer rounded-lg border border-[color:var(--mk-rule-strong)] bg-[color:var(--mk-surface)]"
            />
          </label>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={LABEL}>Hero</span>
          <div className="flex gap-2">
            {['gradient', 'solid'].map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setHeroStyle(style)}
                className={`cursor-pointer rounded-lg border px-3 py-2 text-sm capitalize ${
                  heroStyle === style
                    ? 'border-[color:var(--mk-accent)] text-[color:var(--mk-accent)]'
                    : 'border-[color:var(--mk-rule-strong)] text-[color:var(--mk-ink-soft)]'
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Heading font</span>
            <select
              value={headingFont}
              onChange={(event) => setHeadingFont(event.target.value)}
              className={FIELD}
            >
              <option value="">Default</option>
              {FONT_OPTIONS.map((font) => (
                <option key={font.key} value={font.key}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Body font</span>
            <select
              value={bodyFont}
              onChange={(event) => setBodyFont(event.target.value)}
              className={FIELD}
            >
              <option value="">Default</option>
              {FONT_OPTIONS.map((font) => (
                <option key={font.key} value={font.key}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Categories per row</span>
          <select
            value={tiles}
            onChange={(event) => setTiles(Number(event.target.value))}
            className={FIELD}
          >
            {[2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        {state?.error && <p className="text-sm text-[color:var(--mk-accent)]">{state.error}</p>}

        <button
          type="submit"
          disabled={pending || uploading || availability?.available === false}
          className="mt-1 cursor-pointer rounded-lg bg-[color:var(--mk-accent)] px-5 py-3 font-medium text-[color:var(--mk-on-accent)] transition-colors hover:bg-[color:var(--mk-accent-hover)] disabled:opacity-50"
        >
          {pending ? 'Sending your link…' : 'Confirm my email and go live'}
        </button>
        <p className="text-xs text-[color:var(--mk-ink-faint)]">
          We&rsquo;ll email you a link. Opening it creates your help centre.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <span className="mk-mono text-xs uppercase tracking-[0.12em] text-[color:var(--mk-ink-faint)]">
          Live preview
        </span>

        <div
          className="overflow-hidden rounded-lg border border-[color:var(--mk-rule)] bg-white"
          style={{ fontFamily: fontStack(bodyFont || null) }}
        >
          <div className="flex items-center gap-2 border-b border-neutral-200 px-5 py-3.5">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-6 w-auto" />
            ) : (
              <span className="font-semibold" style={{ color: primary }}>
                {name || 'Your agency'}
              </span>
            )}
          </div>

          <div
            className="px-5 py-12 text-center text-white"
            style={{ background: heroBackground }}
          >
            <h2
              className="text-2xl font-semibold"
              style={{ fontFamily: fontStack(headingFont || bodyFont || null) }}
            >
              {headline || 'How can we help?'}
            </h2>
            <div className="mx-auto mt-5 max-w-sm rounded-xl bg-white px-4 py-2.5 text-left text-sm text-neutral-500">
              Search for answers…
            </div>
          </div>

          <div
            className="grid gap-3 p-5"
            style={{ gridTemplateColumns: `repeat(${tiles}, minmax(0, 1fr))` }}
          >
            {collections.map((collection) => (
              <div
                key={collection.title}
                className="rounded-xl border border-neutral-200 p-4 text-neutral-900"
              >
                {collection.icon && (
                  <span aria-hidden="true" className="block text-xl leading-none">
                    {collection.icon}
                  </span>
                )}
                <p
                  className="mt-1.5 text-sm font-medium"
                  style={{ fontFamily: fontStack(headingFont || bodyFont || null) }}
                >
                  {collection.title}
                </p>
                <p className="mt-2 text-xs text-neutral-500">{collection.count} articles</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </form>
  )
}
