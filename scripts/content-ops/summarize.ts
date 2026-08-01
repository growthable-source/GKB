/**
 * Shared audit summary math, so audit.mts's DB push and report.mts's rendered
 * report can't drift from each other.
 */
import type { AuditArticle } from './types'

export type AuditSummary = {
  articleCount: number
  avgWordCount: number
  shortCount: number
  leakArticleCount: number
  totalLeaks: number
  externalImageArticleCount: number
  totalImages: number
  totalExternalImages: number
  /** Mean of `quality` across classified articles, or null if none are classified. */
  avgQuality: number | null
  riskCounts: { high: number; medium: number; low: number; unclassified: number }
  youtubeCandidateCount: number
}

export function summarizeAudit(audit: AuditArticle[]): AuditSummary {
  const classified = audit.filter((a) => a.quality !== null)
  const riskCounts = { high: 0, medium: 0, low: 0, unclassified: 0 }
  for (const a of audit) {
    if (a.deprecatedRisk) riskCounts[a.deprecatedRisk]++
    else riskCounts.unclassified++
  }

  return {
    articleCount: audit.length,
    avgWordCount: Math.round(audit.reduce((sum, a) => sum + a.wordCount, 0) / (audit.length || 1)),
    shortCount: audit.filter((a) => a.shortArticle).length,
    leakArticleCount: audit.filter((a) => a.brandLeaks.length > 0).length,
    totalLeaks: audit.reduce((sum, a) => sum + a.brandLeaks.length, 0),
    externalImageArticleCount: audit.filter((a) => a.externalImageCount > 0).length,
    totalImages: audit.reduce((sum, a) => sum + a.imageCount, 0),
    totalExternalImages: audit.reduce((sum, a) => sum + a.externalImageCount, 0),
    avgQuality: classified.length
      ? classified.reduce((sum, a) => sum + (a.quality ?? 0), 0) / classified.length
      : null,
    riskCounts,
    youtubeCandidateCount: audit.filter((a) => a.youtubeCandidate === true).length,
  }
}
