# Tutorial

Your first feature in 5 minutes. This walks through adding a new method to your app — from C++ to React — and shows how the pieces connect.

## The Bridge

`createBridge()` connects your React app to C++. You call methods on it, they run in C++, results come back as Promises:

```typescript
const bridge = createBridge()
const lists = await bridge.listLists()
```

That's the entire API. The bridge handles everything else.

## Adding a Feature

Let's add `deleteList` — a method that deletes a todo list and all its items.

### 1. Define the TypeScript interface

**`web/src/api/bridge.ts`** — this is the single source of truth for what your bridge can do:

```typescript
export interface TodoBridge {
  listLists(): Promise<TodoList[]>
  getList(listId: string): Promise<ListDetail>
  addList(name: string): Promise<TodoList>
  deleteList(listId: string): Promise<void>     // ← new
  addItem(listId: string, text: string): Promise<TodoItem>
  toggleItem(itemId: string): Promise<TodoItem>
  search(query: string): Promise<TodoItem[]>
  onDataChanged(callback: () => void): () => void
}
```

### 2. Write the C++ logic

**`lib/todos/include/todo_store.hpp`** — this is `class TodoStore`, your pure C++ domain logic (no Qt, no JSON). Add the new method alongside the existing ones:

```cpp
class TodoStore {
    // ... existing methods: add_list, add_item, toggle_item, etc.

    void delete_list(const std::string& list_id) {
        lists_.erase(
            std::remove_if(lists_.begin(), lists_.end(),
                [&](const TodoList& l) { return l.id == list_id; }),
            lists_.end());
        items_.erase(
            std::remove_if(items_.begin(), items_.end(),
                [&](const TodoItem& i) { return i.list_id == list_id; }),
            items_.end());
    }
};
```

### 3. Expose it via Q_INVOKABLE

**`lib/web-bridge/include/bridge.hpp`** — this is `class Bridge`, a thin QObject wrapper that exposes `TodoStore` methods to JavaScript. Add a `Q_INVOKABLE` method that calls the store and returns JSON:

```cpp
class Bridge : public QObject {
    Q_OBJECT
    TodoStore store_;

public:
    // ... existing methods: listLists, addList, addItem, etc.

    Q_INVOKABLE QString deleteList(const QString& listId) {
        store_.delete_list(listId.toStdString());
        emit dataChanged();
        return "{}";
    }

signals:
    void dataChanged();
};
```

That's it on the C++ side. The bridge infrastructure finds `Q_INVOKABLE` methods automatically — no routing code needed.

### 4. Add it to the test mock

**`tests/helpers/server.ts`** — so Bun-based tests have the same method:

```typescript
deleteList(listId: string) {
  state.lists = state.lists.filter(l => l.id !== listId)
  state.items = state.items.filter(i => i.list_id !== listId)
  return {}
},
```

### 5. Call it from React

```typescript
await bridge.deleteList(listId)
```

The Proxy handles the RPC automatically. No glue code, no method registration.

### What just happened?

You touched four files, and none of them were wiring or plumbing:

| File | What you wrote |
|------|----------------|
| `web/src/api/bridge.ts` | The TypeScript interface method |
| `lib/todos/include/todo_store.hpp` | The actual logic |
| `lib/web-bridge/include/bridge.hpp` | Q_INVOKABLE wrapper + signal |
| `tests/helpers/server.ts` | Mock implementation for tests |

The bridge infrastructure didn't change at all.

## How Do Events/Signals Work?

### C++ side

Emit a signal from your Bridge. The infrastructure automatically forwards all parameterless signals as events to connected clients:

```cpp
// lib/web-bridge/include/bridge.hpp
signals:
    void dataChanged();    // → fires onDataChanged in React
    void listDeleted();    // → fires onListDeleted in React
```

No registration needed — any `Q_SIGNAL` with zero parameters is forwarded.

### TypeScript side

Methods starting with `on` + a capital letter automatically become event subscriptions:

```typescript
bridge.onDataChanged(() => refresh())    // listens for "dataChanged"
bridge.onListDeleted(() => recount())    // listens for "listDeleted"
```

The `on*` convention is detected by the Proxy. It strips the `on` prefix, lowercases the first letter, and subscribes to that event name.

### Adding a new signal

1. Add the signal to `lib/web-bridge/include/bridge.hpp`:
   ```cpp
   signals:
       void dataChanged();
       void listDeleted();  // ← new
   ```

2. Emit it where appropriate:
   ```cpp
   Q_INVOKABLE QString deleteList(const QString& listId) {
       store_.delete_list(listId.toStdString());
       emit listDeleted();
       return "{}";
   }
   ```

3. Add the subscription to your TypeScript interface:
   ```typescript
   export interface TodoBridge {
     // ...
     onListDeleted(callback: () => void): () => void  // ← new
   }
   ```

4. Use it in React:
   ```typescript
   const cleanup = bridge.onListDeleted(() => {
     console.log('a list was deleted')
   })
   // later: cleanup() to unsubscribe
   ```

### Cleanup

Every `on*` call returns an unsubscribe function. Call it when your component unmounts:

```typescript
useEffect(() => {
  const cleanup = bridge.onDataChanged(() => setStale(true))
  return cleanup
}, [])
```

## Where Does My Code Go?

| I want to... | File |
|---|---|
| Add/change business logic | `lib/todos/include/todo_store.hpp` |
| Expose a method to the UI | `lib/web-bridge/include/bridge.hpp` — add a Q_INVOKABLE method |
| Define the TypeScript API | `web/src/api/bridge.ts` — update the interface |
| Add a mock for tests | `tests/helpers/server.ts` |
| Use a bridge method in React | Just call `bridge.methodName()` — the Proxy handles it |
| Push an event from C++ to JS | Add a signal to `bridge.hpp`, add `on*` to the TS interface |

## How the Proxy Works (If You're Curious)

`createBridge()` returns a JavaScript `Proxy`. When you call any method on it:

1. The Proxy intercepts the property access
2. If the name matches `on*` → it sets up an event listener
3. Otherwise → it sends a message to C++ and returns a Promise
4. When the response arrives, the Promise resolves

The TypeScript interface is the implementation. There are no method stubs, no switch statements, no registration. Add a method to the interface, add the Q_INVOKABLE on the C++ side, and the Proxy connects them automatically.
