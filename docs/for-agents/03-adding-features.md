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

### 2. Bridge wrapper

`lib/bridges/include/todo_bridge.hpp` — mark it `Q_INVOKABLE`:

```cpp
Q_INVOKABLE QJsonObject addItem(const QString& listId, const QString& text) {
    auto item = store_.add_item(listId.toStdString(), text.toStdString());
    emit dataChanged();
    return to_json(item);
}
```

`to_json()` is a hand-written helper — **you write one for each domain struct** you want to return. It lives as a `static` method in the bridge class:

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

There's no auto-generation or macro. Qt doesn't know your struct layout, so you map fields manually. This is the pattern used throughout the template — see `todo_bridge.hpp` for the full example.

### 3. TypeScript interface

`web/src/api/bridge.ts`:

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
1. Creates `lib/bridges/include/notes_bridge.hpp` — C++ bridge with `Q_OBJECT` + skeleton
2. Creates `web/src/api/notes-bridge.ts` — TypeScript interface stub
3. Wires `#include` + `addBridge()` into both `desktop/src/main.cpp` and `tests/helpers/dev-server/src/test_server.cpp`

No xmake.lua edits needed — the `lib/bridges/` target uses glob discovery.

### After scaffolding

1. Add `Q_INVOKABLE` methods to `lib/bridges/include/notes_bridge.hpp`
2. Mirror them in `web/src/api/notes-bridge.ts`
3. Use it: `const notes = await getBridge<NotesBridge>('notes')`

### Checklist

- [ ] `Q_INVOKABLE` methods + `to_json()` helpers for your structs in the `.hpp`
- [ ] Matching TypeScript interface in the `.ts`
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
