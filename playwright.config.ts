import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'
import path from 'path'

// Load .env.local so TEST_USER_EMAIL / TEST_USER_PASSWORD are available
config({ path: path.resolve(__dirname, '.env.local') })

/**
 * UAT (User Acceptance Tests) — Playwright E2E config
 *
 * Prerequisites before running:
 *   1. Copy .env.local.example → .env.local and fill in Supabase credentials
 *   2. Set TEST_USER_EMAIL / TEST_USER_PASSWORD in .env.local (a real test account)
 *   3. Run `npm run dev` in a separate terminal, or use the webServer option below
 *
 * Run:   npx playwright test
 * UI:    npx playwright test --ui
 * Debug: npx playwright test --debug
 */
export default defineConfig({
  testDir: './__tests__/e2e',
  fullyParallel: false,    // run sequentially so shared DB state is predictable
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // Auth setup runs first and saves session to file
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './__tests__/e2e/.auth/session.json',
      },
      dependencies: ['setup'],
    },
  ],

})
