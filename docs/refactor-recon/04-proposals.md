# Proposal Pitches 🎯

Lots of options, organized into categories. Each item has my pick (when I have one) and the alternatives, plus tradeoffs. **Throw spaghetti — react to whatever resonates.**

The categories interact. A few proposals only make sense together. Cross-references are noted.

---

# A. `MainWindow` slimming

## The problem
Today's `MainWindow` is 428 lines, knows `WebShellWidget` concretely, knows `DockManager`, owns the dock-tab system, and has a 0×0 placeholder central widget so docks can host content. **It cannot be subclassed for a non-dock app.**

## A.1 — `MainWindowBase` (toolbox) + `MainWindow` (preset) *(LOCKED)*

```cpp
namespace app_shell {

// The toolbox base — composable, no opinions. All functional helpers.
class MainWindowBase : public QMainWindow {
    Q_OBJECT
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

// The opinionated preset. Web shell + menu + status + persistence + dev tools.
// Most consumers use this directly. Power users derive from MainWindowBase.
class MainWindow : public MainWindowBase {
    Q_OBJECT
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

}  // namespace app_shell
```

**Three usage shapes:**

```cpp
// Most consumers — Scenario 2:
app_shell::MainWindow window(app, app.url("main"));
window.show();

// Power user wanting Qt-central + web docks:
app_shell::MainWindowBase window(app);
window.setCentralWidget(new MyCustomQtEditor);
auto& docks = window.useDockTabs();
docks.addDock(app.url("inspector"));
window.usePersistedGeometry();
window.show();

// Consumer subclassing the preset for extras:
class MyMainWindow : public app_shell::MainWindow {
public:
    explicit MyMainWindow(app_shell::App& app)
        : MainWindow(app, app.url("main"))
    {
        useDockTabs().addDock(app.url("notes"));
        statusBar()->addPermanentWidget(new MyConnectionIndicator);
    }
};
```

**Why this shape:** `MainWindowBase` = the toolbox. `MainWindow` = the opinionated preset that wires `useX()` calls in its ctor. **Both are real, both are usable on their own; `MainWindow` is just a tiny class that calls `useX` helpers in its ctor — not magic.** No forced inheritance for power users. No name collision with `QMainWindow` (different namespace).

## A.2 — One MainWindow + composable mixins (rejected)

Ship one `app_shell::MainWindow` with optional mixins:
```cpp
auto* w = new app_shell::MainWindow(app);
app_shell::DockTabFeature::attachTo(w);
```
**Cons:** More moving parts, easier to misconfigure, less clear "what shape am I getting?" Rejected in favor of A.1.

## A.3 — Inheritance-only, no functional helpers (rejected)

Two classes, consumer extends one. Forces derive patterns when consumer just wants to compose. Rejected.

## Pick: A.1 (LOCKED)
Direct fit with all six scenarios. `MainWindowBase` for power users / unusual shapes. `MainWindow` for the typical consumer. Both ship.

---

# B. `Application` slimming

## The problem
`Application::Application()` does 14 things in one constructor. Every feature is hardcoded ON. To opt out, edit framework code.

## B.1 — Tiny Application + opt-in service objects *(my pick)*

`app_shell::App` constructor does only:
- Identity (org, name, version, INI format, icon)
- `--dev` cmdline option
- Web profile + storage paths
- Scheme handler install (production only)
- WebShell + signalReady contract
- Logging

Everything else extracts to separate classes, attached via member-style `app.useX()` (LOCKED):

- `app_shell::SingleInstance` — `app.useSingleInstance()` (or skipped → multi-instance allowed)
- `app_shell::Tray` — `app.useTray()` for default preset; or `app_shell::Tray(app)` for full control
- `app_shell::UrlProtocol` — `app.useUrlProtocol()` (prompts on first launch, register/unregister methods)
- `app_shell::Theming` — `app.useTheming("default-dark")` (auto-registers `ThemeBridge` from `app/bridges/theme/`)
- `app_shell::WindowRegistry` — `app.windows()` (dormant until first window created through it)
- `app_shell::DockSystem` — created when consumer calls `mainWindow.useDockTabs()`; rarely accessed directly

**Pros:** Each service has a clean lifecycle, clean tests. Scenarios 1–4 all express what they want in one statement per feature. **Opt-in matches the principle.**

