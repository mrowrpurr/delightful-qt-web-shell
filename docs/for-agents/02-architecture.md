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

## Multi-App Web Layer

The web layer isn't a single Vite app — it's N apps sharing common code:

```
web/
  shared/api/     ← bridge interfaces + transport (shared by all apps)
  apps/main/      ← main app (todo demo, file browser, all bridge demos)
  apps/docs/      ← docs app (architecture guide, runs in a side panel)
  package.json    ← single deps, per-app scripts (build:main, dev:main, etc.)
```

Each app has its own `vite.config.ts` with a `@shared` alias pointing to `../../shared`. The SchemeHandler routes by host — `app://main/` serves the main app, `app://docs/` serves docs. `Application::appUrl("main")` returns the right URL for dev or production.

To add a new app, copy `web/apps/docs/`, register it in the SchemeHandler, and add build scripts. See [Adding Features](03-adding-features.md) for the recipe.

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
