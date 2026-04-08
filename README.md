# Delightful Qt Web Shell

*Made for agents, by agents.* 🏴‍☠️

A template for building apps with **Qt + React** — two deployment targets from one codebase:

- **Desktop** — native Qt window with menus, tabs, system tray, dialogs, file access, drag & drop, URL protocol
- **Browser** — same app compiled to WebAssembly, runs anywhere with no install

Write React for the UI, C++ for the logic. The framework bridges them — zero boilerplate. Same React code, same C++ logic, different transport.

## What's in the Box

- **Tabbed UI** — Ctrl+T new tab, Ctrl+W close, reactive titles from `document.title`
- **Multiple windows** — Ctrl+N, shared bridges, all windows see the same data
- **File access** — native choosers, directory listing, glob search, streaming file handles for large files
- **Drag & drop** — drop files from the OS, React receives the paths
- **CLI args & URL protocol** — register `your-app://`, args forwarded between instances
- **System tray** — close-to-tray, quit from tray menu
- **Live docs** — embedded markdown viewer with doc selector
- **1000+ themes** — shadcn color themes with searchable picker, dark/light toggle, custom wallpapers (Dragon, Tron)
- **Google Fonts** — 1900+ fonts, separate settings for app vs code editor
- **Monaco editor** — with vim mode, themed from app settings, editor transparency
- **shadcn/ui + Tailwind** — production-ready components with Storybook
- **Five test layers** — Catch2, Bun, Playwright (browser + desktop), pywinauto
- **Agent tooling** — playwright-cdp + pywinauto + screenshots for AI agents

## Table of Contents

- [Make It Yours](#make-it-yours)
- [Build & Run](#build--run)
- [Documentation](#documentation)
  - [For Agents](#for-agents)
  - [For Humans](#for-humans)
- [Prerequisites](#prerequisites)
- [Testing](#testing)
- [License](#license)

## Make It Yours

Edit the top of `xmake.lua`:

```lua
APP_NAME    = "Your App Name"
APP_SLUG    = "your-app-name"
APP_ORG     = "YourOrganization"
APP_VERSION = "0.1.0"
```

This flows everywhere: window title, binary name, Windows exe metadata, HTML `<title>`, loading screen, and platform settings/data directories (`QSettings`, `AppLocalDataLocation`). Replace `desktop/resources/icon.ico` and `icon.png` with your own.

## Build & Run

```bash
# Desktop
xmake f --qt=/path/to/qt      # point at your Qt installation (one time)
xmake build desktop            # build React + C++
xmake run desktop              # run the app

# WASM (browser, no Qt needed)
xmake f -p wasm && xmake build wasm-app
xmake f -p windows --qt=/path/to/qt   # switch back to desktop
xmake run dev-wasm                      # serve in browser

# Storybook (component library)
xmake run storybook            # opens on http://localhost:6006
```

## Documentation

### For Agents

You're an AI agent building a desktop app. These docs are written for you — commands to run, patterns to follow, traps to avoid.

| Doc | What it covers |
|-----|---------------|
| [01 — Getting Started](docs/DelightfulQtWebShell/for-agents/01-getting-started.md) | Project layout, prerequisites, build & run, dev mode |
| [02 — Architecture](docs/DelightfulQtWebShell/for-agents/02-architecture.md) | How pieces fit, proxy pattern, type system, return value wrapping |
| [03 — Adding Features](docs/DelightfulQtWebShell/for-agents/03-adding-features.md) | Add a method, add a bridge, signals, xmake setup, full checklist |
| [04 — Testing](docs/DelightfulQtWebShell/for-agents/04-testing.md) | All 5 layers, what to test when, debugging, adding tests |
| [05 — Tools](docs/DelightfulQtWebShell/for-agents/05-tools.md) | playwright-cdp + pywinauto — seeing and driving the app |
| [06 — Gotchas](docs/DelightfulQtWebShell/for-agents/06-gotchas.md) | Quick reference for silent failures and traps |
| [07 — Desktop Capabilities](docs/DelightfulQtWebShell/for-agents/07-desktop-capabilities.md) | SystemBridge API, tabs, windows, tray, menus |
| [08 — Theming](docs/DelightfulQtWebShell/for-agents/08-theming.md) | QSS themes, StyleManager, live reload, Qt↔React sync, theme editor |

Start with **01**, read through **03**, and keep **06** open while you work.

> 💡 **Tip for Humans** 👤
>
> Have your agents read ALL of the docs in `docs/DelightfulQtWebShell/for-agents/`. The agent docs teach them how to build, test, and drive the entire application autonomously — launching it on your desktop, using playwright-cdp to see and interact with the UI, running all five test layers, and live-editing themes. They can dev solo or pair with you, with hot reloading and everything.

### For Humans

You're a developer who wants to understand the template and start building.

| Doc | What it covers |
|-----|---------------|
| [01 — Getting Started](docs/DelightfulQtWebShell/for-humans/01-getting-started.md) | What is this, why Qt+React, setup, project structure |
| [02 — Architecture](docs/DelightfulQtWebShell/for-humans/02-architecture.md) | How the pieces fit together, the proxy pattern, signals |
| [03 — Tutorial](docs/DelightfulQtWebShell/for-humans/03-tutorial.md) | Add your first feature in 5 minutes |
| [04 — Testing](docs/DelightfulQtWebShell/for-humans/04-testing.md) | Five test layers, debugging, adding tests |
| [05 — Tools](docs/DelightfulQtWebShell/for-humans/05-tools.md) | DevTools, pywinauto, screenshots |
| [06 — Gotchas](docs/DelightfulQtWebShell/for-humans/06-gotchas.md) | Silent failures, build traps, port conflicts |
| [07 — Desktop Capabilities](docs/DelightfulQtWebShell/for-humans/07-desktop-capabilities.md) | File access, drag & drop, tabs, tray, menus |
| [08 — Theming](docs/DelightfulQtWebShell/for-humans/08-theming.md) | 1000+ themes, live editor, dark/light, custom themes |

Start with **01**, then jump to **03** to get your hands dirty.

## Prerequisites

- [xmake](https://xmake.io) — build system
- [Qt 6.x](https://www.qt.io) — WebEngine, WebChannel, WebSockets, Positioning
- [Bun](https://bun.sh) — JS runtime
- [Node.js](https://nodejs.org) — for Playwright and playwright-cdp
- **Linux only:** `libnss3-dev`, `libasound2-dev`

## Testing

```bash
xmake run setup                                   # one-time setup
xmake run test-all                                # all layers: Catch2 + Bun + Playwright + pywinauto
```

Five layers: C++ unit (Catch2), bridge protocol (Bun), browser e2e (Playwright), desktop e2e (Playwright + CDP), native Qt (pywinauto). See [testing docs](docs/DelightfulQtWebShell/for-humans/04-testing.md) for details.

## Acknowledgements

- **Themes** — 1000+ color themes from [ui.jln.dev](https://github.com/jln13x/ui.jln.dev) by Julian (MIT License)

## License

Use however, no attribution required.

```
BSD Zero Clause License (SPDX: 0BSD)

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```
