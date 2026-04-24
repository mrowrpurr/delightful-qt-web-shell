# Gotchas

Things that will bite you if you don't know about them.

## Silent Failures

| What you forgot | What happens |
|---|---|
| Register bridge in `application.cpp` and `test_server.cpp` | Bridge silently doesn't exist — no error, just missing |
| Return `QJsonObject` but got `{value: ...}` | You returned a scalar (`QString`, `int`) — scalars get wrapped |
| Remove `signalReady()` from `App.tsx` | App hangs with spinner forever, error after 15s |
| Use Bun instead of Node for playwright-cdp | `connectOverCDP` hangs forever — no error, no timeout |
| playwright-cdp fails with `ERR_MODULE_NOT_FOUND` | Deps not installed in `tools/playwright-cdp/` — it's a separate install from the Bun workspace. Run `cd tools/playwright-cdp && npm install` (or `xmake run setup`). |
| playwright-cdp fails with `connectOverCDP: Timeout 30000ms exceeded` | The desktop app's CDP endpoint is stuck. Restart the app: `xmake run stop-desktop && xmake run start-desktop`. |
| Bridge method opens modal dialog synchronously | Dialog's QWebChannel can't init — loading overlay forever |
| Drag & drop handler on WebShellWidget | QWebEngineView's focusProxy swallows all drag events |
| Native `<select>` in QWebEngine | White rectangle appears — use custom dropdown component |
| `fetch()` with `app://` scheme | Doesn't work — use Vite JSON import at build time |

**Tip:** Use `xmake run scaffold-bridge <name>` to create new bridges. It handles registration automatically.

## Build

- **Every build runs Vite** (~30s) then compiles C++ (~10s).
- **Skip Vite for C++ iteration:** `SKIP_VITE=1 xmake build desktop` reuses the previous web bundle (~2s). Works with `run desktop` and `run start-desktop` too.
- **`xmake build desktop` before desktop tests.** The app binary must exist.

## Multi-App / Vite

- **`vite --config` doesn't change root.** Use `cd apps/main && vite build` in scripts, not `vite build --config apps/main/vite.config.ts`.
- **`@shared` alias must be in each app's `vite.config.ts`.** It's not inherited.
- **Vite inlines assets < 4KB as data URIs.** Set `assetsInlineLimit: 0` — QWebEngine can't always handle them.

## Theming

- **`fetch` doesn't work with `app://`** — import JSON at build time via Vite.
- **Theme vars need both `--background` and `--color-background`** for Tailwind v4 compatibility.
- **QSS doesn't support CSS tricks** like border-triangles for dropdown arrows — use SVG images.
- **`QIODevice::Text` doubles `\r\n` on Windows** — use binary mode for `writeTextFile`.

## WASM

- **`set_kind("object")` not `"static"`** for the WASM bridges library — static gets dead-stripped.
- **Can't `import()` from `/public` in Vite** — use blob URL + `<script type="module">`. See `wasm-transport.ts`.
- **Platform switch resets Qt path** — always pass `--qt=` when switching back from WASM.

## Ports

| Port | Used by |
|------|---------|
| 5173 | Vite dev server |
| 9222 | CDP (Qt debug port) |
| 9333 | CDP (playwright-cdp persistent browser) |
| 9876 | WebSocket bridge (dev-server) |

## Other

- **`QCommandLineParser.parse()` not `process()`** — `process()` shows error dialogs on unknown flags.
- **playwright-core patch** — QtWebEngine doesn't support `Browser.setDownloadBehavior`. Applied automatically by `patchedDependencies`.
- **pywinauto is Windows-only.** macOS/Linux can run everything except pywinauto tests.
