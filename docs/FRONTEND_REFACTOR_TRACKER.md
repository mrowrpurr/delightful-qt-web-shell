# Frontend Refactor — Progress Tracker 🏴‍☠️

Companion to `FRONTEND_REFACTOR.md` (the **what** + **why**) and `FRONTEND_REFACTOR_PHASES.md` (the **how**, broken into atomic phases). This file is the live checklist.

Tick a phase's verification box only after running it green. Tick the phase's outer box only when **every** sub-box under it is green.

---

## Phase 0 — Baseline

- [ ] **Phase 0 complete**
  - [ ] `xmake run test-all` captured (pass/fail per suite)
  - [ ] Desktop launched, playwright-cdp snapshots captured for every demo tab
  - [ ] WASM build state recorded (`xmake f -p wasm && xmake build wasm-app`)
  - [ ] Pre-existing failures noted somewhere referenceable

---

## C++ reshape — Phases 1–3

### Phase 1 — Hoist pure domain to `<repo>/lib/todos/`

- [x] **Phase 1 complete**
  - [x] `app/lib/todos/include/todo_store.hpp` → `<repo>/lib/todos/include/todo_store.hpp`
  - [x] `app/lib/todos/include/todo_dtos.hpp` → `<repo>/lib/todos/include/todo_dtos.hpp`
  - [x] `app/lib/todos/tests/unit/todo_store_test.cpp` → `<repo>/lib/todos/tests/unit/todo_store_test.cpp`
  - [x] New `<repo>/lib/todos/xmake.lua` — pure C++ target, no Qt deps
  - [x] `TodoBridge` includes updated (bridge stays in `app/lib/todos/` for now — target renamed to `todos-bridge`)
  - [x] Root `xmake.lua` gains `set_languages("c++23")` + `includes("lib/todos/xmake.lua")`
  - [x] `xmake build desktop` green
  - [x] `xmake build wasm-app` green
  - [x] `xmake run test-todo-store` green (17 cases / 46 assertions)
  - [ ] App launches, demo tabs render, todos work end-to-end *(skipped — Phase 1 only renamed include paths and split target deps; desktop + WASM builds + unit tests cover the surface area)*

### Phase 2 — Extract framework to `<repo>/app/framework/`

- [ ] **Phase 2 complete**
  - [ ] `web_shell::bridge` base → `app/framework/...`
  - [ ] WebShell loader (`web_shell.hpp`/`.cpp`) → `app/framework/...`
  - [ ] Qt transport adapters (`bridge_channel_adapter.hpp`, `expose_as_ws.hpp`, `json_adapter.hpp`) → `app/framework/...`
  - [ ] WASM transport (`wasm_bridge_wrapper.hpp`, `wasm_bindings.cpp`) → `app/framework/...`
  - [ ] Internal subfolder layout decided (open question from original doc)
  - [ ] `xmake build desktop` green
  - [ ] `xmake build wasm-app` green
  - [ ] App launches, every bridge method round-trips
  - [ ] WASM app launches, every bridge method round-trips

### Phase 3 — Move bridges, delete `app/lib/`

- [ ] **Phase 3 complete**
  - [ ] `TodoBridge` → `app/bridges/todos/include/todo_bridge.hpp`
  - [ ] `SystemBridge` (+ DTOs + MOC anchor `bridges.cpp`) → `app/bridges/system/...`
  - [ ] `app/lib/` directory removed
  - [ ] `application.cpp` registration includes updated
  - [ ] `test_server.cpp` registration includes updated (verify both!)
  - [ ] `xmake build desktop` green
  - [ ] `xmake build wasm-app` green
  - [ ] `xmake run test-all` green (full-suite — ask Purr first)
  - [ ] WASM app: bridge calls work

---

## Web reshape — Phases 4–8

### Phase 4 — Bun workspaces + shadcn primitives package

- [ ] **Phase 4 complete**
  - [ ] `web/package.json` configured with bun workspaces
  - [ ] `web/packages/<shadcn-pkg-name>/` created with shadcn primitives (`shared/components/ui/*`), `cn` helper, `useSidebarSlot`, `tailwind.css`
  - [ ] Package name decided
  - [ ] `main` app imports from the new package via workspace name
  - [ ] `bun install` from `web/` resolves cleanly
  - [ ] `main` app builds and runs
  - [ ] Components render correctly (snapshot diff vs Phase 0)
  - [ ] Storybook still launches (`xmake run storybook`)

### Phase 5 — Preferences package

- [ ] **Phase 5 complete**
  - [ ] `shared/lib/themes.ts`, `themes.json`, `shared/lib/fonts.ts`, `google-fonts.json` moved
  - [ ] `shared/lib/tron-grid.ts`, theme-effects code (Tron, Dragon, Synthwave glow, wallpapers) moved
  - [ ] `<ThemePicker>`, `<FontPicker>`, `<TransparencySlider>`, `<DarkModeToggle>`, `<AppearancePanel>` moved
  - [ ] Package name decided
  - [ ] localStorage keys unchanged (`theme-name`, `theme-mode`, `editor-theme-name`, `editor-use-app-theme`, `page-transparency`, `surface-transparency`, font keys)
  - [ ] `main` app builds and runs
  - [ ] Theme switching works (incl. Tron and Dragon)
  - [ ] Font switching works (app + editor independently)
  - [ ] Transparency sliders work
  - [ ] Snapshot diff matches Phase 0

