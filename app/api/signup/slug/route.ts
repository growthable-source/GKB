import { NextResponse } from 'next/server'
import { readSignupToken } from '@/lib/signup/session'
import { findSignupByToken } from '@/lib/signup/repository'
import { checkSlugAvailable } from '@/lib/signup/slug-availability'

/** Address availability, checked as the builder is typed into. */
export async function GET(request: Request) {
  const token = await readSignupToken()
  const signup = token ? await findSignupByToken(token) : null
  if (!signup) return NextResponse.json({ error: 'Start a signup first' }, { status: 403 })

  const value = new URL(request.url).searchParams.get('value') ?? ''
  // Excluding this signup's own id: the address it is already holding must read
  // as available to the person holding it.
  const result = await checkSlugAvailable(value, signup.id)

  return NextResponse.json(result)
}
