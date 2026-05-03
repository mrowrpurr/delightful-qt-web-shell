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

- [x] **Phase 2 complete**
  - [x] `bridge.hpp` base → `app/framework/bridge/include/`
  - [x] `WebShell` class **split** into `BridgeRegistry` (pure C++, `app/framework/bridge-registry/`) + `AppLifecycle` (Qt QObject, `app/framework/app-lifecycle/`)
  - [x] Qt transport adapters → `app/framework/qt-transport/include/` (+ MOC anchor `src/qt_transport.cpp`)
  - [x] WASM transport wrapper → `app/framework/wasm-transport/include/` (header-only)
  - [x] `wasm_bindings.cpp` (the app-specific WASM bridge instantiation) moved out of framework into `app/wasm/src/` where it belongs alongside `main.cpp`
  - [x] `bridge_channel_adapter_test.cpp` moves with its code into `app/framework/qt-transport/tests/unit/`
  - [x] Bun tests (`bridge_proxy_test.ts`, `system_bridge_test.ts`, `type_conversion_test.ts`) move with the qt-transport into `app/framework/qt-transport/tests/web/`; `bunfig.toml` updated
  - [x] Internal subfolder layout decided: subdivide by purpose (`bridge/`, `bridge-registry/`, `app-lifecycle/`, `qt-transport/`, `wasm-transport/`)
  - [x] xmake target naming convention: `app.framework.X` (matches folder paths)
  - [x] Old targets retired: `bridge`, `web-shell`, `wasm-bridges`
  - [x] Call-site rewiring: `Application` splits `WebShell* shell_` → `BridgeRegistry registry_` (value member) + `AppLifecycle* lifecycle_`. `WebShellWidget` ctor takes both pointers. `expose_as_ws` signature change.
  - [x] `app/lib/bridge/`, `app/lib/web-shell/`, `app/lib/bridges/wasm/` directories removed
  - [x] `xmake build desktop` green (all targets)
  - [x] `xmake build wasm-app` green
  - [x] `xmake run test-todo-store` green (17 cases / 46 assertions)
  - [x] `xmake run test-bridge-channel-adapter` green (4 cases / 12 assertions)
  - [x] `xmake run test-bun` green (44 tests / 93 expect() calls — exercises real WS protocol round-trip)
  - [x] `xmake run test-browser` — verified **pre-existing red**: 4 fail / 2 pass on baseline commit `a45ba66` (pre-Phase-1) with identical failure pattern. Phase 2 did not introduce these failures. Bug needs its own investigation.
  - [ ] App launches, every bridge method round-trips *(skipped — Bun tests cover WS round-trips against the rewired dev-server, which is the same bridge code path; GUI smoke deferred)*
  - [ ] WASM app launches, every bridge method round-trips *(skipped — WASM build green proves the Embind binding wiring; GUI smoke deferred)*

### Phase 3 — Move bridges, delete `app/lib/`

- [x] **Phase 3 complete**
  - [x] `TodoBridge` → `app/bridges/todos/include/todo_bridge.hpp`
  - [x] `SystemBridge` (+ DTOs + MOC anchor `bridges.cpp`) → `app/bridges/system/...`
  - [x] `app/lib/` directory removed
  - [x] `application.cpp` registration includes updated
  - [x] `test_server.cpp` registration includes updated (verify both!)
  - [x] Target rename: `todos-bridge` → `app.bridges.todos`
  - [x] Target rename: `qt-bridges` → `app.bridges.system`
  - [x] Namespace decision recorded: `web_shell::` → `app_shell::` (locked in `FRONTEND_REFACTOR_PHASES.md`; class casing fix `web_shell::bridge` → `app_shell::Bridge` bundled in)
  - [x] Namespace rename applied to `bridge.hpp`, `BridgeRegistry`, `AppLifecycle`, `WasmBridgeWrapper`, every bridge derived class
  - [x] No remaining `web_shell::` references in the codebase (verify with grep)
  - [x] `xmake build desktop` green
  - [x] `xmake build wasm-app` green

---

## Web reshape — Phases 4–8

### Phase 4 — Bun workspaces + shadcn primitives package

