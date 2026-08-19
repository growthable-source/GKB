/**
 * Fire-and-forget Xovera registration for a help centre.
 *
 * Called from the claim flow so every centre — not just the ones whose
 * owners click "Add AI chat widget" — shows up on Xovera's admin Help
 * Center page, where Growthable staff can provision + unlock it later.
 *
 * Same contract as deliverSignup: AWAIT it (a serverless function can be
 * torn down before a dangling promise resolves) and it NEVER throws — a
 * Xovera blip must not lose a signup. Registration is idempotent on
 * externalId, so the backfill script re-calling this for existing
 * centres is harmless.
 */

import { isXoveraConfigured, registerInstall, XoveraError } from './client'
import { externalIdFor } from './external-id'
import { helpCenterUrl } from './center-url'

export async function registerCenterWithXovera(params: {
  helpCenterId: string
  slug: string
  name: string
  email: string
  origin?: string
  customDomain?: string | null
}): Promise<void> {
  if (!isXoveraConfigured()) return

  try {
    await registerInstall({
      externalId: externalIdFor(params.helpCenterId),
      email: params.email,
      businessName: params.name,
      ...(params.origin
        ? { helpCenterUrl: helpCenterUrl(params.origin, params.slug, params.customDomain ?? null) }
        : {}),
    })
  } catch (error) {
    const detail = error instanceof XoveraError ? `${error.code}: ${error.message}` : String(error)
    console.error(`Could not register help centre ${params.helpCenterId} with Xovera: ${detail}`)
  }
}
