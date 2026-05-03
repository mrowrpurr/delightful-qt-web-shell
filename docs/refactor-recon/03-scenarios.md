# Consumer Scenarios — API Stress Test 🧪

For the proposed framework to be **delightful**, it has to make every one of these scenarios trivial. If a design makes scenario 1 or 6 painful, the design is wrong.

I've sketched what each consumer's `main.cpp` *could* look like in the target world. These are not API decisions — they're stress-tests. The point is to find the shape that makes every case feel natural.

The names below are placeholders (`app_shell::App`, `app_shell::Tray`, etc.) — actual namespaces and class names get decided after we settle.

---

## Scenario 1 — Tray-only mini app with a tiny QWebEngine settings popup

**The consumer:** wants a system tray icon and a settings popup. That's the entire app.

**They need:** tray, web dialog, bridges. **They don't need:** main window, dock-tab system, multi-window, URL protocol, theme system, status bar, menu bar, single-instance (maybe).

```cpp
#include <framework/app.hpp>
#include <framework/tray.hpp>
#include <framework/web_dialog.hpp>
#include "my_settings_bridge.hpp"

int main(int argc, char** argv) {
    app_shell::App app(argc, argv);
    app.bridges().add<MySettingsBridge>("settings");

    app_shell::Tray tray(app);
    tray.addItem("Settings…", [&]{
        app_shell::WebDialog::show(app, app.url("settings"));
    });
    tray.addItem("Quit", [&]{ app.quit(); });
    tray.show();

    return app.exec();
}
```

**~15 lines. No QApplication. No QMainWindow. No DockManager. No StyleManager.** The bridges are typed; the tray is opt-in; the WebDialog is a one-liner.

**What this implies for the API:**
- `app_shell::App` exists and does the bare minimum (bridges, web profile, scheme handler in prod, signalReady contract).
- `app_shell::Tray` is a separate class the consumer instantiates.
- `app_shell::WebDialog::show(app, url)` is a static helper. (Or `WebDialog dlg(app, url); dlg.exec();` if they want to block.)
- `app.bridges().add<T>(name)` is the registration. `app.url("settings")` is the dev/prod URL switch.

---

## Scenario 2 — Single-window app, no tabs/docks/tray

