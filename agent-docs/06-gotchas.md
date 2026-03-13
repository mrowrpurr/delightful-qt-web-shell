# Gotchas — Quick Reference

This is a concise index of traps. Details live in the doc where you're doing the work — this page is for scanning when something breaks.

## Silent Failures (the scary ones)

| What you forgot | What happens | Where it's explained |
|---|---|---|
| Register bridge in `test_server.cpp` | Bridge silently doesn't exist in dev/test mode | [03-adding-features.md, Step 3](03-adding-features.md) |
| Add header to `add_files()` for MOC | Cryptic vtable linker error — doesn't mention your file | [03-adding-features.md, Step 2](03-adding-features.md) |
| Remove `signalReady()` from `App.tsx` | App hangs with spinner forever, error after 15s | [02-architecture.md, signalReady](02-architecture.md) |
| Use Bun instead of Node for cdp-mcp | `connectOverCDP` hangs forever — no error, no timeout | [05-tools.md, Critical: Node Not Bun](05-tools.md) |

## Build Gotchas

**Web build caching:** The build skips Vite if `web/src/` hasn't changed (timestamps vs `build/.web-build-stamp`). If you edited web code but see old output, delete `build/.web-build-stamp` to force a rebuild.

**First build is slow:** ~30s (Vite + C++ compile). Subsequent builds skip Vite and only recompile changed C++.

**`xmake build desktop` before desktop tests:** Desktop e2e and pywinauto tests need the app binary. Build first.

## playwright-core Patch

QtWebEngine doesn't support `Browser.setDownloadBehavior` — Playwright crashes during `connectOverCDP` without a one-line `.catch(() => {})` patch in `crBrowser.js`. Applied automatically by:
- Root `package.json` → `patchedDependencies` (Bun's patch system)
- `tools/cdp-mcp/postinstall` → applies same patch to its copy

**When bumping playwright-core**, check if the patch still applies and if the issue is fixed upstream.

## Port Conflicts

| Port | Used by | If busy |
|------|---------|---------|
| 5173 | Vite dev server | Another Vite instance? |
| 9222 | CDP (Qt debug port) | Another Qt/Chrome instance? |
| 9876 | WebSocket bridge | dev-server already running? |

## Environment

`.env.example` documents Vite env vars. The key one is `VITE_BRIDGE_WS_URL` (defaults to `ws://localhost:9876`). You'd only change this if you run the dev-server on a different port.

## Platform

pywinauto is Windows-only. cdp-mcp works everywhere. The full 5-layer test suite only runs on Windows. macOS/Linux can run everything except pywinauto tests.
