# Testing Guide

You're an agent working on a Qt + React desktop app. You can **see it, click it, and drive it**. This guide is written for you.

## Your Eyes and Hands

You have two tools that let you interact with the running app:

| Tool | What it gives you | How |
|------|-------------------|-----|
| **cdp-mcp** (Playwright over CDP) | See the web content, click buttons, fill inputs, read text, take screenshots, run JS | MCP tools: `snapshot`, `screenshot`, `click`, `fill`, `evaluate`, etc. |
| **pywinauto** (native Windows UI) | Move/resize/minimize the Qt window, read native controls, interact with OS-level UI | `uv run python -c '...'` with `from pywinauto import Desktop` |

**CDP sees inside the web layer. pywinauto sees the native shell from outside.** Together they cover everything a desktop app can do.

This matters for **dev**, not just QA. You can't build a desktop app without seeing it. Take screenshots after changes. Verify your work visually. Don't just trust the tests — look at the thing.

## Getting Started

### Is the app running?

```bash
curl -s http://localhost:9222/json/version
```

If that returns JSON, CDP is live. If not, the human needs to run `xmake run dev-desktop`.

### Look around

**cdp-mcp** (MCP tools — call these directly):
- `snapshot` — DOM/accessibility tree of the page
- `screenshot` — visual capture of the app
- `evaluate` — run any JS in the page context
- `text_content` — read text from elements by `data-testid` or CSS selector

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

### Interact

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
| Move/resize the window | pywinauto |
| Check if the window exists | pywinauto |
| Test native Qt dialogs (file picker, message box) | pywinauto |
| Test window close/minimize/restore behavior | pywinauto |
| Verify the app launched correctly | pywinauto (window exists) + cdp-mcp (content loaded) |

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
Catch2           Bun              Playwright browser      Playwright desktop
  │                │                   │                     │
  ▼                ▼                   ▼                     ▼
TodoStore     Bridge Proxy       React + C++ server     Same tests → real Qt app
(pure C++)    (protocol only)    (full integration)     (same assertions)

                          cdp-mcp                pywinauto
                             │                      │
                             ▼                      ▼
                      Web content inside      Native Qt window outside
                      (Playwright over CDP)   (Windows UIA)
```

### What changed → What to test

| What changed | What to do |
|---|---|
| Domain logic in `todo_store.hpp` | Add a Catch2 test |
| New bridge method in `bridge.hpp` | Nothing — the test server uses the real bridge |
| UI behavior changed | Add a Playwright e2e test |
| Nothing visible changed | You probably don't need a new test |

### Something broke → Where to look

| Test that fails | What's wrong |
|---|---|
| **Catch2** (`test-todo-store`) | C++ domain logic. Fix `todo_store.hpp`. |
| **Bun** (`test-bun`) | Bridge protocol — message format, args, events. |
| **Playwright browser** (`test-browser`) | UI + backend integration. Could be React, bridge, or server. |
| **Playwright desktop** (`test-desktop`) | Same tests against the real Qt app. |

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
// tests/e2e/todo-lists.spec.ts
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

## Known Gotchas

### cdp-mcp must run under Node, not Bun

Bun's `ws` polyfill mishandles HTTP 101 (Switching Protocols), causing Playwright's `connectOverCDP` to hang forever. The MCP server runs via `npx tsx` (Node). See `.mcp.json`.

### playwright-core needs a patch for QtWebEngine

QtWebEngine doesn't support `Browser.setDownloadBehavior`. Playwright calls it during context init and crashes. The fix is a one-line `.catch(() => {})` in `crBrowser.js`. The root uses bun's `patchedDependencies`; `tools/cdp-mcp/` has a `postinstall` script that applies the same patch to its own copy.

See `patches/playwright-core@1.58.2.patch`.
