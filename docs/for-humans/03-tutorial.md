# Tutorial — Your First Feature in 5 Minutes

We'll add an `addItem` method — from C++ domain logic to React UI — and see how the three-file pattern works.

## The Three Files

```
├── lib/todos/include/todo_store.hpp        ← C++ domain logic
├── lib/web-bridge/include/bridge.hpp       ← Q_INVOKABLE wrapper
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

Add a `Q_INVOKABLE` method to `Bridge` — the QObject wrapper.

**`lib/web-bridge/include/bridge.hpp`:**

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
| `bridge.hpp` | Q_INVOKABLE wrapper + signal |
| `bridge.ts` | TypeScript interface line |

The bridge infrastructure didn't change at all. It discovered your new method via `QMetaObject` introspection and made it callable from JavaScript automatically.

## Adding a New Bridge

When you need a new domain area (not just a method on `todos`):

1. **Create a C++ bridge** — `QObject` subclass with `Q_OBJECT` + `Q_INVOKABLE` methods
2. **Add it to xmake** — header in `add_files()` in both `desktop/xmake.lua` and `tests/helpers/dev-server/xmake.lua` (for Qt MOC)
3. **Register in both entry points:**
   - `desktop/src/main.cpp`: `shell->addBridge("name", new YourBridge)`
   - `tests/helpers/dev-server/src/test_server.cpp`: `shell.addBridge("name", new YourBridge)`
4. **TypeScript interface** in `web/src/api/bridge.ts`
5. **Validate:** `xmake run validate-bridges`

The critical gotcha: if you forget `test_server.cpp`, the bridge silently won't exist in browser-mode dev and Playwright tests. No error — it just doesn't work.

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
