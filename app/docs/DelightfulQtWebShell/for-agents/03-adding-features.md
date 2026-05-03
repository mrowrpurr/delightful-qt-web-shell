# Adding Features

> **Shortcut:** `xmake run scaffold-bridge <name>` scaffolds a new bridge end-to-end. The manual steps below show what's happening under the hood.

## Adding a Method to an Existing Bridge

Three files. No wiring.

### 1. C++ domain logic

`lib/todos/include/todo_store.hpp` — pure C++, no Qt:

```cpp
TodoItem add_item(const std::string& list_id, const std::string& text) {
    TodoItem item{gen_id(), list_id, text, false, now_iso()};
    items_.push_back(item);
    return item;
}
```

### 2. Request DTO + bridge method

Define a request DTO in `lib/todos/include/todo_dtos.hpp` — a plain C++ struct:

```cpp
struct AddItemRequest {
    std::string list_id;
    std::string text;
};
```

Add the method to `lib/todos/include/todo_bridge.hpp` and register it in the constructor:

```cpp
class TodoBridge : public app_shell::Bridge {
public:
    TodoBridge() {
        // ... existing registrations ...
        method("addItem", &TodoBridge::addItem);

        signal("itemAdded");
    }

    TodoItem addItem(AddItemRequest req) {
        auto item = store_.add_item(req.list_id, req.text);
        emit_signal("itemAdded", item);
        return item;
    }
};
```

That's it on the C++ side. `def_type::from_json` deserializes the request automatically via PFR. `def_type::to_json` serializes the response automatically. No hand-written `to_json()` helpers, no `to_val()` helpers. One bridge class serves both desktop and WASM.

### 3. TypeScript interface

`web/shared/api/bridge.ts`:

```typescript
export interface TodoBridge {
  // ... existing methods ...
  addItem(req: { list_id: string; text: string }): Promise<TodoItem>
}
```

Note that TS calls pass a **request object**, not positional arguments:

```typescript
await todos.addItem({ list_id: id, text: "Buy milk" })
```

### Use it

```typescript
const todos = await getBridge<TodoBridge>('todos')
await todos.addItem({ list_id: listId, text: 'Buy milk' })
```

Done. The proxy connects them automatically.

### Return types

| C++ returns | JSON result | Notes |
|------------|-------------|-------|
| A def_type struct | The struct as a JSON object | `{"id": "1", "name": "Groceries"}` |
| `std::vector<T>` | A JSON array | Each element serialized recursively |
| `bool` | `{"ok": value}` | |
| `void` / `OkResponse` | `{"ok": true}` | For side-effect-only methods |
| `nlohmann::json` | Passthrough | For manually constructed responses |

**Errors are thrown as JS exceptions.** Unknown method -> clear error. C++ exceptions -> `{"error": "message"}`. You'll see these in the browser console (F12) or in test output — they don't fail silently.

---

## Adding a New Bridge

When you need a new domain area (not just a new method on `todos`):

```bash
xmake run scaffold-bridge notes
```

This creates a new bridge class with def_type DTOs:
1. Creates `lib/bridges/qt/include/notes_bridge.hpp` — bridge class extending `app_shell::Bridge` with method/signal registration skeleton
2. Creates a DTOs header for request/response structs
3. Creates `web/shared/api/notes-bridge.ts` — TypeScript interface stub
4. Wires `#include` + `addBridge()` into both `desktop/src/application.cpp` and `tests/helpers/dev-server/src/test_server.cpp`

No xmake.lua edits needed — the bridge targets use glob discovery.

### After scaffolding

1. Define request DTOs as plain C++ structs
2. Add methods to the bridge class — each takes a request DTO and returns a response struct
3. Register each method: `method("name", &MyBridge::fn)`
4. Register signals: `signal("itemCreated")`, `signal("itemArchived")`
5. Mirror methods in the TypeScript interface
6. Use it: `const notes = await getBridge<NotesBridge>('notes')`

No WASM-specific bridge needed. The generic `WasmBridgeWrapper` handles any `app_shell::Bridge` automatically.

### Checklist

