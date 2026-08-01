/**
 * YouTube-candidate ranking score for content-ops articles: rewards image-
 * and heading-heavy, higher-quality, longer (up to a cap) articles, and
 * penalizes ones flagged as likely describing deprecated UI. Used by the
 * admin ops dashboard (components/admin/ops-dashboard.tsx).
 */

export type ScoreInput = {
  imageCount: number
  headingCount: number
  wordCount: number
  quality: number | null
  deprecatedRisk: 'low' | 'medium' | 'high' | null
}

export function youtubeScore(article: ScoreInput): number {
  let score =
    Math.min(article.imageCount, 20) * 3 +
    Math.min(article.headingCount, 10) * 2 +
    (article.quality ?? 0) * 4 +
    Math.min(article.wordCount, 1200) / 100

  if (article.deprecatedRisk === 'high') score -= 25
  else if (article.deprecatedRisk === 'medium') score -= 8

  return score
}

export type YoutubeTier = 'A' | 'B' | 'C'

const TIER_A_SIZE = 40
const TIER_B_SIZE = 80

/** Tier by rank (1-indexed, highest score first): A = top 40, B = next 80, C = rest. */
export function tierForRank(rank: number): YoutubeTier {
  if (rank <= TIER_A_SIZE) return 'A'
  if (rank <= TIER_A_SIZE + TIER_B_SIZE) return 'B'
  return 'C'
}

export type RankedYoutubeCandidate<T> = T & { score: number; tier: YoutubeTier; rank: number }

/** Filters to youtubeCandidate articles, scores, sorts desc, and assigns rank/tier. */
export function rankYoutubeCandidates<T extends ScoreInput & { youtubeCandidate: boolean | null }>(
  articles: T[],
): RankedYoutubeCandidate<T>[] {
  return articles
    .filter((a) => a.youtubeCandidate === true)
    .map((a) => ({ ...a, score: youtubeScore(a) }))
    .sort((a, b) => b.score - a.score)
    .map((a, i) => ({ ...a, rank: i + 1, tier: tierForRank(i + 1) }))
}
