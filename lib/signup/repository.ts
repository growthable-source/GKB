import { serviceClient } from '@/lib/db/client'
import type { Json } from '@/lib/db/types'
import { newSignupToken } from './session'

export type Signup = {
  id: string
  token: string
  email: string
  full_name: string
  role: string | null
  company_size: string | null
  agency_name: string | null
  subaccount_count: string | null
  marketing_opt_in: boolean
  consented_at: string | null
  center_name: string | null
  center_slug: string | null
  branding: Record<string, unknown>
  step: string
  help_center_id: string | null
  claimed_at: string | null
  delivered_at: string | null
  link_sent_at: string | null
  created_at: string
  updated_at: string
}

const FIELDS =
  'id, token, email, full_name, role, company_size, agency_name, subaccount_count, marketing_opt_in, consented_at, center_name, center_slug, branding, step, help_center_id, claimed_at, delivered_at, link_sent_at, created_at, updated_at'

/**
 * Starts a signup, or returns the one this email already has open.
 *
 * Resuming rather than duplicating is the reason `signups_pending_email`
 * exists. Someone who half-finishes on Monday and comes back on Friday should
 * land back in their own funnel, not start a second row that competes with the
 * first for the same address.
 */
export async function startSignup(email: string, fullName: string): Promise<Signup> {
  const db = serviceClient()

  const { data: existing, error: existingError } = await db
    .from('signups')
    .select(FIELDS)
    .eq('email', email)
    .is('claimed_at', null)
    .maybeSingle()
  if (existingError) throw new Error(`Could not start the signup: ${existingError.message}`)

  if (existing) {
    const resumed = existing as unknown as Signup
    if (resumed.full_name === fullName) return resumed

    // They corrected their name on the way back through. Keep the row.
    return updateSignup(resumed.id, { full_name: fullName })
  }

  const { data: created, error: createError } = await db
    .from('signups')
    .insert({ token: newSignupToken(), email, full_name: fullName, step: 'role' })
    .select(FIELDS)
    .single()
  if (createError || !created) {
    throw new Error(`Could not start the signup: ${createError?.message}`)
  }

  return created as unknown as Signup
}

export async function findSignupByToken(token: string): Promise<Signup | null> {
  const { data, error } = await serviceClient()
    .from('signups')
    .select(FIELDS)
    .eq('token', token)
    .maybeSingle()

  if (error) throw new Error(`Could not read the signup: ${error.message}`)
  return (data as unknown as Signup) ?? null
}

/** The unclaimed signup for an email, used by the claim route after verification. */
export async function findPendingSignupByEmail(email: string): Promise<Signup | null> {
  const { data, error } = await serviceClient()
    .from('signups')
    .select(FIELDS)
    .eq('email', email.toLowerCase())
    .is('claimed_at', null)
    .maybeSingle()

  if (error) throw new Error(`Could not read the signup: ${error.message}`)
  return (data as unknown as Signup) ?? null
}

/** The most recent signup for an email, claimed or not. */
export async function findLatestSignupByEmail(email: string): Promise<Signup | null> {
  const { data, error } = await serviceClient()
    .from('signups')
    .select(FIELDS)
    .eq('email', email.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Could not read the signup: ${error.message}`)
  return (data as unknown as Signup) ?? null
}

/**
 * `branding` is widened to Json on the way in. It is read back as a plain
 * object for convenience, but the column accepts any JSON value, and the
 * generated types hold us to that.
 */
export async function updateSignup(
  id: string,
  patch: Partial<Omit<Signup, 'id' | 'token' | 'created_at' | 'updated_at' | 'branding'>> & {
    branding?: Json
  },
): Promise<Signup> {
  const { data, error } = await serviceClient()
    .from('signups')
    .update(patch)
    .eq('id', id)
    .select(FIELDS)
    .single()

  if (error || !data) throw new Error(`Could not save your answer: ${error?.message}`)
  return data as unknown as Signup
}
