# Testing Guide

Practical guide to writing and running tests. For the big-picture architecture, see [ARCHITECTURE.md](ARCHITECTURE.md).

## I Added a Feature — What Tests Do I Write?

| What changed | Test to add | Layer |
|---|---|---|
| Domain logic in `todo_store.hpp` | Catch2 unit test in `lib/todos/tests/unit/todo_store_test.cpp` | C++ |
| New bridge method in `bridge.hpp` | Add the method to `tests/helpers/server.ts` (the Bun mock). Proxy tests cover the protocol automatically. | Bun |
| UI behavior changed | Playwright e2e test in `tests/e2e/todo-lists.spec.ts` | E2E |
| Nothing visible changed | You probably don't need a new test | — |

Desktop tests (`xmake run test-desktop`) run the exact same tests against the real Qt app via CDP — no separate test files needed.

## Something Broke — Which Test Tells Me Where?

| Test that fails | What's wrong |
|---|---|
| **Catch2** (`test-todo-store`) | Your C++ domain logic is wrong. Fix `todo_store.hpp`. |
| **Bun** (`test-bun`) | The bridge protocol is wrong — message format, args, events. Check `bridge.ts` and `server.ts`. |
| **Playwright browser** (`test-browser`) | UI + backend integration is broken. Could be React, could be the bridge, could be the server. |
| **Playwright desktop** (`test-desktop`) | Same tests fail against the real Qt app. Check that `xmake build desktop` succeeds and the app launches. |

Work from the bottom up: if Catch2 passes but Bun fails, the logic is fine but the protocol is wrong. If Bun passes but e2e fails, the protocol is fine but the UI isn't wired up correctly.

## How Do I Run Tests?

### Setup (one time)

```bash
bun install
npx playwright install chromium
```

### Quick reference

| Layer | Command | Speed |
|-------|---------|-------|
| C++ unit (Catch2) | `xmake run test-todo-store` | ~instant |
| TS unit (Bun) | `xmake run test-bun` | < 1s |
| E2E browser (Playwright) | `xmake run test-browser` | ~5s |
| E2E desktop (Playwright + CDP) | `xmake build desktop && xmake run test-desktop` | ~15s |
| All (Catch2 + Bun + browser e2e) | `xmake run test-all` | ~10s |

### What to expect

**Catch2** prints assertion counts:
```
All tests passed (33 assertions in 11 test cases)
```

**Bun** prints pass/fail per test:
```
✓ sends correct JSON-RPC message for a no-arg method
✓ sends args for methods with parameters
...
8 pass
```

**Playwright e2e** starts a backend server, launches a browser, runs through UI flows:
```
4 passed
```

You can also run e2e against the Bun mock server instead of the C++ server:
```bash
BRIDGE_SERVER=bun xmake run test-browser
```

**Desktop e2e** launches the real Qt desktop app and connects via Chrome DevTools Protocol (using a patched Playwright). Same test suite as browser, just a different runtime. It's slower and can be flaky (GPU, window manager). Good for CI, don't gate on it locally.

### Common failures

| Symptom | Likely cause |
|---|---|
| Catch2 won't compile | Your C++ has syntax errors. Check `todo_store.hpp` / `bridge.hpp`. |
| Bun tests timeout | WebSocket connection failed. Is something else using port 9876? |
| E2e tests fail to start | `test-server` didn't build. Run `xmake build test-server`. |
| E2e "locator not found" | A `data-testid` changed in your React components. |
| Desktop tests fail | Desktop app didn't build. Run `xmake build desktop` first. |
| Desktop tests flaky | GPU/window manager issues. These tests are inherently less stable. |

## How Do I Add a New Test?

### Catch2 — testing domain logic

Add a test case to `lib/todos/tests/unit/todo_store_test.cpp`. Direct C++ — no mocking, no setup:

```cpp
TEST_CASE("delete_list removes the list and its items") {
    TodoStore store;
    auto list = store.add_list("Groceries");
    store.add_item(list.id, "Milk");

    store.delete_list(list.id);

    REQUIRE(store.list_lists().empty());
    REQUIRE(store.search("Milk").empty());
}
```

Run: `xmake run test-todo-store`

### Bun — testing the bridge protocol

Add a test to `lib/web-shell/tests/web/bridge_proxy_test.ts`. Each test spins up its own WebSocket server:

```typescript
test('sends deleteList with the list ID', async () => {
  const received: any[] = []
  const server = startServer((ws, data) => {
    received.push(data)
    ws.send(JSON.stringify({ id: data.id, result: {} }))
  })

  const bridge = createWsBridge<TodoBridge>(`ws://localhost:${server.port}`)
  await bridge.deleteList('list-1')

  expect(received[0].method).toBe('deleteList')
  expect(received[0].args).toEqual(['list-1'])
})
```

Run: `xmake run test-bun`

### Playwright e2e — testing UI flows

Add a test to `tests/e2e/todo-lists.spec.ts`. Drives a real browser against the full stack:

```typescript
test('delete a list', async ({ page }) => {
  await page.goto('/')

  // Create a list first
  await page.getByTestId('new-list-input').fill('Temporary')
  await page.getByTestId('create-list-button').click()
  await expect(page.getByTestId('todo-list').filter({ hasText: 'Temporary' })).toBeVisible()

  // Delete it
  await page.getByTestId('delete-list-button').click()
  await expect(page.getByTestId('todo-list').filter({ hasText: 'Temporary' })).not.toBeVisible()
})
```

Run: `xmake run test-browser`

### Bun mock server — keeping it in sync

When you add a new bridge method, add the corresponding handler to `tests/helpers/server.ts` so e2e tests work against both the C++ server and the Bun mock:

```typescript
deleteList(listId: string) {
  state.lists = state.lists.filter(l => l.id !== listId)
  state.items = state.items.filter(i => i.list_id !== listId)
  return {}
},
```

## Test Architecture at a Glance

```
Catch2           Bun              Playwright browser      Playwright desktop
  │                │                   │                     │
  ▼                ▼                   ▼                     ▼
TodoStore     WsBridge Proxy     React + C++ server     Same tests → real Qt app
(pure C++)    (protocol only)    (full integration)     (via CDP, same assertions)
```

Each layer catches a different class of bug. See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together.
