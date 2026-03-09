# Architecture

```
┌──────────────────────────────────────────────────────┐
│  Qt Desktop Shell                                    │
│  ┌────────────┐    QWebChannel    ┌───────────────┐  │
│  │   React    │◄──────────────────►│   Bridge     │  │
│  │   (Vite)   │                   │  (QObject)    │  │
│  └────────────┘                   └───────┬───────┘  │
│   WebEngine                               │          │
└───────────────────────────────────────────┼──────────┘
                                            │
┌───────────────────────────────────────────┼──────────┐
│  Android Shell                            │          │
│  ┌────────────┐  AndroidBridge    ┌───────┴───────┐  │
│  │   React    │◄──────────────────►│  JNI bridge  │  │
│  │   (Vite)   │  @JavascriptInterface  (C++)     │  │
│  └────────────┘                   └───────┬───────┘  │
│   WebView                                 │          │
└───────────────────────────────────────────┼──────────┘
                                            │
┌───────────────────────────────────────────┼──────────┐
│  Hosted Web                               │          │
│  ┌────────────┐  fetch + SSE      ┌───────┴───────┐  │
│  │   React    │◄──────────────────►│  Bun HTTP    │  │
│  │   (built)  │                   │  server (FFI) │  │
│  └────────────┘                   └───────┬───────┘  │
│   Browser                                 │          │
└───────────────────────────────────────────┼──────────┘
                                            │
  Desktop:   QWebChannel (in-process)       │
  Android:   @JavascriptInterface → JNI     │
  Web:       fetch/SSE → Bun API server     │
  Dev/Test:  WebSocket JSON-RPC             │
                                            │
                                     ┌──────┴───────┐
                                     │  TodoStore   │
                                     │  (pure C++)  │
                                     └──────────────┘
```

In **desktop production**, the React app talks to C++ through QWebChannel — same process, zero serialization overhead. On **Android**, the same React app runs in a WebView with a `@JavascriptInterface` bridge that calls TodoStore via JNI/NDK. In **hosted web** mode, the Bun HTTP server loads the C++ TodoStore as a shared library via `bun:ffi` and exposes it over REST (`POST /api/invoke`) with SSE for events (`GET /api/events`) — all four platforms run the exact same C++ domain logic. In **dev and test**, the same Bridge is exposed over WebSocket, so Playwright, Bun, or a browser can call it identically.

## The Proxy Pattern

Both sides use zero-boilerplate Proxies. On C++, `expose_as_ws()` introspects `Q_INVOKABLE` methods via `QMetaObject` and dispatches calls automatically. On TypeScript, `createWsBridge<T>()`, `createQtBridge<T>()`, `createAndroidBridge<T>()`, and `createApiBridge<T>()` are `Proxy` objects — the interface *is* the implementation. Add a method to both sides and the plumbing connects them with no glue code.

See [BRIDGE_GUIDE.md](BRIDGE_GUIDE.md) for a step-by-step walkthrough of adding features, wiring signals, and how the Proxy works under the hood.

## Testing

Four layers from fast unit tests to full Qt desktop e2e. Browser and desktop e2e share the same test suite — `DESKTOP=1` switches Playwright to connect via CDP. See [TESTING_GUIDE.md](TESTING_GUIDE.md) for practical guidance on what to test, how to debug failures, and how to add new tests.

## Cross-Platform

The template builds on Windows, macOS, and Linux (desktop) and Android (mobile). Platform-specific bits are guarded:

- `app.rc` (Windows icon/version info) — generated by xmake, only compiled on Windows
- `gmtime_s` / `gmtime_r` — `#ifdef _MSC_VER` guard
- Build output paths — smoke tests read from `build/.desktop-binary.txt` (written by `after_build`)
- Android uses NDK/JNI instead of Qt — same `TodoStore`, different bridge layer

Everything else — C++ standard library, React, Vite, Playwright — is cross-platform by nature.
