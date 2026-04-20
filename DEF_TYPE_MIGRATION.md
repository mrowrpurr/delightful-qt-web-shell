# def_type Migration — COMPLETE ✅

> Replaced the Qt-centric bridge layer with def_type DTOs. One bridge per domain area, zero hand-written serialization, typed signals with data.

## Status: VERIFIED WORKING (2026-04-20)

**Branch:** `def-type-migration` (12 commits) — **NOT merged to main yet**

**Tests:** 44 pass, 0 fail (`xmake run test-bun`)

**QA Results:**
- ✅ Desktop production (`xmake run desktop`) — Todos CRUD works, signals fire, UI refreshes
- ✅ Dev mode WebSocket (`xmake run dev-server` + `xmake run dev-web` at localhost:5173) — works
- ✅ Bun bridge tests — 44 pass, 0 fail

### What is def_type?

Purr's C++ library — a Pydantic-style type definition framework. Define a struct with `field<T>` members, get reflection, JSON serialization (`to_json`/`from_json`), validation, and schema queries for free. No macros, no codegen, just C++23. Lives at `C:\Code\mrowr\BuildWithCollab\type_def\`, published to the BuildWithCollab package registry.

README: `C:\Code\mrowr\BuildWithCollab\type_def\README.md`

### What's left for the next agent

1. **WASM compilation** — code is written but needs `xmake f -p wasm` to compile and test. The `WasmBridgeWrapper` and rewritten `wasm-transport.ts` haven't been tested under Emscripten. Potential issues: def_type C++23/PFR under Emscripten's clang, nlohmann::json round-trip via `JSON.parse`/`JSON.stringify`.

2. **`scaffold-bridge` tool** — still generates old-style QObject bridges. Needs rewriting to generate bridge classes with def_type DTOs.

3. **`for-agents/` documentation** — all 8 docs describe the OLD architecture. Full rewrite needed (see Phase 8 below).

4. **Signal naming cleanup** — TodoBridge uses `dataChanged` which is a terrible signal name carrying mixed types. Should be `listAdded`, `itemAdded`, `listDeleted`, etc. with specific payload types.

5. **Remove debug logging** — `bridge_channel_adapter.hpp` has `qDebug()` calls and `bridge-transport.ts` has `console.log` calls from debugging. Remove before merge.

### How to run/test

```bash
# Build
xmake build dev-server          # test server (WebSocket path)
xmake build desktop             # full desktop build (includes Vite)
SKIP_VITE=1 xmake build desktop # C++ only (after first Vite build)

# Test
xmake run test-bun              # 44 tests: bridge_proxy + system_bridge + type_conversion

# Run
xmake run desktop               # production desktop (QWebChannel)
xmake run dev-server            # WebSocket backend (terminal 1)
xmake run dev-web               # Vite dev server (terminal 2, open localhost:5173)
```

### QWebChannel architecture notes (for next agent)

The production desktop path uses `BridgeChannelAdapter` (a QObject) that wraps each bridge for QWebChannel:

- **Method calls:** TS calls `adapter.dispatch("addList", {name: "..."})` → C++ routes through bridge dispatch → returns JSON string → TS parses it
- **Signals:** bridge `emit_signal("dataChanged", payload)` → adapter re-emits as Qt signal `bridgeSignal(name, jsonString)` → QWebChannel forwards to JS → TS routes to per-signal listeners
- **Signal detection:** TS uses a heuristic — if the first argument to a bridge property call is a function, it's treated as a signal subscription. This works because method calls always pass objects, never functions.
- **Return type:** `dispatch()` returns `QString` (JSON string). `QJsonObject` and `QJsonValue` returns silently break QWebChannel callbacks. Always use strings.

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
| `lib/web-shell/include/bridge.hpp` | Bridge base class. Method registration via `method("name", &fn)`. Signal registration, emission, subscription. Dispatch engine. Contains `OkResponse` shared DTO. |
| `lib/web-shell/include/json_adapter.hpp` | `to_qt_json()` / `from_qt_json()` — nlohmann ↔ Qt JSON. Used at transport boundaries only. |
| `lib/web-shell/include/expose_as_ws.hpp` | WebSocket JSON-RPC server. Typed bridge dispatch only. Signal forwarding with payloads. |
| `lib/web-shell/include/bridge_channel_adapter.hpp` | QObject wrapper for QWebChannel. Single `Q_INVOKABLE dispatch(method, args)` method routes to bridge. |
| `lib/web-shell/include/web_shell.hpp` | Bridge registry. Single `QMap<QString, bridge*>`. Still a QObject for `appReady()` lifecycle. |
| `lib/todos/include/todo_store.hpp` | Domain structs use `field<T>` with PFR auto-reflection. |
| `lib/todos/include/todo_dtos.hpp` | Request DTOs for TodoBridge methods. |
| `lib/bridges/qt/include/todo_bridge.hpp` | Pure C++ typed bridge. Zero Qt types. |
| `lib/bridges/qt/include/system_bridge.hpp` | Pure def_type interface. Qt used internally for file I/O, clipboard, dialogs. |
| `lib/bridges/qt/include/system_dtos.hpp` | Request/response DTOs for SystemBridge methods. |
| `lib/bridges/wasm/include/wasm_bridge_wrapper.hpp` | Generic Embind wrapper for any bridge. `call()`, `subscribe()`, `methods()`, `signals()`. |
| `lib/bridges/wasm/src/wasm_bindings.cpp` | Embind registration. `getBridge("todos")` factory. |
| `web/shared/api/bridge-transport.ts` | Signal callbacks receive `msg.args` (typed data). |
| `web/shared/api/wasm-transport.ts` | Generic dispatch through `wrapper.call()`. |

