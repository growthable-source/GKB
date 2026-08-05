import { getBaseHelpCenterId } from '@/lib/tenancy/active'
import { getCachedArticleCollectionIndex, getCachedCollections } from '@/lib/content/cached'
import { countArticlesPerCollection } from '@/lib/content/queries'
import { StartForm } from '@/components/marketing/start-form'

// Every other page in this app is dynamic because it reads headers(). This one
// does not, so Next would prerender it at build time — where there is no
// database, and where the article count would freeze at whatever it was when
// the deployment was cut. The count is the page's central claim; it stays live.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Get your own help centre — Growthable',
  description:
    'A complete GoHighLevel knowledge base under your logo, live the moment you finish signing up.',
}

const STEPS = [
  {
    title: 'Enter your work email',
    body: 'Free providers are turned away. This is built for agencies, so we ask for the domain you actually trade under.',
  },
  {
    title: 'Answer five questions',
    body: 'Your role, your size, your agency name, how many sub-accounts you run. One question per screen.',
  },
  {
    title: 'Brand it',
    body: 'Logo, colours, fonts, and your address, with a live preview of the real help centre as you go.',
  },
  {
    title: 'Confirm your email',
    body: 'One link, one click. Your help centre is live and fully populated the second you land back.',
  },
]

const FAQS = [
  {
    q: 'Do I have to write anything?',
    a: "No. That's the entire point. The library is written, edited, and kept current — you're choosing a logo and a colour, not commissioning a content project.",
  },
  {
    q: "What if an article doesn't fit how I work?",
    a: "Hide it. Visibility is per-article, and it only affects your help centre — nobody else's changes.",
  },
  {
    q: "What's the catch on free?",
    a: 'You tell us about your agency and you join our mailing list. That is the trade, stated plainly.',
  },
  {
    q: 'Can I use my own domain?',
    a: 'Not yet. Today every help centre lives on a Growthable address, and moving across later will not cost you your URLs.',
  },
]

