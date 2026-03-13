# Getting Started

## What Is This?

A template for building **native desktop apps** with a web UI. You write your interface in React, your backend logic in C++, and the framework bridges them together inside a Qt window.

The user sees a native desktop app. You see React + C++.

## Why Qt + React?

- **Qt** gives you native menus, dialogs, system tray, keyboard shortcuts, window management, and cross-platform deployment
- **React** gives you the entire web ecosystem for UI — components, styling, tooling, hot reload
- **The bridge** makes them feel like one thing — call C++ from TypeScript, push events from C++ to React

You don't need to learn QML or Qt Widgets for UI. You don't need Electron's memory overhead. Write React, ship native.

## Prerequisites

- [xmake](https://xmake.io) — C++ build system
- [Qt 6.x](https://www.qt.io) with these modules:
  - **Qt WebEngine** — Chromium-based web view
  - **Qt WebChannel** — bridge between C++ and JavaScript
  - **Qt WebSockets** — for the dev server and test infrastructure
  - **Qt Positioning** — required by WebEngine at runtime (transitive dependency)
- [Bun](https://bun.sh) — JS runtime and package manager
- [Node.js](https://nodejs.org) — for Playwright tests and playwright-cdp
- **Linux only:** `libnss3-dev` and `libasound2-dev` (Chromium dependencies)

## Make It Yours

Edit the top of `xmake.lua`:

```lua
APP_NAME    = "Your App Name"
APP_SLUG    = "your-app-name"
APP_VERSION = "0.1.0"
```

This propagates everywhere automatically: window title, binary name, Windows exe metadata, HTML `<title>`, loading screen text. Replace `desktop/resources/icon.ico` and `icon.png` with your own icons.

## Build & Run

```bash
# Point xmake at your Qt installation (one time)
xmake f --qt=/path/to/qt   # e.g. C:/Qt/6.10.2/msvc2022_64

# Build the desktop app (builds React via Vite, then C++)
xmake build desktop

# Run it
xmake run desktop
```

The first build takes ~30 seconds (Vite + C++ compile). Subsequent builds skip Vite if `web/src/` hasn't changed.

## Dev Mode

### React + C++ together (HMR inside Qt)

```bash
# Terminal 1: Vite dev server with hot reload
xmake run dev-web

# Terminal 2: Qt app loading from Vite + CDP debugging on :9222
xmake run dev-desktop
```

Edit a React component, save, see changes instantly inside the native Qt window.

### React only (no Qt needed)

```bash
# Terminal 1: C++ backend over WebSocket
xmake run dev-server

# Terminal 2: Vite dev server
xmake run dev-web

# Open http://localhost:5173 in any browser
```

The dev-server is a headless C++ process that serves your bridges over WebSocket — same bridge code as the desktop app, just without a window. Useful for rapid UI iteration without rebuilding Qt.

## Project Structure

```
├── desktop/                  # Qt desktop app (main.cpp, xmake.lua, resources)
├── web/                      # React app (Vite)
│   └── src/api/bridge.ts     #   TypeScript bridge interfaces
├── lib/
│   ├── todos/                #   Domain logic (pure C++, no Qt)
│   ├── bridges/               #   Bridge QObjects (wrappers over domain logic)
│   └── web-shell/            #   Framework internals (you won't touch this)
├── tests/
│   ├── playwright/           #   Browser + desktop e2e tests
│   ├── pywinauto/            #   Native Qt widget tests (Windows)
│   └── helpers/dev-server/   #   Headless C++ backend for dev/test
├── tools/playwright-cdp/      # Playwright + CDP library for agent tooling
└── xmake.lua                 # Root build config (APP_NAME, targets)
```

## Quick Test

```bash
xmake run setup               # install all dependencies
xmake run test-all            # all layers: Catch2 + Bun + Playwright + pywinauto
```

If that's green, everything works.

## Next Steps

- [Architecture](02-architecture.md) — how the pieces fit together
- [Tutorial](03-tutorial.md) — add your first feature in 5 minutes
- [Testing](04-testing.md) — five test layers and how to use them
