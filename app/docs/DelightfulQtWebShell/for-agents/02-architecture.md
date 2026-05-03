# Architecture

## The Big Picture

One React UI, one domain library, two deployment targets:

```
                                ┌──────────────────┐
                          ┌────>│ BridgeChannel    │
                          │     │ Adapter (QObject) │
                          │     │ dispatch()        │    ┌──────────────┐
 React (Vite)             │     └──────────────────┘    │ TodoBridge   │
 ┌──────────┐    transport│            │                │ extends      │
 │  UI      │<────────────┤            └───────────────>│ app_shell::  │───> TodoStore
 │  bridge  │  auto-detect│                             │ bridge       │    (pure C++)
 │  proxy   │             │     ┌──────────────────┐    │              │
 └──────────┘             └────>│ WasmBridgeWrapper│───>│ One class.   │
                                │ (generic Embind) │    │ Both targets.│
      transport:                └──────────────────┘    └──────────────┘
      ├── QWebChannel
      ├── WebSocket
      └── WASM (Embind)
```

**The bridge is a controller.** `TodoStore` is the model. There is one bridge class per domain area — it's pure C++, no Qt types, no Emscripten types. The transport layer (QWebChannel adapter, WebSocket server, or WASM wrapper) handles serialization at the edges. React is the view. The transport is invisible.

## Three Layers You Touch

1. **Domain logic** (`lib/todos/include/todo_store.hpp`) — Pure C++, no Qt, no Emscripten. Your business logic lives here. Testable with Catch2 in isolation. Compiled for both desktop and WASM.

2. **Bridge** (`lib/todos/include/todo_bridge.hpp`) — A class extending `app_shell::Bridge`. Methods are registered with `method("name", &Bridge::fn)`. Each method takes a plain C++ request DTO and returns a plain C++ response struct. No `Q_INVOKABLE`, no `QVariant`, no `emscripten::val`. One bridge class serves both desktop and WASM.

3. **TypeScript interface** (`web/shared/api/bridge.ts`) — Declares the methods and signals your bridge exposes. Shared by both targets — React doesn't know which bridge it's talking to.

## Two Layers You Don't Touch

