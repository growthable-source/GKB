/**
 * Pushes content-ops results to the DB as ops_snapshots rows, so the deployed
 * app — which can't read local import/ops/*.json files — can render them in
 * app/admin/ops. Local JSON under import/ops/ stays the source of truth for
 * report.mts; this just mirrors the latest results into Postgres.
 *
 * Every push is a new row; app/admin/ops/page.tsx reads the latest one per
 * kind (order by created_at desc limit 1), so history just accumulates.
 */
import type { Json } from '../../lib/db/types'

export type OpsSnapshotKind = 'audit' | 'gaps' | 'rewrites'

export async function pushSnapshot(kind: OpsSnapshotKind, payload: Json): Promise<void> {
  const { serviceClient } = await import('../../lib/db/client')
  const { error } = await serviceClient().from('ops_snapshots').insert({ kind, payload })
  if (error) throw new Error(`pushSnapshot(${kind}) failed: ${error.message}`)
  console.log(`pushed ops_snapshots row (kind=${kind})`)
}
