# Dependency Graph + Tangle-Finding 🧵

For each "should be optional" responsibility, what blocks clean extraction. The "untangle-first" shortlist. These are the architectural bottlenecks.

---

## T1 — `WebShellWidget` knows `SystemBridge` by name AND concrete type

**Where:** `web_shell_widget.cpp:191-194`

```cpp
auto* bridge = static_cast<SystemBridge*>(
    shell_->bridges().value("system"));
if (bridge)
    bridge->handleFilesDropped(paths);
```

The drag/drop handler is framework code. It directly invokes a method on a specific bridge identified by a magic string. **A consumer who renames or omits SystemBridge has a silently broken drag/drop.**

**Untangle:** WebShellWidget emits a `Qt` signal `filesDropped(QStringList)`. The consumer (or an opt-in `DragDropController`) connects it to whatever they want. No bridge fishing. No name coupling.

---

## T2 — `DockManager` knows `WebShellWidget` concretely

**Where:** `dock_manager.cpp:62-65`

```cpp
auto* widget = new WebShellWidget(
    app->webProfile(), app->shell(), url,
    WebShellWidget::FullOverlay);
```

DockManager *is* the dock factory. It hardwires the dock's content. It assumes `app->webProfile()`, `app->shell()`, `app->appUrl(...)` exist. It persists URLs because it knows the content type has a URL.

**Consequence:** A consumer who wants a dock containing arbitrary `QWidget` (a chart, a tree view, a native form) **cannot use DockManager at all.**

**Untangle:** DockManager becomes content-agnostic. Either:
- Takes a `std::function<QWidget*(QString id)>` factory at registration, so consumer chooses what fills a dock; or
- Accepts an already-constructed QWidget with optional persistence policy (URL persistence is opt-in for web-content docks).

URL persistence becomes a separate concern — a `WebContentPersistencePolicy` or similar — only attached when the dock content is a `WebShellWidget`.

---

## T3 — `DockManager` ↔ `MainWindow` bidirectional concrete-type knowledge

**Where (DockManager → MainWindow):**
- `dock_manager.hpp:31, 38, 42` — public API takes/returns `MainWindow*`
- `dock_manager.cpp:115-122, 256-264, 299-306` — iterates `topLevelWidgets()` and `qobject_cast<MainWindow*>` to find dock hosts

**Where (MainWindow → DockManager):**
- `main_window.cpp:80-90` — calls `dm->createDock(...)`, `dm->restoreDocks(...)`
- `main_window.cpp:294-313` — eventFilter calls `dm->closeDock(dock)`
- `main_window.cpp:327` — context menu calls `dm->closeDock(dock)` for siblings

**Untangle:** Docks should *carry* their host as a property. `dock->property("host")` or a typed pointer. DockManager becomes a pure registry that emits signals; MainWindow listens for what it cares about. No `topLevelWidgets()` iteration. No string-matching.

---

## T4 — `MainWindow` knows `WebShellWidget` concretely

**Where:**
- `main_window.hpp:52` — `WebShellWidget* activeTab() const;` — public API returns concrete type
- `main_window.cpp:176-184` — listens for `widget->view()->page()->titleChanged` for reactive dock titles
- `main_window.cpp:241-269` — `wireToActiveDock` reaches into `tab->view()`, `view->page()`, `view->setZoomFactor` to wire zoom and devtools
- `main_window.cpp:264-265` — pushes web zoom into status bar

**Consequence:** Zoom, devtools, and reactive titles are *all* coupled to the assumption that dock content is a WebShellWidget. A `MainWindow` consumer who puts non-web content in a dock breaks all of these.

**Untangle:** Web-shell-specific behavior (zoom, devtools toggle, title-tracking) extracts into a small `WebContentController` (or "WebShellAdapter") that gets attached to a dock that *happens to* contain a WebShellWidget. Generic MainWindow doesn't know what's in its docks.

---

## T5 — `Application`'s constructor is a god-class orchestrator

**Where:** `application.cpp:41-166` — single constructor doing 14 distinct setup steps.

Every step is hardcoded ON. To turn off the system tray, edit framework code. To turn off URL protocol, edit framework code. To replace the theme baseline, edit framework code.

**Consequence:** The class is unrideable. A consumer subclassing `Application` inherits **all** of it.

**Untangle:** The full pattern is described in proposals — the short version is *opt-in services*. The Application ctor reduces to bridges + web profile + scheme handler + signalReady contract. Tray, URL protocol, single-instance, theming, dock manager are all separate services attached by the consumer's `main.cpp`.

