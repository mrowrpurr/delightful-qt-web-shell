# Native-Side Refactor — Making Qt Delightful for Template Users 🏴‍☠️

> **The Qt-side framework gets in your way today.** This refactor inverts it: opt-in, composable, member-style. After it lands, your `main.cpp` is a recipe — every line is a feature you asked for. Tray-only mini app or full IDE-style multi-window dock UI, both feel native. **Forking this template should be delightful at any scale.**

---

## The Principle

Today: god-class `Application` + monolithic `MainWindow`. Every feature is hardcoded ON. To opt out, you edit framework code. Demo content (Alpha/Beta/Gamma tray submenus, demo dialogs, "Demo Widget" menu actions) lives mixed inside framework files.

Target: `app_shell::App` is tiny. Every feature is either a class you instantiate or a `app.useX()` member call you make. The framework is silent about every choice you didn't make. Demo content lives in its own app binary, not in framework classes.

> **Opt-in framework, not opt-out god-class.** Same thesis as the frontend's slate-app story — a consumer should be able to start from nothing and add only what they reach for.

---

## The Consumer Story

Day one for someone forking this template. Three concrete shapes, same framework, three scales:

### Scenario 1 — Tray-only utility with a tiny web settings popup

```cpp
app_shell::App app(argc, argv);
app.addBridge<MySettingsBridge>("settings");

auto& tray = app.useTray();
tray.addItem("Settings…", [&]{ app.openWebDialog(app.url("settings")); });
tray.addItem("Quit",      [&]{ app.quit(); });
tray.show();

return app.exec();
```

### Scenario 2 — Single-window app, no docks

```cpp
app_shell::App app(argc, argv);
app.addBridge<MyBridge>("my");

app_shell::MainWindow window(app, app.url("main"));
window.show();

return app.exec();
```

### Scenario 4 — IDE-like (current demo)

```cpp
app_shell::App app(argc, argv);
app.useSingleInstance();
app.useUrlProtocol();
app.useTheming("default-dark");
app.useTray();

app.addBridge<MyBridge>("my");
app.addBridge<app_shell::SystemBridge>("system");

auto windows = app.windows().restoreOrCreate<app_shell::MainWindow>();
for (auto* w : windows) w->show();

return app.exec();
```

All under 20 lines. **No `qobject_cast<Application*>(qApp)`. No editing of framework files. No demo content lurking in your tray menu.**

