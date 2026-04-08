# Getting Started

You're an agent who wants to build an app. This template gives you Qt + React + C++ with a bridge between them, five layers of automated testing, and two deployment targets: **desktop** (Qt) and **browser** (WASM).

## What You Get

- **React UI** — one codebase, two targets: native Qt desktop window or standalone browser app
- **C++ backend** connected to the UI via bridges — Qt bridge for desktop, Embind bridge for WASM
- **Shared domain logic** — pure C++ with no framework deps, compiled for both targets
- **Five test layers** that actually work — C++ unit, bridge protocol, browser e2e, desktop e2e, native Qt
- **Dev tools** — playwright-cdp (see/click web content via CLI), pywinauto (drive native Qt widgets)

## Project Layout

```
├── desktop/                  # Qt desktop app
│   └── src/
│       ├── main.cpp          #   Entry point — scheme registration, app, window, show
│       ├── application.*     #   QApplication — identity, theme, profile, bridges, tray
│       ├── windows/
│       │   └── main_window.* #   QMainWindow — wires menus, toolbar, status bar, web view
│       ├── menus/
│       │   └── menu_bar.*    #   Menu bar + toolbar construction
│       ├── widgets/
│       │   ├── web_shell_widget.*  # QWidget wrapping QWebEngineView + bridges + overlay
│       │   ├── loading_overlay.*   # Loading overlay (Full or Spinner mode)
│       │   ├── scheme_handler.*    # app:// URL scheme for embedded resources
│       │   └── status_bar.*       # Status bar (zoom %, status, flash messages)
│       └── dialogs/
│           ├── about_dialog.*     # Custom QDialog example
│           └── web_dialog.*       # React-in-a-dialog (WebShellWidget in a QDialog!)
├── web/                      # React apps (Vite) — shared by desktop + WASM
│   ├── shared/api/           #   Bridge transport + TS interfaces (shared by all apps)
│   │   ├── bridge.ts         #     TypeScript bridge interfaces + transport auto-detect
│   │   ├── system-bridge.ts  #     SystemBridge — desktop capabilities (file I/O, clipboard, etc.)
│   │   └── wasm-transport.ts #     WASM transport (Embind calls wrapped in Promises)
│   ├── apps/
│   │   ├── main/             #   Main app (todo demo + file browser + all bridge demos)
│   │   └── docs/             #   Docs app (architecture guide, runs alongside main)
│   └── package.json          #   Single deps, per-app scripts (build:main, dev:main, etc.)
├── lib/
│   ├── todos/                #   Domain logic (pure C++, no Qt, no Emscripten)
│   ├── bridges/
│   │   ├── qt/               #   Qt bridge — QObjects wrapping domain logic
│   │   └── wasm/             #   WASM bridge — Embind wrapping domain logic
│   └── web-shell/            #   Framework internals (don't touch)
├── wasm/                     # WASM entry point + Emscripten linker config
├── tests/
│   ├── playwright/           #   Browser + desktop e2e tests
│   ├── pywinauto/            #   Native Qt widget tests (Windows)
│   └── helpers/dev-server/   #   Headless C++ backend for dev/test
├── tools/playwright-cdp/     # Playwright CLI for driving web content (desktop + browser)
└── xmake.lua                 # Root build config (APP_NAME, APP_SLUG, APP_ORG, targets)
```

**dev-server** is a headless C++ process that serves your bridges over WebSocket on port 9876 — no Qt window, no GUI. It's what runs during `xmake run dev-server`, Playwright browser tests, and Bun tests. Same bridge code as the desktop app, just without a window.

## Prerequisites

