# Testing Guide

You're an agent working on a Qt + React desktop app. You can **see it, click it, and drive it**. This guide is written for you.

## Your Eyes and Hands

You have two tools that let you interact with the running app:

| Tool | What it gives you | How |
|------|-------------------|-----|
| **cdp-mcp** (Playwright over CDP) | See the web content, click buttons, fill inputs, read text, take screenshots, run JS, read console logs | MCP tools: `snapshot`, `screenshot`, `click`, `fill`, `evaluate`, `console_messages`, etc. |
| **pywinauto** (native Windows UI) | Move/resize/minimize the Qt window, click menu items, interact with native dialogs (file picker, message box), read native controls | `uv run python -c '...'` with `from pywinauto import Desktop` |

**CDP sees inside the web layer. pywinauto sees the native shell from outside.** Together they cover everything a desktop app can do.

This matters for **dev**, not just QA. You can't build a desktop app without seeing it. Take screenshots after changes. Verify your work visually. Don't just trust the tests — look at the thing.

## Launching and Stopping the App

You can launch and stop the desktop app yourself — no human required:

```bash
xmake run start-desktop    # launches app in background with CDP on :9222
xmake run stop-desktop     # kills the background app
```

To check if it's already running:
```bash
curl -s http://localhost:9222/json/version
```

For **dev mode** (Vite HMR — React changes appear instantly):
```bash
# Terminal 1: start Vite dev server
xmake run dev-web &
# Terminal 2: launch app pointing at Vite
xmake run dev-desktop --dev
```

## Look Around

**cdp-mcp** (MCP tools — call these directly):
- `snapshot` — DOM/accessibility tree of the page
- `screenshot` — visual capture of the app
- `evaluate` — run any JS in the page context
- `text_content` — read text from elements by `data-testid` or CSS selector
- `console_messages` — see JS console output (errors, warnings, logs). Use `level: "error"` to filter.

**pywinauto** (via bash):
```python
uv run python -c "
from pywinauto import Desktop
desktop = Desktop(backend='uia')
app = desktop.window(title='Delightful Qt Web Shell', class_name='QMainWindow')
print(app.rectangle())
print(app.is_visible())
"
```

## Interact

**cdp-mcp:**
- `fill` with `testId: "new-list-input"` and `value: "My List"`
- `click` with `testId: "create-list-button"`
- `screenshot` to verify it worked

**pywinauto** (window-level):
```python
uv run python -c "
from pywinauto import Desktop
import ctypes
desktop = Desktop(backend='uia')
app = desktop.window(title='Delightful Qt Web Shell', class_name='QMainWindow')
hwnd = app.wrapper_object().handle
ctypes.windll.user32.MoveWindow(hwnd, 100, 100, 1350, 960, True)
"
```

## When to Use Which Tool

| I want to... | Use |
|---|---|
| Read what's on screen | cdp-mcp `snapshot` or `text_content` |
| Click a React button | cdp-mcp `click` with `testId` |
| Fill a form field | cdp-mcp `fill` |
| Check if a CSS class changed | cdp-mcp `evaluate` |
| See the app visually | cdp-mcp `screenshot` |
| See JS errors/warnings | cdp-mcp `console_messages` with `level: "error"` |
| Move/resize the window | pywinauto |
| Check if the window exists | pywinauto |
| Click a menu item (File, Help, etc.) | pywinauto |
| Interact with a native dialog (file picker, message box) | pywinauto |
| Test window close/minimize/restore behavior | pywinauto |
| Verify the app launched correctly | pywinauto (window exists) + cdp-mcp (content loaded) |

## Debugging

When something goes wrong, check the console first:

```
console_messages  level: "error"
```

If the app looks frozen (spinner forever), the `signalReady()` call in `App.tsx` might be broken. Check with:
```
evaluate  expression: "document.querySelector('.overlay') !== null"
```

