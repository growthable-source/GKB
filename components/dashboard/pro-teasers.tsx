/**
 * Pro features, shown locked.
 *
 * Deliberately not links and not buttons: nothing behind these exists yet, and
 * a control that looks clickable and does nothing is worse than one that is
 * plainly disabled. When Pro ships these become real navigation and this
 * component goes away.
 *
 * Rendered only for centres on the free plan, read from help_centers.plan
 * rather than hardcoded — so the day a centre is upgraded, the teasers stop
 * appearing without anyone editing this file.
 */
const FEATURES = [
  {
    title: 'Your own domain',
    body: 'Serve your help centre from help.youragency.com instead of a Growthable address. Your URLs carry across — nothing you publish now gets orphaned.',
  },
  {
    title: 'Invite your team',
    body: 'Give the people who actually answer your clients their own logins, so writing an article is not routed through one inbox.',
  },
]

export function ProTeasers() {
  return (
    <section aria-labelledby="pro-heading">
      <div className="flex items-baseline gap-3">
        <h2 id="pro-heading" className="text-lg font-semibold text-neutral-500">
          Coming soon
        </h2>
        <span className="rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs font-medium text-neutral-700">
          Pro
        </span>
      </div>

      <ul className="mt-3 grid gap-4 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <li
            key={feature.title}
            // No aria-disabled: it is not a supported attribute on a listitem,
            // and the "Coming soon / Pro" heading above already says this to a
            // screen reader.
            className="rounded-lg border border-dashed border-neutral-300 bg-neutral-100/60 p-5"
          >
            <p className="text-sm font-medium text-neutral-500">{feature.title}</p>
            <p className="mt-1.5 text-sm text-neutral-500">{feature.body}</p>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-neutral-500">
        Everything you write now works on Pro too — this is extra, not a rebuild.
      </p>
    </section>
  )
}
