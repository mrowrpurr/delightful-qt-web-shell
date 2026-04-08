# Tools

Dev tools for debugging and testing your app.

## DevTools (F12)

The web content runs in a Chromium-based engine. Press **F12** or use **Windows > Developer Tools** to open the Chrome DevTools inspector — same as a browser, with console, network, elements, everything.

## pywinauto — Automated Testing of Native Qt

Python library for testing native Windows UI — menus, dialogs, keyboard shortcuts. Useful for verifying that your Qt widgets work correctly without manual clicking.

```bash
xmake run start-desktop              # launch the app
uv run pytest tests/pywinauto/ -v    # run the tests
```

Tests live in `tests/pywinauto/`. They drive the app's menus, open dialogs, and verify window behavior.

**Heads up:** Qt6 modal dialogs (QMessageBox, QFileDialog) block pywinauto's UIA backend. Use the Win32 API helpers in `tests/pywinauto/native_dialogs.py` to work around this.

## Desktop Screenshots

Capture the full screen from a script (useful for CI or debugging native dialogs):

```bash
uv run python tools/screenshot.py                 # primary monitor
uv run python tools/screenshot.py -o debug.png     # custom path
```

> **Note for agent pairing:** If an agent is taking desktop screenshots, be aware it captures your entire primary monitor — not just the app. If the app is on a different monitor, the agent may not see it (use `--monitor 2` or `--all`). For most UI debugging, agents should prefer **playwright-cdp screenshots** (`npx tsx tools/playwright-cdp/cli.ts screenshot`) which capture only web content inside the app — safer and more reliable.

## Platform Support

| Tool | Windows | macOS | Linux |
|------|---------|-------|-------|
| DevTools (F12) | ✅ | ✅ | ✅ |
| pywinauto | ✅ | ❌ | ❌ |
| Screenshots | ✅ | ✅ | ✅ |
