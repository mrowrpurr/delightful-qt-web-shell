# def_type Migration Plan

> Replace the Qt-centric bridge layer with def_type DTOs. One bridge per domain area, zero hand-written serialization, typed signals with data.

## The Goal

**Before:** Bridge methods use Qt types (`QString`, `QJsonObject`, `QJsonArray`). Every domain struct needs a hand-written `to_json()` for Qt and a hand-written `to_val()` for WASM. Signals can't carry data. Adding a method means touching 4 files.

**After:** Bridge methods are pure C++ — take a def_type request struct, return a def_type response struct. The framework handles all serialization. One bridge serves both Qt and WASM transports. Signals carry typed data. Adding a method means writing a function and registering it.

---

## Current Status (Phase 3 complete — 2026-04-20)

**What's done:**
- def_type 1.0.1 published and installed as a dependency
- PFR enabled via `add_configs`/`package:config` fix in BuildWithCollab package recipe
- `typed_bridge` base class implemented (`lib/web-shell/include/typed_bridge.hpp`)
- `json_adapter` for nlohmann ↔ Qt conversion (`lib/web-shell/include/json_adapter.hpp`)
- `WebShell` supports both QObject bridges and typed bridges simultaneously
- `expose_as_ws.hpp` dispatches to typed bridges, forwards their signals with payloads
- `TodoBridge` fully rewritten — zero Qt types, pure C++, def_type DTOs
- Domain structs (`TodoList`, `TodoItem`) use `field<T>` with auto-reflection via PFR
- Request DTOs defined in `lib/todos/include/todo_dtos.hpp`
- **64 Bun bridge tests pass** (type_conversion + bridge_proxy + system_bridge)
- **Desktop app compiles** with the new bridge

**What's partially done:**
- TS transport updated to pass `msg.args` to signal callbacks (code changed, not yet tested with real signal data)
- Signal payloads emit from C++ (TodoBridge emits structs with `emit_signal("dataChanged", item)`)

**What's NOT done yet:**
- TypeTestBridge not rewritten for def_type (still QObject-based, still works)
- WASM bridge still duplicated (`todo_wasm_bridge.hpp` still exists)
- SystemBridge still a QObject (deeply wired to Qt signals in application.cpp)
- QWebChannel adapter for typed bridges not built (desktop production path)
- Old dispatch code (`coerce_arg`, `invoke_bridge_method`, `SignalForwarder`) still present for legacy bridges
- Signal data tests not written
- Documentation not updated

---

## Architecture (as built)

### File Map

| File | What it is | Status |
|------|-----------|--------|
| `lib/web-shell/include/typed_bridge.hpp` | **NEW.** Base class for all def_type bridges. Method registration via `bridge.method("name", &fn)`. Signal registration and emission. Dispatch engine. | Done |
| `lib/web-shell/include/json_adapter.hpp` | **NEW.** `to_qt_json()` / `from_qt_json()` — nlohmann ↔ Qt JSON conversion. Used at the transport boundary only. | Done |
| `lib/web-shell/include/expose_as_ws.hpp` | **MODIFIED.** Now checks typed bridges first in dispatch, falls back to QObject bridges. Forwards typed bridge signals with payload data over WebSocket. `__meta__` includes typed bridges. Old QObject dispatch code still present for SystemBridge. | Done |
| `lib/web-shell/include/web_shell.hpp` | **MODIFIED.** Two maps: `QMap<QString, QObject*>` for legacy bridges, `QMap<QString, typed_bridge*>` for new ones. Both `addBridge` overloads exist. | Done |
| `lib/todos/include/todo_store.hpp` | **MODIFIED.** Domain structs use `field<T>`. PFR auto-discovers fields. Has a temporary `operator==` workaround for MSVC std::ranges. | Done |
| `lib/todos/include/todo_dtos.hpp` | **NEW.** Request DTOs for every TodoBridge method. `AddListRequest`, `GetListRequest`, etc. `OkResponse` for void-like returns. | Done |
| `lib/bridges/qt/include/todo_bridge.hpp` | **REWRITTEN.** Extends `typed_bridge` instead of `QObject`. No Qt types. No hand-written `to_json()`. Methods take DTOs and return domain structs. | Done |
| `web/shared/api/bridge-transport.ts` | **MODIFIED.** Signal callbacks now receive `msg.args` instead of being called with no arguments. Both WebSocket and QWebChannel paths updated. | Done |

### How Dispatch Works Now

