# Tools — Seeing and Driving the App

You're an agent. You can't look at a screen. These tools are your eyes and hands.

## Two Tools, Two Layers

```
 playwright-cdp (CLI)       pywinauto (Python)
 ┌──────────────┐           ┌──────────────┐
 │ Web content  │           │ Native Qt    │
 │ React DOM    │           │ Menus        │
 │ CSS layout   │           │ Dialogs      │
 │ Console logs │           │ Shortcuts    │
 └──────────────┘           └──────────────┘
      ▲                          ▲
      │                          │
  CDP on :9222              UIA automation
  (Chrome DevTools)         (Windows only)
```

| Tool | What it sees | What it drives | When to use |
|------|-------------|----------------|-------------|
| **playwright-cdp** | Web content rendered by React | Click, fill, evaluate JS | Anything inside the web view |
| **pywinauto** | Native Qt widgets | Menus, dialogs, keyboard shortcuts | Anything outside the web view |

**Rule of thumb:** If a human would right-click or use a menu → pywinauto. If they'd click a button in the UI → playwright-cdp.

## playwright-cdp — Your Eyes on the Web Content

A TypeScript library + CLI for driving the app via Playwright. Works with both the Qt desktop app (via CDP) and the WASM browser app (via launched Chromium).

### Connection Modes

| Mode | How | When |
|------|-----|------|
| **Qt desktop** (default) | Connects to CDP on `:9222` | `xmake run start-desktop` first |
| **Browser headless** | `PLAYWRIGHT_URL=http://...` | Agent driving WASM app solo |
| **Browser persistent** | `cli.ts open <url>` / `close` | Human+agent pairing — browser stays open |

### Setup

```bash
xmake run setup            # all deps (one time)

# Desktop mode:
xmake run start-desktop    # launches app, CDP on :9222

# WASM mode:
xmake run dev-wasm         # starts Vite with WASM transport on :5173
```

### Three Ways to Use It

**1. `run.ts` — zero-import scripts (recommended for agents)**

All functions are globals. No imports needed. Reads code from stdin. Auto-disconnects when done.

```bash
# One-liner
echo 'console.log(await snapshot())' | npx tsx tools/playwright-cdp/run.ts

# Multi-step
echo 'await fill("new-list-input", "Groceries"); await click("create-list-button")' | npx tsx tools/playwright-cdp/run.ts
```

**2. Multiline scripts — full TypeScript power**

Loops, variables, conditionals, error handling — a whole program in one command.

```bash
echo '
const tree = await snapshot()
console.log(tree)

await fill("new-list-input", "Groceries")
await click("create-list-button")

// Verify it worked
const updated = await snapshot()
if (updated.includes("Groceries")) {
  console.log("List created!")
} else {
  console.log("Something went wrong")
}
' | npx tsx tools/playwright-cdp/run.ts
```

```bash
echo '
// Loop through and read every visible element
for (const id of ["header", "subtitle", "footer"]) {
  try {
    console.log(id + ": " + await text(id))
  } catch {
    console.log(id + ": not found")
  }
}
' | npx tsx tools/playwright-cdp/run.ts
```

**3. `cli.ts` — simple named commands**

```bash
npx tsx tools/playwright-cdp/cli.ts snapshot
npx tsx tools/playwright-cdp/cli.ts click --test-id new-list-input
npx tsx tools/playwright-cdp/cli.ts fill --test-id new-list-input "Groceries"
npx tsx tools/playwright-cdp/cli.ts eval "document.title"
npx tsx tools/playwright-cdp/cli.ts screenshot debug.png
```

### Available Functions

| Function | What it does |
|----------|-------------|
| `snapshot()` | Returns the accessibility tree (DOM structure with roles, names, values) |
| `screenshot(path?)` | Takes a PNG screenshot, returns the path |
| `click(testId?, { selector? })` | Clicks an element by test ID or CSS selector |
| `fill(testId, value)` | Types text into an input field |
| `press(key, testId?, { selector? })` | Sends a key press (Enter, Tab, etc.) |
| `eval_js(expression)` | Runs JavaScript in the page context, returns the result |
| `text(testId?, { selector? })` | Gets the text content of an element |
| `wait(testId?, timeout?, { selector? })` | Waits for an element to appear |
| `console_messages({ level?, count?, clear? })` | Reads buffered console messages (filtered, counted, or cleared) |
| `reload()` | Reloads the page (picks up new WASM builds) |
| `open(url, { headless? })` | Launches persistent Chromium (survives between commands) |
| `close()` | Closes the persistent browser |
| `disconnect()` | Detaches from CDP (auto-called by run.ts) |

