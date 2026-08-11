import { provisionCustomer } from './actions'

export const metadata = { title: 'Provision a customer — Admin' }

const FIELD =
  'w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none'

/**
 * Staff-only customer setup (the admin layout already gates on a global
 * membership). Prepares the signup, sends the customer the standard branded
 * sign-in email, and optionally comps the Agency AI plan and tags GHL for
 * the human-support workflow.
 */
export default async function ProvisionPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string; error?: string }>
}) {
  const { done, error } = await searchParams

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-lg font-semibold">Provision a customer</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Sets everything up on their behalf. They get the normal sign-in email, and their help
        centre goes live on their first click — no funnel to walk.
      </p>

      {done && (
        <p className="mt-4 rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">
          {done}
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}

      <form
        action={provisionCustomer}
        className="mt-6 flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-5"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Customer email</span>
          <input type="email" name="email" required className={FIELD} placeholder="owner@agency.com" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Full name</span>
          <input type="text" name="fullName" required className={FIELD} placeholder="Alex Smith" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Agency name</span>
          <input type="text" name="agencyName" required className={FIELD} placeholder="Acme Agency" />
          <span className="text-xs text-neutral-500">
            Becomes the help centre name and its address (adjusted if taken).
          </span>
        </label>

        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="agencyPlan" className="mt-0.5" defaultChecked />
          <span>
            <span className="font-medium">Comp the Agency AI plan</span>
            <span className="block text-xs text-neutral-500">
              The AI widget and portal provision as paid — no trial countdown, no upgrade button.
              Skip this for a free help-centre-only setup.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="humanSupport" className="mt-0.5" />
          <span>
            <span className="font-medium">Human support customer</span>
            <span className="block text-xs text-neutral-500">
              Tags the GHL contact “human-support” so the support-team workflow picks them up.
            </span>
          </span>
        </label>

        <button
          type="submit"
          className="mt-1 rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
        >
          Set them up &amp; send the sign-in email
        </button>
      </form>
    </div>
  )
}
