# Frontend Refactor 🏴‍☠️

Reshape the template so a consumer gets an empty slate to build in, a demo to learn from or delete, and a settings app they can keep for free. Reusable components come out of the current single Vite app and into shared packages. Pure C++ domain hoists out of `app/lib/` so it's reusable across projects.

---

## Why this refactor

Today everything lives in one Vite app (`web/apps/main/`) with reusable components buried inside it. C++ domain (`app/lib/todos/`) sits next to template framework code (`app/lib/web-shell/`) and bridge wrappers (`app/lib/bridges/qt/`), all coupled inside `app/`. A consumer wanting to ship their own product has to gut our app and untangle library boundaries that don't exist yet.

Goal: split the structure so the boundaries are real. Three Vite apps for three different stories (playground, reusable settings, blank slate). Workspace packages for everything reusable. Pure C++ domain at the repo root so it can travel.

---

## Required reading

| Doc | Why |
|---|---|
| `app/docs/DelightfulQtWebShell/for-agents/01-08` | Architecture, patterns, gotchas, tools. The `for-agents` docs already catalog the must-preserve patterns this refactor cannot break. |
| Repo Ethos | "Do it right or don't do it." Never destructive git. Own every failure. |
| `working-with-purr` skill | If pairing live with the product owner. |

---

## Patterns this codebase relies on

These are facts about the current code. The refactor must keep all of them working — none are obvious from the new file tree.

- `signalReady()` fires after mount in every app. No call → 15-second loading-overlay timeout shows error.
- `getBridge<T>(...)` is called at module scope with top-level await. Inside a component it creates a new instance on every render and breaks signals.
- Bridges register in BOTH `application.cpp` AND `test_server.cpp`. Forget either, the bridge silently doesn't exist in that environment.
- `QTimer::singleShot(0, ...)` when a bridge method opens a modal. Synchronous open kills the dialog's QWebChannel init.
- Monaco worker setup runs before any editor mount.
- `playwright-cdp` runs under `npx tsx`, NOT `bun`. Bun's WS polyfill kills CDP. The one documented exception to bun-everywhere.
- `assetsInlineLimit: 0` in every `vite.config.ts`. QWebEngine chokes on data: URIs for SVGs under 4KB.
- `qtSyncGuard` flag in the React→Qt theme listener prevents an infinite sync loop.
- localStorage keys are persisted state: `theme-name`, `theme-mode`, `editor-theme-name`, `editor-use-app-theme`, `page-transparency`, `surface-transparency`, current font keys. Renaming or moving any of these wipes user preferences across upgrades.
- `bridges/wasm` library uses `set_kind("object")`, not `static`. Static gets dead-stripped because `main.cpp` doesn't reference the `EMSCRIPTEN_BINDINGS` block.
- `QCommandLineParser::parse()`, never `process()`. `process()` shows an error dialog and exits on unknown flags, killing URL protocol activations.

---

## Pieces of work — overview & dependencies

Four pieces of work. Each can be evaluated independently against its done criteria.

| Work | Independent of | Cleaner if landed after |
|---|---|---|
| C++ layout reshape | everything | — |
| Web layer reshape | C++ at the path level | C++ (so bridge transport TS lands into a stable mental model) |
| Test suite trim | structure-wise from both | C++ and Web (test paths and target apps both move) |
| scaffold-bridge update | — | C++ and Web (it emits into their new layouts) |

**Open: order between the four.** No order has been chosen yet. Each section's "Depends on" notes preferences, not mandates.

---

## C++ layout reshape

### Goal

Pure C++ domain hoists to `<repo>/lib/<domain>/`. Template runtime/framework moves to `<repo>/app/framework/`. Domain bridges move to `<repo>/app/bridges/<domain>/`. `<repo>/app/lib/` ceases to exist.

### Decisions

- Pure C++ domain (no Qt, no Embind, no `web_shell::bridge`) lives at `<repo>/lib/<domain>/`.
- Template runtime — `web_shell::bridge` base, WebShell loader, Qt-side transport adapters, WASM transport wrapper — lives in `<repo>/app/framework/`.
- Domain bridges — classes that extend `web_shell::bridge` and wrap a domain — live in `<repo>/app/bridges/<domain>/`.
- `<repo>/app/lib/` is removed.
- `TodoStore` + DTOs are pure domain. `TodoBridge` is the wrapper. They split.
- `SystemBridge` is Qt-dependent and lives in `<repo>/app/bridges/system/` (Qt-aware code is allowed inside `app/`).
- Tests for pure domain travel with the domain at `<repo>/lib/<domain>/tests/`.

