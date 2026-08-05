import { serviceClient } from '@/lib/db/client'
import type { Signup } from './repository'

/**
 * The CRM seam.
 *
 * Survey answers are lead data, and they will eventually need to reach
 * LeadConnector or whatever replaces it. That destination is deliberately one
 * function wide: the funnel calls `deliverSignup` and stops caring. Swapping
 * Postgres-only for a webhook, or a webhook for a direct contact upsert, is a
 * change to this file.
 *
 * Two rules the implementation must keep, whatever it becomes:
 *
 *   1. Delivery never sits in the request path. A signup must not fail, or
 *      even slow down, because a third party is having a bad day.
 *   2. Failure is recorded, not thrown. `delivered_at` staying null is the
 *      backlog; a retry can sweep it later.
 */
export async function deliverSignup(signup: Signup): Promise<void> {
  const endpoint = process.env.SIGNUP_WEBHOOK_URL

  if (!endpoint) {
    // Nothing configured yet. The row is the record; delivery is a later job.
    return
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: signup.email,
        fullName: signup.full_name,
        role: signup.role,
        companySize: signup.company_size,
        agencyName: signup.agency_name,
        subaccountCount: signup.subaccount_count,
        marketingOptIn: signup.marketing_opt_in,
        consentedAt: signup.consented_at,
        helpCenterSlug: signup.center_slug,
        signedUpAt: signup.created_at,
      }),
    })

    if (!response.ok) {
      console.error(`Signup delivery failed with ${response.status} for ${signup.email}`)
      return
    }

    await serviceClient()
      .from('signups')
      .update({ delivered_at: new Date().toISOString() })
      .eq('id', signup.id)
  } catch (error) {
    console.error(`Signup delivery threw for ${signup.email}:`, error)
  }
}
