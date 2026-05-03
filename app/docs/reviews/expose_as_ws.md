# Code Review — `expose_as_ws.hpp`

**File:** `lib/web-shell/include/expose_as_ws.hpp`
**What it does:** WebSocket JSON-RPC server that exposes `app_shell::Bridge` instances over WS. Sibling of `bridge_channel_adapter.hpp` (QWebChannel transport) and the WASM `WasmBridgeWrapper`. All three should behave identically from the TS side.

---

## Findings — priority order

### 1. 💀 Use-after-free on signal emission after disconnect (HIGH)

`forward_signals()` at `expose_as_ws.hpp:60-75` subscribes a per-socket callback to every bridge signal and **discards the unsubscribe token** returned by `Bridge::on_signal()`.

```cpp
bridge->on_signal(signal_name, [socket, bridgeName, sig](const nlohmann::json& data) {
    ...
    QMetaObject::invokeMethod(socket, [socket, text]() {
        if (socket->isValid())          // ← dangling raw pointer
            socket->sendTextMessage(text);
    }, Qt::QueuedConnection);
});
```

When the socket disconnects, `&QWebSocket::disconnected → deleteLater` reaps it. The bridge still holds the callback, which captures `QWebSocket* socket` by value (raw pointer). Next `emit_signal()` invocation:

- `QMetaObject::invokeMethod(socket, ...)` dereferences the QObject metatype of a freed object → UB.
- Even if that survives, the inner lambda's `socket->isValid()` check is on a dangling pointer.

Also a slow leak: every reconnect adds another callback to the bridge's `signals_` map; they never drop out.

**Fix:** capture the `std::function<void()>` unsubscribe tokens from `on_signal()` and invoke them from the `disconnected` handler. Belt-and-suspenders: replace `socket` captures with `QPointer<QWebSocket>` so the invoke is at least null-safe against torn-down sockets.

---

### 2. 📝 Docstring lies about the wire format

Header comment at `expose_as_ws.hpp:4`:

```
→ {"bridge": "todos", "method": "addList", "args": {"name": "Groceries"}, "id": 1}
```

The TS client at `web/shared/api/bridge-transport.ts:103` actually sends:

```ts
ws.send(JSON.stringify({ bridge: bridgeName, method: name, args, id }))
```

where `args` is a rest-array capture — so the wire format is `"args": [{"name": "Groceries"}]`. The implementation at `expose_as_ws.hpp:107` does `.toArray()` and unwraps `args[0]` — which matches the wire, not the doc.

Anyone writing a new client from the doc hits the `args.isEmpty()` branch at `expose_as_ws.hpp:137` and dispatches with `{}`. Silent bug.

**Fix:** correct the header comment to show the array wrapper, OR normalize the TS side to send an object and fix the impl to match. Current state is a landmine.

---

### 3. ⚠️ Error detection via `"error"` key conflates domain and framework errors (MEDIUM)

`expose_as_ws.hpp:149-152`:

```cpp
if (auto obj = result_value.toObject(); obj.contains("error"))
    response["error"] = obj["error"];
else
    response["result"] = result_value;
```

Any bridge method that legitimately returns a DTO with a field named `error` (e.g., `{valid: false, error: "name required"}`) gets its response hoisted into the JSON-RPC envelope's `error` slot and dropped. The TS client rejects the promise on a perfectly valid domain reply.

**Fix:** use a sentinel only the framework emits (e.g., `{"__dispatch_error__": "..."}`), or change `Bridge::dispatch` to return `std::variant<json, error>` / throw, so the transport decides the envelope explicitly.

---

### 4. 🔀 `args` means two different things

- **Request side** (`expose_as_ws.hpp:107`, `bridge-transport.ts:103`): `args` is an array wrapping one request object.
- **Event side** (`expose_as_ws.hpp:67`): `args` is the bare payload, not wrapped.

TS at `bridge-transport.ts:54` reads `cb(msg.args)` directly, so the receiver gets the payload, but the field name is misleading in both directions.

**Fix:** rename the event field to `payload` or `data`. Wrapping events in an array for symmetry is pointless overhead.

---

