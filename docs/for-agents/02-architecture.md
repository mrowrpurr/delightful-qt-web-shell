# Architecture

## The Big Picture

One React UI, one domain library, two deployment targets:

```
                                ┌──────────────┐
                          ┌────►│ Qt Bridge    │──┐
                          │     │ QObject      │  │
                          │     │ Q_INVOKABLE  │  │    ┌──────────────┐
 React (Vite)             │     └──────────────┘  ├───►│ TodoStore    │
 ┌──────────┐    transport│                       │    │ pure C++     │
 │  UI      │◄────────────┤                       │    │ no framework │
 │  bridge  │  auto-detect│     ┌──────────────┐  │    │ deps         │
 │  proxy   │             └────►│ WASM Bridge  │──┘    └──────────────┘
 └──────────┘                   │ Embind       │
                                │ emscripten:: │
      transport:                │ val          │
      ├── QWebChannel           └──────────────┘
      ├── WebSocket
      └── WASM (Embind)
```

**The bridge is a controller.** `TodoStore` is the model. The Qt bridge and WASM bridge are two thin controllers over the same model — one speaks `QJsonObject`, the other speaks `emscripten::val`. React is the view. The transport is invisible.

## Four Layers You Touch

1. **Domain logic** (`lib/todos/include/todo_store.hpp`) — Pure C++, no Qt, no Emscripten. Your business logic lives here. Testable with Catch2 in isolation. Compiled for both desktop and WASM.

2. **Qt bridge** (`lib/bridges/qt/include/todo_bridge.hpp`) — A `QObject` with `Q_INVOKABLE` methods that wrap your domain logic. Returns `QJsonObject`. Used by the desktop app.

3. **WASM bridge** (`lib/bridges/wasm/include/todo_wasm_bridge.hpp`) — An Embind-registered class with the **same method names** as the Qt bridge. Returns `emscripten::val` (JS objects created directly in WASM memory). Used by the browser app.

4. **TypeScript interface** (`web/shared/api/bridge.ts`) — Declares the methods and signals your bridge exposes. Shared by both targets — React doesn't know which bridge it's talking to.

## Two Layers You Don't Touch

