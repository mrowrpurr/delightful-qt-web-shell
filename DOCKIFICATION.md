# Dockification 🚢

> Replacing `QTabWidget` with tabified `QDockWidget`s so tabs can be torn off and re-docked.

## Completed ✅

### Step 1 — Core Swap
- [x] Remove `QTabWidget* tabs_` from `MainWindow`
- [x] Add `QList<QDockWidget*> docks_` to track all dock widgets
- [x] Dummy central widget (hidden/minimal) — all content lives in docks
- [x] `createTab()` → creates a `QDockWidget` wrapping a `WebShellWidget`
- [x] Second+ docks use `tabifyDockWidget()` to stack as tabs
- [x] Tab bar position: top (`setTabPosition(Qt::TopDockWidgetArea, QTabWidget::North)`)
- [x] Ctrl+T creates a new dock
- [x] Ctrl+W closes the current dock (protect last dock)
- [x] Tear-off works (free from QDockWidget)

### Step 2 — Active Tab Tracking + Rewiring
- [x] Track active dock via `visibilityChanged` + `topLevelChanged`
- [x] Wire zoom actions (Ctrl+=/Ctrl+-/Ctrl+0) to active dock's view
- [x] Wire DevTools toggle (F12) to active dock
- [x] Status bar zoom level updates for active dock
- [x] Reactive tab/dock titles from `document.title` → `dock->setWindowTitle()`

### Step 3 — Polish
- [x] Middle-click close on tabified tab bar
- [x] Per-dock UUID persistence (URL, floating state, geometry, order)
- [x] Close-to-tray behavior with floating docks
- [x] `setDockNestingEnabled(true)` — IDE-style grid splits
- [x] `setAllowedAreas(Qt::AllDockWidgetAreas)` — dock top/bottom/left/right
- [x] Debounced geometry saves (Move + Resize → 500ms timer)
- [x] Clean quit — `requestQuit()` runs shutdown before `quit()`, all docks close

---

## Multi-MainWindow Support 🪟

### Step 0 — Fix what's broken now
- [ ] **Fix Ctrl+N cloning all docks** — new window should get one fresh default dock, not a copy of everything
- [ ] **Fix crash on close with 2+ windows** — closing one MainWindow leaves dangling dock pointers in DockManager → access violation (`0xC0000005`)

### Step 1 — MainWindow identity + per-window geometry
- [ ] Each MainWindow gets a UUID (`objectName`)
- [ ] Save each MainWindow's geometry independently: `[window/<mw-uuid>]/geometry`
- [ ] Save window order for restore sequence

### Step 2 — Associate docks with their window
- [ ] Each dock record gets a `window=<mw-uuid>` field in the INI
- [ ] DockManager tracks which dock belongs to which MainWindow
- [ ] INI structure becomes:
  ```ini
  [window/<mw-uuid>]
  geometry=@ByteArray(...)
  order=0

  [window/<mw-uuid>/dock/<dock-uuid>]
  url=app://main/#editor
  floating=true
  geometry=@ByteArray(...)
  order=0
  ```

### Step 3 — Restore N windows with their docks
- [ ] On startup, read all `window/` groups from settings
- [ ] Create one MainWindow per group
- [ ] Restore each window's docks into the correct MainWindow
- [ ] If no windows saved, create one MainWindow with one default dock (current behavior)

### Step 4 — Closing one window cleanly
- [ ] When a MainWindow closes (non-quit), close its docks via DockManager
- [ ] Remove dock state from settings
- [ ] Remove window state from settings
- [ ] No dangling pointers

---

## Grid Layout Persistence 🧩

The bonkers one. Persist the exact dock arrangement within each MainWindow — which docks are tabified together, which are split side-by-side, splitter ratios.

### Approach
- [ ] Keep dock UUIDs stable across restores (don't regenerate)
- [ ] Save `QMainWindow::saveState()` per window — captures the entire dock arrangement as one opaque `QByteArray`
- [ ] On restore: re-add all docks first (with matching `objectName`s), then call `restoreState()` to reconstruct the grid
- [ ] Handle edge cases: dock removed between sessions, new dock added

---

## Future Ideas 💡

- [ ] **Context menu on dock tab bar** — right-click a tab to get Close, Close Others, Close All to Right, etc. We already handle middle-click close and X button close, so the event filter infrastructure is there. Needs `QTabBar::tabAt(pos)` + custom `QMenu`.
- [ ] **Floating-to-floating docking** — vanilla QDockWidget can't do this. Would need each floating group to be its own QMainWindow, or use Qt Advanced Docking System (ADS). Not in scope for the template.

## Current Limitations

- **Floating docks always stay on top of the main window.** Qt enforces this via the parent-child relationship — floating docks are children of QMainWindow and the window manager keeps children above their parent. `setParent(nullptr)` crashes because the docking system holds references. `setWindowFlags()` changes don't help.
- **Floating-to-floating docking not supported.** Floating docks can only re-dock into a QMainWindow, not into each other. This is a Qt limitation — ADS or custom QMainWindow-per-float would be needed.

## Known Gotchas

- **`visibilityChanged` can be noisy** — fires for hide/show during rearrangement, not just user-initiated tab switches.
- **Child `QTabBar` is fragile** — Qt can recreate the tab bar when docks are rearranged. Event filter may need reinstalling.
- **Floating docks are top-level windows** — they get their own title bar from the OS. No menu bar unless we add one.
- **`QDockWidget::close()` hides, doesn't delete** — we need explicit `deleteLater()` in our close logic.
- **`NonClientAreaMouseButtonRelease` unreliable on Windows** — some drag operations don't fire it. Solved with debounced Move/Resize events.
