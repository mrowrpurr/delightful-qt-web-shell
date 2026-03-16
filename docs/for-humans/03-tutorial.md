# Tutorial — Your First Feature in 5 Minutes

> **Shortcut:** `xmake run scaffold-bridge <name>` scaffolds a new bridge end-to-end. This tutorial walks through the pattern manually so you understand what's happening under the hood.

We'll add an `addItem` method — from C++ domain logic to React UI — and see how the four-file pattern works (domain logic + Qt bridge + WASM bridge + TypeScript interface).

## The Four Files

```
├── lib/todos/include/todo_store.hpp              ← C++ domain logic
├── lib/bridges/qt/include/todo_bridge.hpp        ← Qt bridge (Q_INVOKABLE)
├── lib/bridges/wasm/include/todo_wasm_bridge.hpp ← WASM bridge (Embind)
└── web/src/api/bridge.ts                         ← TypeScript interface
```

## Step 1: Write the C++ Logic

Add the method to `TodoStore` — pure C++, no Qt, no JSON.

**`lib/todos/include/todo_store.hpp`:**

```cpp
TodoItem add_item(const std::string& list_id, const std::string& text) {
    TodoItem item{gen_id(), list_id, text, false, now_iso()};
    items_.push_back(item);
    return item;
}
```

## Step 2: Expose It via the Qt Bridge (Desktop)

Add a `Q_INVOKABLE` method to `TodoBridge` — the QObject wrapper.

**`lib/bridges/qt/include/todo_bridge.hpp`:**

```cpp
Q_INVOKABLE QJsonObject addItem(const QString& listId, const QString& text) {
    auto item = store_.add_item(listId.toStdString(), text.toStdString());
    emit dataChanged();
    return to_json(item);
}
```

`to_json()` is a hand-written helper that maps C++ struct fields to a `QJsonObject`:

```cpp
static QJsonObject to_json(const TodoItem& i) {
    return {
        {"id",   QString::fromStdString(i.id)},
        {"text", QString::fromStdString(i.text)},
        {"done", i.done},
    };
}
```

**Why `QJsonObject`?** Return `QJsonObject` or `QJsonArray` and JS gets the data directly. If you return a scalar (`QString`, `int`, `bool`), JS receives it wrapped: `{value: "hello"}` instead of `"hello"`. This is by design — always return structured types for a clean JS API.

## Step 3: Expose It via the WASM Bridge (Browser)

Add a matching method to `TodoWasmBridge` — **same method name**, same domain call, but returns `emscripten::val` instead of `QJsonObject`.

**`lib/bridges/wasm/include/todo_wasm_bridge.hpp`:**

```cpp
emscripten::val addItem(const std::string& listId, const std::string& text) {
    auto item = store_.add_item(listId, text);
    return to_val(item);
}
```

`to_val()` maps C++ struct fields to a JavaScript object in WASM memory:

```cpp
static emscripten::val to_val(const TodoItem& i) {
    auto obj = emscripten::val::object();
    obj.set("id",   i.id);
    obj.set("text", i.text);
    obj.set("done", i.done);
    return obj;
}
```

The method is registered with Embind at the bottom of the file:

```cpp
EMSCRIPTEN_BINDINGS(todo_bridge) {
    emscripten::class_<TodoWasmBridge>("TodoBridge")
        .constructor<>()
        .function("addItem", &TodoWasmBridge::addItem);
}
```

> **Pattern:** Qt bridge uses `to_json()` → `QJsonObject`. WASM bridge uses `to_val()` → `emscripten::val`. Same method names, same domain calls, different serialization.

## Step 4: Define the TypeScript Interface

**`web/src/api/bridge.ts`:**

```typescript
export interface TodoBridge {
  // ... existing methods ...
  addItem(listId: string, text: string): Promise<TodoItem>
}
```

## Step 5: Use It in React

```typescript
const todos = await getBridge<TodoBridge>('todos')
await todos.addItem(listId, 'Buy milk')
```

That's it. Four files, no wiring, no glue code.

## What Just Happened?

| File | What you wrote |
|------|----------------|
| `todo_store.hpp` | The actual logic (shared by both targets) |
| `todo_bridge.hpp` | Qt bridge: `Q_INVOKABLE` wrapper + `to_json()` |
| `todo_wasm_bridge.hpp` | WASM bridge: Embind method + `to_val()` |
| `bridge.ts` | TypeScript interface line (shared by both targets) |

The bridge infrastructure didn't change at all. The Qt side discovered your new method via `QMetaObject` introspection. The WASM side exposed it via Embind. Both are callable from the same React code.

## Adding a New Bridge

When you need a new domain area (not just a method on `todos`):

```bash
xmake run scaffold-bridge settings
```

This creates the C++ header, TypeScript interface stub, and wires registration into both entry points (`main.cpp` and `test_server.cpp`). No xmake.lua edits needed — the glob picks up new headers automatically.

Then add your `Q_INVOKABLE` methods to the `.hpp` and mirror them in the `.ts`.

Validate with `xmake run validate-bridges`.

## Signals — Push Events from C++ to React

Add a parameterless signal and emit it:

```cpp
signals:
    void dataChanged();

// In a method:
emit dataChanged();
```

Subscribe in TypeScript:

```typescript
const cleanup = todos.dataChanged(() => {
  console.log('data changed!')
  refresh()
})
// Later: cleanup() to unsubscribe
```

In a React component:

```typescript
useEffect(() => {
  const cleanup = todos.dataChanged(() => setStale(true))
  return cleanup
}, [])
```

## Validate Your Work

```bash
xmake run validate-bridges   # checks TS interfaces match C++ methods
xmake run test-all            # run all test layers
```

> If you only changed WASM bridge code, Catch2 covers the domain logic (same C++) and browser e2e covers the UI. You don't need separate WASM tests — the domain logic is identical.
