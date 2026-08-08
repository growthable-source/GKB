import { NextResponse } from 'next/server'
import { authorize, ForbiddenError } from '@/lib/authz/authorize'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { XoveraError, mintPortalLink } from '@/lib/ai-widget/client'
import { externalIdFor } from '@/lib/ai-widget/external-id'

/**
 * A fresh, single-use portal sign-in URL for the caller's own help centre.
 *
 * Sibling of the builder-link route with identical shape and rules: POST
 * because it mints a credential, no parameters because the centre comes
 * from the session, minted per click because the token is single-use.
 */
export async function POST() {
  const center = await getOwnedCenter()
  if (!center) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })

  try {
    await authorize('helpCenter.update', { helpCenterId: center.id })
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }
    throw error
  }

  try {
    const link = await mintPortalLink(externalIdFor(center.id))
    return NextResponse.json(
      { portalUrl: link.portalUrl },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof XoveraError) {
      console.error(`Portal link failed (${error.code}) for ${center.id}:`, error.message)
      const message =
        error.code === 'not_ready'
          ? 'Your portal is still being set up. Give it a moment and try again.'
          : 'We could not open your portal right now. Please try again shortly.'
      return NextResponse.json({ error: message }, { status: 502 })
    }
    throw error
  }
}
