# Delightful Qt Web Shell

A template for building desktop, mobile, and web apps with **Qt WebEngine + React** (desktop), **Android WebView + NDK** (mobile), and **Bun HTTP server** (hosted web) — with five layers of automated testing that actually work.

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
xmake run desktop -- --dev
```

The `--dev` flag loads from `http://localhost:5173` instead of embedded resources. Edit a React component, save, see it update instantly inside the native Qt window.

For browser-only development (no Qt at all):

```bash
# Terminal 1: C++ backend over WebSocket
xmake run test-server

# Terminal 2: Vite dev server
cd web && bun run dev

# Open http://localhost:5173 in any browser
```

The React app auto-detects QWebChannel vs WebSocket — same code, both paths.

## Android Build

The Android shell runs the same React app in a native WebView, with TodoStore compiled via NDK/JNI.

### Prerequisites

- [Android Studio](https://developer.android.com/studio) or Android SDK with NDK and CMake
- [Bun](https://bun.sh) (for building the React app)

### Build & Run

```bash
# Build the web assets first
cd web && bun run build && cd ..

# Set your Android SDK path
echo "sdk.dir=/path/to/Android/Sdk" > android/local.properties

# Build the debug APK (also builds web assets automatically via preBuild)
cd android && ./gradlew assembleDebug

# Install on a connected device or emulator
adb install app/build/outputs/apk/debug/app-debug.apk
```

The bridge auto-detects the Android environment — `window.AndroidBridge.invoke()` routes through JNI to the same C++ TodoStore used on desktop.

## Hosted Web

Deploy the React app as a regular website with a Bun HTTP server backend. All connected clients share the same TodoStore — changes in one browser tab appear in all others via SSE.

```bash
# Build the React app
cd web && bun run build && cd ..

# Start the server
bun server/index.ts
# → http://localhost:3000

# Or via xmake
xmake run server
```

The bridge auto-detects the hosted environment — production builds without a native shell use `fetch` + `EventSource` to talk to the API server.

## Testing

Five layers, from fast unit tests to full Qt smoke tests:

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

See [TESTING_GUIDE.md](TESTING_GUIDE.md) for details on each layer, [BRIDGE_GUIDE.md](BRIDGE_GUIDE.md) for a walkthrough of adding features, or [ARCHITECTURE.md](ARCHITECTURE.md) for the big picture.

## Project Structure

```
lib/
  todos/                Pure C++ domain logic (no Qt)
    include/todo_store.hpp
    tests/unit/todo_store_test.cpp    Catch2 unit tests
  web-bridge/           QObject wrapper — Q_INVOKABLE methods
    include/bridge.hpp
  web-shell/            Generic WebSocket adapter (Delightful infrastructure)
    include/expose_as_ws.hpp
    tests/web/bridge_proxy_test.ts    Bun unit tests for the Proxy bridge

desktop/                Qt desktop shell with WebEngine
  src/main.cpp
  resources/

android/                Android shell with WebView + NDK
  app/src/main/
    kotlin/             Kotlin activity + JNI declarations
    cpp/                JNI bridge → TodoStore (pure C++)
    assets/web/         React app (copied from web/dist/ at build time)

server/
  index.ts              Bun HTTP server (static files + REST API + SSE)

cli/
  test-server/          Headless C++ test server
    src/test_server.cpp

web/
  src/api/bridge.ts     TodoBridge interface + WsBridge + QtBridge + AndroidBridge + ApiBridge + auto-detect

tests/
  e2e/                  Playwright end-to-end tests (browser + desktop)
    fixture.ts          Unified test fixture (DESKTOP=1 switches to Qt CDP)
    todo-lists.spec.ts  CRUD, toggle, isolation
  helpers/
    server.ts           Bun WebSocket mock server (per-connection isolation)
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
