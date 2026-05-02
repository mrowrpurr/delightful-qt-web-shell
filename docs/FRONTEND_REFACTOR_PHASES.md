# Frontend Refactor — Phasing 🏴‍☠️

Companion to `FRONTEND_REFACTOR.md`. That doc says **what** the refactor is and **why**. This doc proposes **how to land it incrementally** — a sequence of phases where every phase ends with a working app.

The original doc treats the refactor as four independent pieces of work and explicitly leaves the order open. This phasing chooses an order, splits two of the four pieces (C++ reshape and web reshape) into multiple sub-phases each, and gives every phase its own verification checklist.

---

## Why phase at all

The four pieces of work in the original doc are sized for *evaluation*, not for *landing*. "Move all C++ at once" and "split web into three apps and extract three packages at once" are both big-bang moves as written. Big-bang moves are hard to review, hard to revert, and hard to debug when something silently breaks halfway through.

Phasing buys three things:

1. **Green checkpoints.** Every phase ends with a runnable app. If something regresses, the previous phase is the last known good — small distance to roll back.
2. **Reviewable atomic moves.** Each phase is a single concern (hoist pure domain, extract framework, extract one package, etc.). A reviewer can hold the whole change in their head.
3. **Fail-fast on premise.** Phase 1 (hoisting pure domain to repo-root `lib/`) is the cheapest test of whether the structural premise holds. If pure C++ won't compile clean of Qt and Embind from a sibling-of-`app/` location, the whole refactor's framing is wrong — and we find that out before touching anything else.

---

## The big arcs

```
Phase 0          Baseline
Phases 1–3       C++ reshape
Phases 4–8       Web reshape
Phase 9          Test trim
Phase 10         scaffold-bridge update
Phase 11         Namespace bare-name template targets
```

C++ before web because the TypeScript layer doesn't reference C++ paths — the (still single, still ugly) web app keeps working through every C++ phase, providing a free integration test for the reshape.

Web before tests and scaffold because both downstream pieces want stable paths to target.

---

## Phase 0 — Baseline

**Goal:** capture green state before touching anything. Every later "still works" claim verifies against this.

**Actions:**
- `xmake run test-all` on the starting branch — capture pass/fail per suite.
- Launch desktop, capture playwright-cdp snapshots of every demo tab.
- Note WASM build state (does `xmake f -p wasm && xmake build wasm-app` succeed?).
- Note any pre-existing failures so they're not later attributed to a phase.

**Done when:** baseline is recorded somewhere referenceable (commit message, a notes file, wherever). No code changes in this phase.

---

## C++ reshape (3 phases)

### Phase 1 — Hoist pure domain to `<repo>/lib/todos/`

**Goal:** prove pure C++ domain compiles outside `app/`, free of Qt and Embind.

**Moves:**
- `app/lib/todos/include/todo_store.hpp` → `<repo>/lib/todos/include/todo_store.hpp`
- `app/lib/todos/include/todo_dtos.hpp` → `<repo>/lib/todos/include/todo_dtos.hpp`
- `app/lib/todos/tests/unit/todo_store_test.cpp` → `<repo>/lib/todos/tests/unit/todo_store_test.cpp`
- New: `<repo>/lib/todos/xmake.lua` — pure C++ target, no Qt deps.
- `TodoBridge` stays in `app/lib/todos/` for now; only its includes update.

**Why first:** smallest blast radius. No transport churn. Establishes the new repo-root `lib/` shape with the lowest-risk move. If pure domain *won't* compile clean of Qt at this location, the whole refactor's premise is suspect — and we know now instead of three phases in.

**Verification:**
- `xmake build desktop` green
- `xmake build wasm-app` green
- `xmake run test-todo-store` green
- App launches, demo tabs render, todos still work end-to-end

---

### Phase 2 — Extract framework to `<repo>/app/framework/`

**Goal:** template runtime moves out of `app/lib/web-shell/` and `app/lib/bridge/` into a single `app/framework/` directory.

**Moves:**
- `web_shell::bridge` base (`app/lib/bridge/include/bridge.hpp`) → `app/framework/...`
- WebShell loader (`web_shell.hpp`/`.cpp`) → `app/framework/...`
- Qt transport adapters (`bridge_channel_adapter.hpp`, `expose_as_ws.hpp`, `json_adapter.hpp`) → `app/framework/...`
- WASM transport (`wasm_bridge_wrapper.hpp`, `wasm_bindings.cpp`) → `app/framework/...`