export default async function GetPage() {
  const baseId = await getBaseHelpCenterId()
  const [collections, index] = await Promise.all([
    getCachedCollections(baseId),
    getCachedArticleCollectionIndex(baseId),
  ])

  // The landing page's central claim is a number, so it is read rather than
  // written down: a hardcoded count goes stale the first week after launch.
  const counts = countArticlesPerCollection(index, new Set<string>())
  const ranked = collections
    .map((collection) => ({ title: collection.title, count: counts[collection.id] ?? 0 }))
    .sort((a, b) => b.count - a.count)

  const total = ranked.reduce((sum, row) => sum + row.count, 0)
  const shown = ranked.slice(0, 8)
  const rest = ranked.slice(8)
  const restCount = rest.reduce((sum, row) => sum + row.count, 0)

  return (
    <main>
      <section className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="grid items-start gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="flex flex-col gap-6">
            <p className="mk-eyebrow mk-mono text-xs uppercase tracking-[0.14em] text-[color:var(--mk-accent)]">
              Built for SaaS-mode agencies
            </p>
            {/* 3.4rem is growthable.io's own hero size, measured rather than
                guessed — anything larger breaks this headline mid-clause. */}
            <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem]">
              Your clients ask the same questions.{' '}
              <span className="text-[color:var(--mk-accent)]">The answers are already written.</span>
            </h1>
            <p className="max-w-lg text-lg leading-snug text-[color:var(--mk-ink-soft)]">
              A complete GoHighLevel knowledge base, under your logo, on your own address — live the
              moment you finish signing up. You write nothing.
            </p>
            <StartForm />
          </div>

          <aside className="flex flex-col gap-4 rounded-lg border border-[color:var(--mk-rule)] bg-[color:var(--mk-surface)] p-6 sm:p-7">
            <div className="flex items-baseline justify-between gap-4 border-b border-[color:var(--mk-rule)] pb-3">
              <h2 className="text-xl">What&rsquo;s already inside</h2>
              <span className="mk-mono text-xs text-[color:var(--mk-ink-faint)]">updated weekly</span>
            </div>

            <ul className="flex flex-col gap-2.5">
              {shown.map((row) => (
                <li key={row.title} className="flex items-baseline gap-2 text-sm">
                  <span>{row.title}</span>
                  <span aria-hidden="true" className="mk-leader" />
                  <span className="mk-mono tabular-nums text-[color:var(--mk-ink-soft)]">
                    {row.count}
                  </span>
                </li>
              ))}
              {rest.length > 0 && (
                <li className="flex items-baseline gap-2 text-sm">
                  <span>
                    …and {rest.length} more {rest.length === 1 ? 'category' : 'categories'}
                  </span>
                  <span aria-hidden="true" className="mk-leader" />
                  <span className="mk-mono tabular-nums text-[color:var(--mk-ink-soft)]">
                    {restCount}
                  </span>
                </li>
              )}
            </ul>

            <div className="flex items-baseline justify-between gap-4 border-t border-[color:var(--mk-rule)] pt-4">
              <span className="mk-mono text-3xl leading-none tabular-nums text-[color:var(--mk-accent)]">
                {total.toLocaleString()}
              </span>
              <span className="mk-mono text-right text-xs uppercase tracking-[0.12em] text-[color:var(--mk-ink-faint)]">
                articles
                <br />
                you didn&rsquo;t write
              </span>
            </div>
          </aside>
        </div>
      </section>

      <section className="border-t border-[color:var(--mk-rule)]">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-16">
          <p className="mk-eyebrow mk-mono text-xs uppercase tracking-[0.14em] text-[color:var(--mk-accent)]">
            Four steps, about two minutes
          </p>
          <h2 className="mt-2 text-2xl tracking-tight sm:text-3xl">
            From this page to a live help centre
          </h2>

          <ol className="mt-9 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="flex flex-col gap-2 border-t-2 border-[color:var(--mk-accent)] pt-3"
              >
                <span className="mk-mono text-xs tracking-[0.1em] text-[color:var(--mk-accent)]">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="text-base font-medium">{step.title}</h3>
                <p className="text-sm leading-relaxed text-[color:var(--mk-ink-soft)]">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-[color:var(--mk-rule)]">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-16">
          <p className="mk-eyebrow mk-mono text-xs uppercase tracking-[0.14em] text-[color:var(--mk-accent)]">
            The specifics
          </p>
          <h2 className="mt-2 text-2xl tracking-tight sm:text-3xl">What you get, precisely</h2>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {[
                  ['Articles', `${total.toLocaleString()} published GoHighLevel articles, maintained and expanded by us — not a starter template`],
                  ['Your address', 'An address of your choosing, checked for availability as you type'],
                  ['Branding', 'Logo, favicon, primary and secondary colours, heading and body fonts, solid or gradient hero'],
                  ['Search', 'Full-text search across every article, scoped to your help centre'],
                  ['Editorial control', "Hide any article that doesn't apply to how you run your agency"],
                  ['Ongoing work', 'None. New articles appear in your help centre as they are published'],
                  ['Price', 'Free'],
                ].map(([label, value]) => (
                  <tr key={label} className="border-b border-[color:var(--mk-rule)]">
                    <th
                      scope="row"
                      className="mk-mono w-52 whitespace-nowrap py-3.5 pr-4 text-left text-xs font-normal uppercase tracking-[0.1em] text-[color:var(--mk-ink-faint)]"
                    >
                      {label}
                    </th>
                    <td className="py-3.5">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="border-t border-[color:var(--mk-rule)]">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-16">
          <p className="mk-eyebrow mk-mono text-xs uppercase tracking-[0.14em] text-[color:var(--mk-accent)]">
            Before you ask
          </p>
          <h2 className="mt-2 text-2xl tracking-tight sm:text-3xl">Reasonable questions</h2>

          <div className="mt-8 grid gap-7 sm:grid-cols-2 sm:gap-x-12">
            {FAQS.map((faq) => (
              <div key={faq.q}>
                <h3 className="text-base font-medium">{faq.q}</h3>
                <p className="mt-1 max-w-prose text-sm leading-relaxed text-[color:var(--mk-ink-soft)]">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[color:var(--mk-rule)]">
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-5 py-14 sm:px-8 sm:py-20">
          <h2 className="max-w-[24ch] text-2xl tracking-tight sm:text-3xl">
            Two minutes from now, your clients could be reading it.
          </h2>
          <StartForm />
        </div>
      </section>
    </main>
  )
}
