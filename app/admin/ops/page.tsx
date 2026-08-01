import { serviceClient } from '@/lib/db/client'
import { OpsDashboard } from '@/components/admin/ops-dashboard'
import type { AuditArticle, GapItem, RewriteApplications } from '@/scripts/content-ops/types'
import type { AuditSummary } from '@/scripts/content-ops/summarize'

type AuditPayload = { summary: AuditSummary; articles: AuditArticle[] }

async function latestSnapshot<T>(kind: 'audit' | 'gaps' | 'rewrites') {
  const { data } = await serviceClient()
    .from('ops_snapshots')
    .select('payload, created_at')
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data ? { payload: data.payload as T, createdAt: data.created_at } : null
}

export default async function OpsPage() {
  const [audit, gaps, rewrites] = await Promise.all([
    latestSnapshot<AuditPayload>('audit'),
    latestSnapshot<GapItem[]>('gaps'),
    latestSnapshot<RewriteApplications>('rewrites'),
  ])

  if (!audit) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Content Ops</h1>
        <p className="rounded-lg border border-neutral-200 bg-white px-4 py-6 text-sm text-neutral-500">
          No ops data yet — run <code className="rounded bg-neutral-100 px-1 py-0.5">pnpm ops:audit</code> then{' '}
          <code className="rounded bg-neutral-100 px-1 py-0.5">pnpm ops:push</code>.
        </p>
      </div>
    )
  }

  return (
    <OpsDashboard
      articles={audit.payload.articles}
      summary={audit.payload.summary}
      auditedAt={audit.createdAt}
      gaps={gaps?.payload ?? []}
      rewrites={rewrites?.payload ?? {}}
    />
  )
}