---

## T6 — Bridge access via name+cast everywhere

**Where:**
- `main.cpp:51-52` — `static_cast<SystemBridge*>(app.shell()->bridges().value("system"))`
- `menu_bar.cpp:78` — same
- `main_window.cpp:115-116` — same
- `web_shell_widget.cpp:191-192` — same

Every consumer of a specific bridge does this dance. Four sites for one bridge. If the consumer renames `system` to `prefs`, all four sites silently get `nullptr`.

**Untangle:** Typed bridge access:
```cpp
auto* bridge = app.bridges().get<SystemBridge>();
```
Returns `nullptr` if the consumer didn't register that type. Compile-time-safe for the type, run-time-checked for presence. The "system" string lives only at registration time.

Also: don't make framework code (e.g., WebShellWidget) ever call into a specific bridge type. Use signals/listeners for cross-component communication.

---

## T7 — `menus/menu_bar.cpp` is two responsibilities tangled

**Where:** `menu_bar.cpp:61-208` (menu structure) + `menu_bar.cpp:210-309` (toolbar with theme combo + dark/light)

Two unrelated concerns in one 309-line file. The toolbar theme controls reach directly into `app->styleManager()` API. The menu structure is hardcoded with demo entries (React Dialog, Demo Widget, About).

**Untangle:**
- Per-menu builders or a declarative menu spec that consumers can build incrementally (`menuBar.addStandardFile()`, `menuBar.add("Custom > Action", callback)`, etc.)
- Toolbar theme controls move into the theming feature (a consumer who installs theming gets the toolbar widget for free; a consumer who doesn't, doesn't see it).
- Demo entries (React Dialog, Demo Widget, About) live with the demo, not in framework menu code.

---

## T8 — QSettings keys constructed inline with string-concat across many files

**Where:** see leak L1 — `dock_manager.cpp`, `main_window.cpp`, `application.cpp`. Key prefixes used: `window/`, `dock/`, `urlProtocol/`, plus Windows-registry keys.

**Consequence:** Renaming a key prefix requires hunting across files. No single source of truth. The schema is implicit.

**Untangle:** A small typed `Settings` helper:
```cpp
class WindowSettings {
public:
    explicit WindowSettings(const QString& windowId);
    QByteArray geometry() const;
    void saveGeometry(const QByteArray&);
    QByteArray dockState() const;
    void saveDockState(const QByteArray&);
    qreal zoomFactor() const;
    void saveZoomFactor(qreal);
    void clear();  // for window close
};
```
Plus `class DockSettings`, `class AppSettings`. All keys live in one file.

---

## T9 — Demo content lives mixed inside framework files

**Where:**
- `application.cpp:402-429` — Alpha/Beta/Gamma tray submenus baked into `setupSystemTray()`
- `main_window.cpp:115-123` — listens for `openDialogRequested`, opens `WebDialog` (specific demo)
- `menu_bar.cpp:160-172` — Windows > React Dialog and Windows > Demo Widget actions
- `menu_bar.cpp:201-205` — Help > About opens AboutDialog with demo content
- `about_dialog.cpp:40-46` — copy "A template for Qt + React desktop apps with real testing and zero-boilerplate bridges"

**Untangle:** All demo content extracts into a separate "demo composition" module. Framework classes don't reference demo dialogs, demo bridges, or demo menu entries.

---

## T10 — `DockManager::createDock` defaults URL to `app->appUrl("main")`

**Where:** `dock_manager.cpp:60`

```cpp
QUrl url = contentUrl.isEmpty() ? app->appUrl("main") : contentUrl;
```

DockManager has hardcoded knowledge that "main" is the default app. Couples to demo's app naming.

**Untangle:** No default. Caller specifies the URL (or the content widget). DockManager takes whatever's given.

---

## T11 — Three-way Application ↔ StyleManager ↔ SystemBridge wiring

**Where:** `application.cpp:128-143`

```cpp
connect(styleManager_, &StyleManager::themeChanged, ..., [systemBridge]{
    systemBridge->updateQtThemeState(...);   // StyleManager → SystemBridge
});
systemBridge->on_signal("qtThemeRequested", [this](const json& data){
    QMetaObject::invokeMethod(this, [...]{
        styleManager_->applyThemeByDisplayName(...);   // SystemBridge → StyleManager
    });
});
```

A specific bridge (`SystemBridge`) is wired to a specific manager (`StyleManager`) via a specific signal name (`qtThemeRequested`). All three are tangled in the Application constructor.

