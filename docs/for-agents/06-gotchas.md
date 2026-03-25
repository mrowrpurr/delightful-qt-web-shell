# Gotchas — Quick Reference

This is a concise index of traps. Details live in the doc where you're doing the work — this page is for scanning when something breaks.

## Silent Failures (the scary ones)

| What you forgot | What happens | Where it's explained |
|---|---|---|
| Register bridge in `application.cpp` and `test_server.cpp` | Bridge silently doesn't exist | [03-adding-features.md](03-adding-features.md) |
| Return `QJsonObject` but got `{value: ...}` | You returned a scalar (`QString`, `int`) — scalars get wrapped | [03-adding-features.md](03-adding-features.md) |
| Remove `signalReady()` from `App.tsx` | App hangs with spinner forever, error after 15s | [02-architecture.md, signalReady](02-architecture.md) |
| Use Bun instead of Node for playwright-cdp | `connectOverCDP` hangs forever — no error, no timeout | [05-tools.md, Critical: Node Not Bun](05-tools.md) |
| Open modal dialog synchronously from bridge call | JS hangs — bridge response blocked by modal event loop | [02-architecture.md, Hash Routing](02-architecture.md) |
| Drag files onto QWebEngineView directly | Events swallowed — web engine eats them before Qt sees them | [02-architecture.md, Drag & Drop](02-architecture.md) |

> **Use `xmake run scaffold-bridge <name>`** to create new bridges. It handles registration in both entry points and MOC setup automatically — you won't hit the first gotcha above.

## Build Gotchas

**Web build caching:** The build skips Vite if web source hasn't changed (timestamps vs `build/.web-build-stamp`). If you edited web code but see old output, delete `build/.web-build-stamp` to force a rebuild.

**First build is slow:** ~30s (Vite + C++ compile). Subsequent builds skip Vite and only recompile changed C++.

**`xmake build desktop` before desktop tests:** Desktop e2e and pywinauto tests need the app binary. Build first.

## playwright-core Patch

QtWebEngine doesn't support `Browser.setDownloadBehavior` — Playwright crashes during `connectOverCDP` without a one-line `.catch(() => {})` patch in `crBrowser.js`. Applied automatically by:
- Root `package.json` → `patchedDependencies` (Bun's patch system)
- `tools/playwright-cdp/postinstall` → applies same patch to its copy

**When bumping playwright-core**, check if the patch still applies and if the issue is fixed upstream.

## Multi-App / Vite Gotchas

**Vite `--config` doesn't change root:** Vite's `--config` flag does NOT change the working directory to the config's directory. The `web/package.json` scripts use `cd apps/main && vite` for this reason. If you try `vite --config apps/main/vite.config.ts` from `web/`, paths will resolve wrong.

**@shared alias requires vite.config.ts:** Each app must declare the `@shared` alias in its own `vite.config.ts`. Without it, imports from `@shared/api/bridge` will fail at build time.

**SchemeHandler host routing:** `app://main/` and `app://docs/` are different apps. If you add a new app and it loads a blank page, check that the SchemeHandler has a route for the new host.

## Drag & Drop Gotchas

**QWebEngineView swallows drag events:** You cannot listen for drag events on the web view directly — Qt's web engine intercepts them in its internal `focusProxy()` widget. `WebShellWidget` installs an event filter on `focusProxy()` to capture `QDragEnterEvent`/`QDropEvent` before the engine eats them. If drag & drop stops working, check that the event filter is installed after the view is created.

## Tab Gotchas

**Tab titles are reactive via document.title:** Set `document.title` in React to change the tab text. No bridge call needed — `QWebEnginePage::titleChanged` signal handles it automatically.

**Zoom and DevTools follow active tab:** Zoom level is per-tab. Toggling DevTools affects only the active tab's web view.

## Multiple Window Gotchas

**Shared bridges, shared state:** Opening a new window (Ctrl+N) creates a new `MainWindow` with its own `WebShellWidget`, but bridges are shared. A signal emitted in one window fires callbacks in all windows. This is correct — it means data stays in sync.

**Close-to-tray only on last window:** Secondary windows close normally. The app only minimizes to the tray when the last visible window is closed. If you're testing tray behavior, make sure no other windows are open.

## CLI / URL Protocol Gotchas

**parser.parse() not process():** `QCommandLineParser::process()` calls `exit()` on unknown flags. The app uses `parse()` instead, so unrecognized args (like file paths or URLs) pass through to React via `system.argsReceived`.

**URL protocol registration is per-user:** Windows uses `HKCU` (not `HKLM`), so no admin elevation is needed. But it also means each user must register separately.

## WASM Gotchas

**Embind bindings missing (TodoBridge is not a constructor):** The `bridges/wasm` library must use `set_kind("object")` in xmake.lua, not `set_kind("static")`. Static libraries get dead-stripped by the linker because `main.cpp` doesn't reference the `EMSCRIPTEN_BINDINGS` block (it's a static initializer). Object libraries include all `.o` files unconditionally.

**Vite blocks import() of /public files:** You can't `import('/wasm-app.js')` in Vite — it refuses to transform JS files inside `/public`. The WASM transport uses a blob URL + `<script type="module">` to load the Emscripten module. Don't try to "fix" this with `@vite-ignore` — it doesn't work. See `wasm-transport.ts` for the working pattern.

**Platform switch resets Qt path:** After `xmake f -p wasm`, switching back with `xmake f -p windows` loses the `--qt=` setting. Always pass it explicitly: `xmake f -p windows --qt=C:/qt/6.10.2/msvc2022_64`.

**WASM state is in-memory:** The WASM bridge has no persistence — page refresh resets everything. This is expected. After rebuilding WASM, use `reload()` in playwright-cdp to pick up the new build.

## Port Conflicts

| Port | Used by | If busy |
|------|---------|---------|
| 5173 | Vite dev server | Another Vite instance? |
| 9222 | CDP (Qt debug port) | Another Qt/Chrome instance? |
| 9333 | CDP (playwright-cdp open) | Close with `npx tsx tools/playwright-cdp/cli.ts close` |
| 9876 | WebSocket bridge | dev-server already running? |

## Environment

`.env.example` documents Vite env vars. The key one is `VITE_BRIDGE_WS_URL` (defaults to `ws://localhost:9876`). You'd only change this if you run the dev-server on a different port.

## Platform

pywinauto is Windows-only. playwright-cdp works everywhere. The full 5-layer test suite only runs on Windows. macOS/Linux can run everything except pywinauto tests.