**Why second:** framework is template runtime — it doesn't know about any domain. Doing this in isolation means only includes shift; behavior doesn't. Bridges still live in `app/lib/` at the end of this phase, but they include from `app/framework/`.

**Open question (carried from original doc):** internal subfolder layout of `app/framework/`. Resolve it during this phase. Recommendation: subdivide by purpose (`bridge/`, `webshell/`, `qt-transport/`, `wasm-transport/`) — each a clear concern. Flat is also defensible if the file count stays small.

**Verification:**
- `xmake build desktop` green
- `xmake build wasm-app` green
- App launches, every bridge method round-trips (smoke a few via `eval_js` if uncertain)
- WASM app launches, every bridge method round-trips

---

### Phase 3 — Move bridges, delete `app/lib/`

**Goal:** bridges land in their final homes; `app/lib/` ceases to exist. Namespace `web_shell::` is renamed at the same time, since this phase touches every `web_shell::bridge` include site already.

**Moves:**
- `TodoBridge` (currently in `app/lib/todos/include/todo_bridge.hpp`) → `app/bridges/todos/include/todo_bridge.hpp`
- `SystemBridge` (`app/lib/bridges/qt/include/system_bridge.hpp`, `system_dtos.hpp`, MOC anchor `bridges.cpp`) → `app/bridges/system/...`
- `app/lib/` removed.
- `application.cpp` and `test_server.cpp` registration includes update.

