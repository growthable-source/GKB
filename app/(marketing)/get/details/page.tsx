import { submitDetails } from '../actions'
import { DetailsForm } from '@/components/marketing/details-form'

export const metadata = { title: 'Your details — Growthable' }

export default async function DetailsPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email = '' } = await searchParams

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-7 px-5 py-16 sm:px-8 sm:py-24">
      <div className="flex flex-col gap-2">
        <p className="mk-eyebrow mk-mono text-xs uppercase tracking-[0.14em] text-[color:var(--mk-accent)]">
          Step 1 of 7
        </p>
        <h1 className="text-3xl tracking-tight sm:text-4xl">First, who are you?</h1>
        <p className="text-[color:var(--mk-ink-soft)]">
          We only need this once. Nothing is created until you confirm your email at the end.
        </p>
      </div>

      <DetailsForm action={submitDetails} initialEmail={email} />
    </main>
  )
}
