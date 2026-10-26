import { beforeEach, describe, expect, it, vi } from 'vitest'

const maybeSingle = vi.fn()
vi.mock('@/lib/db/client', () => ({
  serviceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle,
          }),
        }),
      }),
    }),
  }),
}))

import { shouldDetachHostname } from './lifecycle'

beforeEach(() => {
  maybeSingle.mockReset()
})

describe('shouldDetachHostname', () => {
  it('never detaches a pending or failed row', async () => {
    await expect(shouldDetachHostname('help.acme.com', 'c1', 'pending')).resolves.toBe(false)
    await expect(shouldDetachHostname('help.acme.com', 'c1', 'failed')).resolves.toBe(false)
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it('detaches verifying when nobody is live yet', async () => {
    maybeSingle.mockResolvedValue({ data: null })
    await expect(shouldDetachHostname('help.acme.com', 'c1', 'verifying')).resolves.toBe(true)
  })

  it('does not detach when another centre is already live', async () => {
    maybeSingle.mockResolvedValue({ data: { help_center_id: 'winner' } })
    await expect(shouldDetachHostname('help.acme.com', 'loser', 'verifying')).resolves.toBe(false)
    await expect(shouldDetachHostname('help.acme.com', 'loser', 'active')).resolves.toBe(false)
  })

  it('detaches the live holder', async () => {
    maybeSingle.mockResolvedValue({ data: { help_center_id: 'c1' } })
    await expect(shouldDetachHostname('help.acme.com', 'c1', 'active')).resolves.toBe(true)
  })
})