### Phase 6 — Monaco package

- [ ] **Phase 6 complete**
  - [ ] `@monaco-editor/react`, `monaco-editor`, `monaco-vim` deps moved to package
  - [ ] `shared/lib/monaco-theme.ts` and Monaco setup code moved
  - [ ] Monaco worker setup runs before any editor mount (initialization order preserved)
  - [ ] Package name decided
  - [ ] Editor tab in `main` loads without console errors
  - [ ] Vim mode works
  - [ ] Editor theme syncs with app theme
  - [ ] Editor font is independently configurable

### Phase 7 — Place bridge transport TS

- [ ] **Phase 7 complete**
  - [ ] Decision recorded: where `bridge.ts`, `bridge-transport.ts`, `wasm-transport.ts`, `system-bridge.ts`, `todo-bridge.ts` live
  - [ ] Transport files moved to chosen location
  - [ ] `main` app builds and runs
  - [ ] Every bridge method round-trips
  - [ ] WASM transport still works (`xmake run dev-wasm` + WASM app launches)
  - [ ] Snapshot diff matches Phase 0

### Phase 8 — Split apps, wire react-router, delete `web/shared/`

- [ ] **Phase 8 complete**
  - [ ] `web/apps/main/` → `web/apps/demo/`
  - [ ] `web/apps/settings/` created — thin app composing preferences package
  - [ ] `web/apps/app/` created — empty slate (react + react-router + bridge transport only)
  - [ ] HashRouter wired in all three apps
  - [ ] `desktop/src/widgets/scheme_handler.cpp` updated for `app://demo/`, `app://settings/`, `app://app/` host routing
  - [ ] `WEB_APPS` in `desktop/xmake.lua` registers all three apps
  - [ ] Default URL the desktop loads on launch decided
  - [ ] WASM artifact destination decided
  - [ ] Which app `dev-wasm` starts decided
  - [ ] ChatTab fate decided
  - [ ] Vite dev ports per app decided
  - [ ] Storybook globals (`web/shared/styles/globals.css`) landing place decided
  - [ ] `App.css` split (Tailwind base → shadcn pkg, transparency vars → preferences pkg, markdown → demo only, glow + wallpaper → preferences pkg)
  - [ ] `web/shared/` no longer exists
  - [ ] `signalReady()` verified in **every** app's mount path
  - [ ] `getBridge<T>(...)` at module scope verified per app
  - [ ] `assetsInlineLimit: 0` verified in every new `vite.config.ts`
  - [ ] `qtSyncGuard` preserved
  - [ ] All three apps build (`bun run build:demo`, `build:settings`, `build:app`)
  - [ ] Desktop launches at chosen default URL
  - [ ] User can navigate between demo, settings, and app
  - [ ] Snapshot per app captured (new baseline)
  - [ ] Bridge calls work in each app
  - [ ] WASM dev flow still produces a runnable WASM app
  - [ ] Storybook still launches and renders components
  - [ ] `xmake run test-all` green (ask Purr first)

---

## Phase 9 — Test trim

- [ ] **Phase 9 complete**
  - [ ] Catch2 test chosen + others removed (recommendation: `todo_store_test`)
  - [ ] Bun test chosen + others removed (recommendation: `type_conversion_test` against new layout)
  - [ ] Playwright browser test chosen (one demo-todos flow)
  - [ ] Playwright desktop test chosen (recommendation: keep one)
  - [ ] pywinauto test chosen (recommendation: `test_full_dialog_flow`)
  - [ ] Helpers intact (`native_dialogs.py`, `win32_helpers.py`, conftest fixtures)
  - [ ] Each surviving test runs green standalone
  - [ ] Full suite faster than Phase 0 baseline
  - [ ] Each surviving test's name + content makes the demonstrated pattern obvious

---

## Phase 10 — `scaffold-bridge` update

- [ ] **Phase 10 complete**
  - [ ] Tool templates updated to match new `app/bridges/<name>/` layout
  - [ ] Wiring updates point at new `application.cpp` and `test_server.cpp` registration sites
  - [ ] TS interface emission points at Phase 7's chosen location
  - [ ] Decision: pure-domain placeholder behavior (recommendation: comment + nothing else; don't write into `<repo>/lib/`)
  - [ ] `xmake run scaffold-bridge testbridge` produces a bridge that compiles
  - [ ] Generated bridge registers in both `application.cpp` and `test_server.cpp`
  - [ ] Generated bridge callable from running app
  - [ ] Tool does not write into `<repo>/lib/`
  - [ ] Test bridge removed after verification
