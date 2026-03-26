# Desktop Capabilities

The template includes two bridges: **TodoBridge** (the example you learn from and replace) and **SystemBridge** (the built-in toolkit you keep and use). This doc covers SystemBridge and the desktop shell features that are already wired up.

You don't need to build any of this — it's here. If you need file access, clipboard, drag & drop, or any of these capabilities, reach for SystemBridge first.

## SystemBridge API

Registered as `"system"`. Access it from React:

```typescript
import type { SystemBridge } from '@shared/api/system-bridge'
const system = await getBridge<SystemBridge>('system')
```

### File Choosers

Native OS dialogs for picking files and folders.

| Method | Returns | Notes |
|--------|---------|-------|
| `openFileChooser(filter?)` | `{ path }` or `{ cancelled: true }` | Qt filter string: `"Images (*.png *.jpg);;All Files (*)"` |
| `openFolderChooser()` | `{ path }` or `{ cancelled: true }` | |

### Directory Listing

| Method | Returns | Notes |
|--------|---------|-------|
| `listFolder(path)` | `{ entries: [{ name, isDir, size }] }` | Non-recursive |
| `globFolder(path, pattern, recursive?)` | `{ paths: [...] }` | Wildcard match, optional recursion |

### File Reading — Three Tiers

**Tier 1: Simple text** — for config files, JSON, small text. Don't use on large files.
```typescript
const { text } = await system.readTextFile('/path/to/config.json')
```

**Tier 2: Simple binary** — for images and small assets. Returns base64.
```typescript
const { data } = await system.readFileBytes('/path/to/icon.png')
const img = `data:image/png;base64,${data}`
```

**Tier 3: Streaming handles** — for large files. Opens a handle on the C++ side, reads chunks on demand. The file never loads into memory all at once.
```typescript
const { handle, size } = await system.openFileHandle('/path/to/huge.log')
const { data, bytesRead } = await system.readFileChunk(handle, 0, 4096)  // base64
await system.closeFileHandle(handle)
```

All three return `{ error: "..." }` on failure.

### Clipboard

| Method | Returns |
|--------|---------|
| `copyToClipboard(text)` | `{ ok: true }` |
| `readClipboard()` | `{ text: "..." }` |

### Drag & Drop

Files dragged from the OS onto the app are intercepted by an event filter on `QWebEngineView`'s `focusProxy()` and forwarded to SystemBridge.

```typescript
// Subscribe to drops
useEffect(() => {
  return system.filesDropped(async () => {
    const files = await system.getDroppedFiles()
    // files is string[] of absolute paths
  })
}, [])
```

**Why the event filter?** `QWebEngineView` has an internal child widget (`focusProxy()`) that swallows all drag events. Without the filter, drop events never reach the parent widget. See `web_shell_widget.cpp`.

### CLI Args & URL Protocol

When the app is launched with arguments — from the command line, from another instance, or via a registered URL protocol — React receives them:

```typescript
useEffect(() => {
  // Check for args already received (primary instance's own launch args)
  system.getReceivedArgs().then(args => { if (args.length) handleArgs(args) })

  // Subscribe to args from subsequent launches
  return system.argsReceived(async () => {
    const args = await system.getReceivedArgs()
    handleArgs(args)
  })
}, [])
```

The single-instance pipe forwards all args — flags, file paths, URLs, everything. `QCommandLineParser` uses `parse()` instead of `process()` so unknown flags pass through.

### URL Protocol Registration

The app registers itself as a handler for its custom URL scheme (derived from `APP_SLUG`). After registration, clicking `your-app-slug://anything` in a browser launches the app with the URL as an arg.

- **Windows:** `HKCU\Software\Classes\<protocol>` — user-level, no admin
- **Linux:** `.desktop` file + `xdg-mime` — user-level, no root
- **macOS:** `Info.plist` `CFBundleURLTypes` (build-time) + `QEvent::FileOpen` handler

On first launch, a dialog prompts the user to register (with "Don't ask again"). The **Tools** menu has a Register/Unregister toggle.

### Native Dialogs

```typescript
system.openDialog()  // emits openDialogRequested signal
```

This doesn't open a specific dialog — it emits a signal. `MainWindow` connects to it and opens whatever dialog it wants. The bridge stays decoupled from UI classes.

## Desktop Shell Features

These are Qt-level features of the window and app. You get them for free. If you want to customize them, here's where the code lives.

### Tabs

`MainWindow` wraps the main app panel in a `QTabWidget`. Each tab is its own `WebShellWidget` with its own `QWebEngineView` and `QWebChannel`, but sharing the same bridge objects.

- **Ctrl+T** — new tab
- **Ctrl+W** — close tab (won't close the last one)
- **Middle-click** — close tab
- Tab bar hidden with 1 tab, visible with 2+
- Tab titles update reactively from `document.title` — set it in React and the tab text changes
- Zoom level and DevTools follow the active tab

Code: `desktop/src/windows/main_window.cpp`

### Multiple Windows

**Ctrl+N** opens a new `MainWindow`. All windows share the same bridges — edit data in one window, the `dataChanged` signal fires and every window sees it.

Close-to-tray only applies to the last visible window. Secondary windows close normally.

Code: `desktop/src/windows/main_window.cpp`, `desktop/src/menus/menu_bar.cpp`

### System Tray

The app minimizes to the system tray instead of quitting when you close the last window. Quit via **File > Quit**, **Ctrl+Q**, or the tray icon's context menu.

Code: `desktop/src/application.cpp` → `setupSystemTray()`

### Menu Bar

| Menu | Items |
|------|-------|
| **File** | Save, Open Folder, New Window (Ctrl+N), New Tab (Ctrl+T), Close Tab (Ctrl+W), Quit (Ctrl+Q) |
| **View** | Zoom In/Out/Reset |
| **Windows** | Developer Tools (F12), React Dialog |
| **Tools** | Register/Unregister URL Protocol |
| **Help** | About |

The toolbar reuses the same `QAction` objects as the menu — one action, two places, everything stays in sync.

Code: `desktop/src/menus/menu_bar.cpp`
