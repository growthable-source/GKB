'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { rankYoutubeCandidates, type YoutubeTier } from '@/lib/content-ops/score'
import type { AuditArticle, GapItem, RewriteApplications } from '@/scripts/content-ops/types'
import type { AuditSummary } from '@/scripts/content-ops/summarize'

type Props = {
  articles: AuditArticle[]
  summary: AuditSummary
  auditedAt: string
  gaps: GapItem[]
  rewrites: RewriteApplications
}

type Tab = 'articles' | 'youtube' | 'gaps'
type SortColumn = 'title' | 'collection' | 'words' | 'screenshots' | 'quality' | 'risk'
type SortDirection = 'asc' | 'desc'
type ChipKey = 'leaks' | 'deprecated' | 'thin' | 'rewritten'

const TABS: [Tab, string][] = [
  ['articles', 'Articles'],
  ['youtube', 'YouTube queue'],
  ['gaps', 'Missing topics'],
]

const CHIPS: [ChipKey, string][] = [
  ['leaks', 'Brand leaks'],
  ['deprecated', 'Deprecated risk'],
  ['thin', 'Thin (<120w)'],
  ['rewritten', 'Rewritten'],
]

const RISK_WEIGHT: Record<'high' | 'medium' | 'low', number> = { high: 3, medium: 2, low: 1 }

function riskWeight(risk: AuditArticle['deprecatedRisk']): number {
  return risk ? RISK_WEIGHT[risk] : 0
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function RiskPill({ risk }: { risk: AuditArticle['deprecatedRisk'] }) {
  if (!risk) {
    return <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-400">unclassified</span>
  }
  const styles: Record<'high' | 'medium' | 'low', string> = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-neutral-100 text-neutral-600',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[risk]}`}>{risk}</span>
}

const TIER_STYLES: Record<YoutubeTier, string> = {
  A: 'bg-blue-100 text-blue-700',
  B: 'bg-blue-50 text-blue-600',
  C: 'bg-neutral-100 text-neutral-500',
}

function TierPill({ tier }: { tier: YoutubeTier }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIER_STYLES[tier]}`}>YT {tier}</span>
}

const PRIORITY_STYLES: Record<GapItem['priority'], string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-neutral-100 text-neutral-600',
}

function PriorityPill({ priority }: { priority: GapItem['priority'] }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[priority]}`}>{priority}</span>
  )
}

function SummaryTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  )
}

/** External link to the public reader, used in place of a collection-relative link — the ops payload doesn't carry collectionSlug. */
function ViewLink({ slug }: { slug: string }) {
  return (
    <a href={`/a/${slug}`} target="_blank" rel="noopener noreferrer" className="text-xs text-neutral-500 hover:underline">
      view
    </a>
  )
}