If that returns `true`, the loading overlay is still up — React hasn't signaled ready. See the giant warning comment in `App.tsx`.

## Testing Native Qt Features with pywinauto

The app has native Qt features (menu bar, dialogs) alongside the React web content. Testing these requires **pywinauto** because CDP can't see native widgets. Here are the patterns:

### Example 1: Click a menu item

The app has a menu bar: File (Export..., Quit), Windows (Developer Tools), Help (About).

```python
uv run python -c "
from pywinauto import Desktop
desktop = Desktop(backend='uia')
app = desktop.window(title='Delightful Qt Web Shell', class_name='QMainWindow')

# Click Help > About
app.menu_select('Help->About')
"
```

### Example 2: Interact with a QMessageBox

Help > About opens a native QMessageBox. Here's how to find it, read it, and close it:

```python
uv run python -c "
from pywinauto import Desktop
import time

desktop = Desktop(backend='uia')
app = desktop.window(title='Delightful Qt Web Shell', class_name='QMainWindow')

# Open the About dialog
app.menu_select('Help->About')
time.sleep(0.5)

# Find the dialog (it's a child window)
dialog = desktop.window(title_re='About.*')
print('Dialog title:', dialog.window_text())
print('Dialog text:', dialog.child_window(class_name='QLabel').window_text())

# Close it
dialog.child_window(title='OK', class_name='QPushButton').click()
print('Dialog closed.')
"
```

### Example 3: Handle a QFileDialog

File > Export... opens a native file picker. Here's how to interact with it:

```python
uv run python -c "
from pywinauto import Desktop
import time

desktop = Desktop(backend='uia')
app = desktop.window(title='Delightful Qt Web Shell', class_name='QMainWindow')

# Open the Export dialog
app.menu_select('File->Export...')
time.sleep(1)

# Find the file dialog
dialog = desktop.window(title='Export Data')
print('File dialog opened:', dialog.window_text())

# Type a filename and cancel (just testing the dialog opens)
dialog.child_window(title='File name:', control_type='Edit').set_edit_text('test-export.json')
dialog.child_window(title='Cancel').click()
print('File dialog closed.')
"
```

### Example 4: Cross-layer test (React triggers native, verify in both)

The most powerful pattern — trigger something from React, interact with the native dialog via pywinauto, then verify the result back in React:

```python
# Step 1: Use cdp-mcp to click a React button that triggers a native action
#   evaluate  expression: "document.querySelector('[data-testid=export-button]').click()"

# Step 2: Use pywinauto to interact with the native dialog
#   uv run python -c "
#   from pywinauto import Desktop
#   dialog = Desktop(backend='uia').window(title='Export Data')
#   dialog.child_window(title='File name:', control_type='Edit').set_edit_text('data.json')
#   dialog.child_window(title='Save').click()
#   "

# Step 3: Use cdp-mcp to verify React updated
#   text_content  testId: "export-status"
#   → "Exported to data.json"
```

This is the handoff pattern: **cdp-mcp triggers → pywinauto interacts with native → cdp-mcp verifies**.

### Example 5: Test keyboard shortcuts

```python
uv run python -c "
from pywinauto import Desktop
desktop = Desktop(backend='uia')
app = desktop.window(title='Delightful Qt Web Shell', class_name='QMainWindow')

# Focus the window and send Ctrl+E (Export shortcut)
app.set_focus()
app.type_keys('^e')  # ^ = Ctrl

import time
time.sleep(0.5)

# Verify the file dialog opened
dialog = desktop.window(title='Export Data')
print('Ctrl+E opened:', dialog.window_text())
dialog.child_window(title='Cancel').click()
"
```

## Sharing a Desktop with a Human

You are literally moving windows on someone's screen. Be aware of that.

**When the human is actively using the desktop:**
- Prefer cdp-mcp over pywinauto — it's invisible to the user
- Don't move or resize windows without asking
- Don't spam clicks that steal focus
- Take screenshots instead of doing visual assertions in loops
- If you need to do heavy UI interaction, ask: "Mind if I drive the app for a minute?"