**Cons:** More classes. Some services need a back-pointer to `App` for resources (web profile, shell). Need to decide ownership semantics.

## B.2 — Application as a builder

```cpp
app_shell::App::Builder(argc, argv)
    .withTray()
    .withTheming("default-dark")
    .withUrlProtocol()
    .build()
    .exec();
```

**Pros:** Reads top-down, very clear what's installed.

**Cons:** Hides side effects, harder to wire up custom items mid-build (e.g., adding a tray menu item needs a callback or escape hatch). Builders fight extension. **I'd skip this.**

## B.3 — Consumer subclasses Application; framework provides protected hooks

Today's pattern: subclass and override. With `protected virtual` hooks like `setupTray()`, `setupTheme()` that consumers override to disable.

**Pros:** Familiar OO pattern.

**Cons:** Consumer is *removing* code by overriding. That's opt-out, not opt-in. Same problem as today, just dressed up. **Skip.**

## My pick & why
**B.1** — opt-in service objects. Direct fit with the scenarios. Each proposed service maps 1:1 to a "yes I want this" line in `main.cpp`. Composes upward.

---

# C. Where does the framework live?

## The problem
Phase 1 of the old refactor (locked-in) puts framework C++ at `app/framework/`. Question: does the *desktop-side* framework (MainWindow flavors, Tray, URL protocol, theming, dock system) live in the same `app/framework/` umbrella, or somewhere distinct?

## C.1 — Everything under `app/framework/` *(my pick)*

```
app/framework/
├── bridge/                  (frontend agent owns — transport-agnostic Bridge base)
├── transport/qt/            (BridgeChannelAdapter, expose_as_ws, json_adapter)
├── transport/wasm/          (BridgeWrapper, wasm_bindings)
├── shell/                   ← NEW
│   ├── app.{hpp,cpp}                  app_shell::App
│   ├── main_window.{hpp,cpp}          app_shell::MainWindow (preset)
│   ├── main_window_base.{hpp,cpp}     app_shell::MainWindowBase (toolbox)
│   ├── web_shell_widget.{hpp,cpp}     (moved here from desktop/src/widgets/)
│   ├── scheme_handler.{hpp,cpp}       (moved here)
│   └── loading_overlay.{hpp,cpp}      (moved here)
├── services/                ← NEW (opt-in services, attached via app.useX())
│   ├── tray.{hpp,cpp}
│   ├── url_protocol.{hpp,cpp}
│   ├── single_instance.{hpp,cpp}
│   ├── theming/             (StyleManager + toolbar widget; auto-registers ThemeBridge from bridges/theme/)
│   ├── window_registry.{hpp,cpp}
│   └── dock_system/         (DockManager + DockTabManager + FloatingDockTitleBar)
├── ui/                      ← NEW (small reusable widgets)
│   ├── menu_builder.{hpp,cpp}
│   ├── status_bar.{hpp,cpp}
│   └── web_dialog.{hpp,cpp}
└── settings/                ← deferred (Category F) — typed persistence helpers
```

**Pros:** Single mental location for "the framework." Consumer's `desktop/` becomes their *product*.

**Cons:** Big move. Many files relocate.

## C.2 — Split `app/framework/` (transport-only) and `app/native/` (Qt shell)

Framework = bridge + transport (transport-agnostic). Native = the Qt-side shell + services.

```
app/framework/   ← bridge + transport (Phase 1 plan, untouched)
app/native/      ← App, MainWindow flavors, Tray, etc.
app/desktop/     ← consumer's product
```

**Pros:** Cleanly separates "things that work in WASM too" from "Qt-only stuff." Ideologically pure.

**Cons:** Two framework folders. Consumer thinks "what's the difference?" The line "is this Qt or transport?" is a smell test the consumer shouldn't have to make.

## C.3 — Keep most of it under `app/framework/qt/` as Qt-flavored framework

```
app/framework/
├── bridge/
├── web-shell/
├── transport/{qt,wasm}/
└── qt/             ← Qt-only stuff: shell, services, ui
```

**Pros:** Compromise. Mirrors `transport/qt/` symmetry.

**Cons:** Path depth. Lots of `app/framework/qt/services/tray.hpp` etc.