export function OpsDashboard({ articles, summary, auditedAt, gaps, rewrites }: Props) {
  const [tab, setTab] = useState<Tab>('articles')
  const [search, setSearch] = useState('')
  const [collectionFilter, setCollectionFilter] = useState('')
  const [activeChips, setActiveChips] = useState<Set<ChipKey>>(new Set())
  const [sort, setSort] = useState<{ column: SortColumn; direction: SortDirection }>({
    column: 'words',
    direction: 'desc',
  })

  const rewrittenCount = useMemo(() => Object.values(rewrites).filter((r) => 'appliedAt' in r).length, [rewrites])
  const heldCount = useMemo(
    () => Object.values(rewrites).filter((r) => 'held' in r && r.held).length,
    [rewrites],
  )

  const rankedYoutube = useMemo(() => rankYoutubeCandidates(articles), [articles])
  const tierById = useMemo(() => {
    const map = new Map<string, YoutubeTier>()
    for (const a of rankedYoutube) map.set(a.id, a.tier)
    return map
  }, [rankedYoutube])

  const collections = useMemo(() => {
    const names = new Set(articles.map((a) => a.collectionTitle ?? 'Uncategorized'))
    return [...names].sort()
  }, [articles])

  function toggleChip(chip: ChipKey) {
    setActiveChips((prev) => {
      const next = new Set(prev)
      if (next.has(chip)) next.delete(chip)
      else next.add(chip)
      return next
    })
  }

  const filteredArticles = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = articles.filter((a) => {
      if (q && !a.title.toLowerCase().includes(q) && !a.slug.toLowerCase().includes(q)) return false
      if (collectionFilter && (a.collectionTitle ?? 'Uncategorized') !== collectionFilter) return false
      if (activeChips.has('leaks') && a.brandLeaks.length === 0) return false
      if (activeChips.has('deprecated') && a.deprecatedRisk !== 'high' && a.deprecatedRisk !== 'medium') return false
      if (activeChips.has('thin') && !a.shortArticle) return false
      if (activeChips.has('rewritten') && !rewrites[a.id]) return false
      return true
    })

    return [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sort.column) {
        case 'title':
          cmp = a.title.localeCompare(b.title)
          break
        case 'collection':
          cmp = (a.collectionTitle ?? 'Uncategorized').localeCompare(b.collectionTitle ?? 'Uncategorized')
          break
        case 'words':
          cmp = a.wordCount - b.wordCount
          break
        case 'screenshots':
          cmp = a.imageCount - b.imageCount
          break
        case 'quality':
          cmp = (a.quality ?? -1) - (b.quality ?? -1)
          break
        case 'risk':
          cmp = riskWeight(a.deprecatedRisk) - riskWeight(b.deprecatedRisk)
          break
      }
      return sort.direction === 'asc' ? cmp : -cmp
    })
  }, [articles, search, collectionFilter, activeChips, rewrites, sort])

  function sortHeader(column: SortColumn, label: string) {
    const active = sort.column === column
    return (
      <th
        className="cursor-pointer select-none px-3 py-2 text-left font-medium text-neutral-500 hover:text-neutral-900"
        onClick={() =>
          setSort((prev) =>
            prev.column === column
              ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
              : { column, direction: 'desc' },
          )
        }
      >
        {label}
        {active && <span className="ml-1">{sort.direction === 'asc' ? '↑' : '↓'}</span>}
      </th>
    )
  }

  const gapsByPriority = useMemo(() => {
    const order: GapItem['priority'][] = ['high', 'medium', 'low']
    return [...gaps].sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority))
  }, [gaps])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Content Ops</h1>
        <p className="text-sm text-neutral-500">last audited {formatDate(auditedAt)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryTile label="Articles" value={summary.articleCount} />
        <SummaryTile label="Avg words" value={summary.avgWordCount} />
        <SummaryTile label="Brand-leak articles" value={summary.leakArticleCount} />
        <SummaryTile label="Deprecated high/med" value={`${summary.riskCounts.high} / ${summary.riskCounts.medium}`} />
        <SummaryTile label="Rewritten (held)" value={`${rewrittenCount} (${heldCount})`} />
        <SummaryTile label="Gaps" value={gaps.length} />
      </div>

      <div className="flex gap-1 border-b border-neutral-200">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === value
                ? 'border-neutral-900 text-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'articles' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or slug…"
              className="min-w-56 flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
            />
            <select
              value={collectionFilter}
              onChange={(e) => setCollectionFilter(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">All collections</option>
              {collections.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {CHIPS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleChip(key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  activeChips.has(key)
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-300 text-neutral-600 hover:border-neutral-400'
                }`}
              >
                {label}
              </button>
            ))}
            <span className="text-xs text-neutral-500">
              {filteredArticles.length} of {articles.length}
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50">
                <tr>
                  {sortHeader('title', 'Title')}
                  {sortHeader('collection', 'Collection')}
                  {sortHeader('words', 'Words')}
                  {sortHeader('screenshots', 'Screenshots')}
                  {sortHeader('quality', 'Quality')}
                  {sortHeader('risk', 'Risk')}
                  <th className="px-3 py-2 text-left font-medium text-neutral-500">Flags</th>
                  <th className="px-3 py-2 text-left font-medium text-neutral-500">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredArticles.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-neutral-500">
                      No articles match these filters.
                    </td>
                  </tr>
                )}
                {filteredArticles.map((a) => {
                  const rewrite = rewrites[a.id]
                  const tier = tierById.get(a.id)
                  return (
                    <tr key={a.id}>
                      <td className="px-3 py-2">
                        <Link href={`/admin/articles/${a.id}`} className="font-medium hover:underline">
                          {a.title}
                        </Link>
                        <p className="text-xs text-neutral-500">{a.slug}</p>
                      </td>
                      <td className="px-3 py-2 text-neutral-600">{a.collectionTitle ?? 'Uncategorized'}</td>
                      <td className="px-3 py-2 text-neutral-600">{a.wordCount}</td>
                      <td className="px-3 py-2 text-neutral-600">{a.imageCount}</td>
                      <td className="px-3 py-2 text-neutral-600">{a.quality ?? '—'}</td>
                      <td className="px-3 py-2">
                        <RiskPill risk={a.deprecatedRisk} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {a.brandLeaks.length > 0 && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                              {a.brandLeaks.length} leak{a.brandLeaks.length === 1 ? '' : 's'}
                            </span>
                          )}
                          {rewrite && 'appliedAt' in rewrite && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                              Rewritten
                            </span>
                          )}
                          {rewrite && 'held' in rewrite && rewrite.held && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                              Held
                            </span>
                          )}
                          {tier && <TierPill tier={tier} />}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <ViewLink slug={a.slug} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'youtube' && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-neutral-500">Rank</th>
                <th className="px-3 py-2 text-left font-medium text-neutral-500">Tier</th>
                <th className="px-3 py-2 text-left font-medium text-neutral-500">Title</th>
                <th className="px-3 py-2 text-left font-medium text-neutral-500">Collection</th>
                <th className="px-3 py-2 text-left font-medium text-neutral-500">Score</th>
                <th className="px-3 py-2 text-left font-medium text-neutral-500">Screenshots</th>
                <th className="px-3 py-2 text-left font-medium text-neutral-500">Words</th>
                <th className="px-3 py-2 text-left font-medium text-neutral-500">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rankedYoutube.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-neutral-500">
                    No YouTube candidates found.
                  </td>
                </tr>
              )}
              {rankedYoutube.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 text-neutral-600">{a.rank}</td>
                  <td className="px-3 py-2">
                    <TierPill tier={a.tier} />
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/articles/${a.id}`} className="font-medium hover:underline">
                      {a.title}
                    </Link>
                    <p className="text-xs text-neutral-500">{a.slug}</p>
                  </td>
                  <td className="px-3 py-2 text-neutral-600">{a.collectionTitle ?? 'Uncategorized'}</td>
                  <td className="px-3 py-2 text-neutral-600">{a.score.toFixed(1)}</td>
                  <td className="px-3 py-2 text-neutral-600">{a.imageCount}</td>
                  <td className="px-3 py-2 text-neutral-600">{a.wordCount}</td>
                  <td className="px-3 py-2">
                    <ViewLink slug={a.slug} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'gaps' && (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
          {gapsByPriority.length === 0 && <li className="px-4 py-6 text-sm text-neutral-500">No gaps found.</li>}
          {gapsByPriority.map((g, i) => (
            <li key={`${g.topic}-${i}`} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="font-medium">{g.topic}</p>
                <p className="text-sm text-neutral-500">Suggested collection: {g.suggestedCollection}</p>
              </div>
              <div className="flex items-center gap-3">
                <PriorityPill priority={g.priority} />
                {/* theirUrl is LLM-echoed text; only link real web URLs. */}
                {/^https?:\/\//.test(g.theirUrl) ? (
                  <a
                    href={g.theirUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-neutral-500 hover:underline"
                  >
                    source
                  </a>
                ) : (
                  <span className="text-sm text-neutral-400">{g.theirUrl}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
