import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // Both specs sign in as the same address via Mailpit; parallel workers
  // would race on the shared mailbox.
  workers: 1,
  use: { baseURL: 'http://localhost:3800' },
  webServer: {
    command: 'pnpm dev --port 3800',
    url: 'http://localhost:3800',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
