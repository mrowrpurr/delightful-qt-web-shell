# Architecture

## The Big Picture

```
 React (Vite)          WebShell              Bridge           TodoStore
 ┌──────────┐      ┌──────────────┐     ┌──────────────┐   ┌──────────────┐
 │  UI      │◄────►│ infrastructure│────►│ QObject      │──►│ pure C++     │
 │  bridge  │      │ registration │     │ Q_INVOKABLE  │   │ no Qt deps   │
 │  proxy   │      │ appReady     │     │ signals      │   │ business     │
 └──────────┘      └──────────────┘     └──────────────┘   │ logic        │
                                                            └──────────────┘
      ▲                    ▲
      │                    │
      └── QWebChannel ────┘  (production: in-process, zero overhead)
      └── WebSocket ──────┘  (dev/test: same protocol, any client)
```

## Three Layers You Touch

1. **Domain logic** (`lib/todos/include/todo_store.hpp`) — Pure C++, no Qt. Your business logic lives here. Testable with Catch2 in isolation.

2. **Bridge** (`lib/web-bridge/include/bridge.hpp`) — A `QObject` with `Q_INVOKABLE` methods that wrap your domain logic. This is the API surface between C++ and JavaScript. Takes Qt types, returns Qt types.

3. **TypeScript interface** (`web/src/api/bridge.ts`) — Declares the methods and signals your bridge exposes. No implementation needed — the proxy dynamically dispatches method calls based on the interface, so the declaration alone is sufficient.

## Two Layers You Don't Touch

- **WebShell** (`lib/web-shell/include/web_shell.hpp`) — Bridge registration, `appReady` lifecycle signal. You call `shell->addBridge("name", bridge)` and never think about it again.

- **Transport** (`lib/web-shell/include/expose_as_ws.hpp` + `web/src/api/bridge-transport.ts`) — Converts `Q_INVOKABLE` methods to JSON-RPC over WebSocket (dev/test) or QWebChannel (production). Uses `QMetaObject` introspection + `QVariant` conversion — any type Qt can serialize works automatically.

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

**The result:** Add a `Q_INVOKABLE` method in C++ and a line in the TypeScript interface. Done. The proxy connects them.

## Two Transports, Same Code

| Mode | Transport | When |
|------|-----------|------|
| **Production** | QWebChannel (in-process) | `xmake run desktop` |
| **Dev/Test** | WebSocket JSON-RPC | `xmake run dev-server`, Playwright, Bun tests |

Your bridge code doesn't know or care which transport is active. The React app auto-detects: if `window.qt?.webChannelTransport` exists, it uses QWebChannel. Otherwise, it connects via WebSocket to `localhost:9876`.

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

### Return Value Wrapping

This is important — the JS side sees different shapes depending on the C++ return type:

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

## signalReady() Contract

React calls `signalReady()` after mounting. This fires `WebShell::ready()` on the C++ side, which fades out the loading overlay. If it never fires (bridge broken, JS error), a 15-second timeout shows an error message.

**Never remove the `signalReady()` call in App.tsx.** Move it if you refactor, but it must run after your app mounts.