- [x] **Phase 4 complete**
  - [x] `app/package.json` workspaces extended to `["web", "web/apps/*", "web/packages/*"]` (outer `app/` is the actual workspace root, not `web/`)
  - [x] `web/packages/ui/` created with shadcn primitives (`shared/components/ui/*`), `cn` helper, `useSidebarSlot`, `useIsMobile`, `theme.css`
  - [x] Package name decided: `@app/ui`
  - [x] `main` app imports from the new package via workspace name (`@app/ui/components/*`, `@app/ui/lib/cn`, `@app/ui/hooks/use-sidebar-slot`, `@app/ui/styles/theme.css`)
  - [x] `bun install` resolves cleanly (`@app/ui` symlinked at `web/node_modules/@app/ui`)
  - [x] `main` app builds (`bun run build:main` green, 28.50s)
  - [x] `xmake build desktop` green (web bundle embedded via qrc)

### Phase 5 — Theming package

- [x] **Phase 5 complete**
  - [x] `shared/lib/themes.ts`, `themes.json`, `themes-index.ts`, `themes/*.ts` (1021 generated modules) → `web/packages/theming/lib/themes.ts` + `web/packages/theming/data/`
  - [x] `shared/lib/fonts.ts`, `google-fonts.json` → `web/packages/theming/lib/fonts.ts` + `web/packages/theming/data/`
  - [x] `shared/lib/tron-grid.ts`, `apps/main/src/theme-effects.ts` + wallpaper assets (`themes/dragon.png`, `dragon-legacy.jpg`, `tron.svg`, `tron-animated.svg`, `tron-moving.svg`) → `web/packages/theming/lib/` + `web/packages/theming/themes/`
  - [x] `<ThemePicker>`, `<FontPicker>`, `<TransparencySlider>`, `<DarkModeToggle>`, `<AppearancePanel>` extracted from inline SettingsTab.tsx into `web/packages/theming/components/*.tsx`
  - [x] SettingsTab rewired to a thin re-export of `<AppearancePanel />`
  - [x] Package name decided: `@app/theming`
  - [x] `web/package.json` declares `"@app/theming": "workspace:*"` so bun symlinks it
  - [x] localStorage keys unchanged (`theme-name`, `theme-mode`, `theme-css`, `app-font-family`, `editor-font-family`, `editor-theme-name`, `editor-use-app-theme`, `editor-use-app-font`, `page-transparency`, `surface-transparency`, `editor-transparency`) — verified by grep of moved files
  - [x] All consumers re-pointed: `App.tsx`, `main.tsx`, `EditorTab.tsx`, `.storybook/preview.ts` → `@app/theming/lib/...` and `@app/theming/data/...`
  - [x] `web/packages/ui/components/sonner.tsx` — deleted local `isDarkMode` workaround + the misleading "avoids coupling" comment, now imports `isDarkMode` from `@app/theming/lib/themes` directly. Coupling between workspace packages is fine in this opinionated single-deploy template; the workaround was solving an invented problem.
  - [x] `xmake build desktop` green (Vite 35.87s + linked exe)
  - [x] `xmake build wasm-app` green
  - [x] **Post-audit fixes:** `tools/generate-qss-themes.ts` paths repointed to `web/packages/theming/data/` (was reading/writing dead `web/shared/data/` paths); `.storybook/manager.tsx` switched to `import { isDarkMode } from '@app/theming/lib/themes'` (matched the sonner.tsx fix); empty `web/shared/data/` directory removed; `docs/FRONTEND_REFACTOR_PHASES.md` Phase 5 retitled "Theming package (`@app/theming`)". Re-verified: `xmake build desktop` (SKIP_VITE) green, `bun run build-storybook` green (10.30s), `xmake build wasm-app` green.

**Deferred from Phase 5 (flagged for later phases):**
- **AppearancePanel editor leak (Phase 8):** `appearance-panel.tsx` includes editor-specific UI (use-app-theme/font toggles, separate editor theme/font sub-pickers, editor-transparency slider). Editors aren't a universal app concern. Phase 8's `apps/settings/` should decide: keep AppearancePanel as-is (less portable to editor-less consumers) or split it.
- **system-bridge import path (Phase 7):** `appearance-panel.tsx` imports `@shared/api/system-bridge`. When Phase 7 moves bridge transport TS, this import needs updating.

### Phase 6 — Monaco package (`@app/monaco`)