```
TypeScript → WebSocket JSON-RPC → expose_as_ws.hpp
                                       │
                                       ├─ typed bridge? → typed_bridge::dispatch()
                                       │                    │
                                       │                    ├─ from_json<Request>(args)
                                       │                    ├─ call bridge method
                                       │                    ├─ serialize_response(result)
                                       │                    └─ return nlohmann::json
                                       │
                                       └─ QObject bridge? → invoke_bridge_method() (legacy)
                                                            │
                                                            ├─ coerce_arg / QGenericArgument
                                                            ├─ QMetaObject::invokeMethod
                                                            └─ QJsonValue::fromVariant
```

### How Signals Work Now

**Typed bridges (TodoBridge):**
```
C++ bridge method
  → emit_signal("dataChanged", item)     // item is a def_type struct
  → typed_bridge serializes via to_json
  → listeners called with nlohmann::json
  → forward_typed_signals sends over WebSocket:
    {"bridge": "todos", "event": "dataChanged", "args": {"id": "1", "text": "Buy milk", ...}}
  → TS transport passes msg.args to callback
```

**Legacy QObject bridges (SystemBridge):**
```
C++ emit dataChanged()                   // parameterless Qt signal
  → SignalForwarder::forward()
  → {"bridge": "system", "event": "qtThemeChanged"}    // no args
  → TS transport calls cb() with no args
```

### typed_bridge Template Magic

The `method()` template deduces request and response types from the member function pointer:

```cpp
// Developer writes:
TodoList addList(AddListRequest req) { ... }

// Registers:
method("addList", &TodoBridge::addList);

// Template deduces: Request = AddListRequest, Response = TodoList
// Generates: json → from_json<AddListRequest> → call → to_json(TodoList) → json
```

`serialize_response` handles return type variants:
- `def_type struct` → `def_type::to_json(value)`
- `std::vector<T>` → JSON array, each element serialized
- `bool` → `{"ok": value}`
- `nlohmann::json` → passthrough (for composite responses like `getList`)

### Domain Struct Changes

`TodoList` and `TodoItem` now use `field<T>` from def_type:

```cpp
struct TodoList {
    field<std::string> id;
    field<std::string> name;
    field<int>         item_count{.value = 0};
    field<std::string> created_at;
};
```

`field<T>` is transparent — implicit conversion to/from T, `operator->` for member access, `operator=` for assignment. PFR auto-discovers the fields for serialization. `to_json(list)` just works.

**Known MSVC issue:** `field<T>` comparison with other types doesn't satisfy `std::ranges` concept checking on MSVC. Workaround: free `operator==` templates in `todo_store.hpp`. This should be fixed in def_type itself by adding `operator==` to `field<T>`.

### Dual Bridge Support (Temporary)

`WebShell` holds two maps — one for QObject bridges, one for typed bridges. This exists because SystemBridge is still a QObject with Qt signal connections (`StyleManager::themeChanged`, etc.). Once SystemBridge migrates to typed_bridge (Phase 6), the QObject map and all legacy dispatch code dies.

Registration:
```cpp
// Typed bridge (new)
auto* todoBridge = new TodoBridge;
shell.addBridge("todos", static_cast<web_shell::typed_bridge*>(todoBridge));

// QObject bridge (legacy)
auto* systemBridge = new SystemBridge;
shell.addBridge("system", systemBridge);
```

---

## What Stays

- **WebSocket JSON-RPC protocol** — JSON in, JSON out. Wire format unchanged.
- **TypeScript proxy** (`bridge-transport.ts`, `bridge.ts`) — sends JSON, receives JSON.
- **React UI** — Completely untouched.
- **Dev mode, Storybook, playwright-cdp, pywinauto** — All untouched.
- **Catch2 unit tests** — TodoStore domain logic, unchanged.

## What Dies (when migration is complete)

- `Q_INVOKABLE` on bridge methods
- `QMetaObject::invokeMethod` dispatch
- `coerce_arg()` and `QGenericArgument` machinery
- Hand-written `to_json(TodoItem)` in Qt bridge
- Hand-written `to_val(TodoItem)` in WASM bridge
- Separate Qt bridge and WASM bridge per domain area
- `SignalForwarder` with its parameterless-only limitation
- `TypeTestBridge` in its current QObject form
- `validate-bridges` tool
- The QObject bridge map in `WebShell`

---

## Remaining Migration Steps

### Phase 4 — Signal Tests

**4.1 — Write signal data tests**

Add tests to verify: C++ emits a signal with a def_type payload → TS receives the serialized data in the callback. This proves the full signal path works end-to-end.

**4.2 — Update TypeScript interfaces**

Signal callbacks in `bridge.ts` gain typed parameters:

