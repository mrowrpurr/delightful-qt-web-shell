# Dockification 🚢

> Replacing `QTabWidget` with tabified `QDockWidget`s so tabs can be torn off and re-docked.

## Why

QTabWidget tabs are stuck in the window. QDockWidgets can be torn off into floating windows and dragged back — same UX as IDE panels. Each dock wraps a `WebShellWidget` showing the full app, just like today's tabs.

## The Plan

### Step 1 — Core Swap

The structural change. Replace `QTabWidget` with `QDockWidget` management. Verify docks show up, tabs render, tear-off works, close works.

- [ ] Remove `QTabWidget* tabs_` from `MainWindow`
- [ ] Add `QList<QDockWidget*> docks_` to track all dock widgets
- [ ] Dummy central widget (hidden/minimal) — all content lives in docks
- [ ] `createTab()` → creates a `QDockWidget` wrapping a `WebShellWidget`
- [ ] Second+ docks use `tabifyDockWidget()` to stack as tabs
- [ ] Tab bar position: top (`setTabPosition(Qt::TopDockWidgetArea, QTabWidget::North)`)
- [ ] `setDockNestingEnabled(false)` — may try `true` later
- [ ] Ctrl+T creates a new dock
- [ ] Ctrl+W closes the current dock (protect last dock)
- [ ] Tear-off works (free from QDockWidget)
- [ ] Build and verify

**Not in step 1:** zoom rewiring, devtools, middle-click, title tracking, state persistence.

### Step 2 — Active Tab Tracking + Rewiring

The fiddly part. Figure out which dock is "raised" and wire actions to it.

- [ ] Track active dock via `visibilityChanged` (or alternative signal strategy)
- [ ] Wire zoom actions (Ctrl+=/Ctrl+-/Ctrl+0) to active dock's view
- [ ] Wire DevTools toggle (F12) to active dock
- [ ] Status bar zoom level updates for active dock
- [ ] Reactive tab/dock titles from `document.title` → `dock->setWindowTitle()`

### Step 3 — Polish

- [ ] Middle-click close on tabified tab bar (`findChild<QTabBar*>()` + event filter)
- [ ] `saveState()` / `restoreState()` for full layout persistence
- [ ] Audit close-to-tray behavior with floating docks
- [ ] UX pass — anything that feels off after real usage

## Current Limitations

- **Floating docks always stay on top of the main window.** Qt enforces this via the parent-child relationship — floating docks are children of QMainWindow and the window manager keeps children above their parent. `setParent(nullptr)` crashes because the docking system holds references. `setWindowFlags()` changes don't help. Purr has prior dock code that may solve this — revisit later.

## Known Gotchas (from experience + research)

- **`visibilityChanged` can be noisy** — fires for hide/show during rearrangement, not just user-initiated tab switches. May need debouncing or a different approach.
- **Child `QTabBar` is fragile** — Qt can recreate the tab bar when docks are rearranged. Event filter may need reinstalling. `findChild<QTabBar*>()` scoped to the main window should be safe (won't find tab bars inside WebShellWidgets).
- **Floating docks are top-level windows** — they get their own title bar from the OS. No menu bar unless we add one.
- **`QDockWidget::close()` hides, doesn't delete** — we need explicit `deleteLater()` in our close logic.
- **Dock nesting is off by default** — `setDockNestingEnabled(false)`. Flip to `true` to allow IDE-style grid splits. Keeping off for now to reduce complexity.
