import { redirect } from 'next/navigation'
import { getOwnedCenter } from '@/lib/dashboard/owned-center'
import { getInstallForCenter } from '@/lib/ai-widget/repository'
import { getInstall, isXoveraConfigured, type InstallResponse } from '@/lib/ai-widget/client'
import { AiWidgetBuilder } from '@/components/dashboard/ai-widget-builder'
import { AddWidgetButton, RemoveWidgetButton } from '@/components/dashboard/ai-widget-buttons'
import { AiWidgetSnippet } from '@/components/dashboard/ai-widget-snippet'
import { OpenPortalButton } from '@/components/dashboard/ai-widget-portal-button'
import { addAiWidget, removeAiWidget } from './actions'

export const metadata = { title: 'AI chat widget — Growthable' }

// The install's live state changes on Xovera's side (trial countdown, usage,
// the customer upgrading in the builder), so this page must not be
// prerendered against a build-time snapshot.
export const dynamic = 'force-dynamic'

const CARD = 'rounded-lg border border-neutral-200 bg-white p-5'

/**
 * What the widget can actually do, said accurately.
 *
 * The corpus every provisioned agent reads is the public GoHighLevel help
 * centre — not the customer's own articles. Per-customer content is a planned
 * follow-up. Until it lands, copy on this page promises GoHighLevel answers and
 * nothing about "trained on your business", because the second one is not true
 * and the customer will find that out in their first conversation.
 */
const PITCH = [
  'Answers your clients’ GoHighLevel questions instantly, day or night.',
  'Reads the full public GoHighLevel help centre — around 24,000 passages.',
  // No "offers a human" here: handoff is a paid Xovera feature and every
  // widget starts on trial, so the free pitch must not promise it.
  'Tells your clients honestly when it does not know, rather than inventing an answer.',
  'Goes on your help centre automatically, and you can paste it into your HighLevel agency too.',
]

/** Live status from Xovera, or null when they cannot be reached. */
async function liveStatus(externalId: string): Promise<InstallResponse | null> {
  try {
    return await getInstall(externalId)
  } catch (error) {
    // Degrades to the stored state rather than erroring the page: the widget is
    // on the customer's help centre either way, and a Xovera blip should not
    // make their dashboard look broken.
    console.error(`Could not read AI widget status for ${externalId}:`, error)
    return null
  }
}

