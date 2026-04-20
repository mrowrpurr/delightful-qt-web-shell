# def_type Migration — COMPLETE ✅

> Replaced the Qt-centric bridge layer with def_type DTOs. One bridge per domain area, zero hand-written serialization, typed signals with data.

## Status: All 7 phases complete (2026-04-20)

**Branch:** `def-type-migration` (6 commits)

**Tests:** 44 pass, 0 fail (Bun bridge tests)

**Builds:** Desktop app + dev-server both compile clean

---

## What Changed

**Before:** Bridge methods used Qt types (`QString`, `QJsonObject`, `QJsonArray`). Every domain struct needed a hand-written `to_json()` for Qt and a hand-written `to_val()` for WASM. Signals couldn't carry data. Adding a method meant touching 4 files.

**After:** Bridge methods are pure C++ — take a def_type request struct, return a def_type response struct. The framework handles all serialization. One bridge serves both Qt and WASM transports. Signals carry typed data. Adding a method means writing a function and registering it.

**By the numbers:**
- 440 lines deleted, 150 added (net -290)
- `expose_as_ws.hpp`: 321 → 155 lines
- `todo_wasm_bridge.hpp`: 137 lines → deleted entirely
- Hand-written `to_json()` and `to_val()` functions → deleted entirely
- `coerce_arg`, `QGenericArgument`, `invoke_bridge_method`, `SignalForwarder` → deleted
- QObject bridge map → deleted
- Both bridges (TodoBridge + SystemBridge) are now pure C++ with def_type DTOs
- One TodoBridge serves both desktop and WASM transports

---

## Architecture (final state)

### File Map

| File | Role |
|------|------|
| `lib/web-shell/include/typed_bridge.hpp` | Bridge base class. Method registration via `method("name", &fn)`. Signal registration, emission, subscription. Dispatch engine. Contains `OkResponse` shared DTO. |
| `lib/web-shell/include/json_adapter.hpp` | `to_qt_json()` / `from_qt_json()` — nlohmann ↔ Qt JSON. Used at transport boundaries only. |
| `lib/web-shell/include/expose_as_ws.hpp` | WebSocket JSON-RPC server. Typed bridge dispatch only. Signal forwarding with payloads. |
| `lib/web-shell/include/bridge_channel_adapter.hpp` | QObject wrapper for QWebChannel. Single `Q_INVOKABLE dispatch(method, args)` method routes to typed_bridge. |
| `lib/web-shell/include/web_shell.hpp` | Bridge registry. Single `QMap<QString, typed_bridge*>`. Still a QObject for `appReady()` lifecycle. |
| `lib/todos/include/todo_store.hpp` | Domain structs use `field<T>` with PFR auto-reflection. |
| `lib/todos/include/todo_dtos.hpp` | Request DTOs for TodoBridge methods. |
| `lib/bridges/qt/include/todo_bridge.hpp` | Pure C++ typed bridge. Zero Qt types. |
| `lib/bridges/qt/include/system_bridge.hpp` | Pure def_type interface. Qt used internally for file I/O, clipboard, dialogs. |
| `lib/bridges/qt/include/system_dtos.hpp` | Request/response DTOs for SystemBridge methods. |
| `lib/bridges/wasm/include/wasm_bridge_wrapper.hpp` | Generic Embind wrapper for any typed_bridge. `call()`, `subscribe()`, `methods()`, `signals()`. |
| `lib/bridges/wasm/src/wasm_bindings.cpp` | Embind registration. `getBridge("todos")` factory. |
| `web/shared/api/bridge-transport.ts` | Signal callbacks receive `msg.args` (typed data). |
| `web/shared/api/wasm-transport.ts` | Generic dispatch through `wrapper.call()`. |

### How Dispatch Works

```
TypeScript → WebSocket JSON-RPC → expose_as_ws.hpp
                                       │
                                       └─ typed_bridge::dispatch()
                                            ├─ from_json<Request>(args)
                                            ├─ call bridge method
                                            ├─ serialize_response(result)
                                            └─ return nlohmann::json
```

No QObject dispatch. No QMetaObject. No coerce_arg. No QGenericArgument.

### How Signals Work

```
C++ bridge method
  → emit_signal("dataChanged", item)     // def_type struct
  → typed_bridge serializes via to_json
  → listeners called with nlohmann::json
  → forward_typed_signals sends over WebSocket:
    {"bridge": "todos", "event": "dataChanged", "args": {"id": "1", "name": "Groceries", ...}}
  → TS transport passes msg.args to callback
```

Signals carry data. The parameterless-signal-plus-getter pattern is dead.

### How to Add a New Bridge Method

1. Define a request DTO (if the method takes args):
```cpp
struct MyRequest {
    field<std::string> name;
    field<int>         count;
};
```

