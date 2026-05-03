# Native-Side Inventory + Classification 🏴‍☠️

Working notes from recon. One row per native-side class with responsibilities tagged.

Tag legend:
- 🎭 **demo** — literal showcase content; consumer rips out
- 🎨 **polish** — opt-in feature; ship hardened, consumer attaches when wanted
- 🔧 **default-on** — useful by default but must be removable; the "in the way" stuff
- 🏗 **core** — true framework internals; consumer should never need to know

---

## `desktop/src/main.cpp` — bootstrap glue (78 lines)

| Responsibility | Tag | Notes |
|---|---|---|
| `setupLogging()` | 🏗 | Qt message handler init |
| `SchemeHandler::registerUrlScheme()` | 🏗 | Must run before QApplication |
| Construct `Application` | 🏗 | |
| Single-instance bail-out | 🔧 | currently mandatory; must be optional |
| `dockManager()->restoreWindows()` or `new MainWindow()` | 🔧 | hardwired to dock-based main window |
| Wire `activationRequested` to raise visible MainWindow | 🔧 | only useful with multi-window or tray |
| Wire `appLaunchArgsReceived` → `SystemBridge::handleAppLaunchArgs` | 🔧 | demo/consumer-bound — assumes a SystemBridge exists |
| Pass first-launch CLI args to SystemBridge | 🔧 | same |
| Anti-flash trick (`opacity 0` → `singleShot(0)` → `1.0`) | 🎨 | framework polish, hidden gem |

This file is consumer-shaped glue today. In the target world, what's left should be the consumer's `main.cpp`; the framework concerns live elsewhere.

---

## `desktop/src/application.cpp/.hpp` — QApplication subclass (462 + 93 lines)

A god-class. The constructor does ~14 distinct things in sequence.