export default async function AiAgentPage() {
  const center = await getOwnedCenter()
  if (!center) redirect('/get/details')

  if (!isXoveraConfigured()) {
    return (
      <Shell>
        <p className={`${CARD} text-sm text-neutral-600`}>
          The AI chat widget isn&rsquo;t available on this environment yet.
        </p>
      </Shell>
    )
  }

  const install = await getInstallForCenter(center.id)
  const isLive = install?.status === 'ready'
  const live = isLive ? await liveStatus(install.externalId) : null

  // Xovera's live copy wins over ours: the customer may have changed the widget
  // in the builder since we stored it. Falls back to the stored one so the
  // section still appears when Xovera cannot be reached.
  const snippet = live?.widget?.embedSnippet ?? install?.embedSnippet ?? null

  if (!install || install.status === 'disabled') {
    return (
      <Shell>
        <section className={CARD}>
          <ul className="flex flex-col gap-2">
            {PITCH.map((line) => (
              <li key={line} className="text-sm text-neutral-700">
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-neutral-600">
            It goes live on your help centre the moment you add it — nothing to paste there. You
            get the embed code as well, for adding it to your HighLevel agency.
          </p>
          <div className="mt-5">
            <AddWidgetButton
              action={addAiWidget}
              label={install ? 'Add the AI chat widget back' : 'Add AI chat widget'}
            />
          </div>
          <p className="mt-4 text-xs text-neutral-500">
            Starts on a free trial. If you want to keep it after that, you&rsquo;ll pick a plan
            inside the customiser — it doesn&rsquo;t convert on its own.
          </p>
        </section>
      </Shell>
    )
  }

  if (install.status === 'provisioning') {
    return (
      <Shell>
        <section className={CARD}>
          <p className="text-sm font-medium">Setting up your widget…</p>
          <p className="mt-2 text-sm text-neutral-600">
            This usually takes a few seconds. Refresh the page in a moment.
          </p>
          {/* The status is stamped before we call Xovera, so a crash or a
              dropped connection mid-provision would otherwise strand this
              screen forever. Retrying is safe and is what unsticks it:
              Xovera resumes the same install rather than starting a second. */}
          <div className="mt-5">
            <AddWidgetButton action={addAiWidget} label="Still waiting? Try again" />
          </div>
        </section>
      </Shell>
    )
  }

  if (install.status === 'failed') {
    return (
      <Shell>
        <section className={CARD}>
          <p className="text-sm font-medium text-red-900">We couldn&rsquo;t finish setting this up.</p>
          <p className="mt-2 text-sm text-neutral-600">
            Nothing was charged and nothing is on your help centre. Trying again picks up where it
            got to rather than starting over.
          </p>
          <div className="mt-5">
            <AddWidgetButton action={addAiWidget} label="Try again" />
          </div>
        </section>
      </Shell>
    )
  }

  return (
    <Shell>
      <section className={CARD}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-900">
            <span className="h-1.5 w-1.5 rounded-full bg-green-600" aria-hidden />
            Live
          </span>
          <p className="text-sm text-neutral-600">
            Answering questions on{' '}
            <a href={`/hc/${center.slug}`} className="underline">
              your help centre
            </a>
            .
          </p>
        </div>

        {live?.usage && (
          <p className="mt-4 text-2xl font-semibold tabular-nums">
            {live.usage.conversationCount.toLocaleString()}{' '}
            <span className="text-sm font-normal text-neutral-600">
              {live.usage.conversationCount === 1 ? 'conversation' : 'conversations'} answered
            </span>
          </p>
        )}
      </section>

      {live?.billing && <TrialNudge billing={live.billing} usage={live.usage} />}

      {live?.portal && <PortalCard usage={live.usage} />}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">Customise it</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Colours, logo, greeting, and where it sits on the page. Opens in a new tab, and
            changes go live straight away.
          </p>
        </div>
        <AiWidgetBuilder />
      </section>

      {snippet && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold">Put it somewhere else too</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Your help centre already has it — there&rsquo;s nothing to do there. Use this code to
              add the same widget to your HighLevel agency, or anywhere else you can paste a
              script. It&rsquo;s the same assistant and the same settings, so anything you change
              above applies everywhere.
            </p>
          </div>
          <AiWidgetSnippet snippet={snippet} />
          <p className="text-xs text-neutral-500">
            Paste it just before the closing <code>&lt;/body&gt;</code> tag, or into a custom-code
            or tracking-code box if the site you&rsquo;re adding it to has one.
          </p>
        </section>
      )}

      <section className="border-t border-neutral-200 pt-6">
        <RemoveWidgetButton action={removeAiWidget} />
      </section>
    </Shell>
  )
}

/**
 * Reinforcement, not the only path — the builder shows its own trial banner with
 * the actual upgrade CTA, and Xovera takes the payment. Leads with the
 * conversation count because that is the number that makes the case.
 */
function TrialNudge({
  billing,
  usage,
}: {
  billing: NonNullable<InstallResponse['billing']>
  usage: InstallResponse['usage']
}) {
  if (billing.plan !== 'trial') return null

  const answered = usage?.conversationCount ?? 0

  return (
    <section
      className={
        billing.trialExpired
          ? 'rounded-lg border border-amber-300 bg-amber-50 p-5'
          : 'rounded-lg border border-neutral-200 bg-neutral-50 p-5'
      }
    >
      <p className="text-sm font-medium">
        {billing.trialExpired
          ? 'Your trial has ended'
          : `${billing.trialDaysRemaining} ${billing.trialDaysRemaining === 1 ? 'day' : 'days'} left on your trial`}
      </p>
      <p className="mt-2 text-sm text-neutral-700">
        {answered > 0
          ? `It has answered ${answered.toLocaleString()} ${answered === 1 ? 'question' : 'questions'} for your clients so far. `
          : ''}
        Pick a plan in the customiser below to keep it running — trials don&rsquo;t convert on
        their own.
      </p>
    </section>
  )
}

/** "3h 30m"-style rendering, mirroring the portal report's own format. */
function fmtMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/**
 * The client portal that provisions alongside the widget.
 *
 * Leads with the customer's own last-7-days numbers when there are any —
 * numbers sell, links don't — and falls back to the included-features
 * list before the widget has data. Everything listed is IN the trial;
 * the one named exception, the custom domain, is the paid hook. The
 * button signs them straight in (single-use SSO link) — no invite email
 * to find, no password to set.
 */
function PortalCard({ usage }: { usage: InstallResponse['usage'] }) {
  const included = [
    'Customer satisfaction ratings on every conversation',
    'Turn the assistant on or off per client sub-account',
    'AI analysis of what your clients are actually asking',
    'A weekly email: conversations handled and time saved',
  ]

  const handled = usage?.aiHandledLast7Days ?? 0
  const savedMinutes = usage?.timeSavedMinutesLast7Days ?? 0
  const csat = usage?.csatAverage ?? null

  return (
    <section className={CARD}>
      <h2 className="text-lg font-semibold">Your client portal</h2>

      {handled > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap gap-6">
            <div>
              <p className="text-2xl font-semibold tabular-nums">{handled}</p>
              <p className="text-sm text-neutral-600">
                {handled === 1 ? 'conversation' : 'conversations'} handled this week
              </p>
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums">~{fmtMinutes(savedMinutes)}</p>
              <p className="text-sm text-neutral-600">of support time saved</p>
            </div>
            {csat !== null && (usage?.csatCount ?? 0) > 0 && (
              <div>
                <p className="text-2xl font-semibold tabular-nums">{csat.toFixed(1)}★</p>
                <p className="text-sm text-neutral-600">client satisfaction</p>
              </div>
            )}
          </div>
          <p className="mt-3 text-sm text-neutral-600">
            The full breakdown — satisfaction by conversation, what your clients are asking, and
            per-sub-account controls — is in your portal.
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-neutral-600">
            Set up with your widget, and all of it included in your trial:
          </p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {included.map((line) => (
              <li key={line} className="flex gap-2 text-sm text-neutral-700">
                <span aria-hidden className="text-green-600">✓</span>
                {line}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4">
        <OpenPortalButton />
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        On a paid plan the portal runs on your own domain — white-labelled for your agency.
      </p>
    </section>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold">AI chat widget</h1>
        <p className="mt-1 text-sm text-neutral-600">
          A chat bubble that answers GoHighLevel questions for your clients — on your help centre,
          and anywhere else you want to put it.
        </p>
      </div>
      {children}
    </div>
  )
}
