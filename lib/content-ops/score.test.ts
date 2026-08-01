import { describe, expect, it } from 'vitest'
import { rankYoutubeCandidates, tierForRank, youtubeScore, type ScoreInput } from './score'

describe('youtubeScore', () => {
  it('sums the weighted deterministic terms', () => {
    // images: min(25,20)*3 = 60, headings: min(10,10)*2 = 20, quality: 4*4 = 16, words: min(2017,1200)/100 = 12
    const score = youtubeScore({
      imageCount: 25,
      headingCount: 10,
      wordCount: 2017,
      quality: 4,
      deprecatedRisk: 'low',
    })
    expect(score).toBeCloseTo(108, 5)
  })

  it('caps image count at 20 and heading count at 10', () => {
    const capped = youtubeScore({ imageCount: 20, headingCount: 10, wordCount: 0, quality: 0, deprecatedRisk: null })
    const uncapped = youtubeScore({ imageCount: 999, headingCount: 999, wordCount: 0, quality: 0, deprecatedRisk: null })
    expect(uncapped).toBe(capped)
  })

  it('caps word count contribution at 1200 words', () => {
    const capped = youtubeScore({ imageCount: 0, headingCount: 0, wordCount: 1200, quality: 0, deprecatedRisk: null })
    const uncapped = youtubeScore({ imageCount: 0, headingCount: 0, wordCount: 5000, quality: 0, deprecatedRisk: null })
    expect(uncapped).toBe(capped)
    expect(capped).toBe(12)
  })

  it('treats a null quality as zero', () => {
    expect(youtubeScore({ imageCount: 0, headingCount: 0, wordCount: 0, quality: null, deprecatedRisk: null })).toBe(0)
  })

  it('subtracts 25 for high deprecated risk', () => {
    const base = youtubeScore({ imageCount: 0, headingCount: 0, wordCount: 0, quality: 0, deprecatedRisk: null })
    const high = youtubeScore({ imageCount: 0, headingCount: 0, wordCount: 0, quality: 0, deprecatedRisk: 'high' })
    expect(high).toBe(base - 25)
  })

  it('subtracts 8 for medium deprecated risk', () => {
    const base = youtubeScore({ imageCount: 0, headingCount: 0, wordCount: 0, quality: 0, deprecatedRisk: null })
    const medium = youtubeScore({ imageCount: 0, headingCount: 0, wordCount: 0, quality: 0, deprecatedRisk: 'medium' })
    expect(medium).toBe(base - 8)
  })
})

describe('tierForRank', () => {
  it('assigns A to the top 40', () => {
    expect(tierForRank(1)).toBe('A')
    expect(tierForRank(40)).toBe('A')
  })

  it('assigns B to the next 80 (41-120)', () => {
    expect(tierForRank(41)).toBe('B')
    expect(tierForRank(120)).toBe('B')
  })

  it('assigns C to everything past 120', () => {
    expect(tierForRank(121)).toBe('C')
    expect(tierForRank(999)).toBe('C')
  })
})

describe('rankYoutubeCandidates', () => {
  const base: ScoreInput = { imageCount: 0, headingCount: 0, wordCount: 0, quality: 0, deprecatedRisk: null }

  it('excludes articles that are not youtube candidates', () => {
    const result = rankYoutubeCandidates([
      { ...base, id: 'a', youtubeCandidate: false },
      { ...base, id: 'b', youtubeCandidate: null },
      { ...base, id: 'c', youtubeCandidate: true },
    ])
    expect(result.map((r) => r.id)).toEqual(['c'])
  })

  it('sorts descending by score and assigns sequential rank/tier', () => {
    const result = rankYoutubeCandidates([
      { ...base, id: 'low', quality: 1, youtubeCandidate: true },
      { ...base, id: 'high', quality: 5, youtubeCandidate: true },
      { ...base, id: 'mid', quality: 3, youtubeCandidate: true },
    ])
    expect(result.map((r) => r.id)).toEqual(['high', 'mid', 'low'])
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3])
    expect(result.every((r) => r.tier === 'A')).toBe(true)
  })
})
