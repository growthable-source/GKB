const HEX_PATTERN = /^#[0-9a-fA-F]{3,8}$/

export const DEFAULT_PRIMARY_HEX = '#1f6feb'
export const DEFAULT_SECONDARY_HEX = '#6e7781'

/**
 * Returns `value` only if it is a syntactically valid hex color, else
 * `fallback`. Use this everywhere a stored help_centers hex is interpolated
 * into a `style` attribute — a raw, unvalidated value there is a CSS
 * injection path (e.g. `"; } body { ... } /*"`).
 */
export function safeHex(value: string | null | undefined, fallback: string): string {
  return value && HEX_PATTERN.test(value) ? value : fallback
}

/** Throws unless `value` is a syntactically valid hex color. Call before storing one. */
export function assertHex(value: string, label: string): void {
  if (!HEX_PATTERN.test(value)) {
    throw new Error(`${label} must be a hex color like #1f6feb (got "${value}").`)
  }
}
