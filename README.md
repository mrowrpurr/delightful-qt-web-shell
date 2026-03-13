# Delightful Qt Web Shell

A template for building desktop apps with **Qt WebEngine + React** — native menus, dialogs, and system integration with a web UI, connected by a zero-boilerplate bridge.

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
APP_VERSION = "0.1.0"
```

This flows everywhere: window title, binary name, Windows exe metadata, HTML `<title>`, loading screen. Replace `desktop/resources/icon.ico` and `icon.png` with your own.

## Build & Run

```bash
xmake f --qt=/path/to/qt      # point at your Qt installation (one time)
xmake build desktop            # build React + C++
xmake run desktop              # run the app
```

## Documentation

### For Agents

You're an AI agent building a desktop app. These docs are written for you — commands to run, patterns to follow, traps to avoid.

| Doc | What it covers |
|-----|---------------|
| [01 — Getting Started](docs/for-agents/01-getting-started.md) | Project layout, prerequisites, build & run, dev mode |
| [02 — Architecture](docs/for-agents/02-architecture.md) | How pieces fit, proxy pattern, type system, return value wrapping |
| [03 — Adding Features](docs/for-agents/03-adding-features.md) | Add a method, add a bridge, signals, xmake setup, full checklist |
| [04 — Testing](docs/for-agents/04-testing.md) | All 5 layers, what to test when, debugging, adding tests |
| [05 — Tools](docs/for-agents/05-tools.md) | playwright-cdp + pywinauto — seeing and driving the app |
| [06 — Gotchas](docs/for-agents/06-gotchas.md) | Quick reference for silent failures and traps |

Start with **01**, read through **03**, and keep **06** open while you work.

### For Humans

You're a developer who wants to understand the template and start building.

| Doc | What it covers |
|-----|---------------|
| [01 — Getting Started](docs/for-humans/01-getting-started.md) | What is this, why Qt+React, setup, project structure |
| [02 — Architecture](docs/for-humans/02-architecture.md) | How the pieces fit together, the proxy pattern, signals |
| [03 — Tutorial](docs/for-humans/03-tutorial.md) | Add your first feature in 5 minutes |
| [04 — Testing](docs/for-humans/04-testing.md) | Five test layers, debugging, adding tests |

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
xmake run test-all                                # Catch2 + Bun + Playwright (~10s)
```

Five layers: C++ unit (Catch2), bridge protocol (Bun), browser e2e (Playwright), desktop e2e (Playwright + CDP), native Qt (pywinauto). See [testing docs](docs/for-humans/04-testing.md) for details.

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
