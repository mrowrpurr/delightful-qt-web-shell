# Getting Started

You're an agent who wants to build a desktop app. This template gives you Qt + React + C++ with a bridge between them and five layers of automated testing.

## What You Get

- **React UI** rendered inside a Qt WebEngine window — you write React, the user sees a native desktop app
- **C++ backend** connected to the UI via a type-safe bridge — write `Q_INVOKABLE` methods, call them from TypeScript
- **Five test layers** that actually work — C++ unit, bridge protocol, browser e2e, desktop e2e, native Qt
- **Dev tools** — playwright-cdp (see/click web content via CLI/library), pywinauto (drive native Qt widgets)

## Project Layout

```
├── desktop/                  # Qt desktop app (main.cpp, xmake.lua, resources)
├── web/                      # React app (Vite)
│   └── src/api/bridge.ts     #   TypeScript bridge interfaces
├── lib/
│   ├── todos/                #   Domain logic (pure C++, no Qt)
│   ├── todo-bridge/           #   TodoBridge (QObject wrapper over domain logic)
│   └── web-shell/            #   Framework internals (don't touch)
├── tests/
│   ├── playwright/           #   Browser + desktop e2e tests
│   ├── pywinauto/            #   Native Qt widget tests (Windows)
│   └── helpers/dev-server/   #   Headless C++ backend for dev/test
├── tools/playwright-cdp/      # Playwright + CDP library for seeing web content
└── xmake.lua                 # Root build config (APP_NAME, APP_SLUG, targets)
```

**dev-server** is a headless C++ process that serves your bridges over WebSocket on port 9876 — no Qt window, no GUI. It's what runs during `xmake run dev-server`, Playwright browser tests, and Bun tests. Same bridge code as the desktop app, just without a window.

## Prerequisites

- [xmake](https://xmake.io) — build system
- [Qt 6.x](https://www.qt.io) with modules: WebEngine, WebChannel, WebSockets, Positioning (Positioning is a transitive dependency of QtWebEngine — you won't use it directly)
- [Bun](https://bun.sh) — JS runtime and package manager
- [Node.js](https://nodejs.org) — for Playwright and playwright-cdp (Bun's ws polyfill breaks CDP)

## Make It Yours

Edit the top of `xmake.lua`:

```lua
APP_NAME    = "Your App Name"
APP_SLUG    = "your-app-name"
APP_VERSION = "0.1.0"
```

This flows everywhere: window title, binary name, Windows exe metadata, HTML `<title>`, loading screen. Replace `desktop/resources/icon.ico` and `icon.png` with your own.

## First-Time Setup

```bash
# Point xmake at your Qt installation
xmake f --qt=/path/to/qt   # e.g. C:/Qt/6.10.2/msvc2022_64

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

The first build takes ~30s (Vite + C++ compile). Subsequent builds skip Vite if `web/src/` hasn't changed.

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

### React only (no Qt needed)

```bash
# Terminal 1: C++ backend over WebSocket
xmake run dev-server

# Terminal 2: Vite dev server
xmake run dev-web

# Open http://localhost:5173 in any browser
```

Same React code, same bridge calls — just running in a browser instead of Qt.

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
xmake run test-all   # Catch2 + Bun + Playwright browser (~10s)
```

Note: `test-all` runs the three fast, reliable layers (Catch2 + Bun + browser e2e). Desktop e2e and pywinauto are excluded because they need a built app, take longer, and can be flaky due to GPU/window manager timing. Run those separately when testing native Qt features.

If that's green, everything works. See [Testing](04-testing.md) for the full picture.
