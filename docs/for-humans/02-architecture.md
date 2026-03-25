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

The app has four layers:

1. **React UI** (`web/`) — Everything the user sees. Multiple Vite apps under `web/apps/`, shared code in `web/shared/`. Standard React + Vite.
2. **Domain logic** (`lib/todos/`) — Pure C++, no Qt, no Emscripten. Your business logic, testable in isolation with Catch2. Compiled for both desktop and WASM.
3. **Qt bridge** (`lib/bridges/qt/`) — A thin `QObject` with `Q_INVOKABLE` methods that wrap your domain logic. Returns `QJsonObject`. Used by the desktop app.
4. **WASM bridge** (`lib/bridges/wasm/`) — An Embind-registered class with the **same method names** as the Qt bridge. Returns `emscripten::val` (JS objects created directly in WASM memory). Used by the browser app.

## Three Transports, Same Code

| Mode | Transport | Bridge type | When |
|------|-----------|-------------|------|
| **Desktop prod** | QWebChannel (in-process) | Qt (`QObject`) | `xmake run desktop` |
| **Desktop dev/test** | WebSocket JSON-RPC | Qt (`QObject`) | `xmake run dev-server`, Playwright, Bun tests |
| **Browser (WASM)** | Direct Embind calls | WASM (`emscripten::val`) | `xmake run dev-wasm` |

Your code doesn't know or care which transport is active. React auto-detects: `VITE_TRANSPORT=wasm` → Embind. `window.qt?.webChannelTransport` → QWebChannel. Otherwise → WebSocket to `localhost:9876`.

This means you can develop in a browser with hot reload, the same code runs inside the Qt window in production, and the same C++ logic runs as WASM in the browser — zero changes to React.

## The Proxy Pattern

Both sides are zero-boilerplate:

**C++ side:** The infrastructure finds your method via `QMetaObject` introspection, converts JSON arguments to C++ types via `QVariant::convert()`, calls the method, and converts the return value back to JSON. There is no type whitelist — any type Qt can serialize works automatically.

**TypeScript side:** `getBridge<TodoBridge>('todos')` queries the backend for available methods and signals, then returns a JavaScript `Proxy`. Method calls become JSON-RPC messages. Signal names become subscribe functions.

**WASM side:** No proxy needed — Embind exposes C++ methods directly as JavaScript functions. The WASM transport wraps synchronous Embind calls in Promises for API consistency with the other transports.

**The result:** Add a method to your domain logic, wrap it in both bridges (Qt + WASM), add a line to the TypeScript interface. The transport connects them.

## Signals — C++ to JavaScript Events

Bridges can push real-time updates from C++ to React. Declare a parameterless signal, emit it when data changes, and React can subscribe:

```cpp
// C++ — emit when something changes
signals:
    void dataChanged();
```

```typescript
// TypeScript — subscribe by name
todos.dataChanged(() => refresh())
```

Only parameterless signals are auto-forwarded. If you need to push data, emit a parameterless notification and have the client re-fetch.

## The signalReady() Contract (Desktop Only)

React calls `signalReady()` after mounting. This tells the C++ side to fade out the loading overlay. If it never fires (JS error, bridge broken), a 15-second timeout shows an error message.

This call lives in `web/apps/main/src/App.tsx`. If you refactor, move it — but never remove it. In WASM mode, `signalReady()` is a no-op — there's no loading overlay to dismiss.

## Multi-Web-App Architecture

The `web/` directory holds multiple Vite apps, not just one:

```
web/
├── shared/              # Shared code — bridge interfaces, transport, utilities
│   └── api/
│       ├── bridge.ts          # getBridge<T>(), domain types
│       ├── bridge-transport.ts
│       ├── system-bridge.ts   # File I/O, clipboard, drag & drop, CLI args
│       └── wasm-transport.ts
├── apps/
│   ├── main/            # Main todo app (App.tsx, DialogView.tsx, vite.config.ts)
│   └── docs/            # Docs app
└── package.json         # Single package.json with per-app scripts
```

Each app has its own `vite.config.ts` and entry point. The Vite alias `@shared` resolves to `../../shared` in each app, so imports like `import { getBridge } from '@shared/api/bridge'` work everywhere.

On the desktop side, the `SchemeHandler` routes requests by host to serve the correct app. This means you can add new apps (settings panel, onboarding flow, etc.) without touching the existing ones.

## SystemBridge — Desktop Capabilities

Beyond your domain bridges, the framework provides a built-in `SystemBridge` with desktop-native features:

- **File choosers** — `openFileChooser(filter?)` and `openFolderChooser()` open native OS dialogs and return the selected path.
- **Directory listing** — `listFolder(path)` returns entries with name, size, and isDir. `globFolder(path, pattern, recursive?)` returns matching paths.
- **Simple file reads** — `readTextFile(path)` for text, `readFileBytes(path)` for base64-encoded binary data.
- **Streaming file handles** — For large files: `openFileHandle(path)` returns a handle and size, then `readFileChunk(handle, offset, length)` reads base64 chunks, and `closeFileHandle(handle)` cleans up.
- **Drag & drop** — Drop files onto the window. React subscribes to `filesDropped` and calls `getDroppedFiles()` to get the paths.
- **CLI args & URL protocol** — `getReceivedArgs()` returns args from the command line, second-instance forwarding, or URL protocol invocations. Subscribe to `argsReceived` for real-time notifications.
- **Clipboard** — `copyToClipboard(text)` and `readClipboard()`.

All of these are available via `getSystemBridge()` from `@shared/api/system-bridge`.

## Tabs, Windows, and Tray

The framework handles multi-tab and multi-window behavior at the Qt level:

- **Tabs** — Each window has a tab bar (hidden when there's only one tab). Ctrl+T opens a new tab, Ctrl+W closes the current one, middle-click closes a tab. Each tab is an independent web view with its own React instance. Tab titles update automatically from `document.title`.
- **Multiple windows** — Ctrl+N opens a new window. All windows share the same bridge instances, so state changes in one window are visible in all of them.
- **Close-to-tray** — Closing the last window hides the app to the system tray instead of quitting. Secondary windows close normally. To quit for real: File > Quit, Ctrl+Q, or right-click the tray icon.

## Cross-Platform

The template builds on Windows, macOS, and Linux. Platform-specific bits:

- `app.rc` (Windows icon/version info) — auto-generated by xmake
- `gmtime_s` / `gmtime_r` — guarded by `#ifdef _MSC_VER`
- Native UI testing — pywinauto (Windows), atomacos (macOS), dogtail (Linux)

Everything else — React, Vite, Playwright, the bridge — is cross-platform by nature.
