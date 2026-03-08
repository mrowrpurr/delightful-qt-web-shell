# Bridge Guide

How the C++ ↔ TypeScript bridge works, and how to extend it for your app.

## Why Are There Two Bridges?

| | QWebChannel (production) | WebSocket (dev/test) |
|---|---|---|
| **How** | Qt injects it into WebEngine — in-process, zero network overhead | JSON-RPC over WebSocket on `localhost:9876` |
| **When** | The real desktop app | `--dev` mode, Playwright tests, browser-only dev, Bun unit tests |
| **Speed** | Fastest possible — same process | Fast enough — local loopback |

You don't choose between them. `createBridge()` auto-detects which one is available:

```typescript
// web/src/api/bridge.ts
export function createBridge(): TodoBridge {
  if (window.qt?.webChannelTransport && window.QWebChannel)
    return createQtBridge<TodoBridge>()
  else
    return createWsBridge<TodoBridge>(wsUrl)
}
```

You write your code once. It works both ways.

## How Do I Add a Feature?

Walk through adding `deleteList` to your app.

### Step 1: Add the method to your TypeScript interface

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

### Step 2: Add the domain logic in pure C++

**`lib/todos/include/todo_store.hpp`** — no Qt, no JSON, just your business logic:

```cpp
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
```

### Step 3: Wrap it in the Bridge

**`lib/web-bridge/include/bridge.hpp`** — thin QObject wrapper. Q_INVOKABLE + JSON in/out:

```cpp
Q_INVOKABLE QString deleteList(const QString& listId) {
    store_.delete_list(listId.toStdString());
    emit dataChanged();
    return "{}";
}
```

That's it on the C++ side. `expose_as_ws()` finds this method automatically via `QMetaObject` introspection — no routing code needed.

### Step 4: Add it to the Bun mock server

**`tests/helpers/server.ts`** — so Bun-based tests have the same method:

```typescript
deleteList(listId: string) {
  state.lists = state.lists.filter(l => l.id !== listId)
  state.items = state.items.filter(i => i.list_id !== listId)
  return {}
},
```

### Step 5: Use it in React

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

The bridge infrastructure (`expose_as_ws`, `createWsBridge`, `createQtBridge`, `createBridge`) didn't change at all.

## How Do Events/Signals Work?

### C++ side

Emit a signal from your Bridge. `expose_as_ws()` automatically forwards all parameterless signals as JSON events to connected WebSocket clients:

```cpp
// lib/web-bridge/include/bridge.hpp
signals:
    void dataChanged();    // → {"event":"dataChanged"}
    void listDeleted();    // → {"event":"listDeleted"}
```

No registration needed — any `Q_SIGNAL` with zero parameters is forwarded.

### TypeScript side

Methods starting with `on` + a capital letter automatically become event subscriptions:

```typescript
bridge.onDataChanged(() => refresh())    // listens for "dataChanged"
bridge.onListDeleted(() => recount())    // listens for "listDeleted"
```

The `on*` convention is detected by the Proxy. It strips the `on` prefix, lowercases the first letter, and subscribes to that event name. Works identically for both `createWsBridge` and `createQtBridge`.

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
| Change how the WebSocket protocol works | `lib/web-shell/include/expose_as_ws.hpp` (you probably don't need to) |
| Change how the Proxy works | `web/src/api/bridge.ts` — `createWsBridge` / `createQtBridge` (you probably don't need to) |

## How the Proxy Works (If You're Curious)

Both `createWsBridge<T>()` and `createQtBridge<T>()` return a JavaScript `Proxy`. When you call any method on it:

1. The Proxy intercepts the property access
2. If the name matches `on*` → it sets up an event listener
3. Otherwise → it sends a JSON-RPC message (`{method, args, id}`) and returns a Promise
4. When the response arrives (`{id, result}`), the Promise resolves

The TypeScript interface is the implementation. There are no method stubs, no switch statements, no registration. Add a method to the interface, add the Q_INVOKABLE on the C++ side, and the Proxy connects them automatically.