### Open questions

- Internal subfolder layout of `<repo>/app/framework/`. Subdivide by purpose (bridge base, WebShell loader, Qt transport, WASM transport)? Flat? Some other grouping?
- xmake target names inside framework and bridges (`framework-bridge`, `bridge-todos`, etc. — these are unset).
- Where framework-level tests live (e.g., the existing `bridge_channel_adapter_test.cpp` if it survives the test trim).

### Target shape

See Appendix B for the full tree. The relocations table is in Appendix A.

### Done criteria

- `<repo>/lib/todos/` exists with the pure-domain header(s) and tests, compiling without Qt or Embind.
- `<repo>/app/framework/` contains the framework runtime (bridge base, WebShell loader, Qt and WASM transport adapters).
- `<repo>/app/bridges/todos/` and `<repo>/app/bridges/system/` contain their respective bridge classes.
- `<repo>/app/lib/` does not exist.
- Desktop and WASM builds both compile.
- The running desktop app renders correctly (snapshot via playwright-cdp matches the pre-reshape state at the page level).
- Every bridge call still works (verified by interacting with the running app and by the bridge round-trip test).

### Depends on

Nothing.

---

## Web layer reshape

### Goal

Split `<repo>/app/web/` into reusable workspace packages and three Vite apps. Move every reusable component out of the current single app. Wire react-router into every app.

### Decisions

- Three Vite apps: `demo`, `settings`, `app`.
  - `demo` — playground showing every pattern. Renamed from the current `main`.
  - `settings` — thin app composing reusable preferences components. Plausibly embeddable in a real product.
  - `app` — empty slate where the consumer's product goes. Routes set up, one bridge call wired, nothing else.
- Three reusable workspace packages (bun workspaces):
  - shadcn primitives + `cn` helper + `useSidebarSlot`
  - preferences — themes, fonts, theme effects (Tron, Dragon, all themes), `<ThemePicker>`, `<FontPicker>`, `<TransparencySlider>`, `<DarkModeToggle>`, `<AppearancePanel>`
  - monaco editor wrapper + `monaco-theme.ts`
- Folder name is `components`, not `widgets`.
- All themes ship as production. No theme is demo-only.
- Tron and Dragon are production templates. Their assets and theme-effects code live in the preferences package.
- `useSidebarSlot` lives in the shadcn-primitives package. Demo uses it. The empty `app` does not.
- `react-router` (HashRouter) in **every** app, including `app`.
- All bridges register always. Consumer who deletes demo also deletes the matching bridge wiring.
- The C++ `WebDialog` class stays. Demo demonstrates the dialog pattern. The URL it points to is implementation detail.
- npm publishing: never. Workspaces are for dep isolation inside this template.
- `next-themes` is removed (dead per `web/TODO.md`).

### Open questions

- Names of the three workspace packages.
- Where the bridge transport TS files (`bridge.ts`, `bridge-transport.ts`, `wasm-transport.ts`, `system-bridge.ts`, `todo-bridge.ts`) live. Options: 4th workspace package, folded into one of the three packages, a bare shared folder, or somewhere else.
- Default URL the desktop app loads on launch. After the reshape `app://main/` no longer exists. Needs a chosen default.
- `ChatTab` fate. Currently a placeholder demonstrating the `useSidebarSlot` portal pattern.
- WASM artifact destination. `app/xmake/dev-wasm.lua` copies wasm artifacts into `web/apps/main/public/` and runs `bun run dev:main`. After the reshape, neither path exists. Where do the wasm artifacts land and which app does `dev-wasm` start?
- Storybook globals (`web/shared/styles/globals.css`) — landing place.
- Split of the current `web/apps/main/src/App.css` across new homes. The file mixes Tailwind base + theme mapping (shadcn pkg territory), transparency CSS vars (preferences pkg), markdown styles (demo only), theme glow + wallpaper rules (preferences pkg).
- Vite dev ports per app.

### Target shape

See Appendix B for the full tree. Per-package dep allocation in Appendix C.

### Done criteria

- `<repo>/app/web/packages/` contains three workspace packages, each with its own `package.json`.
- `<repo>/app/web/apps/` contains `demo`, `settings`, and `app`.
- `<repo>/app/web/shared/` does not exist.
- Every app uses react-router.
- The desktop app launches and renders the chosen default app.
- A user can navigate between demo, settings, and app from the running desktop app (via menu, sidebar, or whatever mechanism is wired).
- Snapshot via playwright-cdp shows the expected UI in each of the three apps.
- Bridge calls work in each app.
- Storybook still launches and renders components from the shared packages.
- The wasm dev flow still produces a runnable wasm app in the browser.