**Untangle:** A dedicated `ThemeSyncController` class that holds the wiring. Created only if both theming AND a bridge are installed. Dies cleanly if either is absent.

---

## T12 — `kBackground` color constant duplicated three times, two different hexes

**Where:**
- `application.cpp:39` — `QColor{0x24, 0x24, 0x24}` "Must match --bg in App.css"
- `web_shell_widget.cpp:31` — `QColor{0x24, 0x24, 0x24}` "Must match --bg in App.css and LoadingOverlay"
- `loading_overlay.cpp:17` — `QColor{0x09, 0x09, 0x0b}` "Must match --bg in App.css"

**0x24 ≠ 0x09.** This is a bug-flavored smell — the loading overlay's background doesn't match the others. The "Must match" comments confidently lie.

**Untangle:** Read from the active QSS palette via `qApp->palette().window()` or expose a single `app_shell::backgroundColor()` accessor. Or accept that this particular color must be defined in one place and consumed everywhere.

---

## T13 — `MainWindow`'s central widget is a 0×0 placeholder

**Where:** `main_window.cpp:71-73`

```cpp
auto* placeholder = new QWidget(this);
placeholder->setMaximumSize(0, 0);
setCentralWidget(placeholder);
```

This is the dock-tab system's tax: in QMainWindow, you can't have docks-only without *some* central widget. The 0×0 is a workaround.

**Consequence:** A consumer who wants "single QWebEngineView, no docks" inheriting from MainWindow inherits the placeholder, fights the dock layout, and gets weird default behavior.

**Untangle:** Two main-window flavors:
- `MainWindowBase` — central widget is whatever you set; composable `useX()` helpers; no opinions
- `MainWindow` — opinionated preset that calls `useWebShellAsCentral` + `useDockTabs` + the works in its ctor

---

## T14 — `SchemeHandler` hardcodes `:/web-<host>/` QRC prefix

**Where:** `scheme_handler.cpp:34-36`

```cpp
QString resPath = ":/web-" + appName + urlPath;
```

The scheme handler couples to xmake's QRC convention (`<qresource prefix="/web-main">`). Breaks if xmake changes the prefix; breaks if a consumer wants a different layout.

**Untangle:** Configurable prefix at scheme handler construction. Or a registry (`schemeHandler.registerHost("main", ":/web-main")`). The convention can stay as the *default*; framework just shouldn't bake it as the only choice.

---

## T15 — `WEB_APPS = {"main"}` and `devPorts` are two sources of truth

**Where:**
- `desktop/xmake.lua:11` — `local WEB_APPS = {"main"}`
- `application.cpp:454-456` — `static const QHash<QString, int> devPorts = { {"main", 5173}, };`

Adding a web app requires editing both. Untangle: one source of truth (probably xmake-side) emitted to C++ via a generated header or define.

---

## T16 — `dock_tab_manager.undockTab` finds dock by `windowTitle()` string match

**Where:** `dock_tab_manager.cpp:215-220`

```cpp
QDockWidget* target = nullptr;
for (auto* dock : window_->findChildren<QDockWidget*>()) {
    if (dock->windowTitle() == title) { target = dock; break; }
}
```

The user-visible title is doing the job of an ID. Two docks with the same title (or a title that changes mid-drag) breaks this. There's already a stable mechanism — `tabBar->tabData()` quintptr — used elsewhere in `MainWindow::dockForTab`. Use it.

---

# The "untangle-first" shortlist

Items that block other extractions. Tackle these first:

1. **T6 (typed bridge access)** + **T11 (theme sync controller)** — eliminate the fishing pattern. Unblocks: T1, T7's toolbar split, T9's demo-extraction (because demo bridges become typed registrations).

2. **T2 (DockManager content-agnostic)** + **T4 (web-shell controller for MainWindow)** — make docks generic. Unblocks: T3's bidirectional MainWindow knowledge, T13 (`MainWindowBase` toolbox vs `MainWindow` preset split).

3. **T5 (Application slimming)** — services as opt-in. Unblocks: T9 (demo composition lives outside Application).

4. **T8 (settings service)** — centralize keys. Cosmetic but enables clean test coverage of persistence schema and prevents "where does this key live?" questions during everything else.

After these four, the rest (T7 menu builders, T10 dock URL default, T12 color constant, T14 scheme handler prefix, T15 web-app source of truth, T16 windowTitle string match) are leaf cleanups that drop in cleanly.