- [ ] Domain logic in `lib/` — pure C++, no framework deps
- [ ] Request DTOs — plain C++ structs (auto-serialized by PFR)
- [ ] Bridge class extending `app_shell::Bridge` — methods registered with `method("name", &fn)`
- [ ] Bridge registered in `application.cpp` and `test_server.cpp`: `shell.addBridge("name", bridge)`
- [ ] TypeScript interface with request objects matching the DTOs
- [ ] Compiles — compile-time type safety catches DTO mismatches

---

## Signals (C++ -> JavaScript Events)

Push real-time updates from C++ to React. Signals carry typed data — no parameterless-signal-plus-getter pattern.

### Emit from C++

Register signals in the constructor and emit them with payload data:

```cpp
// In the constructor:
signal("itemAdded");
signal("listDeleted");

// In a method:
TodoItem addItem(AddItemRequest req) {
    auto item = store_.add_item(req.list_id, req.text);
    emit_signal("itemAdded", item);   // item is serialized via def_type::to_json
    return item;
}

OkResponse deleteList(DeleteListRequest req) {
    store_.delete_list(req.list_id);
    emit_signal("listDeleted", req);  // any def_type struct works as payload
    return {};
}
```

**Signals carry data.** The second argument to `emit_signal` is serialized to JSON via `def_type::to_json` and delivered to all listeners. Use specific signal names with specific payload types (e.g., `listAdded` always carries a `TodoList`, `itemToggled` always carries a `TodoItem`).

The signal system works the same across all transports:
- **WebSocket:** `expose_as_ws.hpp` forwards signals as JSON messages with the payload.
- **QWebChannel:** `BridgeChannelAdapter` re-emits bridge signals as Qt signals with JSON string payloads.
- **WASM:** `WasmBridgeWrapper.subscribe()` converts the JSON payload to a JS object and calls the callback.

### Subscribe in TypeScript

Add to your interface:
```typescript
export interface TodoBridge {
  itemAdded(callback: (item: TodoItem) => void): () => void
}
```

Use it:
```typescript
const todos = await getBridge<TodoBridge>('todos')
const cleanup = todos.itemAdded((item) => {
  console.log('item added:', item)
  refresh()
})

// Later: cleanup() to unsubscribe
```

### In React

```typescript
useEffect(() => {
  const cleanup = todos.itemAdded((item) => {
    setItems(prev => [...prev, item])
  })
  return cleanup
}, [])
```

---

## Adding a New Web App

The web layer supports multiple Vite apps under `web/apps/`. Each shares code from `web/shared/` via the `@shared` alias.

1. Copy `web/apps/main/` to `web/apps/yourapp/`
2. Edit its `vite.config.ts` — set a unique dev port, keep the `@shared` alias
3. Add scripts to `web/package.json`: `"build:yourapp": "cd apps/yourapp && vite build"`, `"dev:yourapp": "cd apps/yourapp && vite --port 5175"`
4. Register in `desktop/src/widgets/scheme_handler.cpp` — add host routing so `app://yourapp/` serves from `:/web-yourapp/`
5. Add to `WEB_APPS` list in `desktop/xmake.lua` so it gets built and embedded in the qrc
6. Create a `WebShellWidget` pointed at `app->appUrl("yourapp")` wherever you want it

The new app automatically gets all shared bridges — `getBridge<TodoBridge>('todos')` works the same way.

## Adding Hash Routes (Dialog Pattern)

To render different UIs from the same app build (e.g., a dialog vs the main window):

1. Create a view component (e.g., `SettingsView.tsx`)
2. In `main.tsx`, check `window.location.hash`:
   ```typescript
   const hash = window.location.hash
   if (hash === '#/settings') root.render(<SettingsView />)
   else root.render(<App />)
   ```
3. From C++, set the hash when loading the URL:
   ```cpp
   QUrl url = app->appUrl("main");
   url.setFragment("/settings");
   ```

**QTimer::singleShot(0, ...) is required** when a bridge method triggers opening a modal dialog. Without deferring, the QWebChannel blocks and the dialog's own channel can't initialize. See `main_window.cpp` for the pattern.

---

## Validate Your Work

```bash
xmake run test-all            # run all tests
```

Compile-time type safety catches DTO mismatches between your request structs and bridge method signatures. If the types don't match, the code won't compile — no separate validation step needed.