- [xmake](https://xmake.io) — build system
- [Qt 6.x](https://www.qt.io) with modules: WebEngine, WebChannel, WebSockets, Positioning (Positioning is a transitive dependency of QtWebEngine — you won't use it directly)
- [Bun](https://bun.sh) — JS runtime and package manager
- [Node.js](https://nodejs.org) — for Playwright and playwright-cdp (Bun's ws polyfill breaks CDP)
- [Emscripten](https://emscripten.org) — *(optional, WASM target only)* C++ to WebAssembly compiler

## Make It Yours

Edit the top of `xmake.lua`:

```lua
APP_NAME    = "Your App Name"
APP_SLUG    = "your-app-name"
APP_ORG     = "YourOrganization"
APP_VERSION = "0.1.0"
```

This flows everywhere: window title, binary name, Windows exe metadata, HTML `<title>`, loading screen, and platform settings/data directories (`QSettings`, `AppLocalDataLocation`). Replace `desktop/resources/icon.ico` and `icon.png` with your own.

## First-Time Setup

```bash
# Point xmake at your Qt installation
xmake f --qt=/path/to/qt   # e.g. C:/Qt/6.10.2/msvc2022_64

# Windows example:
# xmake f -m release -p windows -a x64 --qt="C:/qt/6.10.2/msvc2022_64" -c -y

# Install all dependencies (uv, bun, playwright-cdp, playwright chromium)
xmake run setup
```

## Build & Run

```bash
# Build the desktop app (builds React via Vite, then C++)
xmake build desktop

# Run it
xmake run desktop
```

Every build runs Vite (~30s) then compiles C++ (~10s). Use `SKIP_VITE=1` below when you're only changing C++.

### Skip Vite (C++ iteration)

When you're only changing C++, skip the entire Vite build with `SKIP_VITE=1`:

```bash
SKIP_VITE=1 xmake build desktop       # ~2s instead of ~40s
SKIP_VITE=1 xmake run desktop         # build + run, no Vite
SKIP_VITE=1 xmake run start-desktop   # background launch, no Vite
```

Requires a previous Vite build — if `web_dist_resources.cpp` doesn't exist, it warns and builds anyway. This skips `bun install`, both Vite builds, qrc generation, and rcc.

## Dev Mode

Two workflows depending on what you're working on:

### React + C++ together (HMR inside Qt)

```bash
# Terminal 1: Vite dev server with hot reload
xmake run dev-web

# Terminal 2: Qt app loading from Vite + CDP on :9222
xmake run dev-desktop
```

Edit React components, save, see changes instantly inside the native Qt window.

**React changes are live. C++ changes require rebuild + restart:** `xmake build desktop && xmake run dev-desktop`. There's no C++ hot reload — plan your workflow accordingly.

### React only (no Qt needed)

```bash
# Terminal 1: C++ backend over WebSocket
xmake run dev-server

# Terminal 2: Vite dev server
xmake run dev-web

# Open http://localhost:5173 in any browser
```

Same React code, same bridge calls — just running in a browser instead of Qt.

### WASM (browser-only, no Qt needed)

```bash
# One-time: build the WASM target
xmake f -p wasm && xmake build wasm-app

# Switch back to desktop config (WASM artifacts persist in build/)
xmake f -p windows --qt=/path/to/qt

# Run the WASM app in browser
xmake run dev-wasm
```

`dev-wasm` copies the WASM build artifacts to `web/public/` and starts Vite with `VITE_TRANSPORT=wasm`. Same React UI, same method names — but the C++ runs as WebAssembly in the browser instead of a Qt backend.

**React HMR works.** C++ changes require `xmake f -p wasm && xmake build wasm-app`, then `reload()` in playwright-cdp or refresh the browser.

**Drive it with playwright-cdp:**
```bash
# Headless (agent solo)
PLAYWRIGHT_URL=http://localhost:5173 npx tsx tools/playwright-cdp/cli.ts snapshot

# Headed (pairing with human — browser stays open between commands)
npx tsx tools/playwright-cdp/cli.ts open http://localhost:5173
PLAYWRIGHT_URL=http://localhost:5173 npx tsx tools/playwright-cdp/cli.ts snapshot
npx tsx tools/playwright-cdp/cli.ts close
```

### Background launch (for automation)

```bash
xmake run start-desktop    # launches app in background, CDP on :9222
xmake run stop-desktop     # kills it
```

Check if it's running:
```bash
curl -s http://localhost:9222/json/version
```

## Quick Test

```bash
xmake run test-all   # Catch2 + Bun + Playwright + pywinauto
```

Runs all layers except desktop e2e (Playwright in Qt). Launches and stops the desktop app automatically for pywinauto tests.

If that's green, everything works. See [Testing](04-testing.md) for the full picture.
