/** Shared types for the content-ops pipeline (audit.json / gap.json / rewrites index shapes). */

export type BrandLeak = { location: 'title' | 'body'; snippet: string }

export type Classification = {
  deprecatedRisk: 'low' | 'medium' | 'high' | null
  youtubeCandidate: boolean | null
  quality: number | null
  notes: string
}

export type AuditArticle = {
  id: string
  slug: string
  title: string
  collectionId: string | null
  collectionTitle: string | null
  updatedAt: string
  wordCount: number
  shortArticle: boolean
  brandLeaks: BrandLeak[]
  imageCount: number
  externalImageCount: number
  headingCount: number
} & Classification

export type GapItem = {
  topic: string
  theirUrl: string
  suggestedCollection: string
  priority: 'high' | 'medium' | 'low'
}

export type GapStub = { error: string; instructions: string }

export type RewriteIndexEntry = {
  id: string
  slug: string
  title: string
  status: 'proposed' | 'failed'
  reason?: string
}

/** One entry in import/ops/rewrites/applied.json: either applied to the DB, or held back for manual review. */
export type RewriteApplication =
  | { slug: string; appliedAt: string }
  | { slug: string; held: true; note: string }

export type RewriteApplications = Record<string, RewriteApplication>

/** One entry in import/ops/seed-coverage.json: seed.mts phase 1's per-article coverage verdict. */
export type SeedCoverageItem = {
  url: string
  titleish: string
  /** Our slug that substantively covers this topic, or null if nothing does. */
  coveredBy: string | null
}

/** One entry in import/ops/seed-manifest.json: provenance for an article seed.mts wrote. */
export type SeedManifestEntry = { sourceUrl: string; seededAt: string }
export type SeedManifest = Record<string, SeedManifestEntry>
