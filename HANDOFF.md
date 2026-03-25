# Session Handoff (2026-03-25)

## What Exists Now

### Multi-Web-App Architecture
- `web/apps/main/` — todo app (React), port 5173
- `web/apps/docs/` — docs/welcome app (React), port 5174
- `web/shared/api/` — bridge transport + TS interfaces shared by all apps
- Single `web/package.json` — per-app scripts (`build:main`, `dev:main`, etc.)
- `@shared` Vite alias resolves to `../../shared` in each app
- SchemeHandler routes by host: `app://main/` → `:/web-main/`, `app://docs/` → `:/web-docs/`
- `Application::appUrl(name)` returns dev or prod URL

### Tabs
- QTabWidget wraps the main app panel in MainWindow
- Tab bar hidden with 1 tab, visible with 2+
- Ctrl+T new tab, Ctrl+W close, middle-click close, X button close
- Tab titles reactive via `QWebEnginePage::titleChanged` (set `document.title` in React)
- Zoom and devtools follow the active tab
- Tabs are closable, movable, reorderable

### Multiple Windows
- Ctrl+N opens a new MainWindow (heap-allocated)
- All windows share the same bridges — one source of truth
- Close-to-tray only on last visible window, secondary windows close normally
- First window is stack-allocated in main() — never `deleteLater()` it
- `activationRequested` signal finds any visible MainWindow to raise

### File I/O Bridge (SystemBridge)
Three tiers of file reading:
- **readTextFile(path)** — whole file as UTF-8 string (small files)
- **readFileBytes(path)** — whole file as base64 (images, small binaries)
- **openFileHandle / readFileChunk / closeFileHandle** — streaming for large files

Plus:
- **openFileChooser(filter?)** / **openFolderChooser()** — native OS dialogs
- **listFolder(path)** — entries with name, isDir, size
- **globFolder(path, pattern, recursive?)** — wildcard search

React UI demos every method with method labels showing which API is used.
Images render inline via readFileBytes. Large files stream 4KB via handles.

### Drag & Drop
- Event filter on `QWebEngineView::focusProxy()` intercepts drag/drop events
- Without this, the web engine swallows all drag events before they reach the widget
- Files dropped from Explorer → `SystemBridge::handleFilesDropped()` → React via `filesDropped` signal

### CLI Arg Passing + Single-Instance
- `parser.parse()` instead of `process()` — unknown flags pass through (no error dialog)
- Single-instance pipe sends all args (not just "activate")
- Protocol: `"activate\n"` or `"arg:<value>\n"` per line
- React subscribes to `system.argsReceived` and calls `system.getReceivedArgs()`
- Works for first launch args AND subsequent instance args

### URL Protocol Registration
- Cross-platform: Windows registry, Linux .desktop + xdg-mime, macOS Info.plist
- Prompt on first launch if not registered (Yes/No/Don't ask again via QSettings)
- **Tools > Register/Unregister URL Protocol** — toggles state, label updates
- Protocol name from `APP_SLUG` (lowercased): `delightful-qt-web-shell://`
- macOS uses `QEvent::FileOpen` handler in `Application::event()`

### Hash Routing for Dialogs
- `main.tsx` checks `window.location.hash` — `#/dialog` → DialogView, else → App
- DialogView: "Quick Add Todo" with list selector + input
- `WebDialog.cpp` appends `#/dialog` via `QUrl::setFragment("/dialog")`
- **QTimer::singleShot(0, ...)** required when bridge calls open modal dialogs

### Qlementine Icons
- `tintedIcon()` in menu_bar.cpp recolors black SVGs to white via CompositionMode_SourceIn
- Icons: Action_Save, File_FolderOpen, Action_ZoomIn/Out/ZoomOriginal, Navigation_Settings
- Read `Icons16.hpp` from xmake cache for enum names — don't guess

### Close-to-Tray
- Last visible MainWindow hides to tray instead of quitting
- Secondary windows close normally
- Quit via File > Quit, Ctrl+Q, or tray icon > Quit

### Menu Bar
- File: Save, Open Folder, New Window (Ctrl+N), New Tab (Ctrl+T), Close Tab (Ctrl+W), Quit
- View: Zoom In/Out/Reset
- Windows: Developer Tools (F12), React Dialog
- Tools: Register/Unregister URL Protocol
- Help: About
- Toolbar reuses same QAction objects — shared shortcuts, state, signals

## Git State
- Branch: `qt-delightfulness`
- All committed and pushed
- Working tree clean

## What's NOT Done
- Dark/light theme toggle (View > Theme, QActionGroup, QSS)
- WASM bridge doesn't have file I/O or openDialog (desktop-only features)