**When you have a dedicated machine (or the human said go nuts):**
- Use both tools freely
- Run end-to-end flows: create data via cdp-mcp, verify the window title via pywinauto
- Use pywinauto to test minimize/restore/resize scenarios
- Go wild. That's what the machine is for.

**Rule of thumb:** if the human is sitting at the computer, be a polite copilot. If you have the machine to yourself, be a QA demon.

## Platform Notes

**cdp-mcp works on every platform** — it's just talking to a WebSocket. The native window automation is what varies.

| Platform | Native UI automation | Qt support | Notes |
|----------|---------------------|------------|-------|
| **Windows** | **pywinauto** (UIA backend) | Excellent | The gold standard. Use this. |
| **macOS** | **atomacos** (Apple Accessibility API) | Good | Actively maintained. Accessibility-native. Best open-source option for Mac. |
| **Linux** | **dogtail** (AT-SPI / pyatspi2) | Good | Actively maintained (2025). Explicit Qt support. X11 solid, Wayland improving. |

All three are accessibility-based — they see the app the way a screen reader does, not by pixel coordinates.

For **cross-platform commercial**: Qt's own **Squish** is enterprise-grade and designed specifically for Qt apps. But it's not free.

**Recommendation:** pywinauto on Windows is the most capable. If you're on macOS use atomacos, on Linux use dogtail. Agent-driven dev/QA works best on Windows today, but the gap is closing.

---

## Test Layers

Four automated test layers catch bugs at different levels:

```
Catch2           Bun              Playwright browser      Playwright desktop      pywinauto
  │                │                   │                     │                      │
  ▼                ▼                   ▼                     ▼                      ▼
TodoStore     Bridge Proxy       React + C++ server     Same tests → real Qt    Menus, dialogs,
(pure C++)    (protocol only)    (full integration)     (same assertions)       shortcuts, window

                          cdp-mcp (ad-hoc)           pywinauto (ad-hoc)
                             │                           │
                             ▼                           ▼
                      Web content inside           Native Qt window outside
                      (Playwright over CDP)        (Windows UIA)
```

### What changed → What to test

| What changed | What to do |
|---|---|
| Domain logic in `todo_store.hpp` | Add a Catch2 test |
| New bridge method in `bridge.hpp` | Nothing — the test server uses the real bridge |
| UI behavior changed | Add a Playwright e2e test |
| Added a native Qt dialog or menu action | Add a pywinauto test in `tests/pywinauto/` |
| Nothing visible changed | You probably don't need a new test |

### Something broke → Where to look

| Test that fails | What's wrong |
|---|---|
| **Catch2** (`test-todo-store`) | C++ domain logic. Fix `todo_store.hpp`. |
| **Bun** (`test-bun`) | Bridge protocol — message format, args, events. |
| **Playwright browser** (`test-browser`) | UI + backend integration. Could be React, bridge, or server. |
| **Playwright desktop** (`test-desktop`) | Same tests against the real Qt app. |
| **pywinauto** (`test-pywinauto`) | Native Qt widget issue — menu, dialog, or keyboard shortcut. |

Work from the bottom up: if Catch2 passes but Bun fails, the logic is fine but the protocol is wrong. If Bun passes but e2e fails, the protocol is fine but the UI isn't wired up correctly.

## Running Tests

### Setup (one time)

```bash
bun install                              # root deps + patched playwright-core
cd tools/cdp-mcp && npm install && cd -  # MCP server deps (applies playwright patch)
npx playwright install chromium
```

### Quick reference

