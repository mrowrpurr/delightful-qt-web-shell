# Testing

Five layers of automated testing, from fast unit tests to full Qt smoke tests.

```
xmake run test-all
# Catch2 → Bun → Playwright e2e (sequential)
```

## 1. C++ Unit Tests (Catch2)

Pure domain logic. No Qt, no network, no serialization. Fast.

```cpp
TEST_CASE("toggle_item flips done state") {
    TodoStore store;
    auto list = store.add_list("List");
    auto item = store.add_item(list.id, "Task");
    REQUIRE(item.done == false);

    auto toggled = store.toggle_item(item.id);
    REQUIRE(toggled.done == true);
}
```

```
xmake run test-todo-store
# 33 assertions in 11 test cases
```

## 2. TypeScript Unit Tests (Bun)

Tests the WebSocket Proxy bridge protocol against a mock server. Verifies JSON-RPC message format, argument passing, error handling, event subscriptions, and cleanup.

```typescript
test('sends args for methods with parameters', async () => {
  const received: any[] = []
  const server = startServer((ws, data) => {
    received.push(data)
    ws.send(JSON.stringify({ id: data.id, result: { id: '1', name: 'Test' } }))
  })

  const bridge = createWsBridge<TodoBridge>(`ws://localhost:${server.port}`)
  await bridge.addList('Groceries')

  expect(received[0].method).toBe('addList')
  expect(received[0].args).toEqual(['Groceries'])
})
```

```
xmake run test-bun
# 8 tests, 247ms
```

## 3. End-to-End Tests (Playwright)

Full stack: React UI + real C++ backend over WebSocket. Playwright drives a browser, types into inputs, clicks buttons, asserts on DOM state. The C++ `test-server` runs headless (no GUI).

```typescript
test('create a list and add todos', async ({ page }) => {
  await page.goto('/')

  await page.getByTestId('new-list-input').fill('Groceries')
  await page.getByTestId('create-list-button').click()

  const list = page.getByTestId('todo-list').filter({ hasText: 'Groceries' })
  await expect(list).toBeVisible()

  await list.click()
  await page.getByTestId('new-item-input').fill('Milk')
  await page.getByTestId('add-item-button').click()
  await expect(page.getByText('Milk')).toBeVisible()
})
```

```
xmake run test-e2e
# 4 tests against real C++ backend
```

You can also run against the Bun mock server:

```
BRIDGE_SERVER=bun xmake run test-e2e
```

## 4. CDP Smoke Tests (Playwright + QtWebEngine)

The nuclear option: launches the **real Qt desktop app**, connects to its WebEngine via Chrome DevTools Protocol, and verifies React rendered inside the native window.

QtWebEngine *is* Chromium, so `QTWEBENGINE_REMOTE_DEBUGGING=9222` gives you CDP for free. We use raw CDP instead of Playwright's `connectOverCDP` because QtWebEngine doesn't support `Browser.setDownloadBehavior`.

```typescript
test('Qt app renders the React heading', async () => {
  await launchQtApp()  // spawns the real .exe with CDP enabled

  const wsUrl = await getPageDebugUrl()  // http://localhost:9222/json
  const headingText = await cdpEvaluate(wsUrl,
    `document.querySelector('[data-testid="heading"]')?.textContent || ''`
  )

  expect(headingText.length).toBeGreaterThan(0)
})
```

```
xmake build desktop
xmake run test-smoke
# 2 tests — proves Qt actually renders the React app
```

## What Each Layer Proves

| Layer          | What breaks if this fails                |
| -------------- | ---------------------------------------- |
| Catch2         | Your domain logic is wrong               |
| Bun            | Your bridge protocol is wrong            |
| Playwright e2e | Your UI + backend integration is wrong   |
| CDP smoke      | Qt isn't rendering your React app at all |

The first three are fast and reliable. The smoke tests are slower and can be flaky (GPU, window manager) — run them in CI, don't gate on them locally.

## Setup

Install test dependencies:

```bash
bun install
npx playwright install chromium
```
