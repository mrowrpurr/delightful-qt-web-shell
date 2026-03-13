# Testing

Five layers, from instant unit tests to native Qt window automation.

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
| All together | `xmake run test-all` | ~10s | Catch2 + Bun + browser e2e |
| Bridge validation | `xmake run validate-bridges` | ~3s | TS↔C++ interface match |

## Setup (One Time)

```bash
xmake run setup    # all deps: uv sync, bun install, playwright-cdp, playwright chromium
```

## What Changed → What to Test

| What you changed | What to do |
|---|---|
| Domain logic in `todo_store.hpp` | Add a Catch2 test |
| New bridge method in `todo_bridge.hpp` | Nothing — test server uses the real bridge |
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
| Catch2 won't compile | Syntax error in `todo_store.hpp` or `todo_bridge.hpp` |
| Bun tests timeout | Port 9876 in use? Or dev-server binary not built. |
| E2e won't start | Run `xmake build dev-server` |
| E2e "locator not found" | A `data-testid` changed in React |
| Desktop tests fail | Run `xmake build desktop` first |
| Desktop tests flaky | GPU/window manager — inherently less stable |
| App frozen with spinner | `signalReady()` missing or broken. See `App.tsx`. |

## Adding Tests

### Catch2 — domain logic

Test pure C++ directly. No mocking, no setup.

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

Run: `xmake run test-todo-store`

### Playwright — UI flows

Drive a real browser against the full stack (React + C++ backend).

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

Run: `xmake run test-browser`

### pywinauto — native Qt features

Test menus, dialogs, keyboard shortcuts. Requires the app to be running.

**⚠️ Qt6 modal dialogs block pywinauto's UIA backend.** When a modal dialog
(QMessageBox, QFileDialog) is open, `Desktop.windows()`, `child_window()`, and
`.click()` all hang forever. Use the Win32 API helpers in `native_dialogs.py`:

```python
# tests/pywinauto/test_menu_bar.py
from native_dialogs import QtMessageBox, FileDialog, open_modal

def test_about_dialog_opens_and_closes(app):
    open_modal(app, "Help->About")  # runs menu_select in a thread
    time.sleep(0.5)

    with QtMessageBox("About") as dlg:
        assert_that(dlg.is_open).is_true()
        dlg.press_ok()              # PostMessage VK_RETURN → default button
        time.sleep(0.3)
        assert_that(dlg.is_open).is_false()

def test_export_dialog(app):
    open_modal(app, "File->Export...")
    time.sleep(1)

    with FileDialog("Export Data") as dlg:
        assert_that(dlg.is_open).is_true()
        dlg.set_filename("test.json")
        dlg.cancel()                # BM_CLICK on the Cancel button
```

Run: `xmake run start-desktop && xmake run test-pywinauto`

### Bun — bridge protocol + type conversion

The `bridge_proxy_test.ts` tests use a mock WS server to verify the protocol. The `type_conversion_test.ts` tests launch the real C++ dev-server and verify every param/return type combination works through the actual `invoke_bridge_method` code.

```typescript
test('passes mixed types: string + int + bool', async () => {
  const result = await bridge().multiParams('hello', 42, true)
  expect(result).toEqual({ string: 'hello', int: 42, bool: true })
})
```

Run: `xmake run test-bun`

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
| `tests/pywinauto/test_full_dialog_flow.py` | Full dialog driving: navigate, file types, save |
| `tests/pywinauto/native_dialogs.py` | `FileDialog`, `QtMessageBox`, `open_modal` helpers |
| `tests/pywinauto/win32_helpers.py` | Low-level Win32 API for modal dialog interaction |
