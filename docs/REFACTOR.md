# Refactor Plan 🏴‍☠️

The complete plan to ship this template ready for consumers. Five phases, every decision locked, no out-of-scope cop-outs. A fresh agent reads this top to bottom and executes.

## Table of contents

- [Before you start](#before-you-start)
  - [Required reading](#required-reading)
  - [Patterns this refactor MUST preserve](#patterns-this-refactor-must-preserve)
  - [Operational rules](#operational-rules)
- [Phases overview & ordering](#phases-overview--ordering)
- [Phase 1 — C++ refactor](#phase-1--c-refactor)
- [Phase 2 — Frontend refactor](#phase-2--frontend-refactor)
- [Phase 3 — Backend tests trim](#phase-3--backend-tests-trim)
- [Phase 4 — WASM retarget](#phase-4--wasm-retarget)
- [Phase 5 — scaffold-bridge update](#phase-5--scaffold-bridge-update)
- [Appendices](#appendices)

---

## Before you start

You're about to refactor a working template. Read this whole section, then read the required docs, before touching files.

### Required reading

| Doc | Why |
|---|---|
| `app/docs/DelightfulQtWebShell/for-agents/01-08` | Architecture, patterns, gotchas, tools. All of them. |
| Repo Ethos (start-of-session prompt) | "Do it right or don't do it." Never destructive git. Own every failure. |
| `working-with-purr` skill | If pairing live with the product owner. |

### Patterns this refactor MUST preserve

If you break any of these, the app silently breaks. None are obvious from the new file tree.

1. **`signalReady()` fires after mount in *every* app.** No call → 15s loading-overlay timeout shows error. Move it, never delete it.
2. **`getBridge<T>(...)` lives at module scope with top-level await.** Inside a component → new instance every render → broken signals. Top of file, before the component.
3. **Bridges register in BOTH `application.cpp` AND `test_server.cpp`.** Forget either → bridge silently doesn't exist in that environment.
4. **`QTimer::singleShot(0, ...)` when a bridge method opens a modal.** Synchronous open → dialog's QWebChannel can't init → loading overlay forever. See `main_window.cpp` for the pattern.
5. **Monaco worker setup precedes any editor mount.** `self.MonacoEnvironment = { getWorker: ... }` must run before any `<MonacoEditor>` instantiates. Currently in `main.tsx` lines 14-18.
6. **`playwright-cdp` runs under `npx tsx`, NOT `bun`.** Bun's WS polyfill kills CDP. The one documented exception to bun-everywhere.
7. **`assetsInlineLimit: 0` in every `vite.config.ts`.** QWebEngine chokes on data: URIs for SVGs < 4KB.
8. **`qtSyncGuard` flag in the React→Qt theme listener.** Without it: React sets theme → Qt emits → React sets → infinite loop.
9. **localStorage keys are persisted state.** Renaming or moving any of these wipes user preferences across upgrades:
   - `theme-name`, `theme-mode`, `editor-theme-name`, `editor-use-app-theme`
   - `page-transparency`, `surface-transparency`
   - Whatever current font keys are — preserve verbatim
10. **`bridges/wasm` library uses `set_kind("object")`, not `static`.** Static gets dead-stripped because `main.cpp` doesn't reference the `EMSCRIPTEN_BINDINGS` block. Object libraries include all `.o` files unconditionally.
11. **`QCommandLineParser::parse()`, never `process()`.** `process()` shows an error dialog and exits on unknown flags — kills URL protocol activations.

### Operational rules

**Commits.** One commit per step. Match the existing emoji-prefixed style (look at `git log --oneline -20`). Every step ends with a green build and the verify-gate passing — that's what makes the commit valid.

**Pause for review.** After Phase 1, after Phase 2 Step 4, after every full phase. Otherwise steam through within a phase.

**Branch.** Stay on `template`. The whole template is the deliverable.

**Ask before doing these.**
- Run `xmake run test-all`, `xmake run test-pywinauto`, `xmake run test-desktop` — they take the desktop for ~30s
- Delete `app/web/shared/` (Phase 2 Step 1f — biggest single destructive move)
- Delete `app/lib/` after Phase 1's moves complete (the corresponding move at the C++ side)
- Change the default app launch URL (Phase 2 Step 4d does this — confirm before flipping)

**Verify with eyes, not just builds.** A green `xmake build desktop` means it compiled. It does not mean the app works. After every step:

```bash
cd app
xmake run start-desktop                      # background launch, CDP on :9222
echo 'console.log(await snapshot())' \
  | npx tsx tools/playwright-cdp/run.ts      # see what's actually rendered
echo 'console.log(await screenshot("verify.png"))' \
  | npx tsx tools/playwright-cdp/run.ts      # capture the web view
xmake run stop-desktop
```

Read `for-agents/05-tools.md` if any of that is unfamiliar.

---

## Phases overview & ordering

```
Phase 1                Phase 2              Phase 3            Phase 4              Phase 5
C++ refactor    ────►  Frontend refactor    Backend tests      WASM retarget   ───► scaffold-bridge
foundational           three apps + four    trim Catch2 +      point at         update
domain/framework/      packages + react-    pywinauto          apps/app
bridges split          router everywhere
   │
   └──────────────────────────────────────► Phase 3 can land any time after Phase 1
```

**Why this order:**
- Phase 1 is foundational. `<root>/lib/<domain>` and `app/framework/` + `app/bridges/` is the substrate everything else assumes.
- Phase 2 (frontend) is logically independent of Phase 1, but lands cleaner second because the `@template/bridges` TS package's matching C++ paths are stable.
- Phase 3 (backend tests) needs Phase 1's new test paths.
- Phase 4 (wasm) needs Phase 2's three apps (it picks one to retarget at).
- Phase 5 (scaffold-bridge) needs both Phase 1 and Phase 2 — it generates files into the new C++ AND new TS layout.

Phase 3 can land between any two later phases without conflict — it's a tests-only pass.

---

## Phase 1 — C++ refactor

### Why

`app/lib/` mixes pure C++ domain (`todos/`), framework infrastructure (`web-shell/`, `bridge/`), and bridge wrappers (`bridges/qt/system_bridge`, `todos/include/todo_bridge.hpp`). Repo conventions for the product owner put pure domain at `<repo>/lib/` so it's reusable across projects. Seeing `<repo>/lib/` AND `<repo>/app/lib/` is structurally confusing. We want:

- `<root>/lib/<domain>/` — pure C++, no Qt, no Embind, no `web_shell::bridge`. Reusable in any project.
- `<root>/app/framework/` — `web_shell::bridge` base + transport adapters. The template runtime.
- `<root>/app/bridges/<domain>/` — the bridge classes that wrap a `<root>/lib/<domain>/` for this template's transports.

### Decisions

| Thing | Decision |
|---|---|
| Pure domain location | `<root>/lib/<domain>/` (above `app/`) |
| Framework location | `<root>/app/framework/` |
| Domain bridges location | `<root>/app/bridges/<domain>/` |
| `web_shell::bridge` base class | `app/framework/bridge/` (renamed from `app/lib/bridge/`) |
| WebShell loader (`web_shell.hpp/cpp`) | `app/framework/web-shell/` |
| Qt transport (`bridge_channel_adapter.hpp`, `expose_as_ws.hpp`, `json_adapter.hpp`) | `app/framework/transport/qt/` |
| Wasm transport (`wasm_bridge_wrapper.hpp`, `wasm_bindings.cpp`) | `app/framework/transport/wasm/` |
| `TodoStore` + DTOs | `<root>/lib/todos/` (pure) |
| `TodoBridge` | `app/bridges/todos/` |
| `SystemBridge` + DTOs | `app/bridges/system/` (Qt-dependent — fine, `app/` is Qt-aware) |
| Tests for pure domain | Travel with the domain → `<root>/lib/<domain>/tests/` |
| Tests for framework | Travel with framework → `app/framework/<area>/tests/` |
| `app/lib/` after the move | Deleted entirely |

### Target shape

```
<root>/
├── lib/
│   └── todos/
│       ├── include/
│       │   ├── todo_store.hpp
│       │   └── todo_dtos.hpp
│       ├── tests/unit/
│       │   └── todo_store_test.cpp
│       └── xmake.lua          (pure C++ static lib — no Qt, no Embind dep)
├── xmake.lua                  (consumer's customization point — already exists)
└── app/
    ├── framework/
    │   ├── bridge/
    │   │   ├── include/bridge.hpp     (web_shell::bridge base class)
    │   │   └── xmake.lua
    │   ├── web-shell/
    │   │   ├── include/web_shell.hpp
    │   │   ├── src/web_shell.cpp
    │   │   └── xmake.lua
    │   ├── transport/
    │   │   ├── qt/
    │   │   │   ├── include/
    │   │   │   │   ├── bridge_channel_adapter.hpp
    │   │   │   │   ├── expose_as_ws.hpp
    │   │   │   │   └── json_adapter.hpp
    │   │   │   ├── tests/unit/
    │   │   │   │   └── bridge_channel_adapter_test.cpp
    │   │   │   └── xmake.lua
    │   │   └── wasm/
    │   │       ├── include/wasm_bridge_wrapper.hpp
    │   │       ├── src/wasm_bindings.cpp
    │   │       └── xmake.lua
    ├── bridges/
    │   ├── todos/
    │   │   ├── include/todo_bridge.hpp
    │   │   └── xmake.lua             (depends on <root>/lib/todos + app/framework/bridge)
    │   └── system/
    │       ├── include/
    │       │   ├── system_bridge.hpp
    │       │   └── system_dtos.hpp
    │       ├── src/bridges.cpp       (MOC anchor stays — header-only bridges need it)
    │       └── xmake.lua             (depends on app/framework/bridge + Qt)
    ├── desktop/                       (unchanged)
    ├── web/                           (unchanged in Phase 1 — Phase 2 reshapes)
    ├── wasm/                          (unchanged)
    ├── tests/                         (unchanged in Phase 1)
    └── xmake.lua                      (updated includes)
```

### Steps

#### 1.1 — Move pure domain to `<root>/lib/`

```
app/lib/todos/include/todo_store.hpp        → <root>/lib/todos/include/todo_store.hpp
app/lib/todos/include/todo_dtos.hpp         → <root>/lib/todos/include/todo_dtos.hpp
app/lib/todos/tests/unit/todo_store_test.cpp → <root>/lib/todos/tests/unit/todo_store_test.cpp
app/lib/todos/xmake.lua                     → <root>/lib/todos/xmake.lua  (rewrite — see below)
```

Rewrite `<root>/lib/todos/xmake.lua` to define a pure C++ static library with no Qt or Embind deps:

```lua
target("todos")
    set_kind("static")
    add_includedirs("include", { public = true })
    add_packages("def_type", { public = true })

target("test-todo-store")
    set_kind("binary")
    set_default(false)
    add_deps("todos")
    add_packages("catch2", "def_type")
    add_files("tests/unit/todo_store_test.cpp")
    on_run(function (target)
        os.execv(target:targetfile())
    end)
```

Update `<root>/xmake.lua` to include it BEFORE `app/xmake.lua`:

```lua
add_rules("mode.release")
set_defaultmode("release")

includes("lib/todos/xmake.lua")   -- ← NEW
includes("app/xmake.lua")
```

Update `app/xmake.lua` to drop its own `includes("lib/todos/xmake.lua")` line (Phase 1.4 covers full xmake update).

**Verify:** `xmake build todos && xmake run test-todo-store` — domain lib compiles, test runs green, no Qt linkage.

#### 1.2 — Move framework to `app/framework/`

```
app/lib/bridge/include/bridge.hpp            → app/framework/bridge/include/bridge.hpp
app/lib/bridge/xmake.lua                     → app/framework/bridge/xmake.lua

app/lib/web-shell/include/web_shell.hpp      → app/framework/web-shell/include/web_shell.hpp
app/lib/web-shell/src/web_shell.cpp          → app/framework/web-shell/src/web_shell.cpp
app/lib/web-shell/xmake.lua                  → app/framework/web-shell/xmake.lua

app/lib/web-shell/include/bridge_channel_adapter.hpp → app/framework/transport/qt/include/bridge_channel_adapter.hpp
app/lib/web-shell/include/expose_as_ws.hpp           → app/framework/transport/qt/include/expose_as_ws.hpp
app/lib/web-shell/include/json_adapter.hpp           → app/framework/transport/qt/include/json_adapter.hpp
app/lib/web-shell/tests/unit/bridge_channel_adapter_test.cpp → app/framework/transport/qt/tests/unit/bridge_channel_adapter_test.cpp

app/lib/bridges/wasm/include/wasm_bridge_wrapper.hpp → app/framework/transport/wasm/include/wasm_bridge_wrapper.hpp
app/lib/bridges/wasm/src/wasm_bindings.cpp           → app/framework/transport/wasm/src/wasm_bindings.cpp
app/lib/bridges/wasm/xmake.lua                       → app/framework/transport/wasm/xmake.lua
```

Create new `app/framework/transport/qt/xmake.lua` (split from current `web-shell/xmake.lua`).

The `transport/wasm/xmake.lua` keeps `set_kind("object")` — see must-preserve pattern #10.

**Verify:** `xmake build desktop` — framework recompiles at new paths, all internal includes resolve.

#### 1.3 — Move domain bridges to `app/bridges/<domain>/`

```
app/lib/todos/include/todo_bridge.hpp                → app/bridges/todos/include/todo_bridge.hpp
app/lib/bridges/qt/include/system_bridge.hpp         → app/bridges/system/include/system_bridge.hpp
app/lib/bridges/qt/include/system_dtos.hpp           → app/bridges/system/include/system_dtos.hpp
app/lib/bridges/qt/src/bridges.cpp                   → app/bridges/system/src/bridges.cpp
app/lib/bridges/qt/xmake.lua                         → app/bridges/system/xmake.lua  (rewrite — see below)
```

Create `app/bridges/todos/xmake.lua`:

```lua
target("bridge-todos")
    set_kind("interface")
    add_includedirs("include", { public = true })
    add_deps("todos", "framework-bridge", { public = true })
```

Rewrite `app/bridges/system/xmake.lua` to depend on `framework-bridge` + Qt + `framework-transport-qt` (it's Qt-dependent).

`bridges.cpp` (the empty MOC anchor) stays as `app/bridges/system/src/bridges.cpp`. Header-only bridges require something to compile against in Qt's MOC pipeline.

**Verify:** `xmake build desktop` — both bridges compile against the new paths.

#### 1.4 — Update `app/xmake.lua` includes

Replace the `lib/...` and `lib/bridges/...` includes with the new paths:

```lua
-- ── Framework ──────────────────────────────────────────────────────
includes("framework/bridge/xmake.lua")
includes("framework/web-shell/xmake.lua")

-- ── Platform-specific transport ────────────────────────────────────
if is_plat("wasm") then
    includes("framework/transport/wasm/xmake.lua")
    includes("wasm/xmake.lua")
else
    includes("framework/transport/qt/xmake.lua")
    -- ── Bridges ────────────────────────────────────────────────
    includes("bridges/todos/xmake.lua")
    includes("bridges/system/xmake.lua")
    -- ── App targets ────────────────────────────────────────────
    includes("desktop/xmake.lua")
    includes("tests/helpers/dev-server/xmake.lua")
    includes("xmake/setup.lua")
    includes("xmake/scaffold-bridge.lua")
    includes("xmake/dev.lua")
    includes("xmake/dev-wasm.lua")
    includes("xmake/testing.lua")
end
```

Drop the standalone `includes("lib/todos/xmake.lua")` — that's now in `<root>/xmake.lua` (Step 1.1).

#### 1.5 — Update C++ source includes + registration sites

Sweep every `#include` to point at the new paths:

| Old | New |
|---|---|
| `#include <bridge.hpp>` | `#include <bridge.hpp>` (path unchanged — relocated under `app/framework/bridge/include/`) |
| `#include <web_shell.hpp>` | unchanged path |
| `#include <todo_bridge.hpp>` | unchanged (now in `app/bridges/todos/include/`) |
| `#include <system_bridge.hpp>` | unchanged (now in `app/bridges/system/include/`) |
| `#include <bridge_channel_adapter.hpp>` | unchanged |
| `#include <expose_as_ws.hpp>` | unchanged |
| `#include <json_adapter.hpp>` | unchanged |
| `#include <wasm_bridge_wrapper.hpp>` | unchanged |
| `#include <todo_store.hpp>` | unchanged |
| `#include <todo_dtos.hpp>` | unchanged |
| `#include <system_dtos.hpp>` | unchanged |

Header **filenames** don't change. Only the on-disk paths and the `add_includedirs(...)` lines in xmake.lua. The xmake target deps wire everything: `desktop` depends on `bridge-todos` + `bridge-system`, which add their `include/` dirs publicly.

Concretely the only files touching xmake-level deps:

- `app/desktop/xmake.lua` — replace `add_deps("todos", "web-shell", "qt-bridges")` → `add_deps("framework-web-shell", "framework-transport-qt", "bridge-todos", "bridge-system")`.
- `app/tests/helpers/dev-server/xmake.lua` — same dep list as desktop minus Qt-only bits.
- `app/wasm/xmake.lua` — `add_deps("wasm-bridges")` → `add_deps("framework-transport-wasm", "bridge-todos", "bridge-system")`.

`application.cpp` and `test_server.cpp` continue to call `shell.addBridge("todos", todoBridge)` and `shell.addBridge("system", systemBridge)` exactly as before. Patterns must-preserve #3 still applies.

#### 1.6 — Delete `app/lib/`

After all of 1.1–1.5 verify green: `rm -rf app/lib/`. Per the ask-before list, confirm with the human first.

#### 1.7 — Update for-agents docs (paths only)

`for-agents/01-getting-started.md`, `02-architecture.md`, `03-adding-features.md`, `06-gotchas.md` reference `lib/` paths heavily. Sweep updates:

| Old reference | New reference |
|---|---|
| `lib/todos/include/todo_store.hpp` | `<root>/lib/todos/include/todo_store.hpp` |
| `lib/todos/include/todo_bridge.hpp` | `app/bridges/todos/include/todo_bridge.hpp` |
| `lib/todos/include/todo_dtos.hpp` | `<root>/lib/todos/include/todo_dtos.hpp` |
| `lib/web-shell/include/...` | `app/framework/web-shell/include/...` and `app/framework/transport/qt/include/...` |
| `lib/bridges/qt/include/system_bridge.hpp` | `app/bridges/system/include/system_bridge.hpp` |
| `lib/bridges/wasm/...` | `app/framework/transport/wasm/...` |

The mental model section ("Three Layers You Touch") in `02-architecture.md` reframes:

> 1. **Domain logic** at `<root>/lib/<domain>/` — pure C++. Reusable across your projects.
> 2. **Bridge** at `app/bridges/<domain>/` — extends `web_shell::bridge`, wraps the domain for this template's transports.
> 3. **TypeScript interface** at `app/web/packages/bridges/src/<domain>-bridge.ts` (Phase 2 path — write this in Phase 5's docs pass).

#### Phase 1 verify

```bash
cd app
xmake build desktop                     # full Qt build green
xmake build wasm-app -y                 # (after `xmake f -p wasm`) wasm build green
xmake run test-todo-store               # pure domain test green
xmake run test-bun                      # bridge round trip via WS green
xmake run start-desktop && \
  echo 'console.log(await snapshot())' | npx tsx tools/playwright-cdp/run.ts && \
  xmake run stop-desktop                # app launches and renders, all bridges respond
```

Commit: `🏗️ Phase 1: C++ — domain to <root>/lib/, framework + bridges split`

---

## Phase 2 — Frontend refactor

### Why

Today everything lives in one Vite app (`web/apps/main/`) with components buried in `apps/main/src/`. Consumers have to gut our app to ship theirs. Components that should be reusable aren't, because they were written inside the demo.

Goal: split the web layer so consumers see three distinct things:

1. **`demo`** — playground showing every pattern the template supports. Delete it on day one if you want.
2. **`settings`** — a thin app composing reusable components. Plausibly embeddable into a real product as a free preferences UI.
3. **`app`** — the empty slate where the consumer's product goes. Routes set up, one bridge call wired, nothing else.

Components partition by reuse: reusable → workspace package; demo-only → stays inside `web/apps/demo/`.

### Decisions

| Thing | Decision |
|---|---|
| Apps | `demo` / `settings` / `app` (Vite app under `web/apps/<name>/`) |
| Packages | `@template/ui` / `@template/preferences` / `@template/editor` / `@template/bridges` (Bun workspaces under `web/packages/<name>/`) |
| Routing | `react-router` `HashRouter` in **every** app. No hand-rolled hash checks. |
| Default URL on launch | `app://app/` — consumers see their slate first |
| Tron / Dragon | Production templates. Ship in `@template/preferences`. |
| All themes | **Production**. No theme is demo-only. Every theme in `themes.json` ships. |
| `useSidebarSlot` | Shared (`@template/ui`). Demo uses it. `app` does not. |
| `WebDialog` C++ | Stays. Demo demonstrates the dialog pattern. URL is implementation detail. |
| Bridge registration | All bridges register always. Consumer deletes demo → also deletes the matching bridge wiring. |
| Frontend tests | Two: 1 Bun bridge round trip, 1 Playwright browser flow against demo. Drop Playwright-desktop. |
| ChatTab | Demo. Demonstrates the `useSidebarSlot` portal pattern. Stays in `web/apps/demo/`. |
| `next-themes` dep | Delete. Documented dead in `web/TODO.md`. |
| npm publishing | Never. Workspaces are for dep isolation + intent boundaries inside this template. |

### Target shape

```
app/web/
├── package.json              ← bun workspaces: ["packages/*", "apps/*"]
├── tsconfig.json
├── .storybook/               ← scans web/packages/*/src/**/*.stories.tsx
├── packages/
│   ├── ui/
│   │   ├── package.json
│   │   └── src/
│   │       ├── components/   shadcn primitives — button, input, dialog, sidebar, …
│   │       ├── hooks/        use-sidebar-slot.tsx
│   │       ├── lib/          utils.ts (cn helper)
│   │       └── styles/
│   │           └── tailwind.css   `@import "tailwindcss"` + `@theme inline` mapping
│   ├── preferences/
│   │   ├── package.json      (depends on @template/ui + @template/bridges)
│   │   └── src/
│   │       ├── data/
│   │       │   ├── themes.json
│   │       │   ├── themes-index.ts
│   │       │   ├── themes/<slug>.ts          per-theme modules (Vite chunks)
│   │       │   └── google-fonts.json
│   │       ├── lib/          themes.ts, fonts.ts, theme-effects.ts, tron-grid.ts
│   │       ├── effects/      tron.svg, tron-animated.svg, tron-moving.svg,
│   │       │                 dragon.png, dragon-legacy.jpg, …
│   │       ├── components/   ThemePicker, FontPicker, TransparencySlider,
│   │       │                  DarkModeToggle, AppearancePanel
│   │       └── styles/
│   │           ├── transparency.css   `--page-opacity` + `--surface-opacity` defaults + `.bg-page`
│   │           └── effects.css        `.theme-glow` + wallpaper transparency rules
│   ├── editor/
│   │   ├── package.json      (depends on @template/preferences for monaco-theme integration)
│   │   └── src/
│   │       ├── lib/          monaco-theme.ts (derives Monaco theme from CSS vars),
│   │       │                  worker setup
│   │       └── components/   MonacoEditor wrapper
│   └── bridges/
│       ├── package.json      (no runtime deps — pure TS)
│       └── src/
│           ├── bridge.ts                  getBridge<T>() + transport auto-detect
│           ├── bridge-transport.ts        QWebChannel + WS transport
│           ├── wasm-transport.ts          Embind transport
│           ├── system-bridge.ts           SystemBridge interface + getter
│           └── todo-bridge.ts             TodoBridge interface + getter
└── apps/
    ├── demo/
    ├── settings/
    └── app/
```

`app/` (the app, not the dir) is the empty slate. It depends only on `react`, `react-dom`, `react-router`, `@template/bridges`. No `@template/ui`. No theme system. No fonts beyond the browser default.

### Steps

#### 2.1 — Bun workspaces scaffolding

**a. Workspace root.** Edit `app/web/package.json`: add `"workspaces": ["packages/*", "apps/*"]`. Keep root deps to dev tooling only (typescript, vite, tailwindcss, storybook). Move all runtime deps to per-package or per-app `package.json`s per **Appendix A**. Create empty `package.json`s in `web/packages/{ui,preferences,editor,bridges}/`.

**b. Move files.**

| From | To |
|---|---|
| `web/shared/components/ui/*` | `@template/ui/src/components/` |
| `web/apps/main/src/hooks/use-sidebar-slot.tsx` | `@template/ui/src/hooks/` |
| `web/shared/styles/theme.css` | `@template/ui/src/styles/tailwind.css` (rename + prepend `@import "tailwindcss";`) |
| `web/shared/data/themes*` | `@template/preferences/src/data/themes/` (and `themes.json`, `themes-index.ts`) |
| `web/shared/data/google-fonts.json` | `@template/preferences/src/data/` |
| `web/shared/lib/themes.ts`, `fonts.ts`, `tron-grid.ts` | `@template/preferences/src/lib/` |
| `web/apps/main/src/theme-effects.ts` | `@template/preferences/src/lib/` |
| `web/apps/main/src/themes/*` (svg/png) | `@template/preferences/src/effects/` |
| `web/shared/lib/monaco-theme.ts` | `@template/editor/src/lib/` |
| `web/shared/api/bridge.ts`, `bridge-transport.ts`, `wasm-transport.ts`, `system-bridge.ts`, `todo-bridge.ts` | `@template/bridges/src/` |
| `web/shared/lib/utils.ts` | `@template/ui/src/lib/` (shadcn's `cn()` helper) |

**c. CSS split.** `web/apps/main/src/App.css` is mixed concerns:

| Chunk | New home |
|---|---|
| `@import "tailwindcss"` + `@source` + `@theme inline` block + `body { … }` | `@template/ui/src/styles/tailwind.css` |
| `:root { --page-opacity: 1; --surface-opacity: 1 }` + `.bg-page` utility | `@template/preferences/src/styles/transparency.css` |
| `.markdown-body` block (DocsTab) | `web/apps/demo/src/App.css` (still demo-local) |
| `.theme-glow` + wallpaper `html:has(...)` rule | `@template/preferences/src/styles/effects.css` |

`web/shared/styles/globals.css` is the Storybook-only global → moves to `.storybook/globals.css`.

**d. Update imports inside `web/apps/main/`.**

- `@shared/components/ui/*` → `@template/ui`
- `@shared/api/*` → `@template/bridges`
- `@shared/lib/themes`, `fonts`, `tron-grid`, `monaco-theme` → `@template/preferences/lib/*` (or `@template/editor/lib/monaco-theme`)
- `@shared/data/*` → `@template/preferences/data/*`
- `@/hooks/use-sidebar-slot` → `@template/ui/hooks/use-sidebar-slot`

**e. Storybook.**

- Update `.storybook/main.ts` story glob to `web/packages/*/src/**/*.stories.tsx`
- Update `.storybook/preview.ts` global CSS imports to point at `@template/ui` + `@template/preferences` styles
- The Theme/Font addon panels in `.storybook/manager.tsx` still work — they read from the same data files at new paths

**f. Cleanup.**

- Run `bun install` at `app/web/` (resolves workspaces)
- Delete `web/shared/` (empty after moves) — **ask before deleting** per operational rules
- Delete `next-themes` from any `package.json` (dead per `web/TODO.md`)

**g. Vite config update.** `web/apps/main/vite.config.ts` — drop the `@shared` alias, keep `@` alias to `./src`. `@template/*` resolves via Bun workspaces, no Vite alias needed.

**Verify:**
```bash
cd app
xmake build desktop && xmake run start-desktop
echo 'console.log(await snapshot())' | npx tsx tools/playwright-cdp/run.ts
xmake run stop-desktop
xmake run test-bun
```

Commit: `🧱 Phase 2.1: bun workspaces — packages extracted from shared/`

#### 2.2 — Extract preferences UI components

`SettingsTab.tsx` currently inlines the theme picker, font pickers, transparency sliders, and dark-mode toggle. Pull each one out.

- `<ThemePicker/>` — searchable list w/ color preview dots. Reads from `@template/preferences/data`. Calls `applyTheme(...)`. Pushes to Qt via `@template/bridges` `getSystemBridge().setQtTheme(...)`. Exposes `value` + `onChange` props.
- `<FontPicker target="app" | "editor"/>` — one component, two instances. Persists to localStorage (preserve key names — must-preserve #9).
- `<TransparencySlider target="page" | "surface"/>` — one component, two instances. Writes `--page-opacity` / `--surface-opacity` on `:root`.
- `<DarkModeToggle/>` — handles `setDarkMode()` + Qt sync, `qtSyncGuard` pattern preserved.
- `<AppearancePanel/>` — composite of the four. The "give me everything" component. This is what the `settings` app's `/appearance` route renders.

Each gets a `.stories.tsx` next to it.

**Verify:**
```bash
cd app
xmake build desktop && xmake run start-desktop
echo 'await screenshot("settings-after.png")' | npx tsx tools/playwright-cdp/run.ts
xmake run stop-desktop
bun run typecheck
bun run storybook
```

Commit: `🎨 Phase 2.2: extract preferences components`

#### 2.3 — `react-router` migration in `web/apps/main/`

Add `react-router` to `apps/main/package.json` (~v6 latest).

`main.tsx`: remove the hash-based `Root = route === '#/dialog' ? DialogView : App` branch. Always render `<App/>`.

`App.tsx`:
```tsx
<HashRouter>
  <Routes>
    <Route path="/" element={<SidebarShell />}>
      <Route index element={<DocsRoute />} />
      <Route path="editor" element={<EditorRoute />} />
      <Route path="todos" element={<TodosRoute />} />
      <Route path="files" element={<FilesRoute />} />
      <Route path="chat" element={<ChatRoute />} />
      <Route path="system" element={<SystemRoute />} />
      <Route path="components" element={<ComponentsRoute />} />
      <Route path="settings" element={<SettingsRoute />} />
    </Route>
    <Route path="dialog" element={<DialogRoute />} />
  </Routes>
</HashRouter>
```

Sidebar uses `<NavLink to="/editor">` etc. instead of `setCurrentTab`. `document.title` updates per route via a `useEffect` keyed on `useLocation()`. The `/dialog` route renders `<DialogRoute/>` (renamed from `DialogView`), outside the sidebar layout.

**Verify:**
```bash
cd app
xmake build desktop && xmake run start-desktop
echo 'await snapshot()' | npx tsx tools/playwright-cdp/run.ts
echo 'console.log(await eval_js("window.location.hash"))' | npx tsx tools/playwright-cdp/run.ts
xmake run stop-desktop
```

Commit: `🧭 Phase 2.3: react-router migration`

#### 2.4 — Carve `main` into `demo` + `settings` + `app`

Three sub-steps to keep verifiable.

**a. Rename `main` → `demo`.**

- `mv web/apps/main web/apps/demo`
- Update `web/package.json` scripts: `dev:main` → `dev:demo`, etc.
- Update `app/desktop/xmake.lua`: `WEB_APPS = {"main"}` → `WEB_APPS = {"demo"}` (more added in 2.4d)
- Update `app/desktop/src/widgets/scheme_handler.cpp`: route `app://main/` → `app://demo/`
- Update `app/desktop/src/application.cpp`: `appUrl("main")` → `appUrl("demo")` (changes again in 2.4d)
- Update `playwright.config.ts`, `.env.example`, `index.html`, `vite-env.d.ts`
- Verify: `xmake build desktop && xmake run desktop` opens demo at `app://demo/`

**b. Create `settings` app.** Copy per-app skeleton from **Appendix C** to `web/apps/settings/`.

- `package.json` depends on `@template/ui`, `@template/preferences`, `@template/bridges`
- `main.tsx` does the bootstrap blocks listed for `settings` in **Appendix B**
- `App.tsx`:
  ```tsx
  <HashRouter>
    <Routes>
      <Route path="/" element={<SettingsLayout />}>
        <Route index element={<Navigate to="appearance" replace />} />
        <Route path="appearance" element={<AppearanceRoute />} />
        <Route path="fonts" element={<FontsRoute />} />
        <Route path="transparency" element={<TransparencyRoute />} />
      </Route>
    </Routes>
  </HashRouter>
  ```
- Routes render the matching `@template/preferences` components

**c. Create `app` (empty slate).** Copy per-app skeleton from **Appendix C** to `web/apps/app/`.

- `package.json` depends on `react`, `react-dom`, `react-router`, `@template/bridges` only
- `main.tsx` per **Appendix B** for `app`: bridges-ready + render. No theme system.
- `App.tsx`: `<HashRouter><Routes><Route path="/" element={<HomeRoute />} /></Routes></HashRouter>`
- `HomeRoute.tsx`:
  ```tsx
  export default function HomeRoute() {
    const [theme, setTheme] = useState<unknown>(null)
    useEffect(() => {
      getSystemBridge().then(s => s.getQtTheme()).then(setTheme)
      signalReady()
    }, [])
    return (
      <main>
        <h1>Your app goes here</h1>
        <p>Bridge call result:</p>
        <pre>{JSON.stringify(theme, null, 2)}</pre>
      </main>
    )
  }
  ```

**d. Wire all three into the desktop shell.**

- `app/desktop/xmake.lua`: `WEB_APPS = {"demo", "settings", "app"}`
- `app/desktop/src/widgets/scheme_handler.cpp`: register `app://demo/`, `app://settings/`, `app://app/`
- `app/desktop/src/application.cpp`: default `appUrl("demo")` → `appUrl("app")` — **ask before flipping**
- `app/desktop/src/menus/menu_bar.cpp`:
  - `Tools → Open Demo` → loads `app://demo/`
  - `Tools → Open Settings` → loads `app://settings/`
  - `Tools → Open App` → loads `app://app/`
- `web/package.json` scripts: add `dev:settings`, `build:settings`, `dev:app`, `build:app`

**Verify:**
```bash
cd app
xmake build desktop && xmake run start-desktop
echo 'console.log(await eval_js("location.href"))' | npx tsx tools/playwright-cdp/run.ts
echo 'console.log(await snapshot())' | npx tsx tools/playwright-cdp/run.ts
# Use Tools menu to navigate to demo and settings; verify each renders
xmake run stop-desktop
xmake run test-bun
```

Commit: `🪓 Phase 2.4: split main → demo + settings + app`

#### 2.5 — Trim frontend tests

(Backend tests trim is Phase 3. This step is the frontend half.)

**Delete:**
- All Playwright-desktop tests
- All Bun tests in `lib/web-shell/tests/web/` except one round trip
- All Playwright-browser tests in `tests/playwright/` except one demo flow

**Keep:**
- `app/tests/playwright/demo-todos.spec.ts` (rename) — open `app://demo/`, navigate to todos route, add a todo, see it appear
- `app/framework/web-shell/tests/web/bridge-roundtrip.test.ts` (rename, located per Phase 1's tests path) — one bridge call round trip via WS against the real `dev-server`

**Verify:**
```bash
cd app
xmake run test-bun       # green in <1s
xmake run test-browser   # green in <10s
```

Commit: `🧪 Phase 2.5: trim frontend tests to demonstration set`

#### 2.6 — Frontend doc updates

Rewrite the relevant for-agents docs to match the new layout:

- `for-agents/01-getting-started.md` — project layout section, `xmake run dev-web` → `bun run dev:demo` etc.
- `for-agents/02-architecture.md` — multi-app section needs the new package + app structure
- `for-agents/03-adding-features.md` — "adding a new web app" recipe; "scaffold-bridge" callouts deferred to Phase 5
- `for-agents/06-gotchas.md` — `assetsInlineLimit: 0` per app; bun workspaces gotchas
- `for-agents/08-theming.md` — paths inside `@template/preferences` instead of `web/shared/`

For-humans docs: same updates, lighter tone.

**Verify:** read each doc top to bottom against the new tree.

Commit: `📚 Phase 2.6: docs reflect new web layout`

---

## Phase 3 — Backend tests trim

### Why

`xmake run test-all` runs five layers. Two are frontend (covered in Phase 2.5). The other three (Catch2, Playwright-desktop, pywinauto) are backend. The product owner wants the test suite to be **demonstrations of patterns**, not coverage. One test per layer.

Phase 2.5 already drops Playwright-desktop and trims Playwright-browser + Bun.

This phase trims Catch2 and pywinauto.

### Decisions

| Layer | Single test that stays | Why |
|---|---|---|
| Catch2 (C++) | `<root>/lib/todos/tests/unit/todo_store_test.cpp` | Demonstrates pure-domain testing pattern |
| Catch2 (framework) | None — drop `app/framework/transport/qt/tests/unit/bridge_channel_adapter_test.cpp` | Framework tests are over-coverage for a template; consumers add their own |
| pywinauto | One native flow — File menu → File dialog → cancel | Demonstrates the modal-dialog pattern with `native_dialogs.py` helpers |

Helpers stay untouched: `native_dialogs.py`, `win32_helpers.py`, conftest fixtures.

### Steps

#### 3.1 — Drop framework Catch2 test

```
rm app/framework/transport/qt/tests/unit/bridge_channel_adapter_test.cpp
```

Update `app/framework/transport/qt/xmake.lua` to remove the test target. Update `app/xmake/testing.lua` if it references the test by name.

#### 3.2 — Trim pywinauto down to one demonstration

Pick one pywinauto test that exercises the modal-dialog pattern end-to-end. Candidate: `tests/pywinauto/test_full_dialog_flow.py` — full flow with `FileDialog` helper. Keep it. Delete others:

```
rm app/tests/pywinauto/test_window.py
rm app/tests/pywinauto/test_menu_bar.py
rm app/tests/pywinauto/test_keyboard_shortcuts.py
```

Keep:
- `app/tests/pywinauto/test_full_dialog_flow.py`
- `app/tests/pywinauto/native_dialogs.py`
- `app/tests/pywinauto/win32_helpers.py`
- `app/tests/pywinauto/conftest.py`

#### 3.3 — Update for-agents/04-testing.md

The five-layer table becomes a four-layer table (Playwright-desktop dropped in Phase 2.5). One test per layer. Add a sentence explaining "tests are demonstrations of patterns, not coverage — add your own as you build."

#### Phase 3 verify

```bash
cd app
xmake run test-todo-store    # green in <1s
xmake run test-bun           # green in <1s
xmake run test-browser       # green in <10s
# Ask before:
# xmake run test-pywinauto   # green in <5s, takes desktop briefly
```

Commit: `🧪 Phase 3: trim backend tests to demonstration set`

---

## Phase 4 — WASM retarget

### Why

`app/xmake/dev-wasm.lua` hardcodes `web/apps/main/public/` as the WASM artifact destination and runs `bun run dev:main`. After Phase 2, `apps/main` no longer exists. WASM is for browser deployment of the consumer's app — so it should target `apps/app` (the empty slate consumers replace with their product).

### Decisions

| Thing | Decision |
|---|---|
| WASM target app | `apps/app` (consumer's slate). Wasm builds ship the consumer's product to the browser, not the demo. |
| Demo wasm path | Not a thing. If a consumer wants demo features in wasm, they copy from `apps/demo/` into their own app. |
| `dev-wasm.lua` | Hardcodes `apps/app` — simple, matches the rename pattern (consumer renames `apps/app` to their product name; updates `dev-wasm.lua` once). |
| `apps/app/public/` | Created if missing — wasm artifact destination. |

### Steps

#### 4.1 — Update `app/xmake/dev-wasm.lua`

Replace `apps/main` references with `apps/app`. Update `bun run dev:main` to `bun run dev:app`. Two lines.

#### 4.2 — Verify wasm transport works against `apps/app`

`apps/app` depends only on `react`, `react-dom`, `react-router`, `@template/bridges`. The wasm transport is in `@template/bridges/src/wasm-transport.ts` — auto-detected via `VITE_TRANSPORT=wasm`. Already wired. Confirm `getSystemBridge()` works under wasm by:

```bash
cd app
xmake f -p wasm && xmake build wasm-app
xmake f -p windows --qt=<qt-path>      # switch back
xmake run dev-wasm                      # opens apps/app at http://localhost:5173 with wasm transport
PLAYWRIGHT_URL=http://localhost:5173 \
  npx tsx tools/playwright-cdp/cli.ts snapshot
# Should see "Your app goes here" + bridge result
```

#### 4.3 — Update for-agents/01-getting-started.md WASM section

Update the WASM dev mode section to reference `apps/app` not `apps/main`. Add a sentence: "WASM serves the consumer's app — to wasm-deploy the demo, point `dev-wasm.lua` at `apps/demo` instead."

#### Phase 4 verify

WASM build runs through and `apps/app` renders the bridge result in the browser. No Qt needed for the verify.

Commit: `🌐 Phase 4: WASM targets apps/app`

---

## Phase 5 — scaffold-bridge update

### Why

`app/xmake/scaffold-bridge.lua` (the existing tool) generates files into the old layout: `lib/bridges/qt/include/<name>_bridge.hpp` + `web/shared/api/<name>-bridge.ts` + wires `application.cpp` and `test_server.cpp`. After Phases 1 and 2, this is wrong on every count. A consumer who runs `xmake run scaffold-bridge notes` after the refactor gets broken output.

### Decisions

| Thing | Decision |
|---|---|
| Pure domain output | `<root>/lib/<name>/include/<name>_store.hpp` + `<name>_dtos.hpp` skeleton |
| Bridge wrapper output | `app/bridges/<name>/include/<name>_bridge.hpp` |
| TypeScript interface output | `app/web/packages/bridges/src/<name>-bridge.ts` |
| Wiring | `application.cpp` + `test_server.cpp` (`shell.addBridge(...)` lines stay where they are) |
| xmake includes | `<root>/xmake.lua` (for `lib/<name>/`) + `app/xmake.lua` (for `app/bridges/<name>/`) — both updated |
| Naming | The CLI argument is the **domain name**, not the bridge name. `xmake run scaffold-domain notes`. Bridge file is derived (`notes_bridge.hpp`). Consumer is told the bridge wraps the domain. |

The tool's renamed from `scaffold-bridge` → `scaffold-domain` to reflect the new mental model (a domain has a bridge, not the other way around). Old name stays as an alias for one release if desired — at template-author discretion.

### Steps

#### 5.1 — Rewrite `app/xmake/scaffold-bridge.lua` (or `scaffold-domain.lua`)

The tool currently emits ~6 files. New tool emits ~7:

| Output file | Content |
|---|---|
| `<root>/lib/<name>/include/<name>_store.hpp` | Pure C++ struct + store skeleton |
| `<root>/lib/<name>/include/<name>_dtos.hpp` | Empty file with header guard + namespace, ready for request DTOs |
| `<root>/lib/<name>/xmake.lua` | Pure C++ static library (no Qt, no Embind) |
| `app/bridges/<name>/include/<name>_bridge.hpp` | `class NameBridge : public web_shell::bridge` skeleton with method/signal registration block |
| `app/bridges/<name>/xmake.lua` | Interface library depending on `lib/<name>` + `framework-bridge` |
| `app/web/packages/bridges/src/<name>-bridge.ts` | TS interface stub + `getNameBridge()` getter |
| `app/web/packages/bridges/src/index.ts` | Updated to re-export the new bridge |

**Wires:**

- `<root>/xmake.lua` — adds `includes("lib/<name>/xmake.lua")`
- `app/xmake.lua` — adds `includes("bridges/<name>/xmake.lua")` inside the non-wasm branch
- `app/desktop/src/application.cpp` — adds `#include <<name>_bridge.hpp>` + `static <Name>Bridge nameBridge; shell.addBridge("<name>", nameBridge);`
- `app/tests/helpers/dev-server/src/test_server.cpp` — same pattern as application.cpp
- `app/desktop/xmake.lua` — adds `add_deps("bridge-<name>")`
- `app/tests/helpers/dev-server/xmake.lua` — same
- `app/wasm/xmake.lua` — adds `add_deps("bridge-<name>")` (so the bridge is available in the wasm build)

#### 5.2 — Verify the tool against a fresh scaffold

```bash
cd app
xmake run scaffold-domain notes
xmake build desktop                              # green
xmake build wasm-app -y                          # green
xmake run start-desktop && \
  echo 'console.log(await eval_js("Object.keys(window.bridges)"))' \
    | npx tsx tools/playwright-cdp/run.ts        # 'notes' should appear
xmake run stop-desktop
git checkout .                                    # discard scaffold output (verify-only)
```

#### 5.3 — Update for-agents/03-adding-features.md

Rewrite the "Adding a New Bridge" section to:

- Frame domain-first: "you have a domain (notes, files, whatever). You add a bridge that wraps it for the template's transports."
- Reference the new tool name + new file layout
- Update the manual-steps walkthrough (the longer "what's happening under the hood" section) to match the new paths

#### Phase 5 verify

The existing test-all suite passes after a scaffold and unscaffold. Manual scaffold + manual delete (`git checkout .`) shows the tool generates working files.

Commit: `🧰 Phase 5: scaffold-domain tool emits into new layout`

---

# Appendices

## Appendix A — Per-package dependency allocation

### `@template/ui` — shadcn primitives + cn helper + sidebar slot

```jsonc
{
  "name": "@template/ui",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "@base-ui/react": "^1.4.1",
    "@hookform/resolvers": "^5.2.2",
    "@radix-ui/react-select": "^2.2.6",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.1.1",
    "date-fns": "^4.1.0",
    "embla-carousel-react": "^8.6.0",
    "input-otp": "^1.4.2",
    "lucide-react": "^1.8.0",
    "radix-ui": "^1.4.3",
    "react-day-picker": "^9.14.0",
    "react-hook-form": "^7.73.1",
    "react-resizable-panels": "^4",
    "recharts": "3.8.0",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.5.0",
    "vaul": "^1.1.2",
    "zod": "^4.3.6"
  },
  "peerDependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  }
}
```

### `@template/preferences`

```jsonc
{
  "name": "@template/preferences",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "@template/ui": "workspace:*",
    "@template/bridges": "workspace:*"
  },
  "peerDependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  }
}
```

### `@template/editor`

```jsonc
{
  "name": "@template/editor",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "@monaco-editor/react": "^4.7.0",
    "@template/preferences": "workspace:*",
    "monaco-editor": "^0.55.1",
    "monaco-vim": "^0.4.4"
  },
  "peerDependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  }
}
```

### `@template/bridges`

```jsonc
{
  "name": "@template/bridges",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {}
}
```

(No runtime deps — pure TS that talks to native QWebChannel / WS / Embind through globals provided by the host.)

### Per-app deps

| App | Direct deps |
|---|---|
| `web/apps/demo` | `react`, `react-dom`, `react-router`, `react-markdown`, `remark-gfm`, `@template/ui`, `@template/preferences`, `@template/editor`, `@template/bridges` |
| `web/apps/settings` | `react`, `react-dom`, `react-router`, `@template/ui`, `@template/preferences`, `@template/bridges` |
| `web/apps/app` | `react`, `react-dom`, `react-router`, `@template/bridges` |

### Root devDeps (stay at `app/web/package.json`)

```jsonc
{
  "devDependencies": {
    "@storybook/addon-a11y": "^10.3.3",
    "@storybook/addon-docs": "^10.3.3",
    "@storybook/react-vite": "^10.3.3",
    "@tailwindcss/vite": "^4.2.2",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^4.5.2",
    "storybook": "^10.3.3",
    "tailwindcss": "^4.2.2",
    "typescript": "~5.8.3",
    "vite": "^6.3.5"
  }
}
```

### Deleted

- `next-themes` — dead per `web/TODO.md`.

---

## Appendix B — Per-app `main.tsx` bootstrap allocation

| Bootstrap block | demo | settings | app |
|---|:---:|:---:|:---:|
| Theme fast-path (`tryFastTheme()`) + cold-path (top-level await `loadTheme(...)`) | ✓ | ✓ | ✗ |
| `setFontData(...)` + `initFont()` | ✓ | ✓ | ✗ |
| `applyThemeEffects(savedThemeName)` | ✓ | ✓ | ✗ |
| Transparency CSS vars (`--page-opacity`, `--surface-opacity`) | ✓ | ✓ | ✗ |
| Monaco worker registration (`self.MonacoEnvironment = ...`) | ✓ | ✗ | ✗ |
| `@monaco-editor/react` `loader.config({ monaco })` | ✓ | ✗ | ✗ |
| Qt theme push on startup (`getSystemBridge().setQtTheme(...)`) | ✓ | ✓ | ✗ |
| `signalReady()` after mount | ✓ | ✓ | ✓ |
| `<HashRouter>` + `<Routes>` | ✓ | ✓ | ✓ |

The `app` `main.tsx` is just:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './App.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`signalReady()` fires from inside `<HomeRoute/>`'s `useEffect`.

---

## Appendix C — Per-app config skeleton

Every app under `web/apps/<name>/` gets these files. Replace `<NAME>` with the app name.

### `web/apps/<NAME>/package.json`

```jsonc
{
  "name": "<NAME>",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b --noEmit"
  },
  "dependencies": { /* see Appendix A */ }
}
```

### `web/apps/<NAME>/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>%VITE_APP_NAME%</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### `web/apps/<NAME>/vite.config.ts`

```ts
import { resolve } from 'path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,                  // QWebEngine chokes on data: URIs
  },
  server: { port: <UNIQUE_PORT> },         // demo: 5173, settings: 5174, app: 5175
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
})
```

### `web/apps/<NAME>/tsconfig.json` + `tsconfig.app.json`

Mirror the existing `web/apps/main/` files; no per-app divergence beyond the path. The root `web/tsconfig.json` is the shared base.

### `web/apps/<NAME>/.env.example`

```
VITE_APP_NAME=<your app name>
```

### `web/apps/<NAME>/src/vite-env.d.ts`

```ts
/// <reference types="vite/client" />
interface ImportMetaEnv { readonly VITE_APP_NAME: string }
interface ImportMeta { readonly env: ImportMetaEnv }
```

### `web/apps/<NAME>/src/App.css`

For `demo` and `settings`:

```css
@import "@template/ui/styles/tailwind.css";
@import "@template/preferences/styles/transparency.css";
@import "@template/preferences/styles/effects.css";
```

For `app`:

```css
/* No theme system. Add your own styles here. */
```

(`demo` adds its own `.markdown-body` block on top — DocsTab-specific.)

### `VITE_APP_NAME` propagation

Already wired by `app/xmake/dev.lua`, `app/xmake/dev-wasm.lua`, `app/desktop/xmake.lua`, and CI (`.github/workflows/{ci,release}.yml`). Each new app's `index.html` uses `%VITE_APP_NAME%` placeholder; Vite substitutes at build time. No new wiring needed beyond the per-app files above.

---

## Appendix D — Phase 1 file relocation map

Complete before/after for every C++ file that moves in Phase 1. Use this as the checklist.

| Before | After |
|---|---|
| `app/lib/todos/include/todo_store.hpp` | `<root>/lib/todos/include/todo_store.hpp` |
| `app/lib/todos/include/todo_dtos.hpp` | `<root>/lib/todos/include/todo_dtos.hpp` |
| `app/lib/todos/include/todo_bridge.hpp` | `app/bridges/todos/include/todo_bridge.hpp` |
| `app/lib/todos/tests/unit/todo_store_test.cpp` | `<root>/lib/todos/tests/unit/todo_store_test.cpp` |
| `app/lib/todos/xmake.lua` | Deleted; replaced by `<root>/lib/todos/xmake.lua` (rewritten — pure C++) and `app/bridges/todos/xmake.lua` (new) |
| `app/lib/bridge/include/bridge.hpp` | `app/framework/bridge/include/bridge.hpp` |
| `app/lib/bridge/xmake.lua` | `app/framework/bridge/xmake.lua` |
| `app/lib/web-shell/include/web_shell.hpp` | `app/framework/web-shell/include/web_shell.hpp` |
| `app/lib/web-shell/src/web_shell.cpp` | `app/framework/web-shell/src/web_shell.cpp` |
| `app/lib/web-shell/include/bridge_channel_adapter.hpp` | `app/framework/transport/qt/include/bridge_channel_adapter.hpp` |
| `app/lib/web-shell/include/expose_as_ws.hpp` | `app/framework/transport/qt/include/expose_as_ws.hpp` |
| `app/lib/web-shell/include/json_adapter.hpp` | `app/framework/transport/qt/include/json_adapter.hpp` |
| `app/lib/web-shell/tests/unit/bridge_channel_adapter_test.cpp` | `app/framework/transport/qt/tests/unit/bridge_channel_adapter_test.cpp` *(deleted in Phase 3)* |
| `app/lib/web-shell/xmake.lua` | Split: `app/framework/web-shell/xmake.lua` + `app/framework/transport/qt/xmake.lua` |
| `app/lib/bridges/qt/include/system_bridge.hpp` | `app/bridges/system/include/system_bridge.hpp` |
| `app/lib/bridges/qt/include/system_dtos.hpp` | `app/bridges/system/include/system_dtos.hpp` |
| `app/lib/bridges/qt/src/bridges.cpp` | `app/bridges/system/src/bridges.cpp` |
| `app/lib/bridges/qt/xmake.lua` | `app/bridges/system/xmake.lua` (rewrite) |
| `app/lib/bridges/wasm/include/wasm_bridge_wrapper.hpp` | `app/framework/transport/wasm/include/wasm_bridge_wrapper.hpp` |
| `app/lib/bridges/wasm/src/wasm_bindings.cpp` | `app/framework/transport/wasm/src/wasm_bindings.cpp` |
| `app/lib/bridges/wasm/xmake.lua` | `app/framework/transport/wasm/xmake.lua` |
| `app/lib/` (the directory) | Deleted entirely after all moves verify |

---

## Master order of operations summary

1. **Phase 1 — C++ refactor** — move pure domain to `<root>/lib/`, framework to `app/framework/`, bridges to `app/bridges/`. Delete `app/lib/`. *(Pause for review)*
2. **Phase 2 — Frontend refactor** — bun workspaces, four packages, three apps, react-router, lean frontend tests, doc updates. Six sub-steps; pause after Step 4. *(Pause for review)*
3. **Phase 3 — Backend tests trim** — drop framework Catch2 test, drop extra pywinauto tests, doc update.
4. **Phase 4 — WASM retarget** — point `dev-wasm.lua` at `apps/app`, doc update.
5. **Phase 5 — scaffold-bridge update** — rewrite to emit into new C++ + new TS layout, rename to `scaffold-domain`, doc update.

Each phase ends with a green build and the app working. Pause/redirect at any phase boundary. 🔥
