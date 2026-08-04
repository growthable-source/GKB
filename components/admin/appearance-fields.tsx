'use client'

import { useState } from 'react'
import { FONT_OPTIONS, DEFAULT_FONT_KEY, type FontOption } from '@/lib/fonts/options'

export type AppearanceDefaults = {
  primaryHex: string
  secondaryHex: string
  heroStyle: 'solid' | 'gradient'
  heroFromHex: string | null
  heroToHex: string | null
  heroAngle: number
  bodyFont: string | null
  headingFont: string | null
  tilesPerRow: number
}

export const APPEARANCE_DEFAULTS: AppearanceDefaults = {
  primaryHex: '#1f6feb',
  secondaryHex: '#6e7781',
  heroStyle: 'gradient',
  heroFromHex: null,
  heroToHex: null,
  heroAngle: 135,
  bodyFont: null,
  headingFont: null,
  tilesPerRow: 3,
}

const ANGLES = [
  { value: 90, label: 'Left → right' },
  { value: 135, label: 'Diagonal ↘' },
  { value: 180, label: 'Top → bottom' },
  { value: 225, label: 'Diagonal ↙' },
]

/** Groups the catalog by archetype so the picker reads as a menu, not a list. */
function groupedFonts(): [string, FontOption[]][] {
  const groups = new Map<string, FontOption[]>()
  for (const font of FONT_OPTIONS) {
    groups.set(font.category, [...(groups.get(font.category) ?? []), font])
  }
  return [...groups.entries()]
}

function FontSelect({
  name,
  label,
  hint,
  defaultValue,
  emptyLabel,
}: {
  name: string
  label: string
  hint: string
  defaultValue: string | null
  emptyLabel: string
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-neutral-700">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? ''}
        className="rounded-md border border-neutral-300 px-3 py-2"
      >
        <option value="">{emptyLabel}</option>
        {groupedFonts().map(([category, fonts]) => (
          <optgroup key={category} label={category}>
            {fonts.map((font) => (
              <option key={font.key} value={font.key}>
                {font.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span className="text-xs text-neutral-500">{hint}</span>
    </label>
  )
}

/**
 * The appearance controls shared by the create and edit forms. Every input is a
 * plain named field, so both server actions read the same FormData keys via
 * readAppearanceForm.
 */
export function AppearanceFields({ defaults }: { defaults: AppearanceDefaults }) {
  const [primary, setPrimary] = useState(defaults.primaryHex)
  const [secondary, setSecondary] = useState(defaults.secondaryHex)
  const [heroStyle, setHeroStyle] = useState(defaults.heroStyle)
  const [from, setFrom] = useState(defaults.heroFromHex ?? '')
  const [to, setTo] = useState(defaults.heroToHex ?? '')
  const [angle, setAngle] = useState(defaults.heroAngle)

  // Mirrors heroColors(): a blank override means "use the brand colour".
  const previewFrom = from || primary
  const previewTo = to || secondary
  const preview =
    heroStyle === 'solid'
      ? previewFrom
      : `linear-gradient(${angle}deg, ${previewFrom}, ${previewTo})`

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          Primary color
          <input
            type="color"
            name="primaryHex"
            value={primary}
            onChange={(event) => setPrimary(event.target.value)}
            className="h-9 w-16 rounded border border-neutral-300"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          Secondary color
          <input
            type="color"
            name="secondaryHex"
            value={secondary}
            onChange={(event) => setSecondary(event.target.value)}
            className="h-9 w-16 rounded border border-neutral-300"
          />
        </label>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-md border border-neutral-200 p-3">
        <legend className="px-1 text-sm font-medium text-neutral-700">Hero background</legend>

        <div className="flex flex-wrap items-center gap-3">
          <select
            name="heroStyle"
            value={heroStyle}
            onChange={(event) => setHeroStyle(event.target.value as 'solid' | 'gradient')}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="gradient">Gradient</option>
            <option value="solid">Solid</option>
          </select>

          {heroStyle === 'gradient' && (
            <select
              name="heroAngle"
              value={angle}
              onChange={(event) => setAngle(Number(event.target.value))}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              {ANGLES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
          {heroStyle === 'solid' && <input type="hidden" name="heroAngle" value={angle} />}

          <label className="flex items-center gap-2 text-sm text-neutral-600">
            Start
            <input
              type="color"
              name="heroFromHex"
              value={previewFrom}
              onChange={(event) => setFrom(event.target.value)}
              className="h-9 w-14 rounded border border-neutral-300"
            />
          </label>

          {heroStyle === 'gradient' && (
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              End
              <input
                type="color"
                name="heroToHex"
                value={previewTo}
                onChange={(event) => setTo(event.target.value)}
                className="h-9 w-14 rounded border border-neutral-300"
              />
            </label>
          )}
          {heroStyle === 'solid' && <input type="hidden" name="heroToHex" value={to} />}
        </div>

        <div
          className="flex h-20 items-center justify-center rounded-md border border-neutral-200"
          style={{ background: preview }}
        >
          <span
            className="text-sm font-medium"
            // Same rule as heroForeground(), so the preview shows the contrast
            // the live page will actually pick.
            style={{ color: isLight(previewFrom, previewTo, heroStyle) ? '#171717' : '#ffffff' }}
          >
            How can we help?
          </span>
        </div>
        <p className="text-xs text-neutral-500">
          Only the hero uses this. Article text stays on white, so any colour is safe.
        </p>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <FontSelect
          name="headingFont"
          label="Heading font"
          hint="Used for headings only."
          defaultValue={defaults.headingFont}
          emptyLabel="Same as body font"
        />
        <FontSelect
          name="bodyFont"
          label="Body font"
          hint="Used for article and page text."
          defaultValue={defaults.bodyFont}
          emptyLabel={`Default (${DEFAULT_FONT_KEY})`}
        />
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-700">Category tiles per row</span>
        <select
          name="tilesPerRow"
          defaultValue={defaults.tilesPerRow}
          className="w-fit rounded-md border border-neutral-300 px-3 py-2"
        >
          <option value={2}>2 per row</option>
          <option value={3}>3 per row</option>
          <option value={4}>4 per row</option>
        </select>
        <span className="text-xs text-neutral-500">
          Desktop setting. Narrower screens step down automatically.
        </span>
      </label>
    </div>
  )
}

/** Client-side mirror of heroForeground(), kept simple: same luminance rule. */
function isLight(from: string, to: string, style: 'solid' | 'gradient'): boolean {
  const luminance = (hex: string) => {
    const body = hex.replace('#', '')
    const full = body.length === 3 ? body.split('').map((c) => c + c).join('') : body.slice(0, 6)
    const channels = [0, 2, 4].map((i) => {
      const value = parseInt(full.slice(i, i + 2), 16) / 255
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  }

  const value = style === 'solid' ? luminance(from) : (luminance(from) + luminance(to)) / 2
  return value > 0.5
}
