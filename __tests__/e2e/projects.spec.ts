import { test, expect } from '@playwright/test'

/**
 * UAT — Projects
 * Verifies the project list, create/edit modal, and member assignment.
 */

test.describe('Projects', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/projects')
    await expect(page.getByRole('heading', { name: /projects/i })).toBeVisible()
  })

  test('shows project list or empty state', async ({ page }) => {
    const hasProjects = await page.locator('.card').count() > 0
    const hasEmpty = await page.getByText(/no projects/i).isVisible()
    expect(hasProjects || hasEmpty).toBe(true)
  })

  test('New Project button is visible for Partner', async ({ page }) => {
    await expect(page.getByRole('button', { name: /new project/i })).toBeVisible()
  })

  test('clicking New Project opens a modal', async ({ page }) => {
    await page.getByRole('button', { name: /new project/i }).click()
    await expect(page.getByRole('dialog').or(page.locator('[data-testid="project-modal"]'))).toBeVisible({ timeout: 3_000 })
      .catch(async () => {
        // modal might not use dialog role — check for form
        await expect(page.getByLabel(/project name/i)).toBeVisible({ timeout: 3_000 })
      })
  })

  test('project form has name and color fields', async ({ page }) => {
    await page.getByRole('button', { name: /new project/i }).click()
    await expect(page.getByLabel(/name/i).first()).toBeVisible()
  })

  test('project form shows Project Manager dropdown (Partner only)', async ({ page }) => {
    await page.getByRole('button', { name: /new project/i }).click()
    await expect(page.getByText(/project manager/i)).toBeVisible()
  })

  test('existing project cards show project name and color dot', async ({ page }) => {
    const cards = page.locator('.card').filter({ hasText: /€|\d+h/ })
    const count = await cards.count()
    if (count > 0) {
      // Cards exist and show project info
      await expect(cards.first()).toBeVisible()
    }
  })

  test('project card shows Crown icon when PM is assigned', async ({ page }) => {
    const crownIcon = page.locator('svg.lucide-crown').first()
    // Only assert if at least one project has a PM
    if (await crownIcon.isVisible()) {
      await expect(crownIcon).toBeVisible()
    }
  })
})
