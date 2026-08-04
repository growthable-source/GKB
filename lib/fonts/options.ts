/**
 * Font metadata, with no `next/font` import.
 *
 * Kept separate from ./catalog.ts because that module calls the font loaders,
 * which may only run in the server graph — the admin's font picker is a client
 * component and needs the labels, not the loaders.
 *
 * The `cssVar` values here must match the `variable` passed to each loader in
 * ./catalog.ts. A mismatch would silently fall back to the browser default.
 */
export type FontCategory = 'Sans' | 'Geometric' | 'Rounded' | 'Grotesque' | 'Serif' | 'Mono'

export type FontOption = {
  /** Stored in help_centers.font_family / heading_font. Never change these. */
  key: string
  label: string
  category: FontCategory
  cssVar: string
}

export const FONT_OPTIONS: FontOption[] = [
  { key: 'geist', label: 'Geist', category: 'Sans', cssVar: '--font-geist-sans' },
  { key: 'inter', label: 'Inter', category: 'Sans', cssVar: '--font-inter' },
  { key: 'work-sans', label: 'Work Sans', category: 'Sans', cssVar: '--font-work-sans' },
  { key: 'figtree', label: 'Figtree', category: 'Sans', cssVar: '--font-figtree' },
  { key: 'dm-sans', label: 'DM Sans', category: 'Geometric', cssVar: '--font-dm-sans' },
  { key: 'outfit', label: 'Outfit', category: 'Geometric', cssVar: '--font-outfit' },
  { key: 'poppins', label: 'Poppins', category: 'Geometric', cssVar: '--font-poppins' },
  { key: 'sora', label: 'Sora', category: 'Geometric', cssVar: '--font-sora' },
  { key: 'plus-jakarta', label: 'Plus Jakarta Sans', category: 'Rounded', cssVar: '--font-plus-jakarta' },
  { key: 'nunito', label: 'Nunito', category: 'Rounded', cssVar: '--font-nunito' },
  { key: 'manrope', label: 'Manrope', category: 'Rounded', cssVar: '--font-manrope' },
  { key: 'rubik', label: 'Rubik', category: 'Rounded', cssVar: '--font-rubik' },
  { key: 'space-grotesk', label: 'Space Grotesk', category: 'Grotesque', cssVar: '--font-space-grotesk' },
  { key: 'bricolage', label: 'Bricolage Grotesque', category: 'Grotesque', cssVar: '--font-bricolage' },
  { key: 'lora', label: 'Lora', category: 'Serif', cssVar: '--font-lora' },
  { key: 'source-serif', label: 'Source Serif 4', category: 'Serif', cssVar: '--font-source-serif' },
  { key: 'merriweather', label: 'Merriweather', category: 'Serif', cssVar: '--font-merriweather' },
  { key: 'instrument-serif', label: 'Instrument Serif', category: 'Serif', cssVar: '--font-instrument-serif' },
  { key: 'jetbrains-mono', label: 'JetBrains Mono', category: 'Mono', cssVar: '--font-jetbrains-mono' },
]

export const DEFAULT_FONT_KEY = 'geist'

const BY_KEY = new Map(FONT_OPTIONS.map((font) => [font.key, font]))

export function isFontKey(value: string | null | undefined): boolean {
  return value != null && BY_KEY.has(value)
}

/**
 * The CSS font-family stack for a stored key. An unknown key — a font dropped
 * from the catalog after a center selected it — degrades to the default rather
 * than emitting `var(--font-undefined)`, which would resolve to nothing.
 */
export function fontStack(key: string | null | undefined): string {
  const font = BY_KEY.get(key ?? '') ?? BY_KEY.get(DEFAULT_FONT_KEY)!
  const fallback =
    font.category === 'Serif' ? 'serif' : font.category === 'Mono' ? 'monospace' : 'sans-serif'
  return `var(${font.cssVar}), ${fallback}`
}
