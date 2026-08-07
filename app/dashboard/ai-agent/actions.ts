'use server'

import { revalidatePath } from 'next/cache'
import { userClient } from '@/lib/db/client'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { addWidget, removeWidget } from '@/lib/ai-widget/install'

export type AiWidgetState = { error?: string }

/**
 * Buys the widget.
 *
 * Bound to a form submit rather than run on render: Xovera's write budget is 60
 * calls per 10 minutes for the whole integration, so a provision triggered by
 * page load would be a self-inflicted outage the first time a customer left the
 * tab open.
 */
// Both actions take no input at all. Everything they need — the centre, the
// owner's email — comes from the session, so there is nothing a caller could
// pass that we would trust. The client component adapts them to useActionState.
export async function addAiWidget(): Promise<AiWidgetState> {
  const center = await getOwnedCenter()
  if (!center) return { error: 'You do not have a help centre yet.' }

  // The signed-in person's own address, never a value from the form. Xovera
  // creates a passwordless account for whatever we send, on the strength of us
  // having authenticated them — so this has to come from the session.
  const { data } = await (await userClient()).auth.getUser()
  const email = data.user?.email
  if (!email) return { error: 'We could not read your email address. Try signing in again.' }

  const result = await addWidget(center, email)

  revalidatePath('/dashboard/ai-agent')
  revalidatePath(`/hc/${center.slug}`, 'layout')
  return result
}

export async function removeAiWidget(): Promise<AiWidgetState> {
  const center = await getOwnedCenter()
  if (!center) return { error: 'You do not have a help centre yet.' }

  const result = await removeWidget(center)

  revalidatePath('/dashboard/ai-agent')
  revalidatePath(`/hc/${center.slug}`, 'layout')
  return result
}
