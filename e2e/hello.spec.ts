import { test, expect } from '@playwright/test'

test('page renders the heading', async ({ page }) => {
  await page.goto('/')

  const heading = page.getByTestId('heading')
  await expect(heading).toBeVisible()
  await expect(heading).toHaveText('Delightful Qt Web Shell')
})
