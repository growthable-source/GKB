import { describe, expect, it } from 'vitest'
import {
  heroBackground,
  heroColors,
  heroForeground,
  relativeLuminance,
  safeAngle,
  parseHeroStyle,
  tileGridClasses,
  type HeroTheme,
} from './theme'

const theme = (overrides: Partial<HeroTheme> = {}): HeroTheme => ({
  heroStyle: 'gradient',
  heroFromHex: null,
  heroToHex: null,
  heroAngle: 135,
  primaryHex: '#1f6feb',
  secondaryHex: '#6e7781',
  ...overrides,
})

describe('heroColors', () => {
  it('falls back to the brand colours when no override is set', () => {
    expect(heroColors(theme())).toEqual({ from: '#1f6feb', to: '#6e7781' })
  })

  it('prefers explicit hero colours over the brand colours', () => {
    const result = heroColors(theme({ heroFromHex: '#fa0032', heroToHex: '#7c1d3f' }))
    expect(result).toEqual({ from: '#fa0032', to: '#7c1d3f' })
  })

  it('ignores a malformed override rather than emitting it', () => {
    // These land in a style attribute, so an unvalidated value is a CSS
    // injection path — see safeHex.
    const result = heroColors(theme({ heroFromHex: 'red; } body { display:none } /*' }))
    expect(result.from).toBe('#1f6feb')
  })

  it('falls back to the schema defaults when the brand colours are junk too', () => {
    const result = heroColors(theme({ primaryHex: 'nonsense', secondaryHex: '' }))
    expect(result).toEqual({ from: '#1f6feb', to: '#6e7781' })
  })
})

describe('heroBackground', () => {
  it('builds a gradient at the configured angle', () => {
    expect(heroBackground(theme({ heroAngle: 90 }))).toBe(
      'linear-gradient(90deg, #1f6feb, #6e7781)',
    )
  })

  it('paints only the from colour when the style is solid', () => {
    expect(heroBackground(theme({ heroStyle: 'solid', heroFromHex: '#fa0032' }))).toBe('#fa0032')
  })

  it('never emits NaN for a junk angle', () => {
    const background = heroBackground(theme({ heroAngle: Number.NaN }))
    expect(background).toBe('linear-gradient(135deg, #1f6feb, #6e7781)')
  })
})

describe('safeAngle', () => {
  it('keeps angles within range and rounds them', () => {
    expect(safeAngle(0)).toBe(0)
    expect(safeAngle(360)).toBe(360)
    expect(safeAngle(44.6)).toBe(45)
  })

  it('rejects out-of-range and non-finite values', () => {
    expect(safeAngle(-1)).toBe(135)
    expect(safeAngle(361)).toBe(135)
    expect(safeAngle(null)).toBe(135)
    expect(safeAngle(Number.POSITIVE_INFINITY)).toBe(135)
  })
})

describe('parseHeroStyle', () => {
  it('accepts the known styles and degrades anything else to gradient', () => {
    expect(parseHeroStyle('solid')).toBe('solid')
    expect(parseHeroStyle('gradient')).toBe('gradient')
    expect(parseHeroStyle('rainbow')).toBe('gradient')
    expect(parseHeroStyle(null)).toBe('gradient')
  })
})

describe('relativeLuminance', () => {
  it('anchors at the extremes', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
  })

  it('expands three-digit hex', () => {
    expect(relativeLuminance('#fff')).toBeCloseTo(relativeLuminance('#ffffff'), 5)
  })

  it('weights green above red above blue', () => {
    expect(relativeLuminance('#00ff00')).toBeGreaterThan(relativeLuminance('#ff0000'))
    expect(relativeLuminance('#ff0000')).toBeGreaterThan(relativeLuminance('#0000ff'))
  })
})

describe('heroForeground', () => {
  it('uses light text on the dark brand default', () => {
    expect(heroForeground(theme())).toBe('light')
  })

  it('uses light text on a saturated brand red', () => {
    expect(heroForeground(theme({ heroFromHex: '#fa0032', heroToHex: '#7c1d3f' }))).toBe('light')
  })

  it('uses dark text on a pale hero — the case that would be unreadable otherwise', () => {
    expect(heroForeground(theme({ heroFromHex: '#fef9c3', heroToHex: '#fde68a' }))).toBe('dark')
  })

  it('judges a solid hero on its own colour, not the unused second one', () => {
    // A pale solid hero must stay dark-on-light even though secondary is mid-grey,
    // which would drag a gradient average the other way.
    const pale = theme({ heroStyle: 'solid', heroFromHex: '#ffffff', secondaryHex: '#000000' })
    expect(heroForeground(pale)).toBe('dark')
  })

  it('judges a gradient on both ends', () => {
    // Black -> white averages to roughly mid, and the midpoint rule sends it light.
    expect(heroForeground(theme({ heroFromHex: '#000000', heroToHex: '#ffffff' }))).toBe('light')
  })
})

describe('tileGridClasses', () => {
  it('returns literal class names for each density', () => {
    expect(tileGridClasses(2)).toBe('sm:grid-cols-2')
    expect(tileGridClasses(3)).toBe('sm:grid-cols-2 lg:grid-cols-3')
    expect(tileGridClasses(4)).toBe('sm:grid-cols-2 lg:grid-cols-4')
  })

  it('defaults to three for null or an unexpected value', () => {
    expect(tileGridClasses(null)).toBe('sm:grid-cols-2 lg:grid-cols-3')
    expect(tileGridClasses(7)).toBe('sm:grid-cols-2 lg:grid-cols-3')
  })
})
