# Testing

Five test layers, from instant unit tests to native Qt window automation.

## The Layers

```
 Catch2          Bun             Playwright       Playwright       pywinauto
 (C++ unit)      (bridge proto)  (browser e2e)    (desktop e2e)    (native Qt)
    │               │                │                │                │
    ▼               ▼                ▼                ▼                ▼
 TodoStore      WS protocol     React + C++      Same tests →     Menus, dialogs,
 (pure C++)     (mock server)   (real backend)   real Qt app      shortcuts, window
```

| Layer | Command | Speed | What it proves |
|-------|---------|-------|----------------|
| C++ unit (Catch2) | `xmake run test-todo-store` | instant | Domain logic works |
| Bridge protocol (Bun) | `xmake run test-bun` | < 1s | WS protocol + type conversion |
| Browser e2e (Playwright) | `xmake run test-browser` | ~5s | UI + backend integration |
| Desktop e2e (Playwright) | `xmake run test-desktop` | ~15s | Same tests in real Qt app |
| Native Qt (pywinauto) | `xmake run test-pywinauto` | ~5s | Menus, dialogs, shortcuts |
| All fast layers | `xmake run test-all` | ~10s | Catch2 + Bun + browser e2e |
| Bridge validation | `xmake run validate-bridges` | ~3s | TS↔C++ interface match |

`test-all` runs the three fast, reliable layers. Desktop e2e and pywinauto are excluded because they require a built app and can be flaky due to GPU/window manager timing.

## Setup (One Time)

```bash
bun install                              # root deps + patched playwright-core
cd tools/cdp-mcp && npm install && cd -  # MCP server deps
npx playwright install chromium
```

## What Changed → What to Test

| What you changed | What to do |
|---|---|
| Domain logic in `todo_store.hpp` | Add a Catch2 test |
| New bridge method in `bridge.hpp` | Nothing — test server uses the real bridge |
| UI behavior changed | Add a Playwright e2e test |
| New native Qt dialog or menu | Add a pywinauto test in `tests/pywinauto/` |
| Nothing visible changed | You probably don't need a new test |

## Something Broke → Where to Look

| Test that fails | What's wrong |
|---|---|
| **Catch2** | C++ domain logic. Fix `todo_store.hpp`. |
| **Bun** | Bridge protocol or type conversion. Check `expose_as_ws.hpp`. |
| **Playwright browser** | UI + backend. Could be React, bridge, or server. |
| **Playwright desktop** | Same as browser, but in Qt. GPU/window issues are common. |
| **pywinauto** | Native Qt — menu, dialog, or keyboard shortcut. |

**Debug bottom-up:** If Catch2 passes but Bun fails → logic is fine, protocol is wrong. If Bun passes but e2e fails → protocol is fine, UI isn't wired up.

## Common Failures

| Symptom | Likely cause |
|---|---|
| Catch2 won't compile | Syntax error in `todo_store.hpp` or `bridge.hpp` |
| Bun tests timeout | Port 9876 in use? Or dev-server binary not built. |
| E2e won't start | Run `xmake build dev-server` |
| E2e "locator not found" | A `data-testid` changed in React |
| Desktop tests fail | Run `xmake build desktop` first |
| Desktop tests flaky | GPU/window manager — inherently less stable |
| App frozen with spinner | `signalReady()` missing or broken. See `App.tsx`. |

## Adding Tests

### Catch2 — domain logic

```cpp
// lib/todos/tests/unit/todo_store_test.cpp
TEST_CASE("delete_list removes the list and its items") {
    TodoStore store;
    auto list = store.add_list("Groceries");
    store.add_item(list.id, "Milk");

    store.delete_list(list.id);

    REQUIRE(store.list_lists().empty());
    REQUIRE(store.search("Milk").empty());
}
```

### Playwright — UI flows

```typescript
// tests/playwright/todo-lists.spec.ts
test('delete a list', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('new-list-input').fill('Temporary')
  await page.getByTestId('create-list-button').click()
  await expect(page.getByTestId('todo-list').filter({ hasText: 'Temporary' })).toBeVisible()

  await page.getByTestId('delete-list-button').click()
  await expect(page.getByTestId('todo-list').filter({ hasText: 'Temporary' })).not.toBeVisible()
})
```

### pywinauto — native Qt features

```python
# tests/pywinauto/test_menu_bar.py
def test_about_dialog_opens_and_closes(app, desktop, close_dialogs):
    app.menu_select("Help->About")
    time.sleep(0.5)

    dialog = desktop.window(title_re="About.*")
    assert_that(dialog.exists()).is_true()

    dialog.child_window(title="OK", class_name="QPushButton").click()
```

## Test Files

| File | What it tests |
|------|--------------|
| `lib/todos/tests/unit/todo_store_test.cpp` | TodoStore C++ logic |
| `lib/web-shell/tests/web/bridge_proxy_test.ts` | WS protocol (mock server) |
| `lib/web-shell/tests/web/type_conversion_test.ts` | Type conversion (real C++ backend) |
| `tests/playwright/todo-lists.spec.ts` | React UI + backend e2e |
| `tests/pywinauto/test_window.py` | Window visibility, title, size |
| `tests/pywinauto/test_menu_bar.py` | Menu items, About dialog, Export dialog |
| `tests/pywinauto/test_keyboard_shortcuts.py` | Ctrl+E, F12 |
