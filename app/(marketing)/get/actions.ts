'use server'

import { redirect } from 'next/navigation'
import { checkWorkEmail } from '@/lib/signup/work-email'
import { readSignupToken, writeSignupToken } from '@/lib/signup/session'
import { findSignupByToken, startSignup, updateSignup } from '@/lib/signup/repository'
import { findSurveyStep, nextSurveyStepId } from '@/lib/signup/survey'
import { checkSlugAvailable } from '@/lib/signup/slug-availability'
import { requestOrigin } from '@/lib/signup/origin'
import { sendConfirmationLink } from '@/lib/signup/send-link'
import { deliverSignup } from '@/lib/signup/deliver'
import { readAppearanceForm } from '@/lib/tenancy/appearance'
import { DEFAULT_PRIMARY_HEX, DEFAULT_SECONDARY_HEX } from '@/lib/tenancy/color'
import { safeHex } from '@/lib/tenancy/color'

export type FunnelState = { error?: string }

/** Creates or resumes the signup, then hands off to the first survey question. */
export async function submitDetails(
  _prev: FunnelState | null,
  formData: FormData,
): Promise<FunnelState> {
  const fullName = String(formData.get('fullName') ?? '').trim()
  if (!fullName) return { error: 'Tell us your name.' }

  const email = checkWorkEmail(String(formData.get('email') ?? ''))
  if (!email.ok) return { error: email.error }

  const signup = await startSignup(email.email, fullName)
  await writeSignupToken(signup.token)

  redirect('/get/survey/role')
}

/** Saves one survey answer and routes to the next question, or to the builder. */
export async function submitSurveyStep(
  _prev: FunnelState | null,
  formData: FormData,
): Promise<FunnelState> {
  const stepId = String(formData.get('step') ?? '')
  const step = findSurveyStep(stepId)
  if (!step) return { error: 'That question no longer exists.' }

  const token = await readSignupToken()
  const signup = token ? await findSignupByToken(token) : null
  if (!signup) redirect('/get/details')

  const raw = String(formData.get('answer') ?? '').trim()

  if (step.kind === 'consent') {
    // Required, by design. The box arrives ticked and the button is disabled
    // without it, so an empty value here means the form was posted around the
    // UI rather than through it.
    if (raw !== 'on' && raw !== 'true') {
      return { error: 'The mailing list is part of what makes this free.' }
    }
    const surveyed = await updateSignup(signup.id, {
      marketing_opt_in: true,
      consented_at: new Date().toISOString(),
      step: 'build',
    })

    // The survey is complete here, so this is the earliest point the CRM can be
    // told everything. Sending now rather than at claim is what makes someone
    // who abandons the builder a lead instead of an orphaned row. Awaited, not
    // fired and forgotten: a serverless function can be torn down the moment it
    // responds, taking a dangling promise with it. deliverSignup never throws.
    await deliverSignup(surveyed, await requestOrigin())

    redirect('/get/build')
  }

  if (!raw) return { error: 'Pick an answer to carry on.' }

  // A choice step accepts only what it offered. The answer arrives in a hidden
  // field the buttons populate, so anything else means the post did not come
  // from this screen — and survey answers are the segmentation the funnel
  // exists to collect, so junk in this column is worse than a rejected submit.
  if (step.kind === 'choice' && !step.options?.includes(raw)) {
    return { error: 'Pick one of the options to carry on.' }
  }

  const nextStep = nextSurveyStepId(step.id)
  await updateSignup(signup.id, {
    [step.column]: raw,
    step: nextStep ?? 'build',
  })

  redirect(nextStep ? `/get/survey/${nextStep}` : '/get/build')
}

/**
 * Saves the branding draft and sends the magic link.
 *
 * Nothing is created here. The center comes into existence at /get/claim, once
 * the email is proven — until then this is a draft and a held address.
 */
export async function submitBuild(
  _prev: FunnelState | null,
  formData: FormData,
): Promise<FunnelState> {
  const token = await readSignupToken()
  const signup = token ? await findSignupByToken(token) : null
  if (!signup) redirect('/get/details')

  const centerName = String(formData.get('centerName') ?? '').trim()
  if (!centerName) return { error: 'Give your help centre a name.' }

  const slug = await checkSlugAvailable(String(formData.get('slug') ?? ''), signup.id)
  if (!slug.available) return { error: slug.reason }

  const appearance = readAppearanceForm(formData)

  await updateSignup(signup.id, {
    center_name: centerName,
    center_slug: slug.slug,
    branding: {
      ...appearance,
      primaryHex: safeHex(String(formData.get('primaryHex') ?? ''), DEFAULT_PRIMARY_HEX),
      secondaryHex: safeHex(String(formData.get('secondaryHex') ?? ''), DEFAULT_SECONDARY_HEX),
      logoUrl: String(formData.get('logoUrl') ?? '').trim() || null,
      faviconUrl: String(formData.get('faviconUrl') ?? '').trim() || null,
      headline: String(formData.get('headline') ?? '').trim() || undefined,
      subtitle: String(formData.get('subtitle') ?? '').trim() || undefined,
    },
    step: 'claim',
  })

  // Re-read: the branding write above is what put the address and name on the
  // row the email quotes back.
  const ready = await findSignupByToken(signup.token)
  const sent = await sendConfirmationLink(ready ?? signup, await requestOrigin())
  if (!sent.ok) return { error: sent.error }

  redirect('/get/check-email')
}
