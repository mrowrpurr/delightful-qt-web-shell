# Delightful Qt Web Shell

A template for building desktop apps with **Qt WebEngine + React** — with four layers of automated testing that actually work.

![Delightful Qt Web Shell](screenshot.png)

## Make It Yours

1. **Change the app name** — edit the top of `xmake.lua`:
   ```lua
   APP_NAME    = "Your App Name"
   APP_SLUG    = "your-app-name"
   ```
   This flows everywhere automatically: window title, binary name, Windows exe metadata, HTML title, React heading.

2. **Replace the icons** — drop your files into:
   - `desktop/resources/icon.ico` (Windows taskbar / exe icon)
   - `desktop/resources/icon.png` (loading screen logo)

3. **Optionally update `package.json`** — the `name` fields in `package.json` and `web/package.json` are npm metadata. Developers typically edit these when starting a new project.

That's it. Build and run.

## Guides

| | |
|---|---|
| **[Tutorial](TUTORIAL.md)** | Add your first feature in 5 minutes |
| **[Testing Guide](TESTING_GUIDE.md)** | Four test layers — what to write, what broke, how to fix it |
| **[Architecture](ARCHITECTURE.md)** | How the pieces fit together |

## Prerequisites

- [xmake](https://xmake.io)
- [Qt 6.x](https://www.qt.io) with these modules installed:
  - **Qt WebEngine** — the Chromium-based web view
  - **Qt WebChannel** — bridge between C++ and JavaScript
  - **Qt WebSockets** — for the test server and dev/test bridge
  - **Qt Positioning** — required by WebEngine at runtime
- [Bun](https://bun.sh)
- [Node.js](https://nodejs.org) (for Playwright)
- **Linux only:** `libnss3-dev` and `libasound2-dev` (Chromium dependencies)

## Build & Run

```bash
# Configure (point to your Qt installation)
xmake f --qt=/path/to/qt  # e.g. C:/Qt/6.10.2/msvc2022_64 or ~/Qt/6.10.2/macos

# Build the desktop app (also builds the React app via Vite)
xmake build desktop

# Run it
xmake run desktop
```

## Dev Mode

For development with hot module replacement:

```bash
# Terminal 1: Vite dev server
cd web && bun run dev

# Terminal 2: Qt desktop pointing at Vite
xmake run desktop --dev
```

The `--dev` flag loads from `http://localhost:5173` instead of embedded resources. Edit a React component, save, see it update instantly inside the native Qt window.

For browser-only development (no Qt at all):

```bash
# Terminal 1: C++ backend
xmake run test-server

# Terminal 2: Vite dev server
cd web && bun run dev

# Open http://localhost:5173 in any browser
```

The React app connects to the C++ backend automatically — same code whether you're in Qt or a browser.

## Testing

Four layers, from fast unit tests to full Qt smoke tests:

| Layer | Command | What it proves |
|-------|---------|----------------|
| C++ unit (Catch2) | `xmake run test-todo-store` | Domain logic is correct |
| TS unit (Bun) | `xmake run test-bun` | Bridge protocol works |
| E2E browser (Playwright) | `xmake run test-browser` | UI + backend integration works |
| E2E desktop (Playwright + CDP) | `xmake run test-desktop` | Same tests against real Qt app |
| All together | `xmake run test-all` | Everything (Catch2 + Bun + browser e2e) |

Install test dependencies first:

```bash
bun install
npx playwright install chromium
```

## Project Structure

```
lib/
  todos/                  Pure C++ domain logic (no Qt)
    include/todo_store.hpp
    tests/unit/             Catch2 unit tests
  web-bridge/             Bridge — exposes C++ to JavaScript
    include/bridge.hpp
  web-shell/              Bridge infrastructure (you won't need to touch this)
    include/expose_as_ws.hpp

desktop/                  Qt desktop shell
  src/main.cpp
  resources/

web/
  src/api/bridge.ts       Your app's bridge interface

tests/
  e2e/                    Playwright end-to-end tests
    todo-lists.spec.ts
  helpers/
    test-server/          Headless C++ test server
```

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