| Layer | Command | Speed |
|-------|---------|-------|
| C++ unit (Catch2) | `xmake run test-todo-store` | ~instant |
| TS unit (Bun) | `xmake run test-bun` | < 1s |
| E2E browser (Playwright) | `xmake run test-browser` | ~5s |
| E2E desktop (Playwright) | `xmake build desktop && xmake run test-desktop` | ~15s |
| Native Qt (pywinauto) | `xmake run test-pywinauto` | ~5s |
| All (Catch2 + Bun + browser e2e) | `xmake run test-all` | ~10s |
| Launch app for manual testing | `xmake run start-desktop` | ~5s |
| Stop background app | `xmake run stop-desktop` | instant |

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

**Playwright** starts a backend, launches a browser, runs through UI flows:
```
4 passed
```

**Desktop e2e** runs the same test suite against the real Qt app. It's slower and can be less stable (GPU, window manager). Good for CI, don't gate on it locally.

### Common failures

| Symptom | Likely cause |
|---|---|
| Catch2 won't compile | Syntax errors in `todo_store.hpp` or `bridge.hpp` |
| Bun tests timeout | Something else using port 9876? |
| E2e tests fail to start | Run `xmake build dev-server` |
| E2e "locator not found" | A `data-testid` changed in your React components |
| Desktop tests fail | Run `xmake build desktop` first |
| Desktop tests flaky | GPU/window manager issues — inherently less stable |
| cdp-mcp times out | Is the app running? Is it using Node (`npx tsx`), not Bun? See [known gotcha](#cdp-mcp-must-run-under-node-not-bun). |
| pywinauto "App not found" | App isn't running. `xmake run start-desktop` first. |
| App frozen with spinner | `signalReady()` is missing or broken. See the warning in `App.tsx`. |

## Adding Tests

### Catch2 — domain logic

Test your C++ directly. No mocking, no setup.

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

Drive a real browser against the full stack.

```typescript
// tests/playwright/todo-lists.spec.ts
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

### pywinauto — native Qt features

Test menus, dialogs, keyboard shortcuts, and window behavior. Requires the app to be running (`xmake run start-desktop`).

```python
# tests/pywinauto/test_menu_bar.py
import time
from assertpy import assert_that

def test_about_dialog_opens_and_closes(app, desktop, close_dialogs):
    """Help > About should open a QMessageBox with app info."""
    app.menu_select("Help->About")
    time.sleep(0.5)

    dialog = desktop.window(title_re="About.*")
    assert_that(dialog.exists()).is_true()

    dialog.child_window(title="OK", class_name="QPushButton").click()
```

Run: `xmake run test-pywinauto` (uses `uv run pytest`)

Existing tests live in `tests/pywinauto/`:
- `test_window.py` — visibility, title, size
- `test_menu_bar.py` — menu items, About dialog, Export dialog
- `test_keyboard_shortcuts.py` — Ctrl+E, F12

Shared fixtures in `conftest.py`: `app` (finds the running window), `desktop` (UIA backend), `close_dialogs` (cleanup after each test).

**Note:** pywinauto is also your ad-hoc interaction tool. You don't need formal tests to use it — `uv run python -c '...'` is always available for poking around. See the examples throughout this guide.

## Known Gotchas

### cdp-mcp must run under Node, not Bun

Bun's `ws` polyfill mishandles HTTP 101 (Switching Protocols), causing Playwright's `connectOverCDP` to hang forever. The MCP server runs via `npx tsx` (Node). See `.mcp.json`.

### playwright-core needs a patch for QtWebEngine

QtWebEngine doesn't support `Browser.setDownloadBehavior`. Playwright calls it during context init and crashes. The fix is a one-line `.catch(() => {})` in `crBrowser.js`. The root uses bun's `patchedDependencies`; `tools/cdp-mcp/` has a `postinstall` script that applies the same patch to its own copy.

See `patches/playwright-core@1.58.2.patch`.

### signalReady() must not be removed

The `signalReady()` call in `App.tsx` tells Qt that React has mounted. Without it, the loading overlay stays forever — no error, no crash, just a frozen-looking app with a spinner. There's a giant warning comment above it in the code. If you're refactoring, move it but never delete it.