```typescript
interface TodoBridge {
    itemAdded(cb: (item: TodoItem) => void): () => void
}
```

### Phase 5 — Kill WASM Duplication

**5.1 — Write the `nlohmann::json` ↔ `emscripten::val` adapter**

Two functions, written once:
- `emscripten::val to_em_val(const nlohmann::json&)`
- `nlohmann::json from_em_val(const emscripten::val&)`

**5.2 — WASM transport wraps the same bridge**

The same `TodoBridge` class gets wrapped for Embind. `todo_wasm_bridge.hpp` and all its `to_val()` functions go away.

**5.3 — Update WASM bindings**

`wasm_bindings.cpp` exposes the unified bridge through Embind.

### Phase 6 — SystemBridge

**6.1 — Migrate SystemBridge to typed_bridge**

Same pattern as TodoBridge. DTOs for file access, clipboard, theme control, etc. This requires unwiring Qt signal connections in `application.cpp` (`StyleManager::themeChanged`, etc.) and replacing them with the new signal system.

**6.2 — Remove the getter pattern**

`handleFilesDropped` → store data → emit parameterless signal → client calls `getDroppedFiles()` — this entire pattern goes away. The signal carries the data.

**6.3 — Build QWebChannel adapter**

A QObject wrapper with a single `Q_INVOKABLE QJsonObject dispatch(method, args)` method for the production desktop QWebChannel path. This replaces exposing individual QObject bridges.

### Phase 7 — Cleanup

- Delete `coerce_arg`, `invoke_bridge_method`, old `SignalForwarder`, QObject bridge map
- Delete `validate-bridges` tool
- Delete `todo_wasm_bridge.hpp`
- Rewrite `TypeTestBridge` for def_type
- Update `scaffold-bridge` tool to generate def_type-style bridges
- Update all `for-agents/` and `for-humans/` documentation
- Fix the MSVC `operator==` issue in def_type itself

---

## Key Decisions

1. **Explicit registration over MOC discovery.** `bridge.method("name", &fn)` instead of `Q_INVOKABLE`. Costs one line per method. Gains compile-time type deduction and zero Qt types in signatures.

2. **def_type as a hard dependency of the framework.** Not optional, not pluggable. The bridge system IS def_type DTOs.

3. **nlohmann::json as the internal serialization format.** Qt JSON and emscripten::val are transport-edge concerns. Everything between the transport and the domain logic speaks nlohmann.

4. **One bridge class per domain area.** Not one for Qt and one for WASM. The transport adapter is the framework's job.

5. **Signals carry data.** The parameterless-signal-plus-getter pattern is dead. Signals emit def_type structs.

6. **Domain structs use `field<T>` (typed path).** Not the hybrid path. `to_json()` works with no registration needed. PFR discovers fields automatically.

---

## Open Questions

- **def_type + Emscripten compatibility.** def_type uses C++23 and PFR. Need to verify it compiles under Emscripten's clang. If PFR doesn't work under Emscripten, the hybrid path (manual field registration via `struct_info<T>()`) is the fallback.
- **QWebChannel adapter shape.** Not built yet. The bridge needs to be a QObject for QWebChannel. Plan: a wrapper QObject with one `Q_INVOKABLE dispatch()` method that routes to the typed_bridge. Need to verify QWebChannel can forward signals from this wrapper.
- **MSVC `field<T>` operator==.** `field<T>` implicit conversion doesn't satisfy MSVC's `std::ranges` concept checking for predicates. Current workaround: free `operator==` templates in `todo_store.hpp`. Long-term fix: add `operator==` to `field<T>` in def_type.
- **Signal naming.** The example bridge uses `dataChanged` which is a terrible signal name carrying mixed types. Real bridges should use specific signal names with specific payload types (e.g., `listAdded` always carries a `TodoList`).

---

## Packaging Issues Found and Fixed

1. **def_type 1.0.0 — flat include structure.** Headers installed flat instead of in `def_type/` subdirectory. `def_type.hpp` couldn't find `def_type/field.hpp`. Fixed in 1.0.1.

2. **def_type 1.0.1 — PFR define not propagating.** The `enable_pfr` option and `DEF_TYPE_HAS_PFR` define were set during def_type's own build but not propagated to consumers. Fixed by adding `add_configs("enable_pfr", ...)` and `package:add("defines", "DEF_TYPE_HAS_PFR")` in the BuildWithCollab package recipe (`packages/d/def_type/xmake.lua`).

Both of these would have been caught by smoke tests. Setting up smoke tests for def_type is a priority.
