# Testing

Four layers, from instant unit tests to native Qt window automation.

## The Layers

```
 Catch2          Bun             Playwright       pywinauto
 (C++ unit)      (bridge proto)  (browser e2e)    (native Qt)
    |               |                |                |
    v               v                v                v
 TodoStore      WS protocol     React + C++      Menus, dialogs,
 (pure C++)     (real backend)  (real backend)   shortcuts, window
```

| Layer | Command | Speed | What it proves |
|-------|---------|-------|----------------|
| C++ unit (Catch2) | `xmake run test-todo-store` | instant | Domain logic works |
| Bridge protocol (Bun) | `xmake run test-bun` | < 1s | Bridge dispatch + type conversion |
| Browser e2e (Playwright) | `xmake run test-browser` | ~5s | UI + backend integration |
| Desktop e2e (Playwright) | `xmake run test-desktop` | ~15s | Same tests in real Qt app |
| Native Qt (pywinauto) | `xmake run test-pywinauto` | ~5s | Menus, dialogs, shortcuts |
| All layers | `xmake run test-all` | ~30s | Catch2 + Bun + browser e2e + pywinauto |

**`test-all` takes over the desktop.** It launches the Qt app and drives it with pywinauto — your human loses mouse/keyboard control for ~30 seconds. **Ask before running it.** If you just need to validate logic and UI, run `test-todo-store`, `test-bun`, and `test-browser` first — they're invisible. Only run `test-all` or `test-pywinauto` when you need to verify native Qt features (menus, dialogs, shortcuts). See [Sharing the Desktop](05-tools.md#sharing-the-desktop-with-your-human).

## Setup (One Time)

```bash
xmake run setup    # all deps: uv sync, bun install, playwright-cdp, playwright chromium
```

## What Changed -> What to Test

| What you changed | What to do |
|---|---|
| Domain logic in `todo_store.hpp` | Add a Catch2 test |
| New bridge method in `todo_bridge.hpp` | Nothing extra — test server uses the real bridge. Bun tests cover dispatch. |
| New request DTO in `todo_dtos.hpp` | It compiles = it works. PFR handles serialization. |
| UI behavior changed | Add a Playwright e2e test |
| New native Qt dialog or menu | Add a pywinauto test in `tests/pywinauto/` |
| Nothing visible changed | You probably don't need a new test |

**WASM testing note:** Domain logic is already tested via Catch2 — it's the same C++ compiled for both targets. The WASM path uses the same bridge class via `WasmBridgeWrapper`, so if Catch2 and browser e2e tests pass, the WASM path works. For manual verification, use `PLAYWRIGHT_URL=http://localhost:5173` with playwright-cdp.

## Something Broke -> Where to Look

| Test that fails | What's wrong |
|---|---|
| **Catch2** | C++ domain logic. Fix `todo_store.hpp`. |
| **Bun** | Bridge dispatch or DTO serialization. Check `todo_bridge.hpp`, `todo_dtos.hpp`, or `bridge.hpp`. |
| **Playwright browser** | UI + backend. Could be React, bridge, or server. |
| **Playwright desktop** | Same as browser, but in Qt. GPU/window issues are common. |
| **pywinauto** | Native Qt — menu, dialog, or keyboard shortcut. |

**Debug bottom-up:** If Catch2 passes but Bun fails -> logic is fine, bridge dispatch is wrong. If Bun passes but e2e fails -> bridge is fine, UI isn't wired up.

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
| DTO compile error | Request struct fields don't match what the bridge method expects. Fix the struct. |

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

**Qt6 modal dialogs block pywinauto's UIA backend.** When a modal dialog
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
        dlg.press_ok()              # PostMessage VK_RETURN -> default button
        time.sleep(0.3)
        assert_that(dlg.is_open).is_false()

def test_save_dialog(app):
    open_modal(app, "File->Save...")
    time.sleep(1)

    with FileDialog("Save File") as dlg:
        assert_that(dlg.is_open).is_true()
        dlg.set_filename("test.json")
        dlg.cancel()                # BM_CLICK on the Cancel button
```

Run: `xmake run start-desktop && xmake run test-pywinauto`

### Bun — bridge dispatch + type conversion

The Bun tests launch the real C++ dev-server and verify bridge methods work end-to-end through the WebSocket protocol. They exercise CRUD operations, error handling, signal data flow, and unknown method errors.

```typescript
test('addList creates a list and returns it', async () => {
  const result = await bridge().addList({ name: 'Groceries' })
  expect(result.name).toBe('Groceries')
  expect(result.id).toBeTruthy()
})
```

Run: `xmake run test-bun`

## Test Files

| File | What it tests |
|------|--------------|
| `lib/todos/tests/unit/todo_store_test.cpp` | TodoStore C++ logic |
| `lib/web-shell/tests/web/bridge_proxy_test.ts` | WS protocol (mock server) |
| `lib/web-shell/tests/web/type_conversion_test.ts` | Bridge dispatch + type conversion (real C++ backend) |
| `tests/playwright/todo-lists.spec.ts` | React UI + backend e2e |
| `tests/pywinauto/test_window.py` | Window visibility, title, size |
| `tests/pywinauto/test_menu_bar.py` | Menu items, About dialog, Export dialog |
| `tests/pywinauto/test_keyboard_shortcuts.py` | Ctrl+E, F12 |
| `tests/pywinauto/test_full_dialog_flow.py` | Full dialog driving: navigate, file types, save |
| `tests/pywinauto/native_dialogs.py` | `FileDialog`, `QtMessageBox`, `open_modal` helpers |
| `tests/pywinauto/win32_helpers.py` | Low-level Win32 API for modal dialog interaction |