### Workflow Pattern

1. **Orient** — `snapshot()` to see the current DOM state
2. **Act** — `click()`, `fill()`, or `press()` to interact
3. **Verify** — `snapshot()` again or `text()` to confirm the result
4. **Debug** — `console_messages()` if something went wrong, `eval_js()` for deeper inspection

### Tips

- **snapshot is your primary tool** — it's fast, gives you the accessibility tree with test IDs you can target
- **screenshot when snapshot isn't enough** — layout issues, visual bugs, "is this actually rendering?"
- **eval_js for power moves** — read React state, check localStorage, trigger functions
- **console_messages for debugging** — reads the in-page buffer instantly, filter by `level`, limit with `count`, drain with `clear: true`
- **run.ts for quick exploration** — pipe code via stdin, all functions available as globals, no imports, auto-disconnect

### Driving the WASM App

The same functions work against the WASM browser app. Two modes:

**Headless (agent working solo):**
```bash
# Each command launches its own headless browser, runs, exits
PLAYWRIGHT_URL=http://localhost:5173 npx tsx tools/playwright-cdp/cli.ts snapshot

echo '
await fill("new-list-input", "Groceries")
await click("create-list-button")
console.log(await snapshot())
' | PLAYWRIGHT_URL=http://localhost:5173 npx tsx tools/playwright-cdp/run.ts
```

**Persistent browser (pairing with human):**
```bash
# Open a browser that stays open between commands
npx tsx tools/playwright-cdp/cli.ts open http://localhost:5173

# Now run commands against it — same browser, state preserved
PLAYWRIGHT_URL=http://localhost:5173 npx tsx tools/playwright-cdp/cli.ts snapshot
PLAYWRIGHT_URL=http://localhost:5173 npx tsx tools/playwright-cdp/cli.ts fill --test-id new-list-input "Groceries"

# When done
npx tsx tools/playwright-cdp/cli.ts close
```

**After rebuilding WASM:**
```bash
xmake f -p wasm && xmake build wasm-app
# dev-wasm auto-copies artifacts, or manually:
cp build/wasm/wasm32/release/wasm-app.* web/public/
# Then reload the page:
PLAYWRIGHT_URL=http://localhost:5173 npx tsx tools/playwright-cdp/cli.ts reload
```

### ⚠️ Critical: Node, Not Bun

The playwright-cdp tools **must** run under Node.js (`npx tsx`), not Bun. Bun's WebSocket polyfill breaks the CDP connection — it can't handle the HTTP 101 Switching Protocols upgrade. Don't change `npx tsx` to `bun run`.

## pywinauto — Your Hands on Native Qt

Python library that drives Windows UI Automation (UIA) to interact with native Qt widgets — the things React can't see.

### Setup

```bash
pip install pywinauto assertpy
# or
uv pip install pywinauto assertpy
```

The app must be running:
```bash
xmake run start-desktop
```

### Quick Start

```bash
uv run python -c "
from pywinauto import Desktop
from native_dialogs import open_modal, FileDialog, QtMessageBox
import time

d = Desktop(backend='uia')
app = d.window(title='Delightful Qt Web Shell')
app.wait('visible', timeout=5)

# Open the Save dialog and explore it
open_modal(app, 'File->Save...')
time.sleep(1)

with FileDialog('Save File') as dlg:
    print('Folder:', dlg.current_folder)
    print('Types:', dlg.file_types)
    dlg.navigate('C:/Users')
    time.sleep(1)
    print('Now in:', dlg.current_folder)
    dlg.cancel()
"
```

### ⚠️ Critical: Qt6 Modal Dialogs Block UIA

When a Qt6 modal dialog (QMessageBox, QFileDialog) is open, **pywinauto's UIA
backend is completely blocked**. `Desktop.windows()`, `child_window()`, `.click()`
— all hang forever. This is because Qt's modal event loop blocks the UIA COM server.

