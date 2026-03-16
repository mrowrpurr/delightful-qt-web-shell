# Gotchas — Quick Reference

This is a concise index of traps. Details live in the doc where you're doing the work — this page is for scanning when something breaks.

## Silent Failures (the scary ones)

| What you forgot | What happens | Where it's explained |
|---|---|---|
| Register bridge in `test_server.cpp` | Bridge silently doesn't exist in dev/test mode | [03-adding-features.md](03-adding-features.md) |
| Return `QJsonObject` but got `{value: ...}` | You returned a scalar (`QString`, `int`) — scalars get wrapped | [03-adding-features.md](03-adding-features.md) |
| Remove `signalReady()` from `App.tsx` | App hangs with spinner forever, error after 15s | [02-architecture.md, signalReady](02-architecture.md) |
| Use Bun instead of Node for playwright-cdp | `connectOverCDP` hangs forever — no error, no timeout | [05-tools.md, Critical: Node Not Bun](05-tools.md) |

> **Use `xmake run scaffold-bridge <name>`** to create new bridges. It handles registration in both entry points and MOC setup automatically — you won't hit the first gotcha above.

## Build Gotchas

**Web build caching:** The build skips Vite if `web/src/` hasn't changed (timestamps vs `build/.web-build-stamp`). If you edited web code but see old output, delete `build/.web-build-stamp` to force a rebuild.

**First build is slow:** ~30s (Vite + C++ compile). Subsequent builds skip Vite and only recompile changed C++.

**`xmake build desktop` before desktop tests:** Desktop e2e and pywinauto tests need the app binary. Build first.

## playwright-core Patch

QtWebEngine doesn't support `Browser.setDownloadBehavior` — Playwright crashes during `connectOverCDP` without a one-line `.catch(() => {})` patch in `crBrowser.js`. Applied automatically by:
- Root `package.json` → `patchedDependencies` (Bun's patch system)
- `tools/playwright-cdp/postinstall` → applies same patch to its copy

**When bumping playwright-core**, check if the patch still applies and if the issue is fixed upstream.

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