### 5. 🧱 Lambda nesting — three of four are functions in disguise

Call chain (from `emit_signal` to socket send): three lambdas deep.

| Lambda | Location | Verdict |
|---|---|---|
| Lambda #1 (`newConnection` handler) | `expose_as_ws.hpp:89` | **Keep** — ~10 lines of wiring, earns its keep. |
| Lambda #2 (`textMessageReceived` handler) | `expose_as_ws.hpp:94-156` | **Extract** to `handle_message(shell, socket, message)`. 60+ lines of parse/route/dispatch/envelope — this is a function wearing a closure costume. |
| Lambda A (`on_signal` callback) | `expose_as_ws.hpp:62` | **Extract** to `forward_signal_payload(socket, bridgeName, sig, data)`. Captures three values, builds a message, posts — named free function reads cleaner. |
| Lambda B (`QMetaObject::invokeMethod` callback) | `expose_as_ws.hpp:69` | **Delete.** Use the typed Qt 6 overload: `invokeMethod(socket, &QWebSocket::sendTextMessage, Qt::QueuedConnection, text)`. The `isValid()` guard inside is broken anyway (see finding #1). |

Fixing #1 (proper unsubscription) also lets Lambda B go.

---

### 6. 🧹 `invoke_shell_method` uses Q_INVOKABLE machinery pointlessly

`expose_as_ws.hpp:31-37`:

```cpp
inline QJsonValue invoke_shell_method(QObject* shell, const QString& method_name) {
    if (method_name == "appReady") {
        QMetaObject::invokeMethod(shell, "appReady", Qt::DirectConnection);
        return QJsonObject{{"ok", true}};
    }
    ...
}
```

- Routes through `QMetaObject::invokeMethod` with a string name — but the caller always has a `WebShell*`.
- Discards `WebShell::appReady()`'s real return value (`QJsonObject{}`) and hardcodes `{"ok": true}`.

**Fix:**

```cpp
static_cast<WebShell*>(shell)->appReady();
return QJsonObject{{"ok", true}};
```

If this was the only Q_INVOKABLE consumer, `Q_INVOKABLE` on `WebShell::appReady` can come off too.

---

### 7. 🧽 Inconsistent error envelope shapes

- Line 99 (JSON parse error): no `id` field.
- Line 110 (missing method): `id` included if provided.
- Line 147+ (normal response): `id` included if `>= 0`.

**Fix:** pick one rule. JSON-RPC 2.0 uses `"id": null` for parse errors, making all three paths consistent.

---

### 8. `id = -1` sentinel conflates missing and negative (NIT)

`expose_as_ws.hpp:108`: `qint64 id = request["id"].toInteger(-1);`

Works in practice — no client sends negative ids — but `std::optional<qint64>` removes the magic number and makes "no id" explicit.

---

### 9. `QWebSocketServer` with default `parent = nullptr` (NIT)

`expose_as_ws.hpp:79`. If the caller forgets the parent, the server leaks at app teardown. Either drop the default or document the ownership contract in a comment.

---

### 10. Qt5-style `QMap` iteration (COSMETIC)

Lines 122, 159. `asKeyValueRange()` with structured bindings reads cleaner in Qt 6.4+.

---

## What the file does well

- **Transport-edge separation is clean.** Everything domain-side speaks `nlohmann::json`; Qt JSON only touches the socket boundary.
- **`Qt::QueuedConnection` for signal delivery** — `emit_signal` from any thread is safe by design (the UAF above is about lifetime, not threading).
- **`listen()` failure is handled** — warning logged, half-allocated server deleted, `nullptr` returned.
- **`QObject::connect(..., server, ...)` uses `server` as the context object** — connections die with the server. Correct Qt 5+ idiom.

---

## Priority for the next agent

1. **Fix #1 (UAF).** Blocker. Any reconnecting client will trip it eventually.
2. **Fix #2 (docstring).** One-line change. Stops the next person from writing a broken client.
3. **Fix #5 (extract functions).** The file wants to be a few named functions, not a nested-closure staircase. Natural follow-on to #1 because Lambda B vanishes.
4. Everything else is cleanup that falls out of the first three.
