# Tutorial — Your First Feature in 5 Minutes

> **Shortcut:** `xmake run scaffold-bridge <name>` scaffolds a new bridge end-to-end. This tutorial walks through the pattern manually so you understand what's happening under the hood.

We'll add an `addItem` method — from C++ domain logic to React UI — and see how the three-file pattern works.

## The Three Files

```
├── lib/todos/include/todo_store.hpp        ← C++ domain logic
├── lib/bridges/include/todo_bridge.hpp  ← Q_INVOKABLE wrapper
└── web/src/api/bridge.ts                   ← TypeScript interface
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

## Step 2: Expose It to JavaScript

Add a `Q_INVOKABLE` method to `TodoBridge` — the QObject wrapper.

**`lib/bridges/include/todo_bridge.hpp`:**

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

## Step 3: Define the TypeScript Interface

**`web/src/api/bridge.ts`:**

```typescript
export interface TodoBridge {
  // ... existing methods ...
  addItem(listId: string, text: string): Promise<TodoItem>
}
```

## Step 4: Use It in React

```typescript
const todos = await getBridge<TodoBridge>('todos')
await todos.addItem(listId, 'Buy milk')
```

That's it. Three files, no wiring, no glue code.

## What Just Happened?

| File | What you wrote |
|------|----------------|
| `todo_store.hpp` | The actual logic |
| `todo_bridge.hpp` | Q_INVOKABLE wrapper + signal |
| `bridge.ts` | TypeScript interface line |

The bridge infrastructure didn't change at all. It discovered your new method via `QMetaObject` introspection and made it callable from JavaScript automatically.

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
xmake run test-all            # run the fast test layers
```