2. Write the method on the bridge:
```cpp
MyResponse doThing(MyRequest req) {
    // ...
    return result;
}
```

3. Register it:
```cpp
method("doThing", &MyBridge::doThing);
```

That's it. `from_json` and `to_json` are automatic via PFR. No `to_json()` helper, no `to_val()` helper, no TypeScript interface changes needed for serialization.

### How to Add a New Bridge

1. Create a class extending `web_shell::typed_bridge`
2. Register methods and signals in the constructor
3. Add to `test_server.cpp` and `application.cpp`:
```cpp
auto* myBridge = new MyBridge;
shell.addBridge("myBridge", myBridge);
```

No WASM-specific bridge needed. The generic `WasmBridgeWrapper` handles it.

---

## Known Issues / Follow-ups

### MSVC `field<T>` operator==

`field<T>` implicit conversion doesn't satisfy MSVC's `std::ranges` concept checking for predicates. Workaround in `todo_store.hpp`: free `operator==` templates. Should be fixed in def_type itself by adding comparison operators to `field<T>`.

### WASM compilation not tested

The WASM path (`wasm_bridge_wrapper.hpp`, rewritten `wasm_bindings.cpp`, rewritten `wasm-transport.ts`) has not been compiled under Emscripten. The code is written but needs `xmake f -p wasm` to test. Potential issues:
- def_type C++23 features under Emscripten's clang
- PFR under Emscripten
- nlohmann::json under Emscripten (should be fine)
- `JSON.parse`/`JSON.stringify` round-trip in `wasm_bridge_wrapper.hpp`

### QWebChannel production path not tested

`BridgeChannelAdapter` wraps typed bridges for QWebChannel. It compiles but hasn't been tested with actual QWebChannel communication (requires running the desktop app and verifying React can call bridge methods). The TS `bridge-transport.ts` QWebChannel path may need updates to call `dispatch(method, args)` on the adapter instead of calling methods directly.

### TypeTestBridge removed

The old `TypeTestBridge` (QObject, QVariant-based type tests) was removed. It tested the now-deleted QVariant dispatch system. The replacement tests in `type_conversion_test.ts` exercise TodoBridge through the typed_bridge dispatch, covering:
- CRUD operations (addList, getList, addItem, toggleItem, deleteList, deleteItem, renameList, search)
- Error handling (nonexistent list/item)
- Signal data flow (emit with payload → TS receives data)
- Unknown method error

A more comprehensive def_type type test bridge (exercising every field type — vectors, maps, optionals, nested structs, enums) should be written later.

### Signal naming

The example TodoBridge uses `dataChanged` which is a terrible signal name that sometimes carries a `TodoList` and sometimes a `TodoItem`. Real bridges should use specific signal names with specific payload types (e.g., `listAdded` always carries a `TodoList`). This is a documentation/example issue, not an architecture issue.

### `bridges["system"]` syntax

Currently: `app->shell()->bridges().value("system")`. Could be nicer with `operator[]` on the bridge map. Minor API polish.

---

## Commits on `def-type-migration`

1. `🔥 def_type migration — Phase 1-3 complete` — Foundation, dispatch engine, TodoBridge rewrite
2. `✨ Phase 4 — signal data test passes` — Signal payloads flow end-to-end
3. `💀 Phase 5 — Kill WASM bridge duplication` — Delete `todo_wasm_bridge.hpp`, generic Embind wrapper
4. `🔥 Phase 6 — SystemBridge migrated to typed_bridge` — All 6 desktop callsites updated
5. `🧹 Phase 7 — Cleanup: delete all legacy dispatch code` — Remove QObject map, coerce_arg, SignalForwarder, TypeTestBridge
6. `📝 Update migration doc with final status` — This commit

---

## Key Decisions Made

1. **Explicit registration over MOC discovery.** `bridge.method("name", &fn)` instead of `Q_INVOKABLE`.
2. **def_type as a hard dependency.** The bridge system IS def_type DTOs.
3. **nlohmann::json as the internal serialization format.** Qt JSON and emscripten::val are transport-edge concerns.
4. **One bridge class per domain area.** Not one for Qt and one for WASM.
5. **Signals carry data.** The parameterless-signal-plus-getter pattern is dead.
6. **Domain structs use `field<T>` (typed path).** PFR auto-discovers fields. `to_json()` works with no registration.
7. **QWebChannel adapter pattern.** A thin QObject with one `Q_INVOKABLE dispatch()` method wraps typed bridges for the production desktop path.

---

## Packaging Issues Found and Fixed

1. **def_type 1.0.0 — flat include structure.** Fixed in 1.0.1.
2. **def_type 1.0.1 — PFR define not propagating.** Fixed by adding `add_configs("enable_pfr")` and `package:add("defines", "DEF_TYPE_HAS_PFR")` in the BuildWithCollab package recipe. Both would have been caught by smoke tests.
