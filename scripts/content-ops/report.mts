/**
 * Stage 4: renders a human-readable report from audit.json, gap.json, and
 * the rewrite proposals/applied index. No API calls.
 *
 * Run: pnpm ops:report [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { ROOT } from './llm'
import type { AuditArticle, GapItem, GapStub, RewriteIndexEntry } from './types'

const DRY = process.argv.includes('--dry-run')

function readJson<T>(relativePath: string): T | null {
  const p = path.join(ROOT, relativePath)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8')) as T
}

function mdEscape(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function main() {
  const audit = readJson<AuditArticle[]>('import/ops/audit.json')
  if (!audit) {
    throw new Error('import/ops/audit.json not found — run `pnpm ops:audit` first (or supply a fixture for a dry run of report.mts)')
  }
  const gapRaw = readJson<GapItem[] | GapStub>('import/ops/gap.json')
  const rewriteIndex = readJson<RewriteIndexEntry[]>('import/ops/rewrites/index.json')
  const applied = readJson<Record<string, { slug: string; appliedAt: string }>>('import/ops/rewrites/applied.json')

  const lines: string[] = []
  lines.push('# Content-ops report')
  lines.push('')
  lines.push(`Generated ${new Date().toISOString()}`)
  lines.push('')

  // Summary
  const shortCount = audit.filter((a) => a.shortArticle).length
  const leakArticles = audit.filter((a) => a.brandLeaks.length > 0)
  const totalLeaks = audit.reduce((sum, a) => sum + a.brandLeaks.length, 0)
  const externalImageArticles = audit.filter((a) => a.externalImageCount > 0)
  const totalImages = audit.reduce((sum, a) => sum + a.imageCount, 0)
  const totalExternalImages = audit.reduce((sum, a) => sum + a.externalImageCount, 0)
  const avgWordCount = Math.round(audit.reduce((sum, a) => sum + a.wordCount, 0) / (audit.length || 1))
  const classified = audit.filter((a) => a.quality !== null)
  const avgQuality = classified.length
    ? (classified.reduce((sum, a) => sum + (a.quality ?? 0), 0) / classified.length).toFixed(1)
    : 'n/a'
  const riskCounts = { high: 0, medium: 0, low: 0, unclassified: 0 }
  for (const a of audit) {
    if (a.deprecatedRisk) riskCounts[a.deprecatedRisk]++
    else riskCounts.unclassified++
  }
  const youtubeCandidates = audit.filter((a) => a.youtubeCandidate === true)

  lines.push('## Summary')
  lines.push('')
  lines.push(`- Articles audited: ${audit.length}`)
  lines.push(`- Average word count: ${avgWordCount}`)
  lines.push(`- Short articles (<120 words): ${shortCount}`)
  lines.push(`- Articles with brand leaks: ${leakArticles.length} (${totalLeaks} total hits)`)
  lines.push(`- Articles with external (non-Supabase) images: ${externalImageArticles.length}`)
  lines.push(`- Total images: ${totalImages} (${totalExternalImages} external)`)
  lines.push(`- Average quality (1-5, classified articles only): ${avgQuality}`)
  lines.push(
    `- Deprecated risk: ${riskCounts.high} high, ${riskCounts.medium} medium, ${riskCounts.low} low, ${riskCounts.unclassified} unclassified`,
  )
  lines.push(`- YouTube candidates: ${youtubeCandidates.length}`)
  lines.push('')

  // Brand leaks
  lines.push('## Brand leaks')
  lines.push('')
  if (leakArticles.length === 0) {
    lines.push('None found.')
  } else {
    lines.push('| Article | Location | Snippet |')
    lines.push('|---|---|---|')
    let rows = 0
    outer: for (const a of leakArticles) {
      for (const leak of a.brandLeaks) {
        lines.push(`| ${mdEscape(a.title)} (${a.slug}) | ${leak.location} | ${mdEscape(leak.snippet)} |`)
        rows++
        if (rows >= 200) {
          lines.push(`| ... | | *(truncated at 200 rows, ${totalLeaks - rows} more not shown)* |`)
          break outer
        }
      }
    }
  }
  lines.push('')

  // Deprecated risk
  lines.push('## Deprecated risk (high / medium)')
  lines.push('')
  const risky = audit.filter((a) => a.deprecatedRisk === 'high' || a.deprecatedRisk === 'medium')
  if (risky.length === 0) {
    lines.push('None found.')
  } else {
    for (const a of risky.sort((x) => (x.deprecatedRisk === 'high' ? -1 : 1))) {
      lines.push(`- **${a.deprecatedRisk}** — ${a.title} (${a.slug})${a.notes ? ` — ${a.notes}` : ''}`)
    }
  }
  lines.push('')

  // Rewrite queue status
  lines.push('## Rewrite queue')
  lines.push('')
  const queueSize = audit.filter(
    (a) => a.shortArticle || a.brandLeaks.length > 0 || (a.quality !== null && a.quality <= 2),
  ).length
  lines.push(`- Queue size (short, low-quality, or brand-leaked): ${queueSize}`)
  if (!rewriteIndex) {
    lines.push('- `pnpm ops:rewrite` has not been run yet.')
  } else {
    const proposed = rewriteIndex.filter((r) => r.status === 'proposed').length
    const failed = rewriteIndex.filter((r) => r.status === 'failed').length
    lines.push(`- Proposals written: ${proposed}, failed: ${failed}`)
  }
  if (applied) {
    lines.push(`- Applied to the DB: ${Object.keys(applied).length}`)
  } else {
    lines.push('- `pnpm ops:rewrite --apply` has not been run yet.')
  }
  lines.push('')

  // YouTube candidates
  lines.push('## YouTube candidates')
  lines.push('')
  if (youtubeCandidates.length === 0) {
    lines.push('None found.')
  } else {
    for (const a of youtubeCandidates) {
      lines.push(`- ${a.title} (${a.slug})${a.notes ? ` — ${a.notes}` : ''}`)
    }
  }
  lines.push('')

  // Missing articles (gap)
  lines.push('## Missing articles (gap vs. GoHighLevel public KB)')
  lines.push('')
  if (!gapRaw) {
    lines.push('`pnpm ops:gap` has not been run yet.')
  } else if (!Array.isArray(gapRaw)) {
    lines.push(`Gap analysis could not run: ${gapRaw.error}`)
    lines.push('')
    lines.push(gapRaw.instructions)
  } else if (gapRaw.length === 0) {
    lines.push('No gaps found.')
  } else {
    for (const priority of ['high', 'medium', 'low'] as const) {
      const items = gapRaw.filter((g) => g.priority === priority)
      if (items.length === 0) continue
      lines.push(`### ${priority[0].toUpperCase()}${priority.slice(1)} priority (${items.length})`)
      lines.push('')
      for (const g of items) {
        lines.push(`- **${g.topic}** — suggested collection: ${g.suggestedCollection} — [source](${g.theirUrl})`)
      }
      lines.push('')
    }
  }

  const report = lines.join('\n')

  if (DRY) {
    console.log('[dry-run] would write import/ops/REPORT.md:')
    console.log(report.split('\n').slice(0, 20).join('\n'))
    console.log('...')
    return
  }

  writeFileSync(path.join(ROOT, 'import/ops/REPORT.md'), report)
  console.log('wrote import/ops/REPORT.md')
}

main()