### How Dispatch Works

```
TypeScript → WebSocket JSON-RPC → expose_as_ws.hpp
                                       │
                                       └─ bridge::dispatch()
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
  → bridge serializes via to_json
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

1. Create a class extending `web_shell::bridge`
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

The old `TypeTestBridge` (QObject, QVariant-based type tests) was removed. It tested the now-deleted QVariant dispatch system. The replacement tests in `type_conversion_test.ts` exercise TodoBridge through the bridge dispatch, covering:
- CRUD operations (addList, getList, addItem, toggleItem, deleteList, deleteItem, renameList, search)
- Error handling (nonexistent list/item)
- Signal data flow (emit with payload → TS receives data)
- Unknown method error

A more comprehensive def_type type test bridge (exercising every field type — vectors, maps, optionals, nested structs, enums) should be written later.

### Signal naming

The example TodoBridge uses `dataChanged` which is a terrible signal name that sometimes carries a `TodoList` and sometimes a `TodoItem`. Real bridges should use specific signal names with specific payload types (e.g., `listAdded` always carries a `TodoList`). This is a documentation/example issue, not an architecture issue.

### Documentation rewrite needed (Phase 8)

The entire `docs/DelightfulQtWebShell/for-agents/` and `for-humans/` doc sets describe the OLD architecture. Every doc that mentions bridges is wrong now. The key changes a rewrite must cover:

**02-architecture.md** — The proxy pattern section describes `Q_INVOKABLE` + `QMetaObject` dispatch + `QVariant` coercion. All dead. Replace with `bridge` + `method()` registration + def_type dispatch. The "Four Layers You Touch" section still says "Qt bridge" and "WASM bridge" as separate layers — now it's one bridge. Return value wrapping (`{value: ...}` for scalars) is gone — everything goes through `serialize_response`. The type system section about QVariant is irrelevant.

**03-adding-features.md** — The entire "Adding a Method" recipe (4 files: domain logic, Qt bridge with `Q_INVOKABLE` + `to_json()`, WASM bridge with `to_val()`, TS interface) is replaced by: define a request DTO, write the method, register it. One bridge, not two. The `scaffold-bridge` tool still generates old-style bridges.

**04-testing.md** — `validate-bridges` tool is gone (compile-time safety replaces it). TypeTestBridge is gone. The "What Changed → What to Test" table needs updating.

**06-gotchas.md** — "Return `QJsonObject` but got `{value: ...}`" is gone. "Register bridge in `application.cpp` and `test_server.cpp`" still applies but the pattern changed. The scalar wrapping gotcha is irrelevant.

**07-desktop-capabilities.md** — SystemBridge API section describes `Q_INVOKABLE` methods with `QString` params. All signatures changed to def_type DTOs with request objects.

**08-theming.md** — Qt ↔ React sync section describes `setQtTheme(displayName, isDark)` with positional args. Now takes a `SetQtThemeRequest` object. Signal names same but mechanism changed.

**README.md** — References "five test layers" and `validate-bridges`. TypeTestBridge layer gone, validate-bridges gone.

The `for-humans/` docs mirror the same structure and need the same updates.

### `bridges["system"]` syntax

Currently: `app->shell()->bridges().value("system")`. Could be nicer with `operator[]` on the bridge map. Minor API polish.

---

## Commits on `def-type-migration`

1. `🔥 def_type migration — Phase 1-3 complete` — Foundation, dispatch engine, TodoBridge rewrite
2. `✨ Phase 4 — signal data test passes` — Signal payloads flow end-to-end
3. `💀 Phase 5 — Kill WASM bridge duplication` — Delete `todo_wasm_bridge.hpp`, generic Embind wrapper
4. `🔥 Phase 6 — SystemBridge migrated to bridge` — All 6 desktop callsites updated
5. `🧹 Phase 7 — Cleanup: delete all legacy dispatch code` — Remove QObject map, coerce_arg, SignalForwarder, TypeTestBridge
6. `📝 Update migration doc with final status`
7. `📝 Add critical context for next agent`
8. `📝 Add Phase 8 — documentation rewrite spec`
9. `🔧 Fix React UI — update all bridge calls to use request objects`
10. `🔧 Fix QWebChannel — route through BridgeChannelAdapter.dispatch()`
11. `🐛 Fix QWebChannel dispatch — return QString not QJsonValue` (QJsonValue hangs callbacks)
12. `🐛 Fix QWebChannel signals — BridgeChannelAdapter re-emits bridge signals as Qt signals`

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