- **WebShell** (`lib/web-shell/include/web_shell.hpp`) — Bridge registration, `appReady` lifecycle signal. You call `shell->addBridge("name", bridge)` and never think about it again. *(Desktop only — WASM doesn't use WebShell.)*

- **Transport** (`web/shared/api/bridge-transport.ts`, `wasm-transport.ts`) — The React app auto-detects which transport to use. You never touch this.

## The Proxy Pattern

Both sides are zero-boilerplate:

**C++ side:** `invoke_bridge_method` finds your method via `QMetaObject`, converts JSON args to C++ types via `QVariant::convert`, calls the method, converts the return value back to JSON via `QJsonValue::fromVariant`. No type lists, no registration, no switch statements.

**TypeScript side:** `getBridge<TodoBridge>('todos')` queries the C++ backend for all methods and signals via the `__meta__` protocol, returns a JavaScript `Proxy`. Property access on a signal name returns a subscribe function. Property access on anything else returns a function that sends JSON-RPC and returns a Promise.

**Important:** `getBridge()` must be called at **module scope** (top-level await), not inside a React component. It returns a long-lived proxy — calling it inside `useEffect` would create new instances every render. See `App.tsx` for the pattern:

```typescript
// Top of file, before the component — runs once
const todos = await getBridge<TodoBridge>('todos')

export default function App() {
  // Use `todos` directly — it's already connected
}
```

**WASM side:** No proxy needed — Embind exposes C++ methods directly as JavaScript functions. The WASM transport wraps synchronous Embind calls in Promises for API consistency with the other transports.

**The result:** Add a method to your domain logic, wrap it in both bridges (Qt + WASM), add a line to the TypeScript interface. The transport connects them.

## Three Transports, Same React Code

| Mode | Transport | Bridge type | When |
|------|-----------|-------------|------|
| **Desktop prod** | QWebChannel (in-process) | Qt (`QObject`) | `xmake run desktop` |
| **Desktop dev/test** | WebSocket JSON-RPC | Qt (`QObject`) | `xmake run dev-server`, Playwright, Bun tests |
| **Browser (WASM)** | Direct Embind calls | WASM (`emscripten::val`) | `xmake run dev-wasm` |

React auto-detects: `VITE_TRANSPORT=wasm` → Embind. `window.qt?.webChannelTransport` → QWebChannel. Otherwise → WebSocket to `localhost:9876`. Your React components don't know or care which transport is active.

## Type System

There is **no whitelist**. The bridge uses `QVariant::convert()` dynamically — any type with a registered `QMetaType` converter works. You never need to modify the framework to support a new type.

Common types:

| JSON | C++ | Notes |
|------|-----|-------|
| string | `QString` | |
| number | `int`, `double` | |
| boolean | `bool` | |
| object | `QJsonObject` | Returned unwrapped |
| array | `QJsonArray` | Returned unwrapped |
| array of strings | `QStringList` | Qt auto-converts |
| anything | `QVariant` | Catch-all |

### Return Value Wrapping (Qt bridge only)

This applies to the **Qt bridge** (desktop). The WASM bridge returns `emscripten::val` objects directly — no wrapping, no special cases.

For the Qt bridge, the JS side sees different shapes depending on the C++ return type:

| C++ returns | JS receives | Example |
|------------|-------------|---------|
| `QJsonObject` | The object directly | `{id: "1", name: "Groceries"}` |
| `QJsonArray` | The array directly | `[{id: "1"}, {id: "2"}]` |
| `QString` | `{"value": "hello"}` | Wrapped in `value` |
| `int`, `double` | `{"value": 42}` | Wrapped in `value` |
| `bool` | `{"value": true}` | Wrapped in `value` |
| `void` | `{"ok": true}` | Special case |

**Why?** `QJsonObject` and `QJsonArray` are already structured — returning them directly is ergonomic. Scalars need a wrapper because raw JSON-RPC requires an object response.

**In practice:** Most bridge methods return `QJsonObject` or `QJsonArray` (unwrapped). If you return a scalar, access it via `result.value` on the JS side.

**Max parameters:** 10 per method (Qt's `QMetaObject::invokeMethod` limit — pass a `QJsonObject` if you need more).
**Arg count mismatch:** Returns a clear error: `"addItem: expected 2 args, got 1"`.

## signalReady() Contract (Desktop Only)

React calls `signalReady()` after mounting. This fires `WebShell::ready()` on the C++ side, which fades out the loading overlay. If it never fires (bridge broken, JS error), a 15-second timeout shows an error message.

**Never remove the `signalReady()` call in App.tsx.** Move it if you refactor, but it must run after your app mounts. In WASM mode, `signalReady()` is a no-op — there's no loading overlay to dismiss.

## Multi-Web-App Architecture

The web layer is organized as multiple Vite apps sharing common code:

```
web/
├── shared/api/          # Bridge interfaces & transport — used by all apps
│   ├── bridge.ts
│   ├── bridge-transport.ts
│   ├── system-bridge.ts
│   └── wasm-transport.ts
├── apps/main/           # Main todo app (App.tsx, DialogView.tsx, main.tsx)
│   ├── src/
│   └── vite.config.ts
├── apps/docs/           # Docs app
│   ├── src/
│   └── vite.config.ts
└── package.json         # Single package.json — per-app scripts
```

**One `package.json`, per-app scripts:** `build:main`, `build:docs`, `dev:main`, `dev:docs`. Each app's `vite.config.ts` defines a `@shared` alias resolving to `../../shared`, so imports look like `import { getBridge } from '@shared/api/bridge'`.

**SchemeHandler routing:** The `app://` scheme routes by host. `app://main/` serves from `:/web-main/`, `app://docs/` serves from `:/web-docs/`. Each app is a separate Qt resource prefix, built independently.

## Hash Routing for Dialogs

`main.tsx` checks `window.location.hash` at startup. `#/dialog` renders `DialogView`, everything else renders `App`. No React Router needed — the hash is set once at load time.

```typescript
const route = window.location.hash
const Root = route === '#/dialog' ? DialogView : App
```

On the C++ side, `WebDialog.cpp` sets the URL fragment when loading: `QUrl("app://main/#/dialog")`. This gives dialogs a lightweight UI sharing the same bridges and build as the main app. Add a todo in the dialog, and the main window updates instantly via the `dataChanged` signal.

**QTimer::singleShot(0, ...) gotcha:** When a bridge method call triggers opening a modal dialog (e.g., `system.openDialog()`), you must defer the dialog creation with `QTimer::singleShot(0, ...)`. Without this, the synchronous modal blocks the bridge response, and the JS side hangs waiting for the promise to resolve.

## SystemBridge — File I/O

The `SystemBridge` (`web/shared/api/system-bridge.ts`) provides desktop file capabilities in three tiers:

**File choosers:** `openFileChooser(filter?)` and `openFolderChooser()` return `{ path }` or `{ cancelled: true }`.

**Directory operations:** `listFolder(path)` returns entries with name, isDir, and size. `globFolder(path, pattern, recursive?)` returns matching paths.

**Simple reads — small files:**
- `readTextFile(path)` — returns `{ text }` for text files
- `readFileBytes(path)` — returns `{ data }` as base64 for binary files (images, etc.)

**Streaming handles — large files:**
- `openFileHandle(path)` — returns `{ handle, size }`
- `readFileChunk(handle, offset, length)` — returns `{ data, bytesRead }` as base64
- `closeFileHandle(handle)` — releases the handle

Use the simple APIs for files under ~100KB. Use handles for anything larger — they avoid loading entire files into memory.

## Drag & Drop

`WebShellWidget` installs an event filter on `QWebEngineView`'s `focusProxy()` to intercept drag events. Without this, the web engine swallows drag/drop entirely — Qt events never reach your code.

React subscribes via `system.filesDropped(callback)` and retrieves paths with `system.getDroppedFiles()`.

## Tabs

`QTabWidget` wraps the main app. Each tab contains a `WebShellWidget` with its own `QWebEngineView`.

- **Ctrl+T** — new tab
- **Ctrl+W** — close current tab
- **Middle-click** or **X button** — close tab
- Tab bar auto-hides with only 1 tab

Tab titles are reactive: `QWebEnginePage::titleChanged` updates the tab text. Just set `document.title` in your React code — no bridge call needed.

Zoom level and DevTools follow the active tab.

## Multiple Windows

**Ctrl+N** creates a new `MainWindow`. Bridges are shared across all windows, so changes in one window appear in all (via the same signal mechanism).

Close-to-tray only applies to the **last visible window**. Secondary windows close normally. This means you can have several windows open and close them freely — the app only goes to tray when the final one is closed.

## CLI Arg Passing

The app is single-instance. When a second instance launches, it pipes **all its args** (not just an "activate" message) to the running instance via the single-instance pipe.

React sees incoming args via:
- `system.argsReceived(callback)` — signal fired when new args arrive
- `system.getReceivedArgs()` — returns the accumulated args

On the C++ side, `QCommandLineParser` uses `parser.parse()` instead of `process()` so unknown flags pass through to React instead of causing a hard exit.

## URL Protocol Registration

Cross-platform custom URL protocol (e.g., `yourapp://open?file=foo`):

- **Windows:** Writes to `HKCU` registry
- **Linux:** `.desktop` file + `xdg-mime`
- **macOS:** `Info.plist` + `QEvent::FileOpen`

The app prompts on first launch. Users can also register/unregister via the **Tools** menu. Incoming URLs arrive through the same `argsReceived` signal as CLI args.
