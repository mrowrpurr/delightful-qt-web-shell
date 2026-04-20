# def_type Migration — COMPLETE ✅

> Replaced the Qt-centric bridge layer with def_type DTOs. One bridge per domain area, zero hand-written serialization, typed signals with data.

## Status: VERIFIED WORKING (2026-04-20)

**Branch:** `def-type-migration` (15 commits) — **NOT merged to main yet**

**Tests:** 44 pass, 0 fail (`xmake run test-bun`) | Catch2: 46 assertions, 17 tests

**QA Results:**
- ✅ Desktop production (`xmake run desktop`) — Todos CRUD works, signals fire, UI refreshes
- ✅ Dev mode WebSocket (`xmake run dev-server` + `xmake run dev-web` at localhost:5173) — works
- ✅ Bun bridge tests — 44 pass, 0 fail
- ✅ WASM (`xmake run dev-wasm` at localhost:5173) — Todos CRUD works, Purr QA'd

### What is def_type?

Purr's C++ library — a Pydantic-style type definition framework. Plain C++ structs get reflection, JSON serialization (`to_json`/`from_json`), validation, and schema queries for free via PFR. No macros, no codegen, no `field<T>` wrappers needed (as of 1.1.0). Just C++23. Lives at `C:\Code\mrowr\BuildWithCollab\type_def\`, published to the BuildWithCollab package registry.

README: `C:\Code\mrowr\BuildWithCollab\type_def\README.md`

### What's left for the next agent

1. ~~**WASM compilation**~~ — ✅ DONE. Compiles and runs. Purr QA'd Todo CRUD via `dev-wasm`. Pure C++ bridge headers moved to `lib/todos/include/` so both platforms can see them.

2. ~~**`scaffold-bridge` tool**~~ — ✅ DONE. Generates def_type bridge classes with DTOs, idiomatic signal examples.

3. ~~**`for-agents/` documentation**~~ — ✅ DONE. All 8 docs rewritten for the new architecture.

4. ~~**Signal naming cleanup**~~ — ✅ DONE. `dataChanged` replaced with `listAdded`, `listRenamed`, `listDeleted`, `itemAdded`, `itemToggled`, `itemDeleted`. Each signal carries a consistent typed payload.

5. ~~**Remove debug logging**~~ — ✅ Already clean. No `qDebug()` in `bridge_channel_adapter.hpp`, no `console.log` in `bridge-transport.ts`.

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

### ~~MSVC `field<T>` operator==~~ — RESOLVED

No longer applies. `field<T>` removed entirely — all DTOs and domain structs are plain C++ structs. def_type 1.1.0 handles PFR on plain structs natively.

### ~~WASM compilation not tested~~ — RESOLVED

WASM compiles and runs. def_type + PFR work fine under Emscripten. Pure C++ bridge headers (`bridge.hpp`, `todo_bridge.hpp`) moved to `lib/todos/include/` so both desktop and WASM targets can include them.

### ~~QWebChannel production path not tested~~ — RESOLVED

QWebChannel tested and QA'd. Desktop production works.

### ~~Signal naming~~ — RESOLVED

Signals renamed: `listAdded`, `listRenamed`, `listDeleted`, `itemAdded`, `itemToggled`, `itemDeleted`.

### ~~Documentation rewrite (Phase 8)~~ — RESOLVED (for-agents)

All 8 `for-agents/` docs rewritten. `for-humans/` docs still reference the old architecture.

### Remaining

1. **`for-humans/` docs** — `02-architecture.md` and `03-tutorial.md` still reference `dataChanged` and the old bridge patterns. Need the same rewrite as `for-agents/`.

2. ~~**`getList` hand-builds JSON**~~ — ✅ DONE. Returns `ListDetail` struct directly. All bridge methods now return proper DTOs — zero `nlohmann::json` in either bridge.

3. ~~**`bridge.hpp` location**~~ — ✅ Moved to `lib/bridge/include/bridge.hpp` with its own headeronly target.

4. **Comprehensive type test bridge** — current tests cover Todo CRUD. No test exercises every def_type field type (vectors, maps, optionals, nested structs, enums) through the bridge dispatch.

5. **`bridges["system"]` syntax** — Currently: `app->shell()->bridges().value("system")`. Could be nicer with `operator[]` on the bridge map. Minor API polish.

6. **SystemBridge getter methods are dead weight** — `getAppLaunchArgs`, `getDroppedFiles` exist because old signals couldn't carry data. Now signals carry typed payloads (`appLaunchArgsReceived` sends `StringListResponse`, `filesDropped` sends `StringListResponse`). The getters should be removed — listeners should use the signal payload directly instead of calling back to C++ to re-fetch what was just sent.

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
13. `🔥 Replace field<T> with plain structs` — def_type 1.1.0, PFR handles plain structs natively
14. `🏷️ Rename typed_bridge → bridge` — file + all references
15. `🔧 Move pure C++ bridge headers to shared lib` — WASM builds

---

## Key Decisions Made

1. **Explicit registration over MOC discovery.** `bridge.method("name", &fn)` instead of `Q_INVOKABLE`.
2. **def_type as a hard dependency.** The bridge system IS def_type DTOs.
3. **nlohmann::json as the internal serialization format.** Qt JSON and emscripten::val are transport-edge concerns.
4. **One bridge class per domain area.** Not one for Qt and one for WASM.
5. **Signals carry data.** The parameterless-signal-plus-getter pattern is dead.
6. **Domain structs are plain C++ structs.** PFR auto-discovers fields. `to_json()` works with no registration. `field<T>` removed in def_type 1.1.0 upgrade.
7. **QWebChannel adapter pattern.** A thin QObject with one `Q_INVOKABLE dispatch()` method wraps typed bridges for the production desktop path.

---

## Packaging Issues Found and Fixed

1. **def_type 1.0.0 — flat include structure.** Fixed in 1.0.1.
2. **def_type 1.0.1 — PFR define not propagating.** Fixed by adding `add_configs("enable_pfr")` and `package:add("defines", "DEF_TYPE_HAS_PFR")` in the BuildWithCollab package recipe. Both would have been caught by smoke tests.
