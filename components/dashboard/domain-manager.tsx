'use client'

import { useActionState } from 'react'
import type { DomainActionState } from '@/app/dashboard/domain/actions'
import type { DnsInstruction } from '@/lib/domains/vercel'

type Action = (prev: DomainActionState | null, formData: FormData) => Promise<DomainActionState>

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Setting up…', tone: 'bg-neutral-100 text-neutral-600' },
  verifying: { label: 'Waiting for DNS', tone: 'bg-amber-100 text-amber-800' },
  active: { label: 'Live', tone: 'bg-emerald-100 text-emerald-800' },
  failed: { label: 'Failed', tone: 'bg-red-100 text-red-700' },
}

export function DomainManager({
  configured,
  domain,
  instructions,
  addAction,
  checkAction,
  removeAction,
}: {
  configured: boolean
  domain: { hostname: string; status: string; verifiedAt: string | null } | null
  instructions: DnsInstruction[]
  addAction: Action
  checkAction: Action
  removeAction: Action
}) {
  const [addState, addFormAction, adding] = useActionState(addAction, null)
  const [checkState, checkFormAction, checking] = useActionState(checkAction, null)
  const [removeState, removeFormAction, removing] = useActionState(removeAction, null)

  if (!configured) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <h1 className="text-xl font-semibold">Your own domain</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Custom domains are not configured on this environment yet.
        </p>
      </div>
    )
  }

  if (!domain) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <h1 className="text-xl font-semibold">Your own domain</h1>
        <p className="mt-2 max-w-xl text-sm text-neutral-600">
          Serve your help centre from an address on your own domain — usually a subdomain like{' '}
          <code className="rounded bg-neutral-100 px-1 font-mono text-[13px]">help.youragency.com</code>.
          You&rsquo;ll need access to your DNS settings to finish.
        </p>
        <form action={addFormAction} className="mt-4 flex flex-wrap items-center gap-2">
          <input
            name="hostname"
            required
            placeholder="help.youragency.com"
            autoComplete="off"
            spellCheck={false}
            className="w-72 rounded-md border border-neutral-300 px-3 py-1.5 font-mono text-sm"
          />
          <button
            type="submit"
            disabled={adding}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add domain'}
          </button>
        </form>
        {addState?.error && <p className="mt-2 text-sm text-red-600">{addState.error}</p>}
      </div>
    )
  }

  const status = STATUS_COPY[domain.status] ?? STATUS_COPY.pending

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">
            <span className="font-mono">{domain.hostname}</span>
          </h1>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.tone}`}>{status.label}</span>
        </div>

        {domain.status === 'active' ? (
          <p className="mt-2 text-sm text-neutral-600">
            Your help centre is serving from this domain
            {domain.verifiedAt ? ` since ${new Date(domain.verifiedAt).toLocaleDateString()}` : ''}.
          </p>
        ) : (
          <>
            <p className="mt-2 max-w-xl text-sm text-neutral-600">
              Create {instructions.length === 1 ? 'this DNS record' : 'these DNS records'} with your
              domain provider, then check again. DNS changes usually apply within minutes but can
              take up to an hour.
            </p>
            {instructions.length > 0 && (
              <table className="mt-3 w-full max-w-xl text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-neutral-400">
                  <tr><th className="py-1 pr-4">Type</th><th className="py-1 pr-4">Name</th><th className="py-1">Value</th></tr>
                </thead>
                <tbody className="font-mono text-[13px]">
                  {instructions.map((i) => (
                    <tr key={`${i.type}-${i.name}-${i.value}`} className="border-t border-neutral-100">
                      <td className="py-1.5 pr-4">{i.type}</td>
                      <td className="py-1.5 pr-4 break-all">{i.name}</td>
                      <td className="py-1.5 break-all">{i.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <form action={checkFormAction} className="mt-4">
              <button
                type="submit"
                disabled={checking}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                {checking ? 'Checking…' : 'Check again'}
              </button>
            </form>
          </>
        )}
        {checkState?.error && <p className="mt-2 text-sm text-red-600">{checkState.error}</p>}
        {checkState?.ok && <p className="mt-2 text-sm text-emerald-700">{checkState.ok}</p>}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="text-sm font-semibold">Remove this domain</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Your help centre goes back to its Growthable address immediately. You can add a different
          domain afterwards.
        </p>
        <form action={removeFormAction} className="mt-3">
          <button
            type="submit"
            disabled={removing}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            {removing ? 'Removing…' : 'Remove domain'}
          </button>
        </form>
        {removeState?.error && <p className="mt-2 text-sm text-red-600">{removeState.error}</p>}
      </div>
    </div>
  )
}
