# Adding Features

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

`lib/web-bridge/include/bridge.hpp` — mark it `Q_INVOKABLE`:

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

There's no auto-generation or macro. Qt doesn't know your struct layout, so you map fields manually. This is the pattern used throughout the template — see `bridge.hpp` for the full example.

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

When you need a new domain area (not just a new method on `todos`).

### Step 1: Create the C++ bridge

```cpp
// lib/notes/include/notes_bridge.hpp
#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QObject>
#include <QString>

class NotesBridge : public QObject {
    Q_OBJECT
public:
    using QObject::QObject;

    Q_INVOKABLE QJsonArray listNotes() const { /* ... */ }
    Q_INVOKABLE QJsonObject addNote(const QString& title) { /* ... */ }

signals:
    void notesChanged();
};
```

### Step 2: Add the .hpp to xmake build files

**This is the step agents forget.** Qt's MOC (Meta-Object Compiler) needs to process your header. If you skip this, you'll get a cryptic vtable linker error that doesn't mention your file.

Two things to add in **both** `desktop/xmake.lua` and `tests/helpers/dev-server/xmake.lua`:

**1. Add your header to `add_files()` (for MOC processing):**
```lua
add_files(
    -- ...existing files...
    path.join(os.projectdir(), "lib/notes/include/notes_bridge.hpp"),
)
```

**2. Make the header findable via `#include`:**

The existing lib directories use a `headeronly` target in their own `xmake.lua` with `add_includedirs("include", {public = true})`. The simplest approach for a new bridge is the same pattern.

Create `lib/notes/xmake.lua`:
```lua
target("notes")
    set_kind("headeronly")
    add_headerfiles("include/(**.hpp)")
    add_includedirs("include", {public = true})
```

Then add `add_deps("notes")` alongside the existing `add_deps("web-bridge", "web-shell")` in both `desktop/xmake.lua` and `tests/helpers/dev-server/xmake.lua`. This makes `#include "notes_bridge.hpp"` work in your entry points.

**Alternative (simpler, no new target):** If your bridge is a single header with no domain logic library, you can skip the xmake target and just add `add_includedirs(path.join(os.projectdir(), "lib/notes/include"))` directly in both build targets.

### Step 3: Register in both entry points

Note the syntax difference: `main.cpp` uses `shell->` (pointer), `test_server.cpp` uses `shell.` (stack-allocated object). Copy from the right example.

**`desktop/src/main.cpp`** (pointer — uses `shell->`):
```cpp
#include "notes_bridge.hpp"
// ...
auto* notes = new NotesBridge;
shell->addBridge("notes", notes);
```

**`tests/helpers/dev-server/src/test_server.cpp`** (stack object — uses `shell.`):
```cpp
#include "notes_bridge.hpp"
// ...
auto* notes = new NotesBridge;
shell.addBridge("notes", notes);
```

If you only register in `main.cpp`, browser-mode dev and Playwright tests won't see your bridge. No error — it just silently won't exist, and you'll waste time debugging React when the problem is the C++ side.

### Step 4: TypeScript interface

`web/src/api/bridge.ts`:

```typescript
export interface NotesBridge {
  listNotes(): Promise<Note[]>
  addNote(title: string): Promise<Note>
  notesChanged(callback: () => void): () => void
}
```

### Step 5: Use it

```typescript
const notes = await getBridge<NotesBridge>('notes')
await notes.addNote('Meeting notes')
```

### Checklist

- [ ] C++ header with `Q_OBJECT` + `Q_INVOKABLE` methods + `to_json()` helpers for your structs
- [ ] `xmake.lua` for your new lib (headeronly target with `add_includedirs`)
- [ ] Header in `add_files()` in `desktop/xmake.lua`
- [ ] Header in `add_files()` in `tests/helpers/dev-server/xmake.lua`
- [ ] `add_deps("your-lib")` in both xmake targets
- [ ] `#include` + `addBridge()` in `desktop/src/main.cpp` (uses `shell->`)
- [ ] `#include` + `addBridge()` in `tests/helpers/dev-server/src/test_server.cpp` (uses `shell.`)
- [ ] TypeScript interface in `web/src/api/bridge.ts`
- [ ] Run `xmake run validate-bridges` to verify C++ and TS match

---

## Signals (C++ → JavaScript Events)

Push real-time updates from C++ to React.

### Emit from C++

Add a parameterless signal and emit it:

```cpp
// bridge.hpp
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
