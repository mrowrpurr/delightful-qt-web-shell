# Adding Features

> **Shortcut:** `xmake run scaffold-bridge <name>` scaffolds a new bridge end-to-end. The manual steps below show what's happening under the hood.

## Adding a Method to an Existing Bridge

Four files. No wiring.

### 1. C++ domain logic

`lib/todos/include/todo_store.hpp` — pure C++, no Qt:

```cpp
TodoItem add_item(const std::string& list_id, const std::string& text) {
    TodoItem item{gen_id(), list_id, text, false, now_iso()};
    items_.push_back(item);
    return item;
}
```

### 2. Qt bridge wrapper (desktop)

`lib/bridges/qt/include/todo_bridge.hpp` — mark it `Q_INVOKABLE`. Parameters can be `QString`, `int`, `double`, `bool`, `QJsonObject`, `QJsonArray`, or `QStringList` — the bridge converts JSON args automatically:

```cpp
Q_INVOKABLE QJsonObject addItem(const QString& listId, const QString& text) {
    auto item = store_.add_item(listId.toStdString(), text.toStdString());
    emit dataChanged();
    return to_json(item);
}
```

`to_json()` is a hand-written helper — **you write one for each domain struct** you want to return:

```cpp
static QJsonObject to_json(const TodoItem& i) {
    return {
        {"id",         QString::fromStdString(i.id)},
        {"text",       QString::fromStdString(i.text)},
        {"done",       i.done},
        {"created_at", QString::fromStdString(i.created_at)},
    };
}
```

### 3. WASM bridge wrapper (browser)

`lib/bridges/wasm/include/todo_wasm_bridge.hpp` — same method names, same domain call, but returns `emscripten::val` instead of `QJsonObject`:

```cpp
emscripten::val addItem(const std::string& listId, const std::string& text) {
    auto item = store_.add_item(listId, text);
    notify();
    return to_val(item);
}
```

`to_val()` is the WASM equivalent of `to_json()`:

```cpp
static emscripten::val to_val(const TodoItem& i) {
    auto obj = emscripten::val::object();
    obj.set("id", i.id);
    obj.set("text", i.text);
    obj.set("done", i.done);
    obj.set("created_at", i.created_at);
    return obj;
}
```

Then register it with Embind in `lib/bridges/wasm/src/wasm_bindings.cpp`:

```cpp
EMSCRIPTEN_BINDINGS(bridges) {
    emscripten::class_<TodoWasmBridge>("TodoBridge")
        .constructor()
        .function("addItem", &TodoWasmBridge::addItem);
        // ... all other methods
}
```

**The pattern:** `to_json()` for Qt, `to_val()` for WASM. Same fields, same structure, different types. Both are thin wrappers around the same domain logic — they should produce identical JSON shapes.

**Return type matters on the JS side (Qt bridge only):**

| C++ returns | JS receives | Why |
|------------|-------------|-----|
| `QJsonObject` | The object directly | `{id: "1", name: "Groceries"}` |
| `QJsonArray` | The array directly | `[{id: "1"}, {id: "2"}]` |
| `QString`, `int`, `double`, `bool` | Wrapped: `{value: ...}` | Scalars need a JSON wrapper |
| `void` | `{ok: true}` | Acknowledgement |

**WASM bridge returns are always direct** — `emscripten::val` creates JS objects, so there's no wrapping.

**Errors are thrown as JS exceptions.** Wrong arg count → `"addItem: expected 2 args, got 1"`. Unknown method → clear error. You'll see these in the browser console (F12) or in Playwright test output — they don't fail silently.

### 4. TypeScript interface

`web/shared/api/bridge.ts`:

```typescript
export interface TodoBridge {
  // ... existing methods ...
  addItem(listId: string, text: string): Promise<TodoItem>
}
```

### Use it

```typescript
const todos = await getBridge<TodoBridge>('todos')
await todos.addItem(listId, 'Buy milk')
```

Done. The proxy connects them automatically.

---

## Adding a New Bridge

When you need a new domain area (not just a new method on `todos`):

```bash
xmake run scaffold-bridge notes
```

This does everything:
1. Creates `lib/bridges/qt/include/notes_bridge.hpp` — C++ bridge with `Q_OBJECT` + skeleton
2. Creates `web/shared/api/notes-bridge.ts` — TypeScript interface stub
3. Wires `#include` + `addBridge()` into both `desktop/src/application.cpp` and `tests/helpers/dev-server/src/test_server.cpp`

