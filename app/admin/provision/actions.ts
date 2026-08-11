'use server'

import { redirect } from 'next/navigation'
import { authorize } from '@/lib/authz/authorize'
import { findLatestSignupByEmail, startSignup, updateSignup } from '@/lib/signup/repository'
import { nextAvailableCenterSlug } from '@/lib/signup/slug-availability'
import { sendConfirmationLink } from '@/lib/signup/send-link'
import { requestOrigin } from '@/lib/signup/origin'
import {
  findEntitlementByEmail,
  recordAgencySubscription,
} from '@/lib/agency-plan/entitlement'
import { isLeadConnectorConfigured, upsertLead } from '@/lib/crm/leadconnector'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Staff provisioning: sets a customer up without them walking the funnel.
 *
 * Deliberately built ON the funnel rather than around it — the action
 * prepares a signup row at the claim step and sends the standard
 * confirmation email, so the customer's first click creates their user,
 * centre and membership through exactly the code the self-serve path uses.
 * Nothing here mints sessions or bypasses auth on the customer's behalf.
 *
 * The comped Agency AI plan reuses recordAgencySubscription with a comp-
 * prefixed subscription id: if the centre already exists it entitles it now,
 * otherwise the claim picks it up — same pipeline as a paid checkout, so a
 * comp and a purchase are indistinguishable to the rest of the app.
 */
export async function provisionCustomer(formData: FormData): Promise<void> {
  await authorize('helpCenter.create')

  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const fullName = String(formData.get('fullName') ?? '').trim()
  const agencyName = String(formData.get('agencyName') ?? '').trim()
  const compPlan = formData.get('agencyPlan') === 'on'
  const humanSupport = formData.get('humanSupport') === 'on'

  if (!EMAIL_RE.test(email) || !fullName || !agencyName) {
    redirect(
      `/admin/provision?error=${encodeURIComponent('Email, full name and agency name are all required.')}`,
    )
  }

  const notes: string[] = []

  const existing = await findLatestSignupByEmail(email)
  const alreadyLive = Boolean(existing?.claimed_at && existing?.help_center_id)

  if (alreadyLive) {
    notes.push(`${email} already runs the centre "${existing?.center_slug}" — kept as is.`)
  } else {
    const signup = await startSignup(email, fullName)
    const slug = await nextAvailableCenterSlug(agencyName)
    const ready = await updateSignup(signup.id, {
      agency_name: agencyName,
      center_name: agencyName,
      center_slug: slug,
      step: 'claim',
    })

    const sent = await sendConfirmationLink(ready, await requestOrigin())
    if (!sent.ok) {
      redirect(`/admin/provision?error=${encodeURIComponent(sent.error)}`)
    }
    notes.push(
      `Sign-in email sent to ${email} — their centre "${slug}" goes live the moment they click it.`,
    )
  }

  if (compPlan) {
    const entitled = await findEntitlementByEmail(email)
    if (entitled) {
      notes.push('Already on the Agency AI plan — nothing to comp.')
    } else {
      await recordAgencySubscription({
        email,
        stripeCustomerId: null,
        stripeSubscriptionId: `comp-${crypto.randomUUID()}`,
      })
      notes.push('Agency AI plan comped — the AI widget provisions as paid, no trial.')
    }
  }

  if (humanSupport) {
    if (isLeadConnectorConfigured()) {
      try {
        await upsertLead({
          email,
          fullName,
          agencyName,
          role: null,
          companySize: null,
          country: null,
          subaccountCount: null,
          marketingOptIn: true,
          helpCenterSlug: existing?.center_slug ?? null,
          helpCenterUrl: null,
          extraTags: ['human-support'],
        })
        notes.push('Tagged human-support in GHL for the support-team workflow.')
      } catch (error) {
        console.error(`Provisioning: GHL tag failed for ${email}:`, error)
        notes.push('GHL tagging failed — add the human-support tag manually.')
      }
    } else {
      notes.push('GHL is not configured here — add the human-support tag manually.')
    }
  }

  redirect(`/admin/provision?done=${encodeURIComponent(notes.join(' '))}`)
}
