# Desktop Capabilities

Everything the template gives you out of the box — no setup needed, just use it.

## SystemBridge

The built-in bridge for desktop features. Access from React:

```typescript
const system = await getBridge<SystemBridge>('system')
```

### File Access

Three tiers depending on file size:

| Method | Use for | Returns |
|--------|---------|---------|
| `readTextFile(path)` | Config, JSON, small text | UTF-8 string |
| `writeTextFile(path, text)` | Saving files from React | `{ok: true}` |
| `readFileBytes(path)` | Images, small binaries | Base64 string |
| `openFileHandle` / `readFileChunk` / `closeFileHandle` | Large files | Streaming chunks |

Plus native OS dialogs: `openFileChooser(filter?)` and `openFolderChooser()`. Directory listing with `listFolder(path)` and `globFolder(path, pattern, recursive?)`.

### Drag & Drop

Drop files from the OS onto the app window. React receives them via the `filesDropped` signal:

```typescript
system.filesDropped(() => {
  system.getDroppedFiles().then(paths => console.log(paths))
})
```

An event filter on `QWebEngineView`'s `focusProxy()` intercepts the drag events — without it, the web engine swallows them.

### Clipboard

```typescript
await system.copyToClipboard('Hello')
const { text } = await system.readClipboard()
```

### CLI Args & URL Protocol

The app is single-instance. A second launch pipes its args to the running instance. React receives them via `appLaunchArgsReceived` signal → `getAppLaunchArgs()`.

The app registers as a URL protocol handler (`your-app://...`) on first launch. Toggleable in **Tools > Register/Unregister URL Protocol**.

### Qt Theme Control

React can control the Qt-side QSS theme:

```typescript
await system.setQtTheme('Dracula', true)   // set theme + dark mode
const state = await system.getQtTheme()     // { displayName, isDark }
system.qtThemeChanged(() => { ... })        // listen for toolbar changes
```

See [Theming](08-theming.md) for the full architecture.

### Context-Aware Save

The `saveRequested` signal fires when the user clicks Save in the Qt toolbar or File menu. React can intercept it for custom behavior — for example, the Editor tab uses it to save the current QSS theme file instead of opening a file dialog.

## Shell Features

### Tabs

`QTabWidget` with Ctrl+T (new), Ctrl+W (close), middle-click close. Tab titles update automatically when React sets `document.title`. Only one tab visible? Tab bar hides.

### Multiple Windows

Ctrl+N opens a new window. All windows share the same bridges — change data in one window, it updates everywhere via signals.

### System Tray

The last window hides to tray instead of quitting. Quit via File > Quit, Ctrl+Q, or right-click the tray icon.

### Menu Bar

| Menu | Items |
|------|-------|
| File | Save, Open Folder, New Window, New Tab, Close Tab, Quit |
| View | Zoom In/Out/Reset |
| Windows | DevTools, React Dialog, Demo Widget |
| Tools | URL Protocol toggle |
| Help | About |

The toolbar reuses the same `QAction` objects as the menus — one action, two places, always in sync.

## Theming & Fonts

### 1000+ Themes

Both the React UI and Qt chrome are themed simultaneously. Pick a theme in either place — they stay in sync. See [Theming](08-theming.md).

### Google Fonts

1900+ fonts with a searchable picker. Separate settings for the app UI and the code editor.

### Monaco Editor

Full code editor with vim mode. Theme derived from the current app theme. Independent transparency and font settings.

### Live Theme Editor

The Editor tab can load the current QSS theme file. Edit it, hit Ctrl+S, and watch the Qt chrome update in real time. The `QFileSystemWatcher` picks up the save instantly.