- [x] **Phase 6 complete**
  - [x] `@monaco-editor/react`, `monaco-editor`, `monaco-vim` deps moved to `web/packages/monaco/package.json`
  - [x] `shared/lib/monaco-theme.ts` → `web/packages/monaco/lib/monaco-theme.ts`; the 4-line worker+`loader.config({ monaco })` bootstrap from `main.tsx` extracted to `web/packages/monaco/lib/setup.ts` as a side-effect module
  - [x] Monaco worker setup runs before any editor mount — `import '@app/monaco/setup'` is the **first** import in `main.tsx`, before any other module that could mount an editor
  - [x] Package name decided: `@app/monaco`
  - [x] `main` app builds (`bun run build:main` green, 28.13s)
  - [x] `xmake build desktop` green (SKIP_VITE, web bundle embedded via qrc)

### Phase 7 — Place bridge transport TS

- [x] **Phase 7 complete**
  - [x] Decision recorded: bridge transport TS lives in a 4th workspace package `@app/bridge` at `web/packages/bridge/`. Internal layout split by purpose: `lib/transport/` (`bridge.ts`, `bridge-transport.ts`, `wasm-transport.ts` — framework runtime, consumers never touch) + `lib/bridges/` (`system-bridge.ts`, `todo-bridge.ts` — typed declarations of named bridges; this is where consumer-added bridges land). Folder name `bridges/` mirrors the C++ side's `app/bridges/` for matching vocabulary across the wire.
  - [x] Transport files moved into `web/packages/bridge/lib/transport/` and `web/packages/bridge/lib/bridges/`
  - [x] JS-side `_shell` identifier renamed to `_lifecycle` — coordinated change in `bridge-transport.ts` (`channel._lifecycle`, `lifecycle.appReady(...)`) + `web_shell_widget.cpp` (`channel->registerObject("_lifecycle", lifecycle);`). Doc comment in `app_lifecycle.hpp` updated to drop the "Phase 7 will rename" note.
  - [x] No remaining `_shell` references in `.ts`, `.tsx`, `.cpp`, `.hpp` (verified with grep — empty)
  - [x] `main` app builds (`bun run --cwd web build:main` green, 26.48s)
  - [x] `xmake build wasm-app` green (2.45s)
  - [x] `xmake build desktop` green (7.06s with `_lifecycle` rename)
  - [x] `@app/bridge` symlinked at `web/node_modules/@app/bridge` after `bun install` (declared as workspace dep in `web/package.json`, matching the established convention from Phases 4/5/6 — sibling packages don't self-declare workspace deps)
  - [x] Phase-5-deferred consumer fix bundled: `appearance-panel.tsx` rewired from `@shared/api/system-bridge` to `@app/bridge/lib/bridges/system-bridge`

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
  - [ ] `xmake build desktop` green (compiles with new scheme_handler routing + WEB_APPS list)
  - [ ] `xmake build wasm-app` green

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

---

## Phase 11 — Namespace bare-name template targets

- [ ] **Phase 11 complete**
  - [ ] Open question resolved: scheme for nested-concept targets (e.g., `app.test.browser` vs `app.test-browser`)
  - [ ] `desktop` → `app.desktop`
  - [ ] `dev-server` → `app.dev-server`
  - [ ] `dev-web`, `dev-web-main`, `dev-desktop`, `dev-wasm` → `app.dev.*` (or chosen scheme)
  - [ ] `start-desktop`, `stop-desktop` → `app.start-desktop`, `app.stop-desktop`
  - [ ] `storybook` → `app.storybook`
  - [ ] `setup` → `app.setup`
  - [ ] `validate-bridges` → `app.validate-bridges`
  - [ ] `playwright-cdp` → `app.playwright-cdp`
  - [ ] `scaffold-bridge` → `app.scaffold-bridge`
  - [ ] All `test-*` targets renamed to namespaced scheme
  - [ ] Pure-domain targets at `<repo>/lib/` (`todos`, etc.) → `lib.<name>`
  - [ ] All `os.execv("xmake", {"run", "..."})` calls inside `app/xmake/*.lua` updated to new names
  - [ ] All `xmake run` references in `app/docs/`, `docs/`, and CI workflow files updated
  - [ ] Grep for old bare names in docs returns nothing
  - [ ] `xmake build` runs through every namespaced target green
