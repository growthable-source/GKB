import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { syncCenterWithXovera } from '@/lib/ai-widget/reconcile'

/**
 * Xovera pushes here right after a staff unlock, so the widget appears
 * on the customer's help centre and the Pro flag flips WITHOUT anyone
 * running a script or clicking anything.
 *
 * Auth: shared bearer secret (XOVERA_SYNC_SECRET here, the same value
 * as HELP_CENTER_SYNC_SECRET on Xovera's deployment). Machine-to-
 * machine only — there is no user in this request. Unset secret =
 * endpoint off (404), per the unset-is-supported convention.
 *
 * Body: { externalId: "hc_<helpCenterId>" } — the join key both sides
 * already share (lib/ai-widget/external-id.ts).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.XOVERA_SYNC_SECRET
  if (!secret) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const header = req.headers.get('authorization') ?? ''
  const presented = header.startsWith('Bearer ') ? header.slice(7) : ''
  const a = Buffer.from(presented)
  const b = Buffer.from(secret)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as { externalId?: string }
  const externalId = typeof body.externalId === 'string' ? body.externalId : ''
  if (!externalId.startsWith('hc_')) {
    return NextResponse.json({ error: 'externalId must look like hc_<helpCenterId>' }, { status: 422 })
  }

  const result = await syncCenterWithXovera(externalId.slice(3))
  return NextResponse.json({ ok: true, ...result })
}
