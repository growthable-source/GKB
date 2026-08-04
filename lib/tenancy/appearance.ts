import { assertHex } from './color'
import { isFontKey } from '@/lib/fonts/options'

/** The appearance fields shared by the create and edit forms. */
export type AppearanceInput = {
  heroStyle: string
  heroFromHex: string | null
  heroToHex: string | null
  heroAngle: number
  bodyFont: string | null
  headingFont: string | null
  tilesPerRow: number
}

/** The same fields as database columns. */
export type AppearanceColumns = {
  hero_style: string
  hero_from_hex: string | null
  hero_to_hex: string | null
  hero_angle: number
  font_family: string | null
  heading_font: string | null
  tiles_per_row: number
}

/**
 * Validates appearance input and maps it to columns, throwing a message meant
 * for the admin rather than relying on the database CHECK constraints — those
 * would surface as an opaque Postgres error.
 *
 * Every field is optional and falls back to the schema default, so a caller that
 * does not care about appearance (a seeding script, say) can omit them entirely.
 * An empty string means "unset" for the nullable fields, because that is what an
 * untouched form control posts.
 */
export function toAppearanceColumns(input: Partial<AppearanceInput> = {}): AppearanceColumns {
  const heroStyle = input.heroStyle ?? 'gradient'
  const heroAngle = input.heroAngle ?? 135
  const tilesPerRow = input.tilesPerRow ?? 3

  if (heroStyle !== 'solid' && heroStyle !== 'gradient') {
    throw new Error('Hero style must be solid or gradient.')
  }

  if (input.heroFromHex) assertHex(input.heroFromHex, 'Hero start color')
  if (input.heroToHex) assertHex(input.heroToHex, 'Hero end color')

  if (!Number.isInteger(heroAngle) || heroAngle < 0 || heroAngle > 360) {
    throw new Error('Hero angle must be a whole number between 0 and 360.')
  }

  if (![2, 3, 4].includes(tilesPerRow)) {
    throw new Error('Tiles per row must be 2, 3 or 4.')
  }

  // Reject an unknown key rather than storing it: fontStack would silently fall
  // back to the default, leaving the admin to wonder why their choice did nothing.
  for (const [label, key] of [['Body font', input.bodyFont], ['Heading font', input.headingFont]] as const) {
    if (key && !isFontKey(key)) throw new Error(`${label} "${key}" is not an available font.`)
  }

  return {
    hero_style: heroStyle,
    hero_from_hex: input.heroFromHex || null,
    hero_to_hex: input.heroToHex || null,
    hero_angle: heroAngle,
    font_family: input.bodyFont || null,
    heading_font: input.headingFont || null,
    tiles_per_row: tilesPerRow,
  }
}

/** Reads the appearance fields out of a submitted form. */
export function readAppearanceForm(formData: FormData): AppearanceInput {
  const text = (key: string) => String(formData.get(key) ?? '').trim()

  return {
    heroStyle: text('heroStyle') || 'gradient',
    heroFromHex: text('heroFromHex') || null,
    heroToHex: text('heroToHex') || null,
    heroAngle: Number(text('heroAngle') || '135'),
    bodyFont: text('bodyFont') || null,
    headingFont: text('headingFont') || null,
    tilesPerRow: Number(text('tilesPerRow') || '3'),
  }
}
