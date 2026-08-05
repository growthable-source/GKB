import { redirect } from 'next/navigation'
import { readSignupToken } from '@/lib/signup/session'
import { findSignupByToken } from '@/lib/signup/repository'

export const metadata = { title: 'Check your email — Growthable' }

export default async function CheckEmailPage() {
  const token = await readSignupToken()
  const signup = token ? await findSignupByToken(token) : null
  if (!signup) redirect('/get/details')
  if (signup.claimed_at) redirect('/dashboard')

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-5 px-5 py-16 sm:px-8 sm:py-24">
      <p className="mk-eyebrow mk-mono text-xs uppercase tracking-[0.14em] text-[color:var(--mk-accent)]">
        Almost there
      </p>
      <h1 className="text-3xl tracking-tight sm:text-4xl">One click left.</h1>
      <p className="text-[color:var(--mk-ink-soft)]">
        We sent a confirmation link to <span className="mk-mono">{signup.email}</span>. Opening it
        creates your help centre at{' '}
        <span className="mk-mono text-[color:var(--mk-ink)]">/hc/{signup.center_slug}</span> and
        signs you in.
      </p>
      <p className="text-sm text-[color:var(--mk-ink-faint)]">
        Nothing is lost if you close this tab — your answers and your branding are saved, and the
        address is held for you.
      </p>
    </main>
  )
}