No xmake.lua edits needed — the `lib/bridges/qt/` target uses glob discovery.

### After scaffolding

1. Add `Q_INVOKABLE` methods to `lib/bridges/qt/include/notes_bridge.hpp`
2. Create the WASM bridge: `lib/bridges/wasm/include/notes_wasm_bridge.hpp` — same method names, `emscripten::val` returns, `to_val()` helpers
3. Register in `lib/bridges/wasm/src/wasm_bindings.cpp` with `EMSCRIPTEN_BINDINGS`
4. Register in `web/shared/api/wasm-transport.ts` — add `notes: new wasm.NotesBridge()` to the bridges map
5. Mirror methods in `web/shared/api/notes-bridge.ts`
6. Use it: `const notes = await getBridge<NotesBridge>('notes')`

> The scaffolder handles Qt bridge + TS interface + wiring. WASM bridge creation is manual — see `todo_wasm_bridge.hpp` for the pattern.

### Checklist

- [ ] Domain logic in `lib/` — pure C++, no framework deps
- [ ] Qt bridge: `Q_INVOKABLE` methods + `to_json()` helpers
- [ ] WASM bridge: Embind-registered class + `to_val()` helpers + `EMSCRIPTEN_BINDINGS`
- [ ] WASM transport: bridge instance registered in `wasm-transport.ts`
- [ ] TypeScript interface matching both bridges
- [ ] Run `xmake run validate-bridges` to verify C++ and TS match

---

## Signals (C++ → JavaScript Events)

Push real-time updates from C++ to React.

### Emit from C++

Add a parameterless signal and emit it:

```cpp
// todo_bridge.hpp
signals:
    void dataChanged();

// In a method:
Q_INVOKABLE QJsonObject addItem(...) {
    // ...
    emit dataChanged();
    return result;
}
```

**Only parameterless signals are auto-forwarded** to connected clients. Signals with parameters (e.g., `void itemAdded(QString id)`) are listed in `__meta__` but are NOT forwarded over WebSocket — the forwarding mechanism uses a generic slot that can't receive arbitrary parameter types. If you need to push data, emit a parameterless signal and have the client re-fetch.

**WASM equivalent:** Signals don't exist in Embind. Instead, expose an `onDataChanged(callback)` method that stores a JS callback. Call it from mutation methods:

```cpp
// In the WASM bridge:
std::vector<emscripten::val> data_changed_listeners_;
void notify() { for (auto& cb : data_changed_listeners_) cb(); }
void onDataChanged(emscripten::val callback) { data_changed_listeners_.push_back(callback); }
```

The WASM transport maps `onDataChanged` to the same `dataChanged` signal interface React expects — no changes needed in your components.

### Subscribe in TypeScript

Add to your interface:
```typescript
export interface TodoBridge {
  dataChanged(callback: () => void): () => void
}
```

Use it:
```typescript
const todos = await getBridge<TodoBridge>('todos')
const cleanup = todos.dataChanged(() => {
  console.log('data changed, refreshing...')
  refresh()
})

// Later: cleanup() to unsubscribe
```

### In React

```typescript
useEffect(() => {
  const cleanup = todos.dataChanged(() => setStale(true))
  return cleanup
}, [])
```

---

## Adding a New Web App

The web layer supports multiple Vite apps under `web/apps/`. Each shares code from `web/shared/` via the `@shared` alias.

1. Copy `web/apps/docs/` to `web/apps/yourapp/`
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

**⚠️ QTimer::singleShot(0, ...) is required** when a bridge method triggers opening a modal dialog. Without deferring, the QWebChannel blocks and the dialog's own channel can't initialize. See `main_window.cpp` for the pattern.

---

## Validate Your Work

```bash
xmake run validate-bridges   # checks TS interfaces match C++ methods
xmake run test-all            # run all tests
```

The bridge validator catches drift between C++ and TypeScript at dev time — before you find out at runtime.

### What validate-bridges output looks like

**Passing:**
```
Bridge "todos": 9 methods, 1 signal — all match ✓
Bridge "typeTest": 18 methods, 0 signals — all match ✓
All bridges validated successfully.
```

**Failing (TS method missing in C++):**
```
ERROR: Bridge "todos" — TS declares "removeItem" but C++ has no matching Q_INVOKABLE method
```

**Warning (C++ method missing in TS):**
```
WARNING: Bridge "todos" — C++ has "search" but TS interface doesn't declare it (won't be callable from JS)
```

Errors (TS declares something C++ doesn't have) cause exit code 1. Warnings (C++ has extras) are informational.
