import { test, expect } from '@playwright/test'

/**
 * UAT — Analytics (Partner only)
 * Verifies KPI cards, cashflow section, and team utilization chart render.
 */

test.describe('Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/analytics')
    await expect(page.getByRole('heading', { name: /analytics/i })).toBeVisible()
  })

  test('shows 4 core KPI cards', async ({ page }) => {
    await expect(page.getByText(/revenue.*mtd|mtd.*revenue/i).or(page.getByText(/revenue this month/i))).toBeVisible()
    await expect(page.getByText(/pipeline/i)).toBeVisible()
    await expect(page.getByText(/utilization/i)).toBeVisible()
    await expect(page.getByText(/effective rate|avg.*rate/i)).toBeVisible()
  })

  test('shows Cashflow KPI section', async ({ page }) => {
    await expect(page.getByText(/cashflow/i)).toBeVisible()
    await expect(page.getByText(/total billed/i)).toBeVisible()
    await expect(page.getByText(/collected/i)).toBeVisible()
    await expect(page.getByText(/outstanding/i)).toBeVisible()
    await expect(page.getByText(/overdue/i)).toBeVisible()
  })

  test('shows Team Utilization section', async ({ page }) => {
    await expect(page.getByText(/team utilization/i)).toBeVisible()
  })

  test('utilization range selector has expected options', async ({ page }) => {
    const rangeSelect = page.locator('select').filter({ hasText: /this week|this month/i })
    if (await rangeSelect.isVisible()) {
      const opts = await rangeSelect.locator('option').allInnerTexts()
      expect(opts).toContain('This week')
      expect(opts).toContain('This month')
      expect(opts).toContain('Last month')
      expect(opts).toContain('Custom range')
    }
  })

  test('clicking a team member drills into their weekly breakdown', async ({ page }) => {
    const memberRows = page.locator('button').filter({ hasText: /%/ })
    const count = await memberRows.count()
    if (count > 0) {
      await memberRows.first().click()
      // Drill-down shows back button and weekly chart
      await expect(page.getByText(/all members/i)).toBeVisible({ timeout: 5_000 })
    }
  })

  test('custom range inputs appear when Custom is selected', async ({ page }) => {
    const rangeSelect = page.locator('select').filter({ hasText: /this week|this month/i })
    if (await rangeSelect.isVisible()) {
      await rangeSelect.selectOption('custom')
      await expect(page.locator('input[type="date"]').first()).toBeVisible()
    }
  })

  test('revenue trend chart area is rendered', async ({ page }) => {
    // Recharts renders SVG
    await expect(page.locator('svg').first()).toBeVisible()
  })
})
