# Tools — Seeing and Driving the App

You're an agent. You can't look at a screen. These tools are your eyes and hands.

## Two Tools, Two Layers

```
 cdp-mcp (MCP)              pywinauto (Python)
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
| **cdp-mcp** | Web content rendered by React | Click, fill, evaluate JS | Anything inside the web view |
| **pywinauto** | Native Qt widgets | Menus, dialogs, keyboard shortcuts | Anything outside the web view |

**Rule of thumb:** If a human would right-click or use a menu → pywinauto. If they'd click a button in the UI → cdp-mcp.

## cdp-mcp — Your Eyes on the Web Content

An MCP server that connects to the Qt app's Chrome DevTools Protocol endpoint.

### Setup

The app must be running with CDP enabled:

```bash
xmake run start-desktop    # launches app, CDP on :9222
```

Verify CDP is up:
```bash
curl -s http://localhost:9222/json/version
```

### Available MCP Tools

| Tool | What it does |
|------|-------------|
| `snapshot` | Returns the accessibility tree (DOM structure with roles, names, values) |
| `screenshot` | Takes a PNG screenshot of the page |
| `click` | Clicks an element by accessibility snapshot ref |
| `fill` | Types text into an input field |
| `press` | Sends a key press (Enter, Tab, etc.) |
| `evaluate` | Runs arbitrary JavaScript in the page context |
| `text_content` | Gets the text content of the page |
| `wait_for` | Waits for text to appear on the page |
| `console_messages` | Returns recent console.log output |

### Workflow Pattern

1. **Orient** — take a `snapshot` to see the current DOM state
2. **Act** — `click`, `fill`, or `press` to interact
3. **Verify** — `snapshot` again or `text_content` to confirm the result
4. **Debug** — `console_messages` if something went wrong, `evaluate` for deeper inspection

### Example: Add a Todo Item

```
→ snapshot()                          # see the current UI state
→ click(ref: 5)                       # click the input field (ref from snapshot)
→ fill(ref: 5, value: "Buy milk")     # type into it
→ click(ref: 7)                       # click the "Add" button
→ snapshot()                          # verify the item appeared
```

### Tips

- **snapshot is your primary tool** — it's fast, gives you the accessibility tree with refs you can click
- **screenshot when snapshot isn't enough** — layout issues, visual bugs, "is this actually rendering?"
- **evaluate for power moves** — read React state, check localStorage, trigger functions
- **console_messages for debugging** — bridge errors, WebSocket issues, JS exceptions all show up here

### ⚠️ Critical: Node, Not Bun

cdp-mcp **must** run under Node.js (`npx tsx`), not Bun. Bun's WebSocket polyfill breaks the CDP connection — it can't handle the HTTP 101 Switching Protocols upgrade. The `.mcp.json` config already uses `npx tsx`. Don't change it to `bun run`.

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

```python
from pywinauto import Desktop

desktop = Desktop(backend="uia")
app = desktop.window(title="Delightful Qt Web Shell", class_name="QMainWindow")
app.wait("visible", timeout=5)
```

### Common Patterns

**Open a menu:**
```python
app.menu_select("File->Export Data")
```

**Find and interact with a dialog:**
```python
import time
app.menu_select("Help->About")
time.sleep(0.5)

dialog = desktop.window(title_re="About.*")
assert dialog.exists()

# Click OK to close
dialog.child_window(title="OK", class_name="QPushButton").click()
```

**Keyboard shortcuts:**
```python
app.set_focus()
app.type_keys("^e")      # Ctrl+E
app.type_keys("{F12}")    # F12
```

**Check window properties:**
```python
assert app.is_visible()
assert "Web Shell" in app.window_text()

rect = app.rectangle()
assert rect.width() >= 800
assert rect.height() >= 600
```

### Writing pywinauto Tests

Tests live in `tests/pywinauto/`. Use the shared fixtures from `conftest.py`:

```python
# tests/pywinauto/test_my_feature.py
import time

def test_my_dialog(app, desktop, close_dialogs):
    app.menu_select("File->My New Feature")
    time.sleep(0.5)

    dialog = desktop.window(title_re="My Feature.*")
    assert dialog.exists()

    # Do something with the dialog...
    dialog.child_window(title="Save", class_name="QPushButton").click()
```

The `close_dialogs` fixture auto-closes known dialogs after each test, preventing cascading failures.

Run tests:
```bash
xmake run start-desktop && xmake run test-pywinauto
# or directly:
uv run pytest tests/pywinauto/ -v
```

### Tips

- **Always `set_focus()` before keyboard shortcuts** — the app must be focused
- **Add `time.sleep(0.5)` after menu selections** — dialogs take a moment to appear
- **Use `class_name="QPushButton"` or `class_name="QMainWindow"`** — Qt widget class names help pywinauto find the right element
- **Use `title_re` for regex matching** — dialog titles may include version numbers or variable text
- **`close_dialogs` fixture prevents test pollution** — always include it

## Cross-Layer Testing

Sometimes you need both tools together. Example: test that a React button triggers a native dialog.

```
1. cdp-mcp: click the "Export" button in React
2. pywinauto: verify the native QFileDialog appeared
3. pywinauto: click "Cancel" to close it
4. cdp-mcp: verify the UI shows "Export cancelled"
```

This is the superpower — React can't see native dialogs, pywinauto can't see React DOM. Together they cover everything.

## Platform Notes

| Platform | cdp-mcp | pywinauto | Notes |
|----------|---------|-----------|-------|
| **Windows** | ✅ | ✅ | Full support. Primary dev platform. |
| **macOS** | ✅ | ❌ (use atomacos) | pywinauto is Windows-only. atomacos is the macOS equivalent but less mature. |
| **Linux** | ✅ | ❌ (use dogtail) | dogtail or AT-SPI2 for native widget automation. |

cdp-mcp works everywhere because it talks to the browser engine, not the OS. Native widget testing is platform-specific.

## Sharing the Desktop with Your Human

If you're driving the app with pywinauto, **your human can't use their desktop** — you're moving their mouse, opening dialogs, pressing keys. Coordinate:

- Ask before taking over the desktop
- Work in focused bursts — do your automation, then release
- Consider running on a separate machine or VM for long automation sessions
- cdp-mcp doesn't have this problem — it works through CDP, invisible to the human
