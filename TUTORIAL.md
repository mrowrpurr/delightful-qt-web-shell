# Tutorial

Your first feature in 5 minutes. We'll add a `deleteList` method — from C++ to React — and see how the pieces connect.

## The Bridge

`createBridge()` connects your React app to C++. You call methods, they run in C++, results come back as Promises:

```typescript
const bridge = createBridge()
const lists = await bridge.listLists()
```

That's the entire API. The bridge handles everything else.

## Adding a Feature

We're adding `deleteList` — deletes a todo list and all its items.

### 1. Define the TypeScript interface

Add the new method to the `TodoBridge` interface. This is the single source of truth for what your bridge can do.

#### `web/src/api/bridge.ts`

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

Add the method to `TodoStore` — your pure C++ domain logic. No Qt, no JSON, just business logic.

#### `lib/todos/include/todo_store.hpp`

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

Add a `Q_INVOKABLE` method to `Bridge` — the thin QObject wrapper that exposes `TodoStore` to JavaScript. Call the store, emit a signal, return JSON.

#### `lib/web-bridge/include/bridge.hpp`

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

Add the same method to the Bun mock server so e2e tests work.

#### `tests/helpers/server.ts`

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

## Events and Signals

Push real-time updates from C++ to React. Emit a signal on the C++ side, subscribe with `on*` on the TypeScript side.

### C++ — emit a signal

Any parameterless `Q_SIGNAL` on Bridge is automatically forwarded to connected clients.

#### `lib/web-bridge/include/bridge.hpp`

```cpp
signals:
    void dataChanged();    // → fires onDataChanged in React
    void listDeleted();    // → fires onListDeleted in React
```

### TypeScript — subscribe with on*

Methods starting with `on` + a capital letter are event subscriptions. The naming convention is the wiring — no registration needed.

```typescript
bridge.onDataChanged(() => refresh())    // listens for "dataChanged"
bridge.onListDeleted(() => recount())    // listens for "listDeleted"
```

### Adding a new signal

1. Add the signal to Bridge:

   #### `lib/web-bridge/include/bridge.hpp`

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

   #### `web/src/api/bridge.ts`

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