### Depends on

C++ layout reshape, ideally — so the bridge transport TS files have a stable mental model that mirrors the new C++ layout. Not strictly blocked by it (the TS layer doesn't reference C++ paths), but cleaner if landed second.

---

## Test suite trim

### Goal

Reduce every test suite to 1–3 tests that demonstrate the suite's pattern against the demo. Tests are demonstrations, not coverage.

### Decisions

- 1–3 tests per suite. Each surviving test is recognizably a demonstration.
- Surviving tests target the demo where applicable.
- Test helpers (`native_dialogs.py`, `win32_helpers.py`, conftest fixtures, etc.) stay.
- A native pywinauto test demonstrating the modal-dialog pattern is desirable.

### Open questions

- Which specific Catch2 test stays. Candidates: `todo_store_test`, `bridge_channel_adapter_test`, both, neither, or one written fresh.
- Which specific pywinauto test stays. Candidates: `test_full_dialog_flow`, `test_menu_bar`, `test_window`, `test_keyboard_shortcuts`, or one written fresh.
- Which Bun test stays. Candidates: `bridge_proxy_test`, `type_conversion_test`, or one written fresh against the new layout.
- Which Playwright-browser test stays. Candidate: a single demo-todos flow, or a different pattern.
- Whether Playwright-desktop survives at all.

### Target shape

After the trim, each test suite directory contains 1–3 spec files plus its helpers.

### Done criteria

- Every surviving test runs green standalone.
- The full suite runs faster than today.
- Each surviving test's name and content make obvious what pattern it demonstrates.
- Helpers are intact.

### Depends on

C++ layout reshape (test paths move) and Web layer reshape (target app moves). Cleanest after both.

---

## scaffold-bridge update

### Goal

Update `scaffold-bridge` so that running it generates files into the post-reshape layouts.

### Decisions

- Tool name stays `scaffold-bridge`.
- The tool does **not** write into `<repo>/lib/<domain>/`. That's consumer territory — the consumer maintains their pure-domain libraries however they want. The tool only generates the bridge wrapper inside `<repo>/app/`, the TS interface inside the appropriate package, and updates the wiring (`application.cpp`, `test_server.cpp`, xmake target deps).

### Open questions

- Exact file set the tool emits after C++ + Web reshape (depends on internal layouts of `app/framework/` and the package structure).
- Where the generated TS interface lands (depends on the bridge-transport-TS open question in the web reshape).
- Whether the tool emits any pure-domain placeholder. Options: nothing, a stub inside `app/bridges/<name>/` for the consumer to move out, a comment pointing at where they should add their domain header.

### Target shape

The tool produces the same kinds of artifacts as today (bridge class skeleton, TS interface stub, wiring updates), just at the new paths.

### Done criteria

- Running the tool on a clean tree produces a working bridge that compiles, registers, and is callable from the running app.
- The tool does not write into `<repo>/lib/`.

### Depends on

C++ layout reshape and Web layer reshape both landed.

---

# Appendices

## Appendix A — C++ file relocation map

| Before | After |
|---|---|
| `app/lib/todos/include/todo_store.hpp` | `<repo>/lib/todos/include/todo_store.hpp` |
| `app/lib/todos/include/todo_dtos.hpp` | `<repo>/lib/todos/include/todo_dtos.hpp` |
| `app/lib/todos/include/todo_bridge.hpp` | `<repo>/app/bridges/todos/include/todo_bridge.hpp` |
| `app/lib/todos/tests/unit/todo_store_test.cpp` | `<repo>/lib/todos/tests/unit/todo_store_test.cpp` |
| `app/lib/todos/xmake.lua` | replaced by `<repo>/lib/todos/xmake.lua` (pure C++) and `<repo>/app/bridges/todos/xmake.lua` (bridge wrapper) |
| `app/lib/bridge/include/bridge.hpp` | `<repo>/app/framework/...` (the `web_shell::bridge` base) |
| `app/lib/web-shell/include/web_shell.hpp` | `<repo>/app/framework/...` |
| `app/lib/web-shell/src/web_shell.cpp` | `<repo>/app/framework/...` |
| `app/lib/web-shell/include/bridge_channel_adapter.hpp` | `<repo>/app/framework/...` |
| `app/lib/web-shell/include/expose_as_ws.hpp` | `<repo>/app/framework/...` |
| `app/lib/web-shell/include/json_adapter.hpp` | `<repo>/app/framework/...` |
| `app/lib/web-shell/tests/unit/bridge_channel_adapter_test.cpp` | `<repo>/app/framework/...` (or removed by the test trim) |
| `app/lib/bridges/qt/include/system_bridge.hpp` | `<repo>/app/bridges/system/include/system_bridge.hpp` |
| `app/lib/bridges/qt/include/system_dtos.hpp` | `<repo>/app/bridges/system/include/system_dtos.hpp` |
| `app/lib/bridges/qt/src/bridges.cpp` (MOC anchor) | with the bridge code in `<repo>/app/bridges/system/` |
| `app/lib/bridges/wasm/include/wasm_bridge_wrapper.hpp` | `<repo>/app/framework/...` |
| `app/lib/bridges/wasm/src/wasm_bindings.cpp` | `<repo>/app/framework/...` |
| `app/lib/` (the directory) | removed |

The exact subfolders inside `<repo>/app/framework/` are an open question (see C++ layout reshape).

## Appendix B — Target file tree (post-reshape)

```
<repo>/
├── xmake.lua                          (existing — consumer customization point)
├── lib/                               ← NEW location: pure C++, reusable across projects
│   └── todos/                         todo_store.hpp, todo_dtos.hpp, tests/, xmake.lua
└── app/
    ├── xmake.lua                      template entry (includes updated)
    ├── framework/                     ← NEW: bridge base + WebShell loader + Qt/WASM transports
    │                                  (internal subfolder layout: ❓ open)
    ├── bridges/                       ← NEW
    │   ├── todos/                     TodoBridge (wraps <repo>/lib/todos)
    │   └── system/                    SystemBridge
    ├── desktop/                       unchanged
    ├── wasm/                          unchanged
    ├── tests/                         structure unchanged; contents trimmed
    ├── tools/                         unchanged
    ├── xmake/                         unchanged
    └── web/
        ├── package.json               updated: declares bun workspaces
        ├── tsconfig.json
        ├── .storybook/
        ├── packages/                  ← NEW: bun workspaces (names ❓ open)
        │   ├── ?shadcn-ui/            shadcn primitives + use-sidebar-slot + cn helper + tailwind.css
        │   ├── ?preferences/          themes + fonts + effects (Tron/Dragon) + ThemePicker / FontPicker / TransparencySlider / DarkModeToggle / AppearancePanel
        │   ├── ?monaco/               Monaco wrapper + monaco-theme.ts
        │   └── ❓                     4th package for bridge transport TS — or fold into one of the three?
        └── apps/
            ├── demo/                  renamed from main — the playground
            ├── settings/              ← NEW: thin app composing the preferences package
            └── app/                   ← NEW: empty slate (react + react-router + bridge transport only)
```

## Appendix C — Per-package dependency allocation

Package names are open. The deps are listed by which package's components currently use them in the source.

### shadcn primitives package — current deps used by these components

- `@base-ui/react`
- `@hookform/resolvers`, `react-hook-form`, `zod` (used by the form primitive)
- `@radix-ui/react-select`, `radix-ui` (the bundle)
- `class-variance-authority`, `clsx`, `tailwind-merge` (the `cn` helper + variant tooling)
- `cmdk` (command/combobox)
- `date-fns`, `react-day-picker` (calendar)
- `embla-carousel-react` (carousel)
- `input-otp`
- `lucide-react` (icons)
- `react-resizable-panels` (resizable)
- `recharts` (chart primitive)
- `sonner` (toaster)
- `vaul` (drawer)

### Preferences package

- Depends on the shadcn-primitives package and the bridge transport TS.
- No additional runtime deps beyond what the components import from the above.

### Monaco package

- `@monaco-editor/react`
- `monaco-editor`
- `monaco-vim`
- Depends on the preferences package for monaco-theme integration.

### Per-app deps

| App | Direct deps |
|---|---|
| `demo` | `react`, `react-dom`, `react-router`, `react-markdown`, `remark-gfm`, all three shared packages, bridge transport TS |
| `settings` | `react`, `react-dom`, `react-router`, shadcn-primitives package, preferences package, bridge transport TS |
| `app` | `react`, `react-dom`, `react-router`, bridge transport TS |

### Root devDeps

Stay at `<repo>/app/web/package.json`:

- `@storybook/addon-a11y`, `@storybook/addon-docs`, `@storybook/react-vite`
- `@tailwindcss/vite`
- `@types/react`, `@types/react-dom`
- `@vitejs/plugin-react`
- `storybook`
- `tailwindcss`
- `typescript`
- `vite`

### Removed

`next-themes` — dead per `app/web/TODO.md`.