## My pick & why
**C.1** — Phase 1's `app/framework/` is the right umbrella. Add `shell/`, `services/`, `ui/` subfolders. Consumers know "framework lives at `app/framework/`." No splitting.

---

# D. Where does the demo live?

## The problem
Demo content is mixed inside framework files: Alpha/Beta/Gamma in `Application::setupSystemTray()`, demo dialogs in `desktop/src/dialogs/`, demo menu actions in `menus/menu_bar.cpp`, "openDialogRequested" listener in MainWindow, etc.

## D.1 — Both as siblings under `app/apps/` *(my pick — and now ratified by H.1)*

```
app/
├── framework/         (the toolbox)
├── bridges/           (todos, system, theme — typed wrappers per domain)
├── apps/              ← N desktop apps. Mirrors web/apps/.
│   ├── demo/                    the showcase (IDE-like)
│   │   ├── src/
│   │   │   ├── main.cpp                     (instantiates everything)
│   │   │   ├── demo_tray_menu.{hpp,cpp}     (Alpha/Beta/Gamma items)
│   │   │   ├── dialogs/
│   │   │   │   ├── about_dialog.{hpp,cpp}
│   │   │   │   ├── demo_widget_dialog.{hpp,cpp}
│   │   │   │   └── web_dialog.{hpp,cpp}
│   │   │   └── menus/
│   │   │       └── demo_menu_bar.{hpp,cpp}  (full menu with React Dialog, Demo Widget, About)
│   │   └── xmake.lua
│   └── main/                    the SLATE (consumer's primary product, ships nearly empty)
│       ├── src/main.cpp                     (~5–10 lines)
│       └── xmake.lua
```

`app/apps/main/` is the consumer's product. `app/apps/demo/` is the showcase. They build into separate binaries. Consumer adds more siblings (`app/apps/<my-utility>/`) as needed.

**Pros:** Mirrors the web-side `apps/demo` / `apps/app` story exactly. N desktop apps for free. Consumer keeps `apps/main/`, deletes/ignores `apps/demo/`, adds whatever else.

