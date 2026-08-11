import { serviceClient } from '@/lib/db/client'
import { isLeadConnectorConfigured, upsertLead } from '@/lib/crm/leadconnector'
import type { Signup } from './repository'

/**
 * Gets a signup into the CRM as a lead.
 *
 * Called twice by design: once the moment the survey is finished, and again
 * when the centre goes live. The first call is the important one — it means a
 * person who fills in the survey and then abandons the builder is still a lead
 * with everything they told us, rather than a row nobody sees. Both calls
 * upsert on email, so the second updates the first.
 *
 * Two rules this must always keep:
 *
 *   1. It never throws. A signup must not fail because a third party is having
 *      a bad day, and the funnel calls this on its critical path.
 *   2. Failure is recorded, not raised. `delivered_at` staying null is the
 *      backlog a retry can sweep later.
 */
export async function deliverSignup(signup: Signup, origin?: string): Promise<void> {
  const helpCenterUrl =
    signup.center_slug && origin ? `${origin}/hc/${signup.center_slug}` : null

  let delivered = false

  if (isLeadConnectorConfigured()) {
    try {
      await upsertLead({
        email: signup.email,
        fullName: signup.full_name,
        agencyName: signup.agency_name,
        role: signup.role,
        companySize: signup.company_size,
        country: signup.country,
        subaccountCount: signup.subaccount_count,
        marketingOptIn: signup.marketing_opt_in,
        helpCenterSlug: signup.center_slug,
        helpCenterUrl,
      })
      delivered = true
    } catch (error) {
      console.error(`CRM delivery failed for ${signup.email}:`, error)
    }
  }

  // Kept alongside the CRM rather than replaced by it: a webhook is how this
  // reaches anything else (Zapier, Make, an internal endpoint) without another
  // integration living in here.
  const endpoint = process.env.SIGNUP_WEBHOOK_URL
  if (endpoint) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: signup.email,
          fullName: signup.full_name,
          role: signup.role,
          companySize: signup.company_size,
          country: signup.country,
          agencyName: signup.agency_name,
          subaccountCount: signup.subaccount_count,
          marketingOptIn: signup.marketing_opt_in,
          consentedAt: signup.consented_at,
          helpCenterSlug: signup.center_slug,
          helpCenterUrl,
          signedUpAt: signup.created_at,
        }),
      })
      if (response.ok) delivered = true
      else console.error(`Signup webhook failed with ${response.status} for ${signup.email}`)
    } catch (error) {
      console.error(`Signup webhook threw for ${signup.email}:`, error)
    }
  }

  if (!delivered) return

  const { error } = await serviceClient()
    .from('signups')
    .update({ delivered_at: new Date().toISOString() })
    .eq('id', signup.id)

  if (error) console.error(`Could not stamp delivery for ${signup.email}: ${error.message}`)
}
