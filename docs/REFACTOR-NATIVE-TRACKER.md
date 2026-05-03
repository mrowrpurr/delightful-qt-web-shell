# Native Refactor — Progress Tracker 🏴‍☠️

Companion to `REFACTOR-NATIVE.md` (the **what** + **why**) and `REFACTOR-NATIVE-PHASES.md` (the **how**, 23 atomic commits across 7 phases). This file is the live checklist.

Tick a sub-box when its commit lands green (`xmake build desktop` + `xmake build wasm-app`) and the demo runs. Tick the phase's outer box only when **every** sub-box under it is green.

---

## Phase 1 — Foundation

- [x] **Phase 1 complete**
  - [x] **1. Introduce `app_shell::App` as a real class** — `Application` becomes a thin transitional subclass; commit `173a9ec`
  - [x] **2. Kill `qobject_cast<Application*>(qApp)`** — 11 fishing sites across 5 files migrated to typed `app_shell::App&` references; commit `bc2a18e`
  - [x] **3. `app.iconPath()` accessor** — adds `iconPath()` and `brandingImagePath()`; all hardcoded `:/icon.ico` and `:/icon.png` literals collapsed into the two App accessors; commit `6157c07`

---

## Phase 2 — Services opt-in

- [ ] **Phase 2 complete**
  - [ ] **4. `Tray` → `app.useTray()`** — class extracted to `app_shell::Tray`; demo's tray content (Alpha/Beta/Gamma submenus, demo dialog hooks) moves into demo's `main.cpp`
  - [ ] **5. `UrlProtocol` → `app.useUrlProtocol()`**
  - [ ] **6. `SingleInstance` → `app.useSingleInstance()`**
  - [ ] **7. `WindowRegistry` → `app.windows()`** — dormant until referenced

---

## Phase 3 — Theming

- [ ] **Phase 3 complete**
  - [ ] **8. Carve `ThemeBridge` from `SystemBridge`** — theme methods/signals move to `app/bridges/theme/`; JS-side updates to `getBridge<ThemeBridge>('theme')`; `SystemBridge` becomes pure stateless OS I/O
  - [ ] **9. `app.useTheming(baseline)` makes the theme stack opt-in** — skip the call → no StyleManager, no libsass, no watcher, no `ThemeBridge` registered

---

## Phase 4 — Typed bridge access

- [ ] **Phase 4 complete**
  - [ ] **10. Add `app.addBridge<T>(name)` and `app.bridge<T>()`** — both APIs available; old fishing pattern still compiles
  - [ ] **11. Migrate every fishing-cast site to typed `app.bridge<T>()`** — no `static_cast<*Bridge*>(shell()->bridges().value(...))` anywhere
  - [ ] **12. Extract `register_my_bridges(app)`** — single registration function called from `application.cpp` and `test_server.cpp` both

---

## Phase 5 — `MainWindow` untangle

- [ ] **Phase 5 complete**
  - [ ] **13. `MainWindowBase` toolbox + `MainWindow` preset** — base exposes `useWebShellAsCentral`, `useStatusBar`, `useDockTabs`, `useMenuBar`, `useDevTools`, `useReactiveTitleFromContent`, `usePersistedGeometry`
  - [ ] **14. Extract `WebContentController`** — zoom, devtools, reactive titles ride on it instead of `MainWindow` knowing `WebShellWidget` directly
  - [ ] **15. `DockManager` accepts any `QWidget`** — no longer constructs `WebShellWidget` itself
  - [ ] **16. Docks carry their host as a property** — `DockManager` ↔ `MainWindow` `topLevelWidgets()` iteration dies
  - [ ] **17. `undockTab` uses `tabData()` quintptr** — `windowTitle()` string-match dies
  - [ ] **18. `LoadingOverlay` reads its devtools shortcut from the menu** (or generalizes the message); the hardcoded "F12" literal dies

---

## Phase 6 — Apps split + xmake consolidation

- [ ] **Phase 6 complete**
  - [ ] **19. Consolidate framework into one `app-shell` static-lib xmake target** — transport-qt vs transport-wasm becomes platform-conditional `add_files` inside it; bridges keep their own targets (`set_kind("object")` for WASM is non-negotiable)
  - [ ] **20. Create `app/apps/demo/`** — move the desktop binary's xmake target there; demo content lives entirely under `app/apps/demo/`
  - [ ] **21. Create `app/apps/main/` slate** — ~5–10 line `main.cpp`, registers nothing by default, opens a single `MainWindow`; both binaries build by default

---

## Phase 7 — Sweep

- [ ] **Phase 7 complete**
  - [ ] **22. Unify `kBackground`** — three duplicates with **inconsistent hex values** (`0x24,0x24,0x24` vs `0x09,0x09,0x0b`) collapse to one source of truth matching `--bg` in `App.css`
  - [ ] **23. Update agent + human docs** — `app/docs/DelightfulQtWebShell/for-{agents,humans}/` reference the new API; no stale `Application::` or fishing-cast snippets remain