**The consumer:** wants one window, full-screen React app, standard menu bar (File > Quit and that's it). No tabs, no docks, no tray.

```cpp
#include <framework/app.hpp>
#include <framework/basic_main_window.hpp>
#include "my_bridge.hpp"

int main(int argc, char** argv) {
    app_shell::App app(argc, argv);
    app.bridges().add<MyBridge>("my");

    app_shell::MainWindowBase window(app, app.url("app"));
    window.menuBar().addQuit();   // optional one-liner
    window.show();

    return app.exec();
}
```

**~10 lines.** `MainWindowBase` is the answer to T13 — its central widget is the `WebShellWidget`. No placeholder. No docks. No DockManager involvement.

**What this implies for the API:**
- `MainWindowBase` is a real class. It's tiny — a `QMainWindow` whose central widget is a `WebShellWidget` (or whatever QWidget the consumer hands it).
- It exposes `menuBar()` returning a builder that can compose menus incrementally.
- No automatic dock system, no automatic status bar, no automatic toolbar.

---

## Scenario 3 — Multi-window app (tools + inspector pattern)

**The consumer:** wants a main window plus separately-opened tool windows (settings, console, inspector). Each tool window is its own QMainWindow. Single-instance: yes, raise existing windows on second launch.

```cpp
#include <framework/app.hpp>
#include <framework/basic_main_window.hpp>
#include <framework/single_instance.hpp>

int main(int argc, char** argv) {
    app_shell::App app(argc, argv);
    app_shell::SingleInstance::ensure(app);   // exits if not primary; raises existing windows on activation

    app.bridges().add<MyBridge>("my");
    app.bridges().add<ToolsBridge>("tools");

    auto& main = app.windows().create<app_shell::MainWindowBase>(app.url("main"));
    auto& settings = app.windows().create<app_shell::MainWindowBase>(app.url("settings"));
    settings.hide();   // shown via menu

    main.menuBar().add("View > Settings", [&]{ settings.toggle(); });
    main.menuBar().addQuit();
    main.show();

    return app.exec();
}
```

**~15 lines.** Multi-window orchestration is opt-in via `app.windows()` (a registry). `SingleInstance::ensure(app)` hooks the activation behavior.

**What this implies:**
- `app.windows()` is a registry that owns lifetimes and routes activation. It exists if the consumer creates a window through it; otherwise dormant.
- `SingleInstance::ensure(app)` is the static "do this at the top of main" helper. Returns or exits.

---

## Scenario 4 — IDE-like (current demo, essentially)

**The consumer:** the full circus — multi-window, dock-tab system with floatable tabs, tray, URL protocol, theme system, full menus. Power-user app.

```cpp
#include <framework/app.hpp>
#include <framework/docked_main_window.hpp>
#include <framework/tray.hpp>
#include <framework/url_protocol.hpp>
#include <framework/theming.hpp>
#include <framework/single_instance.hpp>
#include "my_bridge.hpp"

int main(int argc, char** argv) {
    app_shell::App app(argc, argv);
    app_shell::SingleInstance::ensure(app);
    app_shell::UrlProtocol::registerOnFirstLaunch(app);
    app.useTheming("default-dark");
    app.useTray();   // tray with "Show Window" + "Quit"

    app.bridges().add<MyBridge>("my");

    auto windows = app.windows().restoreOrCreate<app_shell::MainWindow>();
    for (auto* w : windows) w->show();

    return app.exec();
}
```

**~15 lines.** Each opt-in service is a single line. `MainWindow` is the answer for the dock-tab pattern (replaces today's `MainWindow`).

**What this implies:**
- `app.useTheming(baseline)` attaches StyleManager + auto-registers `ThemeBridge` (from `app/bridges/theme/`); returns `Theming&` for further config.
- `app.useTray()` attaches a default tray (Show Window + Quit) and returns `Tray&` for further config. For full custom control, instantiate `Tray(app)` directly per scenario 1.
- `UrlProtocol::registerOnFirstLaunch(app)` does the prompt + register dance.
- `app.windows().restoreOrCreate<T>()` covers the persistence + first-launch case.

---

## Scenario 5 — WASM-only browser app (no Qt)

**The consumer:** ships React-only to the browser via WASM. No desktop entry point.

This isn't a `desktop/main.cpp` scenario at all — it's the `wasm/` target. The framework split (Phase 1 already-locked-in: `<root>/lib/<domain>/` + `app/framework/transport/wasm/` + `app/bridges/<domain>/`) is what makes this work.

The point of including this scenario in the stress-test: **the C++ refactor must not make WASM harder.** Bridges must remain transport-agnostic. The "typed bridge access" pattern from T6 has to work in WASM, and pure domain libs at `<root>/lib/<domain>/` must still compile against Embind without dragging Qt in.

---

## Scenario 6 — Wizard / single-purpose dialog app

**The consumer:** the entire app is a QDialog with a web view. No main window. Returns exit code from the dialog.

```cpp
#include <framework/app.hpp>
#include <framework/web_dialog.hpp>
#include "wizard_bridge.hpp"

int main(int argc, char** argv) {
    app_shell::App app(argc, argv);
    app.bridges().add<WizardBridge>("wizard");

    app_shell::WebDialog dlg(app, app.url("wizard"));
    return dlg.exec();
}
```

**~8 lines.** Same `WebDialog` as scenario 1. No tray, no main window, no anything.

**What this implies:**
- `WebDialog` constructs without needing a parent QMainWindow. (Today's `web_dialog.cpp` requires a parent.)
- `WebDialog` works without Application owning a DockManager or anything else.

---

# What the scenarios reveal about the API shape

**🧠 Key design choices the scenarios force:**

1. **`app_shell::App` is the entry — never `qobject_cast<Application*>(qApp)`.** Consumer code passes `app` references around. No singleton fishing.

2. **`MainWindowBase` and `MainWindow` are both real, separate classes.** Not "one MainWindow with feature flags." Different mental model, different API surface.

3. **Bridges are typed.** `app.bridges().add<T>(name)` registers; `app.bridges().get<T>()` retrieves. The string name is for the wire protocol; the C++ type is what consumers use.

4. **Optional features are objects you instantiate or member-style `app.useX()` calls.** Both forms are valuable: `Tray tray(app); tray.addItem(...)` for full control (scenario 1), `app.useTray()` for "give me the default" (scenario 4).

5. **`app.url("name")` is the dev/prod switch.** Same `name` works in dev (Vite port) and prod (`app://name/`). The framework doesn't care if it's `"main"`, `"settings"`, `"app"`, or `"wizard"` — that's the consumer's choice.

6. **`WebDialog` works without a MainWindow.** Stress-tested by scenarios 1 and 6.

7. **`app.windows()` is the multi-window registry — dormant unless used.** Scenario 1 doesn't touch it; scenarios 3 and 4 do.

8. **No service hardcodes the assumption that another service exists.** Theming works without bridges. Tray works without DockManager. URL protocol works without single-instance. They compose; they don't depend on each other.

9. **`MainWindow` extends `MainWindowBase` (or composes it).** The dock system is a feature on top of the basic shell.

10. **No QMainWindow subclass *requires* docks or web content.** Today's MainWindow does. The new ones don't.

---

# Failed dreams (worth flagging)

These are nice-to-haves that the scenarios don't quite force, but suggest:

- **A `app_shell::DesktopApp` wrapper class** that pre-installs everything common (tray, theming, URL protocol, single-instance) for consumers who want the IDE preset without the boilerplate. Probably-no — the scenario 4 main is already short.

- **A YAML/INI manifest for "what services to install"** — overkill. Code-as-config is fine for ~8 lines of opt-in.

- **Builder-style chaining** (`app_shell::App(argc, argv).withTray().withTheming("default-dark").withUrlProtocol().exec()`) — cute, but harder to debug, harder to extend, hides side effects. Stick with discrete statements.

- **A `app_shell::makeStandardWindow()` factory** — basically scenario 4 wrapped. Could ship as one of the demo compositions; not in the framework core.