- **WebShell** (`lib/web-shell/include/web_shell.hpp`) — Bridge registration, `appReady` lifecycle signal. You call `shell->addBridge("name", bridge)` and never think about it again. *(Desktop only — WASM doesn't use WebShell.)*

- **Transport** (`web/shared/api/bridge-transport.ts`, `wasm-transport.ts`) — The React app auto-detects which transport to use. You never touch this.

## Multi-App Web Layer

The web layer isn't a single Vite app — it's N apps sharing common code:

```
web/
  shared/api/     <- bridge interfaces + transport (shared by all apps)
  apps/main/      <- main app (todo demo, file browser, all bridge demos)
  package.json    <- single deps, per-app scripts (build:main, dev:main, etc.)
```

Each app has its own `vite.config.ts` with a `@shared` alias pointing to `../../shared`. The SchemeHandler routes by host — `app://main/` serves the main app. `Application::appUrl("main")` returns the right URL for dev or production.

To add a new app, copy `web/apps/main/`, register it in the SchemeHandler, and add build scripts. See [Adding Features](03-adding-features.md) for the recipe.

## The Bridge System

### How Dispatch Works

```
TypeScript -> WebSocket JSON-RPC -> expose_as_ws.hpp
                                       |
                                       +-- Bridge::dispatch()
                                            +-- from_json<Request>(args)
                                            +-- call bridge method
                                            +-- serialize_response(result)
                                            +-- return nlohmann::json
```

No QObject dispatch. No QMetaObject. No `coerce_arg`. No `QGenericArgument`. The bridge base class (`app_shell::Bridge` in `bridge.hpp`) handles everything:

- **Method registration:** `method("name", &Bridge::fn)` — template deduction figures out the request/response types automatically.
- **Deserialization:** `def_type::from_json<Request>(args)` converts the incoming JSON to a typed C++ request struct via PFR reflection. No hand-written deserialization.
- **Serialization:** `detail::serialize_response(result)` converts the return value to JSON via `def_type::to_json`. Handles plain structs, vectors, booleans, and raw `nlohmann::json`.
- **Error handling:** Exceptions become `{"error": "message"}` responses. Unknown methods return a clear error.

### Request/Response DTOs

Every bridge method takes a plain C++ struct as its request and returns a plain C++ struct as its response. `def_type` provides `to_json` and `from_json` via PFR — no macros, no registration, no hand-written serializers.

```cpp
// Request DTO — plain struct, auto-serialized by PFR
struct AddListRequest {
    std::string name;
};

// The bridge method — takes a DTO, returns a domain struct
TodoList addList(AddListRequest req) {
    auto list = store_.add_list(req.name);
    emit_signal("listAdded", list);
    return list;
}
```

Methods that take no arguments omit the request parameter. Methods that return nothing (void) automatically return `{"ok": true}`. Methods that return `OkResponse` (a shared DTO) also return `{"ok": true}`.

### TypeScript Side

**TypeScript side:** `getBridge<TodoBridge>('todos')` queries the C++ backend for all methods and signals via the `__meta__` protocol, returns a JavaScript `Proxy`. Property access on a signal name returns a subscribe function. Property access on anything else returns a function that sends JSON-RPC and returns a Promise.

**Important:** `getBridge()` must be called at **module scope** (top-level await), not inside a React component. It returns a long-lived proxy — calling it inside `useEffect` would create new instances every render. See `App.tsx` for the pattern:

```typescript
// Top of file, before the component — runs once
const todos = await getBridge<TodoBridge>('todos')

export default function App() {
  // Use `todos` directly — it's already connected
}
```

**Bridge calls use request objects, not positional args:**
```typescript
// Correct — pass a request object
await todos.addList({ name: "Groceries" })
await todos.addItem({ list_id: id, text: "Milk" })

// Wrong — positional args don't work
await todos.addList("Groceries")  // will fail
```

**WASM side:** The generic `WasmBridgeWrapper` wraps any `app_shell::Bridge` for Embind. It exposes `call(method, args)`, `subscribe(signal, callback)`, `methods()`, and `signals()`. No per-bridge WASM code needed.

## Three Transports, Same React Code

| Mode | Transport | Bridge adapter | When |
|------|-----------|----------------|------|
| **Desktop prod** | QWebChannel (in-process) | `BridgeChannelAdapter` (QObject with `dispatch()`) | `xmake run desktop` |
| **Desktop dev/test** | WebSocket JSON-RPC | `expose_as_ws.hpp` | `xmake run dev-server`, Playwright, Bun tests |
| **Browser (WASM)** | Direct Embind calls | `WasmBridgeWrapper` (generic) | `xmake run dev-wasm` |

React auto-detects: `VITE_TRANSPORT=wasm` -> Embind. `window.qt?.webChannelTransport` -> QWebChannel. Otherwise -> WebSocket to `localhost:9876`. Your React components don't know or care which transport is active.

All three transports talk to the same `app_shell::Bridge` instance. The bridge is pure C++. The transport adapters handle conversion at the edges:
- **WebSocket:** nlohmann::json passes through directly.
- **QWebChannel:** `BridgeChannelAdapter` converts between nlohmann::json and Qt JSON (via `json_adapter.hpp`) at the boundary.
- **WASM:** `WasmBridgeWrapper` converts between nlohmann::json and `emscripten::val` at the boundary.

## Type System

Bridge methods use plain C++ types. `def_type` with PFR auto-reflection handles serialization — no type registration, no macros, no `QVariant`.

Common types in DTOs:

| JSON | C++ | Notes |
|------|-----|-------|
| string | `std::string` | |
| number | `int`, `double` | |
| boolean | `bool` | |
| object | Plain C++ struct | Serialized via `def_type::to_json` |
| array | `std::vector<T>` | Each element serialized recursively |
| null | (no direct equivalent) | Void methods return `{"ok": true}` |

### Return Value Serialization

All transports use the same serialization — `detail::serialize_response()` in `bridge.hpp`. No wrapping surprises, no special cases per transport:

| C++ returns | JSON result | Notes |
|------------|-------------|-------|
| A def_type struct | The struct as a JSON object | `{"id": "1", "name": "Groceries"}` |
| `std::vector<T>` | A JSON array | Each element serialized recursively |
| `bool` | `{"ok": value}` | |
| `void` / `OkResponse` | `{"ok": true}` | |
| `nlohmann::json` | Passthrough | For manually constructed responses |

## signalReady() Contract (Desktop Only)

React calls `signalReady()` after mounting. This fires `WebShell::ready()` on the C++ side, which fades out the loading overlay. If it never fires (bridge broken, JS error), a 15-second timeout shows an error message.

**Never remove the `signalReady()` call in App.tsx.** Move it if you refactor, but it must run after your app mounts. In WASM mode, `signalReady()` is a no-op — there's no loading overlay to dismiss.