**Solution:** Use the Win32 API helpers in `tests/pywinauto/native_dialogs.py` and
`tests/pywinauto/win32_helpers.py`. The Win32 API (`EnumWindows`, `SendMessage`,
`PostMessage`) is unaffected by Qt's modal loop.

### Common Patterns

**Open a menu that triggers a modal dialog:**
```python
from native_dialogs import open_modal, QtMessageBox, FileDialog

# open_modal runs menu_select in a thread to avoid blocking
open_modal(app, "Help->About")
time.sleep(0.5)
```

**Drive a QMessageBox (About dialog):**
```python
# QMessageBox has NO Win32 child controls — Qt draws buttons itself.
# Use keyboard: Enter → default button (OK), Escape → cancel.
with QtMessageBox("About") as dlg:
    assert dlg.is_open
    dlg.press_ok()       # PostMessage VK_RETURN
```

**Drive a native file dialog (Save/Open):**
```python
# Native Windows file dialog (#32770) has real Win32 child controls.
with FileDialog("Save File") as dlg:
    dlg.set_filename("my_data.json")    # WM_SETTEXT on Edit
    dlg.navigate("C:/Users/Desktop")    # type path + Enter
    print(dlg.current_folder)           # read from address bar toolbar
    print(dlg.file_types)               # ['JSON Files (*.json)', 'All Files (*)']
    dlg.select_file_type(1)             # switch filter
    dlg.cancel()                        # BM_CLICK on Cancel button
```

**Non-modal interactions (menus, keyboard shortcuts, window props) still use pywinauto:**
```python
app.menu_select("File")     # open menu (non-modal — fine)
app.type_keys("{ESC}")       # close menu
app.set_focus()
app.type_keys("{F12}")       # F12 (DevTools is non-modal — fine)
assert app.is_visible()
```

### Writing pywinauto Tests

Tests live in `tests/pywinauto/`. Use the shared fixtures from `conftest.py`:

```python
# tests/pywinauto/test_my_feature.py
import time
from native_dialogs import FileDialog, open_modal

def test_my_dialog(app):
    open_modal(app, "File->My New Feature")
    time.sleep(1)

    with FileDialog("My Feature") as dlg:
        dlg.set_filename("output.json")
        dlg.save()
```

The `close_dialogs` autouse fixture sends `WM_CLOSE` to known dialog titles after
each test, preventing cascading failures.

Run tests:
```bash
xmake run start-desktop && xmake run test-pywinauto
# or directly:
uv run pytest tests/pywinauto/ -v
```

### Tips

- **Always use `open_modal()` for menu items that open modal dialogs** — `menu_select` blocks forever otherwise
- **Use `threading.Thread(daemon=True)` for keyboard shortcuts that open modals** (e.g., Ctrl+S)
- **Always `set_focus()` before keyboard shortcuts** — the app must be focused
- **Add `time.sleep(0.5-1)` after opening dialogs** — they take a moment to appear
- **`close_dialogs` fixture prevents test pollution** — runs automatically via `autouse=True`
- **`FileDialog` context manager auto-closes** on exit if still open (safety net)

## Prefer Headless Playwright Screenshots Over Desktop Screenshots

Before reaching for the desktop screenshot tool, consider whether **headless Playwright** can do the job. It almost always can — and it's better in every way:

```bash
# Screenshot via playwright-cdp (captures web content only — safe, fast, invisible)
echo 'console.log(await screenshot("debug.png"))' | npx tsx tools/playwright-cdp/run.ts

# Or via WASM/browser headless mode
PLAYWRIGHT_URL=http://localhost:5173 npx tsx tools/playwright-cdp/cli.ts screenshot debug.png
```

Playwright screenshots capture exactly what's in the web view — components, themes, layout — without touching the OS. They're invisible to the human, run on any platform, and never capture anything sensitive.

**Use playwright-cdp screenshots as your default.** They work for:
- Verifying UI renders correctly after a change
- Checking theme application
- Debugging layout issues
- Storybook component verification (via `PLAYWRIGHT_URL=http://localhost:6006`)

## Desktop Screenshots — Last Resort