**Target renames** (the bridges' new paths drive new target names in the `app.X` scheme):
- `todos-bridge` (introduced in Phase 1) → `app.bridges.todos`
- `qt-bridges` → `app.bridges.system`

**Namespace rename:** `web_shell::bridge`, `web_shell::WasmBridgeWrapper`, etc. → new namespace. The old name was bolted onto the now-deleted `WebShell` class and is misleading. Touches `bridge.hpp` itself, every bridge derived class, `wasm_bindings.cpp`, `BridgeRegistry`, `AppLifecycle`, and every `#include` and `using` site.

**Open question (resolve in this phase):** new namespace name. Candidates:
- `framework::` — single-level, matches the folder
- `app::framework::` — two-level, matches the `app.framework.X` target prefix

**Why last in C++:** with framework and pure domain stable in their new homes, the bridges are the last residents to evict. After this phase, C++ matches the target tree.

**Critical pattern preservation:** bridges register in **both** `application.cpp` and `test_server.cpp`. Forgetting either makes the bridge silently absent in that environment. Verify both before declaring this phase done.

**Verification:**
- `app/lib/` directory does not exist
- No remaining references to `web_shell::` in the codebase (check with grep)
- `xmake build desktop` green
- `xmake build wasm-app` green
- `xmake run test-all` green (first full-suite run since Phase 0 — takes the desktop, ask Purr first)
- WASM app: bridge calls work

---

## Web reshape (5 phases)

Bottom-up by dep chain. The current single app stays the consumer of each newly-extracted package, so it's a working integration test through every phase. Apps split last, when there are three packages to compose.

### Phase 4 — Bun workspaces + shadcn primitives package

**Goal:** establish the workspace mechanic with the lowest-risk extraction.

**Actions:**
- Configure `web/package.json` with bun workspaces.
- Create `web/packages/<shadcn-pkg-name>/` — shadcn primitives (`shared/components/ui/*`), `cn` helper, `useSidebarSlot`, `tailwind.css` base.
- Existing `main` app imports from the new package via the workspace name.

**Why first in web:** leaf deps. Nothing else in the codebase depends on these primitives except apps. Establishing workspaces here means future packages have a known mechanic to follow.

**Open question (carried):** package name. The original doc lists three "?" placeholders — `?shadcn-ui`, `?preferences`, `?monaco`. Resolve names during their respective extraction phases.

**Verification:**
- `bun install` from `web/` resolves cleanly
- `main` app builds and runs
- Components render correctly (snapshot diff against Phase 0)
- Storybook still launches (`xmake run storybook`)

---

### Phase 5 — Preferences package

**Goal:** themes, fonts, theme effects extract into a single reusable package.

**Moves:**
- `shared/lib/themes.ts`, `themes.json`, `shared/lib/fonts.ts`, `google-fonts.json`
- `shared/lib/tron-grid.ts`, theme-effects code (Tron, Dragon, Synthwave glow, wallpapers)
- `<ThemePicker>`, `<FontPicker>`, `<TransparencySlider>`, `<DarkModeToggle>`, `<AppearancePanel>` components
- Depends on the shadcn-primitives package.

**Why second:** depends only on shadcn-primitives, which is already extracted. Biggest surface in the web reshape — isolating it in its own phase makes regressions easier to bisect.

**Critical pattern preservation:** localStorage keys (`theme-name`, `theme-mode`, `editor-theme-name`, `editor-use-app-theme`, `page-transparency`, `surface-transparency`, font keys) **must not change**. Renaming or relocating any of them wipes user preferences across upgrades. Audit them at the end of this phase by clearing localStorage, setting preferences in the running app, then comparing keys with Phase 0.

**Verification:**
- `main` app builds and runs
- Theme switching works (every theme — try a few including Tron and Dragon)
- Font switching works (app font and editor font independently)
- Transparency sliders work
- localStorage keys match Phase 0 baseline
- Snapshot diff matches Phase 0

---

### Phase 6 — Monaco package

**Goal:** Monaco wrapper + `monaco-theme.ts` extract into their own package.

**Moves:**
- `@monaco-editor/react`, `monaco-editor`, `monaco-vim` deps move to the package
- `shared/lib/monaco-theme.ts` and the Monaco setup code move
- Depends on preferences (for theme integration via `buildMonacoThemeFromVars`).

**Why third:** sits on top of preferences in the dep graph. Smallest of the three packages by surface.

**Critical pattern preservation:** Monaco worker setup runs before any editor mount. Preserve the initialization order during the move.

**Verification:**
- Editor tab in `main` app loads without console errors
- Vim mode works
- Editor theme syncs with app theme
- Editor font is independently configurable

---

### Phase 7 — Place bridge transport TS

**Goal:** resolve where bridge transport TypeScript lives, before splitting apps.

**Open question being resolved:** `bridge.ts`, `bridge-transport.ts`, `wasm-transport.ts`, `system-bridge.ts`, `todo-bridge.ts` — currently in `web/shared/api/`. The original doc lists four options:
1. A 4th workspace package
2. Folded into the shadcn-primitives package
3. Folded into the preferences package
4. A bare shared folder under `web/`

**Recommendation (this doc, not the original):** option 1 — a 4th workspace package, e.g., `bridge-transport/` or similar. Reasons: bridge transport is conceptually orthogonal to UI primitives, preferences, and Monaco; co-locating it with any of them is a category error. A bare shared folder works mechanically but contradicts the "everything reusable is a workspace package" principle the refactor establishes. Decide in the implementation phase, but expect this to be the recommendation that lands.

**Why this gets its own phase:** splitting apps before bridge transport has a stable home means thrash — every app would need to update its transport import path twice. Doing this as its own atomic phase keeps the apps-split phase focused on apps, not on transport.

**JS-side `_shell` rename:** the QWebChannel object name `_shell` in `bridge-transport.ts` is named after the deleted `WebShell` class. Phase 2 split the C++ side into `BridgeRegistry` + `AppLifecycle` but kept registering the AppLifecycle as `_shell` for JS compatibility. This phase updates the JS side and the `channel->registerObject(...)` call site to a name that matches the C++ class — likely `_lifecycle` or `_appLifecycle`. Coordinated change in `bridge-transport.ts` and `web_shell_widget.cpp` (the registration site).

**Verification:**
- `main` app builds and runs
- Every bridge method round-trips (smoke a few)
- WASM transport still works (`xmake run dev-wasm` + WASM app launches)
- Snapshot diff matches Phase 0
- `_shell` no longer appears in any `.ts` or `.cpp` file (check with grep)

---

### Phase 8 — Split apps, wire react-router, delete `web/shared/`

**Goal:** the payoff phase. Three apps composing the packages.

**Actions:**
- Rename `web/apps/main/` → `web/apps/demo/`
- Create `web/apps/settings/` — thin app composing the preferences package
- Create `web/apps/app/` — empty slate (react + react-router + bridge transport, nothing else)
- HashRouter in all three apps
- Update `desktop/src/widgets/scheme_handler.cpp` — host routing for `app://demo/`, `app://settings/`, `app://app/`
- Update `WEB_APPS` in `desktop/xmake.lua` — register the three apps for build + qrc embedding
- Pick the default URL the desktop loads on launch (open question from original doc)
- `web/shared/` no longer exists

**Why last in web:** needs all packages in their final homes. Three apps composing three packages is the structural payoff.

**Open questions resolving in this phase:**
- Default URL the desktop loads on launch (original doc flagged this — `app://main/` no longer exists post-rename)
- WASM artifact destination (currently `web/apps/main/public/`)
- Which app `dev-wasm` starts
- ChatTab fate — keep as a `useSidebarSlot` demo in `demo`, or remove entirely
- Vite dev ports per app
- Storybook globals (`web/shared/styles/globals.css`) landing place
- App.css split (Tailwind base → shadcn pkg, transparency vars → preferences pkg, markdown → demo only, theme glow + wallpaper → preferences pkg)

**Critical pattern preservations:**
- `signalReady()` in **every** app's mount path. No call → 15-second loading-overlay timeout shows error. Verify per app.
- `getBridge<T>(...)` at **module scope** in each app. Inside a component it creates a new instance per render and breaks signals.
- `assetsInlineLimit: 0` in **every** new `vite.config.ts`. QWebEngine chokes on data: URIs for SVGs under 4KB.
- `qtSyncGuard` — preserved wherever the React→Qt theme listener lives now (settings or demo).

**Verification:**
- All three apps build (`bun run build:demo`, `build:settings`, `build:app`)
- Desktop launches at the chosen default URL
- User can navigate between demo, settings, and app from the running desktop
- Snapshot per app captured (these become the new baseline)
- Bridge calls work in each app
- WASM dev flow still produces a runnable WASM app
- Storybook still launches and renders components
- `xmake run test-all` green (full-suite run — ask Purr first)

---

## Phase 9 — Test trim

**Goal:** each test suite drops to 1–3 tests demonstrating the suite's pattern. Tests are demonstrations, not coverage. Helpers stay.

**Per-suite trim:**
- **Catch2:** pick `todo_store_test` OR `bridge_channel_adapter_test` OR a fresh demonstration. Original doc lists this as an open question — recommendation: `todo_store_test` (clearest "pure C++ domain logic" demonstration).
- **Bun:** pick one of `bridge_proxy_test` or `type_conversion_test`. Recommendation: `type_conversion_test` against the new layout (it exercises real C++ backend through real WS, the whole point of the Bun layer).
- **Playwright browser:** one demo-todos flow.
- **Playwright desktop:** the original doc flags this as "whether it survives at all." Recommendation: keep one as a demonstration that the same test runs in Qt — the "two-environments-one-test" capability is the reason it exists.
- **pywinauto:** one modal-dialog demonstration. `test_full_dialog_flow` covers the most patterns (menu → modal → file dialog → cancel).

**Why now:** paths are settled after Phase 8. Trimming earlier means re-trimming after every move.

**Verification:**
- Each surviving test runs green standalone
- Full suite runs faster than Phase 0 baseline
- Each surviving test's name and content make obvious what pattern it demonstrates
- Helpers (`native_dialogs.py`, `win32_helpers.py`, conftest fixtures) intact

---

## Phase 10 — `scaffold-bridge` update

**Goal:** the tool emits into the post-reshape layouts.

**Actions:**
- Update the tool's templates to match the new `app/bridges/<name>/` layout
- Update wiring updates to point at the new `application.cpp` and `test_server.cpp` registration sites
- Update the TS interface emission to point at wherever Phase 7 placed bridge transport TS
- Decide: does the tool emit a placeholder pure-domain header, or just a comment pointing the consumer at `<repo>/lib/<name>/`? Original doc flagged this — recommendation: comment + nothing else. The tool stays out of `<repo>/lib/` per the original decision; making it suggest *where* to put domain code is fine, but it shouldn't write there.

**Why absolute last:** codifies the new layouts. Updating it before they're final means re-updating it.

**Verification:**
- `xmake run scaffold-bridge testbridge` on a clean tree produces a bridge that compiles
- The generated bridge registers in both `application.cpp` and `test_server.cpp`
- The generated bridge is callable from the running app
- The tool does not write into `<repo>/lib/`
- Remove the test bridge after verification (this is verification, not a permanent addition)

---

## Phase 11 — Namespace bare-name template targets

**Goal:** every xmake target the template defines carries an `app.X` (or `lib.X` for repo-root pure-C++ libs) prefix so it doesn't squat on bare names the consumer might want for their own targets.

**Why this exists at all:** the template lives alongside a consumer's other code in the same xmake project. Bare-name targets like `desktop`, `dev-server`, `test-todo-store`, `start-desktop`, `validate-bridges`, etc. would collide with anything a consumer names the same. Phases 1–3 introduced the `app.X` / `lib.X` scheme for new and moved targets — this phase retrofits everything that wasn't already touched.

**Renames (illustrative, not exhaustive — final list is whatever's still bare-named after Phase 10):**
- `desktop` → `app.desktop`
- `dev-server` → `app.dev-server`
- `dev-web`, `dev-web-main`, `dev-desktop`, `dev-wasm` → `app.dev.*`
- `start-desktop`, `stop-desktop` → `app.start-desktop`, `app.stop-desktop`
- `storybook` → `app.storybook`
- `setup` → `app.setup`
- `validate-bridges` → `app.validate-bridges`
- `playwright-cdp` → `app.playwright-cdp`
- `scaffold-bridge` → `app.scaffold-bridge`
- All `test-*` targets → `app.test.*` (e.g., `test-todo-store` → `lib.todos.test` since the test target lives with the lib; `test-browser` → `app.test.browser`; `test-all` → `app.test.all`)
- Pure-domain targets at `<repo>/lib/` (e.g., `todos`) → `lib.todos`

**Why last:** renaming targets cascades to every `add_deps()`, every `xmake run X` invocation in `app/xmake/` files, every doc reference, and every CI workflow. Doing this after the major refactor settles means the rename touches a stable target list, not a moving one. It also becomes a single legible commit ("renamed every template target to namespaced form") rather than churn smeared across earlier phases.

**Open question (resolve in this phase):** scheme for nested-concept targets. Does `test-browser` become `app.test.browser` or `app.test-browser`? The dot is a stronger separator semantically; the dash matches the existing single-word convention. Decide here.

**Verification:**
- `xmake build` runs through every namespaced target green
- `xmake run app.test.all` (or whatever the renamed full-suite target ends up) drives the full suite
- Every `os.execv("xmake", {"run", "..."})` call inside `app/xmake/*.lua` updated to the new names
- Every `xmake run` reference in `app/docs/` and `docs/` and CI workflow files updated
- Documentation grep for old bare names returns nothing

**Why a separate phase, not folded into earlier ones:** the rename is mechanical but wide. Folding into Phase 3 (which already touches a lot of xmake.lua) would conflate "move bridges" with "rename every template target." Each phase should be reviewable as one concern.

---

## Verification checklist (every phase)

After every phase except 0, before declaring the phase done:

- [ ] `xmake build desktop` green
- [ ] `xmake build wasm-app` green (skip on phases that don't touch C++ or WASM-relevant paths)
- [ ] `xmake run test-todo-store` green (after Phase 1)
- [ ] `xmake run test-bun` green
- [ ] `xmake run test-browser` green
- [ ] App launches, snapshots match the current baseline
- [ ] Every bridge round-trips (smoke a few via `eval_js`)
- [ ] localStorage keys unchanged (Phase 5 onwards)
- [ ] No new console errors in the web view

`xmake run test-all` (which includes pywinauto and takes over the desktop) runs **once at end of each multi-phase block** — end of P3, end of P8, end of P9, end of P10, end of P11. Not per-phase. Always ask Purr before running it.

---

## What this phasing intentionally does NOT do

- **Does not parallelize.** Phases are sequential because each is a small, atomic move. Parallelism trades small-and-clear for fast-and-confusing.
- **Does not fold test trim into earlier phases.** Keeping the existing test surface during the moves is what catches regressions. Trim once paths are stable.
- **Does not make `scaffold-bridge` a sub-step.** It's its own thing, easy to defer, easy to verify in isolation.
- **Does not commit to package names.** Names are decided in their respective phases. Original doc leaves them open; this doc carries that openness through.
- **Does not pre-resolve the open questions from the original doc.** It maps each open question to the phase where it must be resolved, but doesn't pre-decide them. Decisions land where the work lands.

---

## Rollback strategy

Each phase is a separate commit (or small commit series). If a phase regresses something the verification didn't catch, revert that commit and re-evaluate. Phases are designed so that reverting one does not require reverting the next — but in practice, if Phase N+1 has been merged on top of N, reverting N requires reverting N+1 first. Land phases in PRs, not in a long-lived branch, so the revert path is one `git revert <commit>` per phase if needed.

Never `git reset --hard` or `git checkout .` to roll back a phase. Other sessions may have uncommitted work. Use `git revert`.
