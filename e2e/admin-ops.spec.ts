import { expect, test } from '@playwright/test'

// Read-only: does not create or mutate data, so unlike publish-and-read.spec.ts
// it's safe to run without a fresh db:reset.
const MAIL_API = 'http://127.0.0.1:54724/api/v1'
const EMAIL = 'owner@example.com'

async function mailApi(path: string) {
  const res = await fetch(`${MAIL_API}${path}`)
  if (!res.ok) throw new Error(`Mailpit request failed (${res.status}) — is supabase running on 54724?`)
  return res.json()
}

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/login')
  await page.getByPlaceholder('you@company.com').fill(EMAIL)
  await page.getByRole('button', { name: /email me a link/i }).click()
  await expect(page.getByText(/check your email/i)).toBeVisible()

  const { messages } = await mailApi('/messages')
  const latest = messages
    .filter((m: { To: { Address: string }[] }) => m.To.some((to) => to.Address === EMAIL))
    .sort((a: { Created: string }, b: { Created: string }) => (a.Created < b.Created ? 1 : -1))[0]
  expect(latest, 'magic link email received').toBeTruthy()
  const message = await mailApi(`/message/${latest.ID}`)

  const link = /href="([^"]*\/auth\/confirm[^"]*)"/.exec(message.HTML)?.[1]
  expect(link, 'magic link in email').toBeTruthy()

  // The email links to Supabase's configured site_url, which may not be the e2e port — navigate by path so it resolves against baseURL.
  const url = new URL(link!.replace(/&amp;/g, '&'))
  await page.goto(url.pathname + url.search)
}

test('content ops page shows the empty state when no snapshots exist', async ({ page }) => {
  await signIn(page)

  await page.goto('/admin/ops')
  await expect(page.getByRole('heading', { name: 'Content Ops' })).toBeVisible()
  await expect(page.getByText(/no ops data yet/i)).toBeVisible()
})
