/**
 * The hero call to action.
 *
 * A plain GET form, deliberately: it carries the address to /get/details as a
 * query param and writes nothing. One screen owns the creation of the signup
 * row, and this is not it — so this form works with JavaScript disabled and
 * cannot half-start a funnel.
 */
export function StartForm() {
  return (
    <form action="/get/details" method="get" className="flex w-full max-w-md flex-col gap-3">
      <div className="flex flex-wrap gap-2.5">
        <label htmlFor="start-email" className="sr-only">
          Work email
        </label>
        <input
          id="start-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@youragency.com"
          className="min-w-0 flex-1 rounded-lg border border-[color:var(--mk-rule-strong)] bg-[color:var(--mk-surface)] px-3.5 py-3 text-[color:var(--mk-ink)] placeholder:text-[color:var(--mk-ink-faint)] focus:outline-2 focus:outline-offset-1 focus:outline-[color:var(--mk-accent)]"
        />
        <button
          type="submit"
          className="cursor-pointer rounded-lg bg-[color:var(--mk-accent)] px-5 py-3 font-medium text-[color:var(--mk-on-accent)] transition-colors hover:bg-[color:var(--mk-accent-hover)]"
        >
          Claim your help centre
        </button>
      </div>
      <p className="text-xs text-[color:var(--mk-ink-faint)]">
        Work email only. Free — you answer five questions about your agency and join the Growthable
        mailing list.
      </p>
    </form>
  )
}