Desktop screenshots capture the entire monitor — including personal content, other apps, and anything visible on screen. **Ask the human before using this.**

Two important caveats:
1. **The human may have multiple desktops/monitors.** The app might be on monitor 2 while the screenshot captures monitor 1 (the default). You'll see their wallpaper, not the app. Use `--list` to find monitors, or `--all` for a composite.
2. **Privacy.** You're capturing their entire screen. That may include personal messages, browser tabs, or sensitive content. Always ask first: *"I need to see the native Qt chrome — can I take a desktop screenshot?"*

Only use desktop screenshots when you need to see something **outside** the web view: native Qt dialogs, menus, the taskbar, system tray, or OS-level error popups.

### CLI (from any agent)

```bash
uv run python tools/screenshot.py                    # primary monitor → screenshot.png
uv run python tools/screenshot.py --monitor 2        # specific monitor
uv run python tools/screenshot.py --all              # all monitors as one image
uv run python tools/screenshot.py -o debug.png       # custom output path
uv run python tools/screenshot.py --list             # list available monitors
```

The output path is printed to stdout. Read the file to see the image.

### From Python tests (pywinauto)

```python
from screenshot import capture

path = capture()                                     # primary monitor → screenshot.png
path = capture(output="debug.png")                   # custom path
path = capture(monitor_index=2, output="mon2.png")   # specific monitor
path = capture(capture_all=True)                     # all monitors
```

No subprocess needed — `tools/` is on the Python path.

### From Playwright / Bun tests

```typescript
import { execSync } from 'child_process'
execSync('uv run python tools/screenshot.py -o test-results/desktop.png')
```

### Privacy

Disabled in CI by default (screenshots may capture sensitive content). Set
`SCREENSHOTS_ENABLED=1` to enable in CI environments.

## Cross-Layer Testing

Sometimes you need both tools together. Example: test that a React button triggers a native dialog.

```
1. playwright-cdp: click the "Save" button in React
2. pywinauto: verify the native QFileDialog appeared
3. pywinauto: click "Cancel" to close it
4. playwright-cdp: verify the UI shows "Save cancelled"
```

This is the superpower — React can't see native dialogs, pywinauto can't see React DOM. Together they cover everything.

## Platform Notes

| Platform | playwright-cdp | pywinauto | Notes |
|----------|-----|-----------|-------|
| **Windows** | ✅ | ✅ | Full support. Primary dev platform. |
| **macOS** | ✅ | ❌ (use atomacos) | pywinauto is Windows-only. atomacos is the macOS equivalent but less mature. |
| **Linux** | ✅ | ❌ (use dogtail) | dogtail or AT-SPI2 for native widget automation. |

playwright-cdp works everywhere because it talks to the browser engine, not the OS. Native widget testing is platform-specific.

## Sharing the Desktop with Your Human

You share a computer with a human. Be mindful of what takes over their screen.

**What's invisible to the human (safe anytime):**
- playwright-cdp in **headless mode** (`PLAYWRIGHT_URL=...`) — runs in a background browser
- playwright-cdp via **CDP** (`:9222`) — talks to the browser engine, not the OS
- Catch2 and Bun tests — pure backend, no GUI

**What hijacks their desktop (ask first):**
- **pywinauto** — moves their mouse, opens dialogs, presses keys. They can't use their computer.
- **`xmake run test-all`** — includes pywinauto tests, which launch the Qt desktop app and drive it for ~30s. Your human loses control of their desktop during this time.
- **`xmake run test-pywinauto`** / **`xmake run test-desktop`** — same problem
- **playwright-cdp `open`** (persistent headed browser) — opens a visible window but doesn't steal focus or mouse. Less intrusive, but still visible.

**Best practices:**
- **Ask before running `test-all`** — "I need to run the full test suite, which includes desktop tests that'll take over your screen for about 30 seconds. Good time?"
- Prefer **headless browser mode** for WASM work — it's completely invisible
- For desktop tests, consider running non-pywinauto layers first (`test-todo-store`, `test-bun`, `test-browser`) to catch most issues without taking over the desktop
- If the human says "run everything", go ahead — they've given permission
- Work in focused bursts with pywinauto — do your automation, then release
