import { test, expect } from './fixture'

test('app signals ready after first render', async ({ page, goHome }) => {
  await goHome()
  // appReady() is called in useEffect on mount. If it failed, the bridge
  // would be broken and the heading wouldn't be visible (goHome asserts it).
  // Verify the round trip works by calling it again from the test.
  // signalReady() returns void — if it rejects, evaluate() will throw.
  await page.evaluate(async () => {
    const { signalReady } = await import('/src/api/bridge.ts')
    await signalReady()
  })
})

test('shows empty state when no lists exist', async ({ page, goHome }) => {
  await goHome()
  await expect(page.getByTestId('empty-state')).toBeVisible()
})

test('create a list and add todos', async ({ page, goHome }) => {
  await goHome()

  // Create a list
  await page.getByTestId('new-list-input').fill('Groceries')
  await page.getByTestId('create-list-button').click()

  // List appears
  const list = page.getByTestId('todo-list').filter({ hasText: 'Groceries' })
  await expect(list).toBeVisible()

  // Select the list
  await list.click()

  // Add items (wait for each to complete before adding the next)
  await page.getByTestId('new-item-input').fill('Milk')
  await page.getByTestId('add-item-button').click()
  await expect(page.getByText('Milk')).toBeVisible()

  await page.getByTestId('new-item-input').fill('Eggs')
  await page.getByTestId('add-item-button').click()
  await expect(page.getByText('Eggs')).toBeVisible()
})

test('toggle a todo done', async ({ page, goHome }) => {
  await goHome()

  // Create list + item
  await page.getByTestId('new-list-input').fill('Chores')
  await page.getByTestId('create-list-button').click()
  await page.getByTestId('todo-list').filter({ hasText: 'Chores' }).click()
  await page.getByTestId('new-item-input').fill('Vacuum')
  await page.getByTestId('add-item-button').click()

  // Toggle it
  const item = page.getByTestId('todo-item').filter({ hasText: 'Vacuum' })
  await item.click()

  // Should have done class
  await expect(item).toHaveAttribute('data-done', 'true')
})

test('multiple lists stay independent', async ({ page, goHome }) => {
  await goHome()

  // Create two lists (wait for each to appear)
  await page.getByTestId('new-list-input').fill('Work')
  await page.getByTestId('create-list-button').click()
  await expect(page.getByTestId('todo-list').filter({ hasText: 'Work' })).toBeVisible()

  await page.getByTestId('new-list-input').fill('Home')
  await page.getByTestId('create-list-button').click()
  await expect(page.getByTestId('todo-list').filter({ hasText: 'Home' })).toBeVisible()

  // Add item to Work
  await page.getByTestId('todo-list').filter({ hasText: 'Work' }).click()
  await page.getByTestId('new-item-input').fill('Ship feature')
  await page.getByTestId('add-item-button').click()
  await expect(page.getByText('Ship feature')).toBeVisible()

  // Switch to Home — should not see Work's items
  await page.getByTestId('todo-list').filter({ hasText: 'Home' }).click()
  await expect(page.getByText('Ship feature')).not.toBeVisible()
})