**Cons:** Two binaries minimum (mitigated: it's the right shape for consumers wanting their own utility apps). Plural folder name even for 1-app consumers (mild).

## D.2 — Demo as a sibling under `desktop/`

```
app/desktop/
├── src/                  (the slate)
├── demo/                 (demo content)
└── xmake.lua             (one binary; demo flag toggles)
```

One binary, with demo bits compiled in based on a flag.

**Pros:** Single executable. Easy "delete the demo folder" for consumer.

**Cons:** Slate code and demo code intermingled in builds. Two-target story (web has `apps/demo` + `apps/app`) doesn't match.

## D.3 — Demo lives at repo root `demo/` as a standalone showcase repo-style

`demo/` is the "look how to use this." It builds against the framework. `app/desktop/` is the consumer's slate.

**Pros:** Strongest separation. Demo is teaching material; product is product.

**Cons:** Demo at repo root next to `lib/` and `app/` is unusual layout. People might miss it.

## My pick & why
**D.1** — mirrors the web-side `apps/demo` / `apps/app` story. **Consistent mental model across web and native** ("the demo is its own thing, the slate is your starting point"). Two binaries is fine — they're different things. The demo binary is also useful as a *running reference* for consumers learning the framework.

---

# E. ~~Multiple starting points (templates)~~ — **dropped**

Originally proposed shipping `app/templates/` with copyable scaffolds for tray-popup, single-window, and docked-ide patterns. **Redundant given D.1 + H.1.**

The slate (`app/apps/main/`) gives the empty starting point. The demo (`app/apps/demo/`) gives the running reference. Docs and `for-agents/` markdown can show the variant `main.cpp` patterns (tray-popup, single-window, etc.) as code snippets without needing copyable folders. N-app support means consumers easily add more apps as siblings — no scaffolding tier needed.

If consumers need more starting examples in the future, add a snippet page in docs. Don't ship a templates folder.

---

# F. Settings / persistence service

## The problem
QSettings keys are constructed inline with string-concat in `dock_manager.cpp`, `main_window.cpp`, `application.cpp` (see leak L1).

## F.1 — Typed settings classes *(my pick)*

```cpp
namespace framework {
    class WindowSettings {
    public:
        explicit WindowSettings(const QString& windowId);
        QByteArray geometry() const;
        void saveGeometry(const QByteArray&);
        QByteArray dockState() const;
        void saveDockState(const QByteArray&);
        qreal zoomFactor() const;
        void saveZoomFactor(qreal);
        void clear();
    };

    class DockSettings { /* per-dock state */ };
    class AppSettings { /* urlProtocol/dontAsk, etc. */ };
}
```

All key strings live inside these classes. Callers say `WindowSettings(id).saveGeometry(g)`. Schema is the type signatures.

**Pros:** Schema is one file. Renames are localized. Easy to test.

**Cons:** Slight ceremony for one-off settings.

## F.2 — Single SettingsService singleton

One class with `getWindowGeometry(id)`, `setWindowGeometry(id, ...)`, `getDockUrl(id)`, etc.

**Pros:** Easy to mock for tests.

**Cons:** Grows to hundreds of methods over time. God-class trajectory.

## F.3 — Leave it; just constants

A `settings_keys.hpp` with `constexpr` strings. Inline construction stays but uses named constants.

**Pros:** Smallest change.

**Cons:** Construction logic still inline. Half a fix.

## My pick & why
**F.1 — but deferred.** Typed classes are the right answer when this gets tackled. **Not load-bearing for the headline refactor** (opt-in framework). The QSettings string-concat smell is real but won't block any of the bigger extractions. Defer until the framework split is done; revisit as a focused follow-on cleanup.

---

# G. Bridge composition for consumers

## The problem
Bridge access via `static_cast<SystemBridge*>(shell()->bridges().value("system"))` is everywhere. Bridge registration must mirror in `application.cpp` AND `test_server.cpp` (must-preserve #3).

## G.1 — Typed registry on `App` *(my pick)*

```cpp
template <typename T>
T* App::Bridges::add(const QString& name) {
    auto* bridge = new T;
    shell_.addBridge(name, bridge);
    typeMap_[std::type_index(typeid(T))] = bridge;
    return bridge;
}

template <typename T>
T* App::Bridges::get() const {
    auto it = typeMap_.find(std::type_index(typeid(T)));
    return it != end ? static_cast<T*>(it->second) : nullptr;
}
```

```cpp
app.bridges().add<SystemBridge>("system");
auto* sys = app.bridges().get<SystemBridge>();   // typed
```

Wire-protocol name is one string; consumer code uses the type. The fishing pattern dies.

**Pros:** Type-safe. One-line registration. Eliminates the leak L5 fishing pattern entirely.

**Cons:** Uses `std::type_index` — slight compile-time cost; one bridge per type (which is fine — duplicate bridge types are weird anyway).

## G.2 — Single source of truth via codegen

A small build step generates the registration code from a manifest. Both `application.cpp` (or its successor) and `test_server.cpp` `#include` the generated registration block.

**Pros:** Eliminates "register in two places" footgun.

**Cons:** Build complexity. Codegen is a heavier hammer than this needs.

## G.3 — Shared free function

```cpp
// in some shared header
void registerStandardBridges(WebShell& shell) {
    static SystemBridge sys;
    shell.addBridge("system", &sys);
    static TodoBridge todos;
    shell.addBridge("todos", &todos);
}
```

Both desktop main and test_server call this.

**Pros:** Tiny fix. No codegen.

**Cons:** Still string-named. Doesn't solve typed access. But solves the "register in two places" footgun.

## My pick & why
**G.1 + G.3 hybrid.** Typed access via `App::bridges()`. Plus a *convention* (not framework code) that the consumer's `desktop/` and `tests/dev-server/` both call the same `register_my_bridges(app)` function the consumer writes once. Framework provides typed access; consumer applies discipline of one registration call.

---

# H. Project / folder structure (the delightful layout)

## The problem
This is the synthesis. What does the repo look like such that a consumer can navigate it and feel "yeah, this is good."

## H.1 — Domain at `<root>/lib/`, framework + bridges + N apps at `app/apps/` *(my pick)*

```
<root>/
├── lib/                    ← pure C++ domains, reusable across projects
│   └── todos/                (the demo's domain — no Qt, no GUI)
│
├── app/
│   ├── framework/          ← the toolbox (namespace: app_shell::)
│   │   ├── bridge/             Bridge base — frontend agent owns naming/details
│   │   ├── transport/{qt,wasm}/
│   │   ├── shell/              App, MainWindow, MainWindowBase, WebShellWidget,
│   │   │                       SchemeHandler, LoadingOverlay
│   │   ├── services/           Tray, UrlProtocol, SingleInstance, Theming,
│   │   │                       WindowRegistry, DockSystem
│   │   ├── ui/                 MenuBuilder, StatusBar, WebDialog
│   │   └── settings/           (deferred — see Category F)
│   │
│   ├── bridges/            ← bridge wrappers per domain
│   │   ├── todos/              wraps lib/todos for the framework
│   │   ├── system/             SystemBridge (clipboard, files, drag-drop,
│   │   │                       save signal, CLI args, native dialog request)
│   │   └── theme/              ThemeBridge (auto-registered by app.useTheming())
│   │
│   ├── apps/               ← N desktop apps under here (mirrors web/apps/)
│   │   ├── demo/                 the showcase (IDE-like — Scenario 4)
│   │   │   ├── src/main.cpp
│   │   │   └── xmake.lua
│   │   └── main/                 the SLATE (consumer's primary, ships nearly empty)
│   │       ├── src/main.cpp        (~5–10 lines using the framework)
│   │       └── xmake.lua
│   │   (consumer adds their own siblings: app/apps/<my-utility>/, etc.)
│   │
│   ├── web/                ← Phase 2 frontend (3 apps + 4 packages, locked-in story)
│   ├── wasm/
│   └── tests/
│
└── xmake.lua
```

**Pros:**
- Mirrors the web-side `apps/` plural — consistent mental model across native + web
- Pure domain at `<root>/lib/` is reusable
- `app/framework/` is the umbrella for everything the consumer doesn't write
- Consumer's day one: open `app/apps/main/`, that's where they live
- N desktop apps "for free" — just add a sibling under `app/apps/`
- Demo is one app, slate is another, consumer's utilities are more

**Cons:** Big move. But that's the refactor. Plural folder name is mild overhead for the 1-app consumer (mitigated: web side already pluralized, symmetry helps).

## H.2 — `app/desktop/` becomes `app/slate/`; demo replaces today's `desktop/`

```
app/
├── desktop/      (today's stuff, renamed → demo content stays here as the showcase binary)
└── slate/        (NEW empty starting point)
```

**Pros:** Less aggressive — today's `desktop/` keeps its name and some history.

**Cons:** Naming asymmetry: `desktop` IS the demo, `slate` IS the consumer's product. Confusing.

## H.3 — One folder, demo flag

`app/desktop/` with a `--demo` xmake flag that includes/excludes demo content.

**Pros:** One folder.

**Cons:** Same intermingling problem we have today.

## My pick & why
**H.1.** It's the one that makes the structure self-explaining. A consumer landing in the repo sees `app/apps/demo/` (the showcase), `app/apps/main/` (their slate), `app/framework/` (the toolbox), `app/bridges/` (typed bridges), `lib/<domain>/` (reusable domain code). Every folder name announces its purpose. N apps for free under `app/apps/`.

---

# I. xmake structure

## The problem
Today's `app/desktop/xmake.lua` glob-includes all of `desktop/src/`. WEB_APPS hardcoded. Adding/removing framework features means editing the binary's xmake file.

## I.1 — One `app-shell` target *(LOCKED)*

Single static library. Everything inside: `App`, `MainWindow` + `MainWindowBase`, `Tray`, `UrlProtocol`, `SingleInstance`, `Theming` (libsass and all), `DockSystem`, `WindowRegistry`, ui widgets, both transport adapters. Transport-qt vs transport-wasm is platform-conditional `add_files` *inside* `app-shell`'s xmake.lua, not separate targets.

**Why:** Opt-in is a class-level concept. Consumer who doesn't call `app.useTray()` doesn't instantiate the Tray class — the linker DCEs unused symbols. xmake target granularity adds nothing on top of that. The earlier proposal of N per-service targets was overengineering against a phantom benefit.

Bridges keep their own xmake targets per Phase 1's plan (WASM bridges need `set_kind("object")` to keep `EMSCRIPTEN_BINDINGS` from being dead-stripped — must-preserve #10). Frontend-agent territory; not prescribed here.

## ~~I.2 / I.3~~ (rejected earlier proposals — left for record)

I.2 was "one framework target, runtime opt-in" — basically I.1 framed as a counter. I.1 is that.

I.3 was preprocessor `#ifdef` feature flags. Rejected because `#ifdef` everywhere is noise and hurts test combinatorics.

## Pick: I.1 (LOCKED)
One `app-shell` target. No prefix proliferation. No per-service targets.

---

# J. Resources, branding, identity

## The problem
- `:/icon.ico`, `:/icon.png` hardcoded in framework code
- `APP_NAME`, `APP_SLUG`, `APP_ORG`, `APP_VERSION` defined at xmake.lua top, flowed through `add_defines`, used everywhere — fine, but **sometimes the framework references these directly**
- Consumer rebranding edits xmake.lua + replaces icon files

## J.1 — Framework-internal defaults, consumer overrides on `App` *(my pick)*

Framework loads defaults (a small placeholder icon, `"Framework App"` title). Consumer sets identity:

```cpp
app_shell::App app(argc, argv);
app.setIdentity({
    .organization = "MyCompany",
    .name = "My Cool Tool",
    .slug = "my-cool-tool",
    .version = "1.0.0",
    .iconPath = ":/my-icon.ico",
});
```

**Pros:** No hardcoded defines required. Consumer can build without renaming framework files.

**Cons:** Loses xmake-level identity for Windows `.exe` metadata generation (which currently uses `APP_NAME` etc. at xmake time). Need to keep the xmake mechanism for things that must happen at build time.

## J.2 — Keep the xmake defines, eliminate `:/icon.ico` framework references

Framework code reads icons via `app.iconPath()` accessor. xmake-time defines (APP_NAME, APP_VERSION) keep flowing for Windows `.exe` metadata. Resource paths are exposed via `App` accessors.

**Pros:** Smallest change.

**Cons:** Two ways to set identity (compile-time defines + runtime setter) — but in practice they alias.

## J.3 — Single source: `app/branding.toml` parsed by xmake AND C++

A small TOML/JSON file at the repo root that xmake reads to set defines, and that the framework reads at runtime to fill identity.

**Pros:** One file to edit for branding.

**Cons:** Two parsers. Build complexity.

## My pick & why
**J.2** — keep what works, just decouple framework code from `:/icon.ico` literal paths. Framework reads from `app.iconPath()` (which returns whatever the consumer set, or a built-in framework default). xmake-time identity flow stays for Windows .exe metadata.

---

# K. Architectural-leak fixes

These are smaller items. Most are downstream of the bigger proposals but worth listing as standalone candidates.

| # | Fix | Notes |
|---|---|---|
| K1 | Centralize `kBackground` color | Single source — read from QPalette at runtime, or single `app_shell::config::backgroundColor()` accessor. **Fix the 0x09/0x24 mismatch** (T12). |
| K2 | Eliminate all `qobject_cast<Application*>(qApp)` | Replaced by `app_shell::App&` references passed explicitly. (Falls out of B.1.) |
| K3 | Replace `windowTitle()` string-match in `dock_tab_manager.undockTab` | Use the existing `tabData()` quintptr mechanism (already used in `MainWindow::dockForTab`). |
| K4 | Centralize CDP-debug-port wiring | Currently implicit. Make `app_shell::DebugServer` a tiny opt-in. |
| K5 | Fix `LoadingOverlay::showError` "F12" string | Either read shortcut from MainWindow or just say "open developer tools" without naming the key. |
| K6 | Replace `app->shell()->bridges().value("...")` fishing | Falls out of G.1 typed bridge access. |
| K7 | Replace inline QSettings string-concat | Falls out of F.1 typed settings classes. |
| K8 | One source of truth for `WEB_APPS` table | xmake-side; emit a generated header consumed by `App::appUrl(name)`. |
| K9 | Move `dock-debug.log` into a `app_shell::DockSystem::debugLog()` opt-in (or kill it) | Hardcoded log path is noise. |
| K10 | Make the "first window anti-flash" trick a `app_shell::Shell::showWithAntiFlash(window)` helper | One method, not a copy-paste pattern. |

---

# L. Theme / style system as opt-in

## The problem
Theming is **shipped hardened** (StyleManager + 1000+ themes + libsass + watcher + JSON name mapping + dark/light suffix convention + bridge sync). It's polish-grade. But it's NOT optional today — `Application` always creates `StyleManager`, always calls `applyTheme("default-dark")`, and theme control is **smelly-coupled to SystemBridge** (`setQtTheme`, `getQtTheme`, `qtThemeChanged` live on a "stateless OS I/O" bridge, which is a category error).

## L.1 — `app.useTheming(baseline)` + dedicated `ThemeBridge` *(my pick)*

A member-style call on App that does:
- Create StyleManager attached to `app`
- Apply baseline theme (`"default-dark"` default; consumer overrides)
- **Auto-register a dedicated `ThemeBridge`** that exposes `setQtTheme`/`getQtTheme`/`qtThemeChanged` to React. Theme control comes OFF SystemBridge entirely.
- Returns `Theming&` for further config (e.g. `theming.attachToolbarOn(window)` for the optional toolbar combo + dark/light toggle)

Consumer who doesn't call `app.useTheming(...)` gets:
- No StyleManager
- No `ThemeBridge` registered
- No libsass dependency in the binary (xmake target not linked)
- Qt's default style

**Pros:** True opt-in. Cleans up the SystemBridge category error. Consumer who skips theming pays no code-size or runtime cost.

**Cons:** A consumer who installs theming after creating their main window has to apply retroactively — works fine (`qApp->setStyleSheet` is application-wide).

## L.2 — Theming always loaded, default is "no theme"

Always create StyleManager. Default state = no QSS applied. Consumer calls `app.theming().applyBaseline("default-dark")` if they want theming.

**Pros:** Always available; consumer doesn't have to "install."

**Cons:** Pays the dependency cost (libsass, themes JSON, etc.) even for tray-only apps. **Violates the principle.**

## L.3 — Build-time theme subset *(tracked, future)*

Separate from feature-richness (L.1 vs L.2). Today the QSS generator embeds **all 1000+ themes** into the binary's qrc. A tiny app that wants *just one theme* (e.g. `catppuccin-dark` only) has no clean knob.

Proposal sketch (not in the load-bearing scope of this refactor):

```lua
-- consumer's xmake.lua
target("my-tray-app")
    set_kind("binary")
    add_deps( ... framework-core + theming-service deps ... )
    set_values("framework.themes", "catppuccin-dark", "catppuccin-light")
    -- omit → embed all themes (default for the demo + slate)
```

The QSS generator (today's `tools/generate-qss-themes.ts`) reads this xmake config and emits only the requested QSS files. Themes JSON source unchanged; embedded resources shrink.

**Tracked separately.** Land L.1 first; this is a follow-on.

## My pick & why
**L.1 is the load-bearing call.** Member-style, ThemeBridge auto-registered, SystemBridge stays clean. **L.3 tracked as future work** — added to docs but not blocking the main refactor.

---

# M. ~~Lifecycle hooks for consumers~~ — **dropped**

Originally proposed signals on `App` (`beforeBridgeRegistration`, `afterFirstWindowShown`, etc.) for consumers to inject behavior at framework lifecycle points. **No code in scope actually needs them.** Solving a problem that doesn't exist. Removed from scope.

If a real need surfaces later, add a signal then.

---

# N. WebDialog improvements

## The problem
Today's `WebDialog` requires a parent QMainWindow and reaches `qApp` for `appUrl/webProfile/shell`. Scenarios 1 and 6 stress-test this — neither has a main window.

## N.1 — `WebDialog` takes `App&` and `QUrl`, parent optional *(my pick)*

```cpp
app_shell::WebDialog dlg(app, app.url("settings"));   // parent = nullptr OK
dlg.exec();
// or:
app_shell::WebDialog::show(app, app.url("settings"));   // static fire-and-forget
```

Pulls profile + shell from `app`, not via `qApp` cast. Parent is optional. Spinner-style overlay (not Full).

**Pros:** Works in scenario 1 and 6.

**Cons:** None significant.

## My pick
**N.1**.

---

# O. Tray as opt-in *and* as overrideable preset

## The problem
Tray content is hardcoded with demo Alpha/Beta/Gamma. Tray itself is hardcoded ON.

## O.1 — `app_shell::Tray` class + `app.useTray()` member style *(my pick)*

```cpp
// Full control (Scenario 1):
app_shell::Tray tray(app);
tray.setIcon(myIcon);
tray.addItem("Settings…", []{ ... });
tray.show();

// Default preset (Scenario 4):
auto& tray = app.useTray();       // adds "Show Window" + "Quit" by default
tray.addItemBefore("Quit", "Preferences…", [&]{ ... });
```

`app.useTray()` registers a default tray with sensible items (Show Window, Quit, optionally a version label). Returns `Tray&` so consumer can keep configuring. Direct `Tray(app)` instantiation also works for full control without defaults.

**Pros:** Two patterns served by one class. Scenarios 1 and 4 both clean. Member style locked.

**Cons:** Two API surfaces (instance + member preset). But that's the point — different scenarios, different starting points.

## My pick
**O.1**.

---

# 🎯 Synthesis — my picks at a glance

| Category | Pick |
|---|---|
| A. MainWindow slimming | A.1 — `MainWindowBase` (composable `useX()` helpers) + `MainWindow` (preset wiring the typical app) |
| B. Application slimming | B.1 — tiny `App` + opt-in services via member-style `app.useX()` |
| C. Framework location | C.1 — `app/framework/` with `shell/`, `services/`, `ui/`, `settings/` subfolders |
| D. Demo extraction | D.1 — demo as its own binary; lives under `app/apps/demo/` (paired with `app/apps/main/` slate) |
| E. Multiple starting points | **dropped** — slate + demo + docs is enough; no `app/templates/` folder |
| F. Settings service | F.1 — typed `WindowSettings`/`DockSettings`/`AppSettings`. **Deferred** — not load-bearing for the headline refactor |
| G. Bridge composition | G.1 + G.3 — typed access via `app.bridge<T>()`/`app.addBridge<T>(name)` plus consumer-side single registration call. (Registry class naming is the frontend agent's call.) |
| H. Project structure | H.1 — `<root>/lib/`, `app/{framework,bridges,apps/<name>/,web,wasm,tests}` |
| I. xmake | I.1 — one `app-shell` target. Class-level opt-in is the actual mechanism; xmake granularity adds nothing |
| J. Branding | J.2 — keep xmake-time defines, decouple framework from `:/icon.ico` literal |
| K. Leak fixes | All 10, downstream of bigger picks |
| L. Theming opt-in | L.1 — `app.useTheming(baseline)` member style; auto-registers a dedicated `ThemeBridge`; SystemBridge stops doing themes. **L.3 (build-time theme subset) tracked as future work.** |
| ~~M. Lifecycle hooks~~ | **Dropped** — no real need |
| N. WebDialog | N.1 — parent-optional, takes `App&` |
| O. Tray | O.1 — `app.useTray()` member style + direct `Tray(app)` for full control |

# Cross-proposal interactions

- **A.1 + I.1:** All framework code lives in one `app-shell` xmake target. A consumer who never calls `useDockTabs()` doesn't *instantiate* DockSystem — the linker DCEs unused symbols. No xmake-level surgery needed.
- **B.1 + L.1 + O.1:** All the `app.useX()` entries follow the same convention, making the API teach itself.
- **G.1 + T6:** Typed bridge access kills four fishing sites. Combined with no-bridge-fishing-from-framework (T1), `WebShellWidget` becomes generic — emits `filesDropped` signal instead of calling SystemBridge by name.
- **L.1 + SystemBridge cleanup:** ThemeBridge (auto-registered by `app.useTheming()`) takes over `setQtTheme`/`getQtTheme`/`qtThemeChanged`. SystemBridge sheds the category error.
- **H.1 ↔ Phase 1 (locked in):** H.1 layout is a strict superset of Phase 1's `<root>/lib/` + `app/framework/` + `app/bridges/` — no conflict; adds `apps/<name>/` plural, the framework subfolder structure, and `bridges/theme/`.

The full plan tells one story: **opt-in framework, N desktop apps under `app/apps/`, every feature is a class you add via `app.useX()`, never a god-class you fight.**
