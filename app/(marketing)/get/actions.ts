'use server'

import { redirect } from 'next/navigation'
import { userClient } from '@/lib/db/client'
import { checkWorkEmail } from '@/lib/signup/work-email'
import { readSignupToken, writeSignupToken } from '@/lib/signup/session'
import { findSignupByToken, startSignup, updateSignup } from '@/lib/signup/repository'
import { findSurveyStep, nextSurveyStepId } from '@/lib/signup/survey'
import { checkSlugAvailable } from '@/lib/signup/slug-availability'
import { requestOrigin } from '@/lib/signup/origin'
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
    await updateSignup(signup.id, {
      marketing_opt_in: true,
      consented_at: new Date().toISOString(),
      step: 'build',
    })
    redirect('/get/build')
  }

  if (!raw) return { error: 'Pick an answer to carry on.' }

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

  const supabase = await userClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: signup.email,
    options: {
      // The host they are on, not a build-time constant — see requestOrigin().
      emailRedirectTo: `${await requestOrigin()}/auth/confirm`,
    },
  })
  if (error) return { error: `We could not send your confirmation email: ${error.message}` }

  redirect('/get/check-email')
}
