import { safeHex, DEFAULT_PRIMARY_HEX, DEFAULT_SECONDARY_HEX } from './color'

/** The hero fields of a help center, as the public layout needs them. */
export type HeroTheme = {
  heroStyle: 'solid' | 'gradient'
  heroFromHex: string | null
  heroToHex: string | null
  heroAngle: number
  primaryHex: string
  secondaryHex: string
}

const VALID_STYLES = ['solid', 'gradient'] as const

/** Narrows the raw `hero_style` column, falling back rather than throwing —
 *  an odd value should degrade to a plain hero, not blank the page. */
export function parseHeroStyle(value: string | null | undefined): 'solid' | 'gradient' {
  return (VALID_STYLES as readonly string[]).includes(value ?? '')
    ? (value as 'solid' | 'gradient')
    : 'gradient'
}

/** An angle safe to interpolate into CSS. Non-numeric or out-of-range degrades
 *  to the default rather than emitting `linear-gradient(NaNdeg, ...)`. */
export function safeAngle(value: number | null | undefined): number {
  return Number.isFinite(value) && value! >= 0 && value! <= 360 ? Math.round(value!) : 135
}

/**
 * The hero's two colours. Null overrides mean "use the brand colours", which is
 * what almost every center wants; safeHex guards the CSS interpolation, since
 * these end up in a `style` attribute.
 */
export function heroColors(theme: HeroTheme): { from: string; to: string } {
  const primary = safeHex(theme.primaryHex, DEFAULT_PRIMARY_HEX)
  const secondary = safeHex(theme.secondaryHex, DEFAULT_SECONDARY_HEX)

  return {
    from: safeHex(theme.heroFromHex, primary),
    to: safeHex(theme.heroToHex, secondary),
  }
}

/** The CSS `background` value for the hero band. */
export function heroBackground(theme: HeroTheme): string {
  const { from, to } = heroColors(theme)
  if (parseHeroStyle(theme.heroStyle) === 'solid') return from

  return `linear-gradient(${safeAngle(theme.heroAngle)}deg, ${from}, ${to})`
}

/** Expands #abc to #aabbcc and drops any alpha, so parsing is uniform. */
function normalizeHex(hex: string): string {
  const body = hex.slice(1)
  if (body.length === 3) return body.split('').map((c) => c + c).join('')
  return body.slice(0, 6).padEnd(6, '0')
}

/**
 * WCAG relative luminance (0 = black, 1 = white).
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance(hex: string): number {
  const body = normalizeHex(hex)
  const channels = [0, 2, 4].map((i) => {
    const value = parseInt(body.slice(i, i + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

/**
 * Whether hero text should be light or dark, derived from the mean luminance of
 * the hero's colours rather than stored.
 *
 * Deriving it is the point: the hero is the one place a tenant colour is used at
 * full strength behind text, so a pale brand colour would otherwise render
 * white-on-white. A tenant cannot configure an unreadable hero because the
 * foreground is never theirs to choose.
 *
 * The 0.5 threshold is the midpoint of the luminance range, not a contrast-ratio
 * calculation — it picks whichever of white/near-black contrasts better, which is
 * all that is needed when the two candidates are the extremes.
 */
export function heroForeground(theme: HeroTheme): 'light' | 'dark' {
  const { from, to } = heroColors(theme)
  const style = parseHeroStyle(theme.heroStyle)

  // A solid hero has one colour; a gradient is judged on its average, since text
  // sits across the whole band.
  const luminance =
    style === 'solid'
      ? relativeLuminance(from)
      : (relativeLuminance(from) + relativeLuminance(to)) / 2

  return luminance > 0.5 ? 'dark' : 'light'
}

export const HERO_FOREGROUND_HEX = { light: '#ffffff', dark: '#171717' } as const

/** Tailwind column classes per density. Written out because Tailwind scans for
 *  complete class names — a template literal like `sm:grid-cols-${n}` is not
 *  emitted into the stylesheet. */
const TILE_GRID: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
}

/**
 * Grid classes for the category tiles. The stored value is the DESKTOP density;
 * narrower breakpoints step down so a 4-wide setting does not become unreadable
 * slivers on a phone.
 */
export function tileGridClasses(tilesPerRow: number | null | undefined): string {
  return TILE_GRID[tilesPerRow ?? 3] ?? TILE_GRID[3]
}