| Responsibility | Tag | Where | Notes |
|---|---|---|---|
| Qlementine icon theme init | 🎨 | `application.cpp:47` | required before any QIcon usage |
| Identity (org, name, version, INI format, window icon) | 🏗 | `application.cpp:50-57` | all consumer-customizable |
| `--dev` cmdline option (Vite dev mode) | 🔧 | `application.cpp:60-69` | uses `parse()` not `process()` (must-preserve #11) |
| `setupSingleInstance()` | 🔧 | `application.cpp:74-75, 176-225` | early-return if not primary |
| Dark theme baseline (color scheme + palette) | 🎨 | `application.cpp:81-85` | hardcoded `kBackground{0x24,0x24,0x24}` |
| `StyleManager` instantiation + `applyTheme("default-dark")` | 🎨 | `application.cpp:92-93` | hardcoded baseline name |
| `QWebEngineProfile` setup (cache + storage paths) | 🏗 | `application.cpp:101-105` | named profile = persistent localStorage |
| `installUrlSchemeHandler("app", handler)` | 🏗 | `application.cpp:111-112` | only in non-dev mode |
| `WebShell` + bridge registration (TodoBridge, SystemBridge) | 🏗+🎭 | `application.cpp:119-124` | the `addBridge()` site (must-preserve #3) |
| StyleManager↔SystemBridge wiring (`qtThemeRequested`, theme push) | 🎨 | `application.cpp:128-143` | three-way coupling |
| `promptUrlProtocolRegistration()` | 🔧 | `application.cpp:148, 332-361` | shows QMessageBox on launch |
| `setupSystemTray()` | 🔧 | `application.cpp:153, 379-447` | with **demo** Alpha/Beta/Gamma submenus 🎭 |
| `DockManager` instantiation | 🔧 | `application.cpp:158` | always created |
| `aboutToQuit` → `dockManager_->shutdownAll()` | 🏗 | `application.cpp:163-165` | safety net |
| `requestQuit()` (live-loop shutdown) | 🏗 | `application.cpp:168-174` | needed because Qt's `quit()` is too late for `deleteLater` |
| `setupSingleInstance()` (named pipe / domain socket) | 🔧 | `application.cpp:176-225` | per-platform protocol |
| URL protocol register/unregister/check (Win + Linux + macOS) | 🔧 | `application.cpp:227-330` | Windows registry, Linux .desktop, macOS Info.plist |
| `event()` override for `QEvent::FileOpen` (macOS URL) | 🔧 | `application.cpp:363-377` | macOS-specific URL protocol delivery |
| Tray menu submenus: "Example Menu 1" with Alpha/Beta/Gamma; "Nested Example 2" with deeper subs | 🎭 | `application.cpp:402-429` | **literal demo content baked into framework class** |
| `appUrl(name)` → dev URL or `app://name/` | 🏗 | `application.cpp:450-462` | `devPorts` table hardcoded with `"main"` |

Forty-six responsibilities in one class. The constructor alone runs fourteen of them.

---

## `desktop/src/dock_manager.cpp/.hpp` — dock lifecycle (400 + 83 lines)

| Responsibility | Tag | Where | Notes |
|---|---|---|---|
| Tracks all docks across all MainWindows | 🔧 | entire class | global registry pattern |
| `createDock(url, host, id)` constructs `WebShellWidget` directly | 🔧+🏗 | `dock_manager.cpp:62-65` | **hardwired to WebShellWidget content** — no support for arbitrary QWidget |
| Per-dock QSettings persistence (URL, floating, geometry, order, window) | 🔧 | `dock_manager.cpp:286-329` | inline key concat `"dock/" + id + "/..."` |
| Restore via UUID + `QMainWindow::saveState/restoreState` | 🔧 | `dock_manager.cpp:130-217` | three-phase restore (create, layout, floating geometry) |
| Iterates `QApplication::topLevelWidgets()` to find host MainWindow for a dock | 🔧 | `dock_manager.cpp:115-122, 256-264, 299-306` | **bidirectional MainWindow knowledge** |
| Hooks `QWebEngineView::urlChanged` for save | 🔧 | `dock_manager.cpp:338-347` | only works because dock content is WebShellWidget |
| Hooks `QDockWidget::topLevelChanged` for save | 🔧 | `dock_manager.cpp:351-356` | |
| Event filter on docks for resize/move debouncing (500ms) | 🔧 | `dock_manager.cpp:362-400` | |
| Debug log to `<AppData>/dock-debug.log` | 🎭 | `dock_manager.cpp:28-45` | clearly debug — log path hardcoded |
| `restoreWindows()` constructs MainWindow instances | 🔧 | `dock_manager.cpp:219-237` | knows MainWindow concrete type |
| `shutdownAll()` (idempotent, processes pending deletes, closes top-levels) | 🏗 | `dock_manager.cpp:241-282` | required for clean exit |

Tangle-rich. DockManager is the single biggest source of cross-class coupling.

---

## `desktop/src/style_manager.cpp/.hpp` — QSS theming (311 + 111 lines)

| Responsibility | Tag | Where |
|---|---|---|
| Three-source QSS lookup: `STYLES_DEV_PATH` → AppData/styles → `:/styles/...` | 🎨 | `style_manager.cpp:80-117, 192-221` |
| `QFileSystemWatcher` live reload | 🎨 | `style_manager.cpp:58-78` |
| libsass SCSS compilation | 🎨 | `style_manager.cpp:223-250` |
| Dark/light suffix convention (`-dark`/`-light`) | 🎨 | `style_manager.cpp:92-98, 167-175` |
| Slug↔display-name JSON mapping | 🎨 | `style_manager.cpp:289-311` |
| `themeChanged` signal (parameterless) | 🎨 | `style_manager.hpp:80` |
| Hardcoded fallback `"default-dark"`/`"default-light"` | 🎨 | `style_manager.cpp:124, 162` |
| `setColorScheme()` on platform style hints | 🎨 | `style_manager.cpp:109-111` |

Self-contained. Could be ripped out cleanly if the consumer doesn't want themeing.

---

## `desktop/src/windows/main_window.cpp/.hpp` — QMainWindow (428 + 68 lines)

| Responsibility | Tag | Where |
|---|---|---|
| UUID-based identity (`objectName`) | 🔧 | `main_window.cpp:40-43` |
| Geometry restore from QSettings | 🔧 | `main_window.cpp:48-59` |
| Build menu bar via `buildMenuBar(this)` | 🔧 | `main_window.cpp:62` |
| Build toolbar via `buildToolBar(this, *actions)` | 🔧 | `main_window.cpp:63` |
| `StatusBar` instantiation | 🔧 | `main_window.cpp:66-67` |
| **Central widget = 0×0 placeholder** (because all content is in docks) | 🔧 | `main_window.cpp:71-73` |
| Dock nesting + `Qt::TopDockWidgetArea` north tabs | 🔧 | `main_window.cpp:75-76` |
| `DockTabManager` instantiation | 🔧 | `main_window.cpp:77` |
| Restore docks or create one default dock | 🔧 | `main_window.cpp:80-90` |
| Wire `New Window`/`New Tab`/`Close Tab` actions to DockManager | 🔧 | `main_window.cpp:95-109` |
| `wireToActiveDock()` — connects zoom/devtools actions to active dock's QWebEngineView | 🔧 | `main_window.cpp:112, 241-269` |
| Listen for `SystemBridge::openDialogRequested` → open `WebDialog` | 🎭 | `main_window.cpp:115-123` (uses QTimer::singleShot(0) for QWebChannel safety) |
| Save geometry/dockState/zoom on aboutToQuit | 🔧 | `main_window.cpp:129-138` |
| Restore zoom factor for first dock | 🔧 | `main_window.cpp:140-144` |
| `addDock`/`removeDock` API for DockManager | 🔧 | `main_window.cpp:149-199` |
| Reactive dock title from `QWebEnginePage::titleChanged` | 🎨 | `main_window.cpp:176-184` |
| `wireTabBar()` finds auto-created QTabBar children, makes closable, installs filter, wires close + currentChanged | 🔧 | `main_window.cpp:213-237` |
| `dockForTab()` resolves tab index → dock via `tabData()` quintptr | 🏗 | `main_window.cpp:201-211` |
| `eventFilter` for: floating dock activation, dock close, middle-click tab close, right-click tab context menu | 🔧 | `main_window.cpp:279-378` |
| Right-click menu: "Close tab/Close other tabs/Close to the right/Close all" | 🔧 | `main_window.cpp:330-371` |
| `changeEvent` ActivationChange to track active dock | 🔧 | `main_window.cpp:380-393` |
| `closeEvent` — hide-to-tray if last visible window, else clean up | 🔧 | `main_window.cpp:395-427` |

Owned by **dock-tab assumption** throughout. Not viable as a base class for a consumer who wants a single web view with no docks.

---

## `desktop/src/widgets/web_shell_widget.cpp/.hpp` — QWebEngineView host (200 + 62 lines)

| Responsibility | Tag | Where |
|---|---|---|
| QWebEngineView + LoggingWebPage subclass (JS console → qDebug) | 🏗 | `web_shell_widget.cpp:35-67` |
| Page background color (hardcoded `0x24,0x24,0x24`) | 🎨 | `web_shell_widget.cpp:31, 66` |
| Per-instance QWebChannel registering shell + bridges | 🏗 | `web_shell_widget.cpp:103-113` (must-preserve, signals reach all views) |
| `qwebchannel.js` injection at DocumentCreation | 🏗 | `web_shell_widget.cpp:92-100` |
| Devtools view (lazy) | 🎨 | `web_shell_widget.cpp:118-124, 157-168` |
| Drag/drop event filter on `view_->focusProxy()` | 🏗 | `web_shell_widget.cpp:129-135, 170-200` |
| **Hardcoded fishing for SystemBridge by name** to call `handleFilesDropped(paths)` | 🎭 | `web_shell_widget.cpp:191-194` |
| Loading overlay attached, dismissed on `WebShell::ready` | 🎨 | `web_shell_widget.cpp:142-154` |
| Page-load timing logging | 🎨 | `web_shell_widget.cpp:74-87` |

The drag/drop handler is the cleanest example of a tangle: framework code (focusProxy filter) directly calls a consumer-specific bridge.

---

## `desktop/src/widgets/dock_tab_manager.cpp/.hpp` — IDE-style tab UX (234 + 58 lines)

| Responsibility | Tag |
|---|---|
| Title bar swap (tabified=hidden, floating=custom, standalone=native) | 🔧 |
| Drag-to-undock from tab bar | 🔧 |
| `LayoutRequest` event tracking (no Qt signal for tabification) | 🏗 |
| `windowTitle()` string-match to find dock during undock | ⚠️ smell — `dock_tab_manager.cpp:215-220` |

Coherent module. Could ship as opt-in IDE-tabs feature.

---

## `desktop/src/widgets/floating_dock_titlebar.cpp/.hpp` — custom title bar (97 + 42 lines)

| Responsibility | Tag |
|---|---|
| Title label + dock-back (▣) + close (×) buttons | 🔧 |
| Drag to move floating dock | 🔧 |
| Reactive title from `windowTitleChanged` | 🔧 |
| Inline QSS using palette() | 🎨 |

Tightly bound to `DockTabManager`. Together they're "the dock-tab feature."

---

## `desktop/src/widgets/loading_overlay.cpp/.hpp` — fade-out overlay (111 + 47 lines)

| Responsibility | Tag |
|---|---|
| Two styles: Full (logo+progress+15s timeout) / Spinner | 🎨 |
| 300ms fade-out animation | 🎨 |
| Parent resize event filter | 🎨 |
| Hardcoded `kBackground{0x09,0x09,0x0b}` (different hex from other "must match" sites!) | 🎭 bug-flavored smell |
| Error message references "F12" + "restart the app" | 🎨 |
| Logo loaded from `:/icon.png` (hardcoded) | 🎨 |

Spinner mode is the minimum viable; Full mode is polish. Errors hint at framework knowledge of devtools shortcut.

---

## `desktop/src/widgets/scheme_handler.cpp/.hpp` — `app://` resolver (59 + 28 lines)

| Responsibility | Tag |
|---|---|
| `registerUrlScheme()` static, must run before QApplication | 🏗 |
| Route by host: `app://main/` → `:/web-main/...` | 🏗 |
| MIME type table | 🏗 |
| SPA fallback: unknown paths → index.html | 🏗 |
| `web-` prefix hardcoded in QRC paths | 🏗 (couples scheme handler to QRC convention) |

True framework. Stays.

---

## `desktop/src/widgets/status_bar.cpp/.hpp` (31 + 31 lines)

| Responsibility | Tag |
|---|---|
| Permanent widgets: status label + zoom label | 🔧 |
| `flash(message, timeout)` temporary message | 🔧 |
| Zoom indicator updated by MainWindow (cross-coupling — see tangles) | 🔧 |

Tiny class. Optional.

---

## `desktop/src/menus/menu_bar.cpp/.hpp` — menu + toolbar builder (309 + 42 lines)

`MenuActions` struct + free functions `buildMenuBar(window)` and `buildToolBar(window, actions)`.

| Item | Tag | Notes |
|---|---|---|
| File > Save (with `SystemBridge::has_listeners("saveRequested")` integration) | 🎭+🔧 | demo bridge integration baked in; falls back to QFileDialog |
| File > Open Folder | 🎭 | demo (just shows a message box) |
| File > New Window/New Tab/Close Tab | 🔧 | wired in MainWindow |
| File > Quit | 🔧 | calls `Application::requestQuit()` |
| View > Zoom In/Out/Reset | 🔧 | wired in MainWindow `wireToActiveDock` |
| Windows > Developer Tools (F12) | 🎨 | wired in MainWindow |
| Windows > React Dialog (opens WebDialog) | 🎭 | demo |
| Windows > Demo Widget (opens DemoWidgetDialog) | 🎭 | literally named "demo" |
| Tools > Register/Unregister URL Protocol | 🔧 | toggle action with dynamic label |
| Help > About (opens AboutDialog) | 🎭 | demo content |
| **Toolbar theme combo** (1000+ themes searchable) | 🎨 | reaches into `app->styleManager()` directly |
| **Toolbar dark/light toggle** (🌙/☀️) | 🎨 | direct StyleManager coupling |
| `tintedIcon()` helper for dark/light icon recoloring | 🎨 | clever, but framework-coupled |

Two responsibilities tangled in one file (menu structure + toolbar theme controls). Both should be optional.

---

## `desktop/src/dialogs/` — three dialogs

| File | Tag | Notes |
|---|---|---|
| `about_dialog.cpp/.hpp` (62 + 19) | 🎭 | demo content; references "A template for Qt + React desktop apps" |
| `demo_widget_dialog.cpp/.hpp` (230 + 15) | 🎭 | literally a "Widget Gallery — Theme Preview" with QPushButton/QCheckBox/QSlider/etc., used for visual theme testing |
| `web_dialog.cpp/.hpp` (35 + 29) | 🎭 framework demo | a `WebShellWidget` inside a QDialog at hash route `#/dialog`; demonstrates pattern. Useful as a reference, but the *use* of it (menu wiring, bridge listener) is demo. |

The pattern shown by `web_dialog.cpp` is valuable; the dialog itself as shipped is demo.

---

## `desktop/src/logging.cpp/.hpp` (64 + 8)

Qt message handler installation. 🏗 framework.

---

## `desktop/xmake.lua` — build rules

| Item | Tag | Notes |
|---|---|---|
| Single `target("desktop")` binary | 🏗 | |
| `WEB_APPS = {"main"}` hardcoded | 🎭 | consumer must edit to add their app |
| Vite per-app build + qrc gen + rcc | 🏗 | |
| `STYLES_DEV_PATH` define for dev (not in CI) | 🎨 | |
| `APP_NAME/APP_SLUG/APP_ORG/APP_VERSION` defines flowed to C++ | 🏗 | |
| Windows `app.rc` generation (icon + version metadata) | 🏗 | |
| `qlementine-icons`, `libsass` packages | 🎨 | both could be opt-in |

`add_files("src/**.cpp", "src/**.hpp")` — entire desktop/src is in one target. No way to swap pieces in/out without xmake refactor.

---

## `desktop/resources/resources.qrc`

| File | Tag |
|---|---|
| `icon.ico`, `icon.png`, `down-arrow.svg` | 🏗 (resources customer rebrands) |

Tiny. Should split: framework icons (down-arrow for QSS) vs app icons (icon.ico/png).

---

## `tests/helpers/dev-server/src/test_server.cpp` (38 lines)

| Responsibility | Tag |
|---|---|
| Headless QCoreApplication | 🏗 |
| Bridge registration mirror of application.cpp (must-preserve #3) | 🏗 (with the same magic-name strings) |
| `expose_as_ws(&shell, port)` for WebSocket bridge transport | 🏗 |

The "register bridges in two places" footgun. Goes away if bridge composition becomes a typed registry.

---

# Cross-cutting smells (cribbed from Stage 4 subagent — file:lines kept)

The full subagent report is in conversation history. The smells, summarized:

| # | Smell | Worst sites |
|---|---|---|
| L1 | QSettings inline string-concat keys | `dock_manager.cpp:156-169, 292-316`; `main_window.cpp:49, 133-137, 142, 423` |
| L2 | `qobject_cast<Application*>(qApp)` downcast | 11 sites across 5 files |
| L3 | `kBackground` constant duplicated three times, two different hex values | `application.cpp:39`, `web_shell_widget.cpp:31`, `loading_overlay.cpp:17` |
| L4 | Hardcoded resource paths | `:/icon.ico`, `:/icon.png`, `:/styles/...`, `:/web-...` |
| L5 | "Fishing for bridges" via `static_cast<SystemBridge*>(shell->bridges().value("system"))` | 4 sites: `main.cpp:51-52`, `menu_bar.cpp:78`, `main_window.cpp:115-116`, `web_shell_widget.cpp:191-192` |
| L6 | Magic name strings: `"todos"`, `"system"`, `"main"`, `"app"`, `"default-dark"`, `"_shell"`, `"qtThemeRequested"`, `"openDialogRequested"`, `"saveRequested"`, `"/dialog"`, `"MainToolBar"` | scattered |
| L7 | Cross-class concrete-type leaks: `MainWindow::activeTab() → WebShellWidget*`; DockManager constructs WebShellWidget directly; LoadingOverlay knows F12/devtools; MainWindow listens for specific bridge signal + opens specific dialog | many |
| L8 | Two `aboutToQuit` lambdas (Application + MainWindow), framework half + window half | `application.cpp:163-165`, `main_window.cpp:129-138` |
| L9 | `QTimer::singleShot(0, ...)` patterns mixed framework + consumer | 9 sites |
| L10 | Hardcoded localhost:5173, fallback :5175 in `Application::appUrl` | `application.cpp:454-458` |

---

# Classification summary by bucket

🎭 **demo (rip out cleanly)**
- Tray submenus Alpha/Beta/Gamma + Nested Example 2 (`application.cpp:402-429`)
- AboutDialog content
- DemoWidgetDialog (entire class)
- WebDialog as a Windows-menu action target
- Menu actions: Windows > React Dialog, Windows > Demo Widget
- MainWindow listening for `openDialogRequested` and opening WebDialog
- File > Save's bridge integration (Save action that emits to React)
- File > Open Folder (just message-boxes the folder name)
- "main" web app + the hardcoded `WEB_APPS = {"main"}`
- `dock-debug.log` debug logging
- The fishing-for-SystemBridge in WebShellWidget for drag/drop

🎨 **polish (opt-in, ship hardened)**
- StyleManager + QSS theme system + libsass + watcher
- Toolbar theme combo + dark-light toggle
- Tinted icons (`tintedIcon` helper)
- Qlementine icon theme
- LoadingOverlay (Full mode especially)
- DevTools toggle (F12)
- Anti-flash trick
- Reactive document.title → dock title
- Page-load timing logging

🔧 **default-on (must become opt-in)**
- System tray (`setupSystemTray` + close-to-tray in `MainWindow::closeEvent`)
- URL protocol registration prompt
- Single-instance pipe
- Dock-tab system (DockTabManager + FloatingDockTitleBar + the placeholder central widget pattern + middle-click + context-menu)
- Multi-window orchestration (`restoreWindows`, `activationRequested`, `topLevelChanged` tracking)
- StatusBar with zoom indicator
- Full menu bar (File/View/Windows/Tools/Help)
- macOS `QEvent::FileOpen` handling
- DockManager itself (always-on registry)
- The full menu+toolbar from `buildMenuBar`/`buildToolBar`

🏗 **core (true framework)**
- `web_shell::bridge` base class + dispatch
- `WebShell` + bridge registration
- BridgeChannelAdapter (Qt transport)
- expose_as_ws (WS transport for headless)
- WebShellWidget's web view + qwebchannel injection + QWebChannel registration
- LoggingWebPage (JS console → qDebug)
- SchemeHandler + `app://` registration
- Drag/drop event filter on focusProxy (without it, drag/drop is silently broken)
- `signalReady()` contract via `WebShell::ready`
- `dockForTab()` quintptr-based resolver
- Logging setup
- xmake APP_NAME/APP_SLUG defines flow
- Windows app.rc generation

⚠️ **grey zone (worth a conversation)**
- Anti-flash polish: framework or polish?
- Reactive titles: framework or polish?
- DevTools toggle: framework or polish?
- LoadingOverlay attachment policy: WebShellWidget always attaches one — should this be opt-in?
- The `web-` QRC prefix in SchemeHandler — couples scheme handler to xmake convention
