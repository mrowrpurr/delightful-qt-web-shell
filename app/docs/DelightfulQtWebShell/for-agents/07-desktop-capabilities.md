# Desktop Capabilities

The template includes two bridges: **TodoBridge** (the example — learn from it, then replace it) and **SystemBridge** (the built-in toolkit — keep it, use it). This doc tells you what's already here so you don't reinvent it.

Both bridges extend `web_shell::bridge` and use def_type DTOs for all method signatures. No QObject inheritance, no Q_INVOKABLE, no QVariant. One bridge class serves both desktop (QWebChannel) and WASM transports.

Full API: `web/shared/api/system-bridge.ts` (TypeScript interface) and `lib/bridges/qt/include/system_bridge.hpp` (C++ implementation). DTOs: `lib/bridges/qt/include/system_dtos.hpp`.

## SystemBridge

Registered as `"system"`. Access from React: `const system = await getBridge<SystemBridge>('system')`

All methods take a request object (a plain C++ struct) and return a response struct. The framework handles JSON serialization automatically via def_type + PFR.

### File Access

Three tiers, pick the right one:

- **`readTextFile({path})`** — returns `{text}`, the whole file as a UTF-8 string. Great for config, JSON, small text. Don't use on large files.
- **`writeTextFile({path, text})`** — writes a UTF-8 string to a file. Creates it if it doesn't exist.
- **`readFileBytes({path})`** — returns `{data}` as base64. For images and small binaries.
- **`openFileHandle({path})` / `readFileChunk({handle, offset, length})` / `closeFileHandle({handle})`** — streaming. Opens a handle on the C++ side, reads chunks on demand. The file never loads into memory all at once. Use this for anything large.

Plus: `openFileChooser({filter})` and `openFolderChooser()` for native OS pick dialogs. `listFolder({path})` and `globFolder({path, pattern, recursive})` for directory listing.

### Drag & Drop

Files dragged from the OS land in React via `system.filesDropped` signal → `system.getDroppedFiles()`. An event filter on `QWebEngineView`'s `focusProxy()` intercepts the events — without it, the web engine swallows them. Code: `web_shell_widget.cpp`.

### CLI Args & URL Protocol

The app is single-instance. When a second instance launches, it pipes all its args to the running instance. React receives them via `system.appLaunchArgsReceived` signal → `system.getAppLaunchArgs()`. Works for command-line args, file paths, and URL protocol activations (`your-app://...`).

The app registers itself as a URL protocol handler on first launch (Windows registry, Linux `.desktop` + `xdg-mime`, macOS `Info.plist`). Toggleable via **Tools > Register/Unregister URL Protocol**.

### Clipboard

`system.copyToClipboard({text})` and `system.readClipboard()` (returns `{text}`).

### Qt Theme Control

React can change the Qt-side QSS theme and dark/light mode via the bridge. All methods take request objects:

- **`setQtTheme({displayName, isDark})`** — React tells Qt to switch theme
- **`getQtTheme()`** — returns `{displayName, isDark}` for current Qt state
- **`getQtThemeFilePath()`** — returns `{path, embedded}` for the current theme file
- **`qtThemeChanged`** (signal) — emitted with `{displayName, isDark}` when Qt theme changes

See [08-theming.md](08-theming.md) for the full theming architecture.

### Save Signal

`system.saveRequested` is emitted when the user triggers Save from the Qt toolbar or File menu. React can intercept this for context-aware saving — e.g., the Editor tab catches it to save the current QSS theme file instead of opening a file dialog. When the Editor tab is not active, the signal is unsubscribed.

### Native Dialogs

`system.openDialog()` emits a signal — `MainWindow` connects to it and opens whatever dialog it wants. The bridge stays decoupled from UI classes. See `main_window.cpp` for the wiring.

## Desktop Shell Features

These are Qt-level features of the window and app. You get them for free.

### Tabs

`QTabWidget` wraps the main app. Ctrl+T new tab, Ctrl+W close, middle-click close. Tab bar hidden with 1 tab. Tab titles are reactive — set `document.title` in React. Zoom and DevTools follow the active tab. Code: `main_window.cpp`.

### Multiple Windows

Ctrl+N opens a new `MainWindow`. All windows share the same bridges — one source of truth, signals reach everywhere. Close-to-tray only on the last visible window; secondary windows close normally. Code: `main_window.cpp`, `menu_bar.cpp`.

### System Tray

Last window hides to tray instead of quitting. Quit via File > Quit, Ctrl+Q, or tray context menu. Code: `application.cpp` → `setupSystemTray()`.

### Menu Bar

File (Save, Open Folder, New Window, New Tab, Close Tab, Quit), View (Zoom), Windows (DevTools, React Dialog), Tools (URL Protocol), Help (About). The toolbar reuses the same `QAction` objects — one action, two places, synced automatically. Code: `menu_bar.cpp`.

## Theming, Fonts & Monaco Editor

The app ships a full theming and editor customization system. All settings are persisted to localStorage with separate controls for the app UI vs the code editor.

### Themes

1000+ shadcn themes live in `themes.json`, applied to both React (CSS variables) and Qt (QSS stylesheets). Both sides stay in sync via the bridge. See [08-theming.md](08-theming.md) for the full architecture — StyleManager, QSS generator, live reload, dark/light switching, and the live theme editor.

Custom theme effects go beyond CSS variables: wallpaper backgrounds (Dragon), animated SVG overlays (Tron), canvas-drawn grids (Tron Moving), and glow CSS (Synthwave). These are managed in `apps/main/src/theme-effects.ts`.

### Fonts

1900+ Google Fonts are catalogued in `google-fonts.json`. `injectGoogleFont(family)` loads a font from Google CDN. `applyFont(family, 'app'|'editor')` applies it to either the app UI or the code editor independently.

### Monaco Editor

Monaco editor with vim mode (`monaco-vim`). A shared instance is configured in `main.tsx`. Theme syncing uses `buildMonacoThemeFromVars()` to derive a Monaco theme from the current CSS variables. App and editor each have independent theme, font, and transparency settings.

### Key Files

- `shared/lib/themes.ts` — theme loading and application
- `shared/lib/fonts.ts` — font injection and application
- `shared/lib/monaco-theme.ts` — Monaco theme derivation from CSS vars
- `shared/lib/tron-grid.ts` — animated canvas grid effect
- `apps/main/src/theme-effects.ts` — custom wallpaper/animation effects