The other three scenarios — multi-window tools-and-inspectors (#3), WASM-only (#5), wizard-only (#6) — are equally trivial in the new shape. See `docs/refactor-recon/03-scenarios.md` for the full set.

---

## Target Shape: Folder Layout

```
<root>/
├── lib/                        ← pure C++ domains, reusable across projects
│   └── todos/                    (the demo's domain — no Qt, no GUI)
│
├── app/
│   ├── framework/              ← the toolbox (namespace: app_shell::)
│   │   ├── bridge/                  Bridge base — frontend agent owns naming
│   │   ├── transport/{qt,wasm}/     Transport adapters
│   │   ├── shell/                   App, MainWindow, MainWindowBase,
│   │   │                            WebShellWidget, SchemeHandler, LoadingOverlay
│   │   ├── services/                Tray, UrlProtocol, SingleInstance, Theming,
│   │   │                            WindowRegistry, DockSystem
│   │   └── ui/                      MenuBuilder, StatusBar, WebDialog
│   │
│   ├── bridges/                ← typed bridge wrappers per domain
│   │   ├── todos/                   wraps lib/todos
│   │   ├── system/                  SystemBridge (clipboard, files, drag-drop, ...)
│   │   └── theme/                   ThemeBridge (auto-registered by app.useTheming())
│   │
│   ├── apps/                   ← N desktop apps. Mirrors web/apps/.
│   │   ├── demo/                    the showcase (IDE-like)
│   │   └── main/                    the SLATE — consumer's primary, ships nearly empty
│   │   (consumer adds: app/apps/<my-utility>/, etc.)
│   │
│   ├── web/                    ← frontend (separate refactor, not in this scope)
│   ├── wasm/
│   └── tests/
│
└── xmake.lua
```

Every folder name announces its purpose. Consumer day-one journey: open `app/apps/main/`, that's where they live.

---

## Target Shape: Namespace

`app_shell::` — flat top-level for first-class concerns; sub-namespaces only for transport adapters.

```cpp
namespace app_shell {
  // App + window + ui + services
  class App;
  class MainWindow;
  class MainWindowBase;
  class WebShellWidget;
  class WebDialog;
  class Tray;
  class UrlProtocol;
  class SingleInstance;
  class Theming;
  class DockSystem;
  class WindowRegistry;
  class MenuBuilder;
  class StatusBar;
  class LoadingOverlay;
  class SchemeHandler;

  // Transport adapters
  namespace qt   { class BridgeChannelAdapter; /* expose_as_ws, json_adapter */ }
  namespace wasm { class BridgeWrapper;        /* wasm_bindings */ }
}
```

The `Bridge` base class and the bridge registry live in their own (transport-agnostic) namespace owned by the frontend refactor agent. `app_shell::App` knows about it via accessor methods; consumers never touch the registry directly.

Consumer bridges (`SystemBridge`, `ThemeBridge`, consumer's own) live in their own namespaces or no namespace — they're consumer extension points and should not be claimed by `app_shell::`. (`SystemBridge` and `ThemeBridge` ship in `app/bridges/` but are not framework-owned in the namespace sense — consumers can replace them.)

---

## Locked Decisions

For each: what we're doing + **why**.

### 1. `MainWindowBase` (toolbox) + `MainWindow` (preset)

```cpp
class MainWindowBase : public QMainWindow {
public:
    explicit MainWindowBase(App& app);

    // Functional helpers — call them, or don't
    WebShellWidget& useWebShellAsCentral(const QUrl& url);
    StatusBar&      useStatusBar();
    void            usePersistedGeometry();
    DockSystem&     useDockTabs();
    MenuBuilder&    useMenuBar();
    void            useDevTools(QKeySequence = QKeySequence("F12"));
    void            useReactiveTitleFromContent();
};

class MainWindow : public MainWindowBase {
public:
    MainWindow(App& app, const QUrl& url) : MainWindowBase(app) {
        useWebShellAsCentral(url);
        useMenuBar();
        useStatusBar();
        usePersistedGeometry();
        useDevTools();
        useReactiveTitleFromContent();
    }
};
```

**Why:** Today's `MainWindow` is 428 lines, knows `WebShellWidget` concretely, owns the dock-tab system, and has a 0×0 placeholder central widget — hostile to non-dock apps. The new shape gives consumers three usable starting points:

- **Bare `MainWindowBase`** for power users (e.g., Qt-native central widget + web content in docks — a real use case)
- **`MainWindow` preset** for the typical case (one line, you get the works)
- **Derive from `MainWindow`** for "the preset plus my extras"

`MainWindow` is just a tiny class that calls `useX()` helpers in its ctor. Not magic. The toolbox is the API; the preset is one composition of it.

### 2. Opt-in services via member-style `app.useX()`

`App`'s constructor does only the minimum: identity, web profile, scheme handler in production, the bridge dispatch contract, logging. Everything else attaches via member calls:

```cpp
app.useTray()              → returns Tray&
app.useUrlProtocol()       → returns UrlProtocol&
app.useSingleInstance()    → returns SingleInstance&
app.useTheming(baseline)   → returns Theming&
app.windows()              → returns WindowRegistry& (dormant until used)
app.bridge<T>()            → typed bridge access
app.addBridge<T>(name)     → typed bridge registration
app.openWebDialog(url)     → modal web dialog (one-liner from anywhere)
```

For full custom control, instantiate the service class directly: `app_shell::Tray tray(app)` (no defaults installed).

**Why:** Today `Application::Application()` runs 14 setup steps in one constructor. Tray (with literal Alpha/Beta/Gamma demo submenus), URL protocol prompt, single-instance pipe, theme baseline, dock manager — all hardcoded ON. Consumer who doesn't want tray must edit framework code. The fix is composition: every feature is a thing you ask for.

### 3. Typed bridge access

```cpp
app.addBridge<SystemBridge>("system");          // typed at compile, named on the wire
auto* sys = app.bridge<SystemBridge>();          // typed retrieval, no fishing
```

Replaces the fishing pattern that exists in 4 sites today:
```cpp
auto* bridge = static_cast<SystemBridge*>(shell()->bridges().value("system"));
```

**Why:** String-name + cast is error-prone (rename the bridge, four sites silently get nullptr) and forces framework code to know consumer-specific bridge types. Typed access kills that. The wire-protocol name is one string; consumer code uses the type. The "register the same bridge in two places" footgun (`application.cpp` + `test_server.cpp`) is solved by convention: the consumer writes one `register_my_bridges(app)` function and both call sites use it.

### 4. SystemBridge sheds theme control; `ThemeBridge` is separate

`SystemBridge` today holds `setQtTheme`/`getQtTheme`/`qtThemeChanged` — a category error on a "stateless OS I/O" bridge. **Themes go to a dedicated `ThemeBridge`**, auto-registered by `app.useTheming(...)`. Consumer who skips theming has no theme bridge in their binary. Lives in `app/bridges/theme/`.

`SystemBridge` stays as one bridge for stateless OS I/O:

- File I/O — read/write text + binary, streaming handles for large files
- Folder listing + glob
- Native pickers — open file, open folder, save dialog
- Drag & drop — `filesDropped` signal + `getDroppedFiles()`
- Clipboard — copy/read
- CLI args / URL protocol forwarding — `appLaunchArgsReceived` signal
- Save signal — `saveRequested` (toolbar/menu Save → React)
- Native dialog request — `openDialog` signal (React asks for a Qt-native dialog)

Ships in `app/bridges/system/`. Consumer registers it via `app.addBridge<SystemBridge>("system")` if they want it.

**Why:** Theme control is coordination between React and StyleManager, not OS I/O. It snuck onto SystemBridge as the code grew. Separating restores the clean mental model and lets a tray-only consumer skip the entire theme system without touching a useless `setQtTheme` method.

### 5. Theming is opt-in (heavy + composable)

`app.useTheming(baseline)` attaches the full theme system: StyleManager, libsass, file watcher, JSON name mapping, dark/light suffix convention, `ThemeBridge` auto-registered. Consumer who skips the call gets Qt's default style and zero theming dependencies in their binary.

Two axes, separately controllable:

| | Tiny app | Full app |
|---|---|---|
| **Feature richness** (Axis 1) | minimal — one QSS embedded, no live reload | full — StyleManager + libsass + watcher + JSON map + dark/light |
| **Theme set size** (Axis 2) | 1 (e.g. `catppuccin-dark`) | 1000+ shadcn |

Axis 1 = controlled by `app.useTheming(...)` options.
Axis 2 = controlled at build time via xmake config (consumer's `xmake.lua` declares which themes embed). **Tracked as future work** — not load-bearing for the headline refactor.

**Why:** The QSS theme system is genuinely production-grade and gets used in 100% of typical apps. But a tray-only utility shouldn't pay for libsass + 1000 themes + watcher just to exist. Opt-in keeps it heavy when wanted, invisible when not.

### 6. N desktop apps under `app/apps/<name>/`

Each desktop app is its own xmake binary, sharing framework + bridges + lib. Demo and slate are both apps under `app/apps/`. Consumer adds siblings as they grow.

**Why:** Mirrors the web side's `apps/` plural exactly. Consistent mental model across native + web. Opens the door for utility-app patterns — main app + tiny tray utility, both shipping from one codebase. Today's 1-app desktop convention is a lid on real use cases.

### 7. Demo as `app/apps/demo/`, slate as `app/apps/main/`

Both are full apps. Demo is the running showcase of every framework feature (Scenario 4 — full IDE-style). Slate is the consumer's empty starting point (~5–10 line `main.cpp`). Two separate binaries, both built by default.

**Why:** Mirrors the web-side `apps/demo` + `apps/app` story. Consumer keeps the slate, deletes/ignores the demo, adds whatever else. The demo binary is a *running reference* the consumer learns from — not buried in their product binary.

### 8. xmake — one framework target

**`app-shell` is one xmake target.** Static library. Everything inside it: `App`, `MainWindow` + `MainWindowBase`, `Tray`, `UrlProtocol`, `SingleInstance`, `Theming` (libsass and all), `DockSystem`, `WindowRegistry`, ui widgets, both transport adapters. Transport-qt vs transport-wasm is platform-conditional `add_files` *inside* `app-shell`'s `xmake.lua`, not separate targets.

**Why:** Opt-in is a class-level concept — consumer who doesn't call `app.useTray()` doesn't instantiate the Tray class, and the linker DCEs unused symbols. xmake target granularity buys nothing on top of that. Splitting into per-service targets was overengineering against a phantom benefit.

Bridges live in their own xmake targets per Phase 1's plan (must-preserve #10 — WASM bridges need `set_kind("object")` to keep `EMSCRIPTEN_BINDINGS` from being dead-stripped). Frontend-agent territory.

### 9. Branding + identity

Keep xmake-time `APP_NAME`/`APP_SLUG`/`APP_ORG`/`APP_VERSION` defines for Windows `.exe` metadata generation (which must happen at build time). Decouple framework code from `:/icon.ico` literal references — framework reads via `app.iconPath()` accessor, which returns whatever the consumer set or a built-in framework default.

**Why:** Today the framework hardcodes `:/icon.ico` in three places. Consumer who renames their icon needs to either keep that exact filename or edit framework code.

---

## Out of Scope

These came up and are explicitly NOT part of this refactor.

- **Lifecycle hooks** (signals on `App` like `beforeBridgeRegistration`, `afterFirstWindowShown`) — invented to solve a problem that doesn't exist. Dropped. If a real need surfaces later, add a signal then.
- **Multiple starting templates as folders** (`app/templates/tray-popup/` etc.) — slate + demo + docs is enough. If consumers need more example shapes, doc snippets handle it without shipping copyable folders that need maintenance.
- **Registry / Bridge base class naming** — owned by the frontend refactor agent (transport-agnostic concern). Whatever they pick, `app_shell::App` adapts to it.

---

## Cross-Cutting Cleanup (drops out of the bigger work)

These die naturally as the architectural pieces land:

- All `qobject_cast<Application*>(qApp)` sites die — replaced by `app_shell::App&` references passed explicitly
- All "fishing for bridges" sites (`shell()->bridges().value("system")`) die — replaced by typed `app.bridge<T>()`
- `kBackground` color constant duplicated in 3 places (with **inconsistent hex values** — `0x24,0x24,0x24` vs `0x09,0x09,0x0b`, both with "Must match --bg in App.css" comments) — single source of truth
- `windowTitle()` string-match in `dock_tab_manager.undockTab` — replaced by existing `tabData()` quintptr mechanism (already used elsewhere)
- `LoadingOverlay`'s "F12" reference in error message — read from menu shortcut, or genericized to "open developer tools"
- `MainWindow` knows `WebShellWidget` concretely — extracts to a `WebContentController` invoked by `useWebShellAsCentral` (zoom, devtools, reactive titles all opt-in)
- `DockManager` constructs `WebShellWidget` directly — becomes content-agnostic, accepts any `QWidget`
- `DockManager` ↔ `MainWindow` bidirectional concrete-type knowledge — docks carry their host as a property, no `topLevelWidgets()` iteration

---

## Patterns This Refactor MUST Preserve

The silent-failure list from `app/docs/DelightfulQtWebShell/for-agents/06-gotchas.md`. Don't regress on any of these:

1. `signalReady()` fires after mount in every web app
2. `getBridge<T>(...)` lives at module scope with top-level await on the JS side
3. Bridge registration mirrored in production main + dev-server (the consumer-side `register_my_bridges(app)` convention codifies this)
4. `QTimer::singleShot(0, ...)` when a bridge method opens a modal
5. Monaco worker registration before any `<MonacoEditor>` mounts
6. `playwright-cdp` runs under `npx tsx`, not `bun`
7. `assetsInlineLimit: 0` in every `vite.config.ts`
8. `qtSyncGuard` in the React→Qt theme listener
9. localStorage keys are persisted state — don't rename
10. `bridges/wasm` library uses `set_kind("object")`, not `static`
11. `QCommandLineParser::parse()`, never `process()`

---

## What "Done" Looks Like

A consumer forking this template can do all of these without editing framework files:

- ✅ Build a tray-only utility with one web dialog (Scenario 1)
- ✅ Build a single-window app with no docks (Scenario 2)
- ✅ Build a multi-window app with single-instance + tools (Scenario 3)
- ✅ Build an IDE-style multi-window dock UI with the works (Scenario 4)
- ✅ Build a WASM-only browser app (Scenario 5)
- ✅ Build a wizard/dialog-only app (Scenario 6)
- ✅ Add a custom bridge by writing one class + registering it
- ✅ Replace the demo's tray content (or skip tray entirely)
- ✅ Have multiple desktop apps under `app/apps/` sharing framework + bridges + lib
- ✅ (future) Pick which themes embed in their binary at build time

The framework gets out of the way. **The template becomes delightful.** 🏴‍☠️

---

## Reference

Recon scratchpads with deeper findings:

- `docs/refactor-recon/01-inventory.md` — every native-side class with responsibility tags (🎭 demo / 🎨 polish / 🔧 default-on / 🏗 core)
- `docs/refactor-recon/02-tangles.md` — 16 dependency tangles + untangle-first shortlist
- `docs/refactor-recon/03-scenarios.md` — six consumer scenarios stress-testing the API
- `docs/refactor-recon/04-proposals.md` — full proposal options + tradeoffs (this doc is the locked subset)
