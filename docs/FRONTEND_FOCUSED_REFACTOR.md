# Frontend-Focused Refactor 🏴‍☠️

A plan to reshape `app/web/` so that someone taking this template gets an empty slate to build in, a demo to learn from (or delete), and a settings app they can keep for free.

The C++ side is **out of scope** for this doc — `app/lib/` → `<root>/lib/` + `app/framework/` + `app/bridges/` is a separate refactor.

---

## Before you start

You're about to refactor a working template. Read these first or you'll break things you don't know exist.

### Required reading

| Doc | Why |
|---|---|
| `app/docs/DelightfulQtWebShell/for-agents/01-08` | Architecture, patterns, gotchas, tools. All of them. |
| Repo Ethos (start-of-session prompt) | "Do it right or don't do it." Never destructive git. Own every failure. |
| `working-with-purr` skill | If pairing live with the product owner. |

### Patterns this refactor MUST preserve

If you break any of these, the app silently breaks. None are obvious from the new file tree.

1. **`signalReady()` fires after mount in *every* app.** No call → 15s loading-overlay timeout shows error. Move it, never delete it.
2. **`getBridge<T>(...)` lives at module scope with top-level await.** Inside a component → new instance every render → broken signals. Top of file, before the component, period.
3. **Bridges register in BOTH `application.cpp` AND `test_server.cpp`.** Forget either → bridge silently doesn't exist in that environment.
4. **`QTimer::singleShot(0, ...)` when a bridge method opens a modal.** Synchronous open → dialog's QWebChannel can't init → loading overlay forever. See `main_window.cpp` for the pattern.
5. **Monaco worker setup precedes any editor mount.** `self.MonacoEnvironment = { getWorker: ... }` must run before any `<MonacoEditor>` instantiates. Currently in `main.tsx` lines 14-18.
6. **`playwright-cdp` runs under `npx tsx`, NOT `bun`.** Bun's WS polyfill kills CDP. Documented exception to the bun-everywhere rule.
7. **`assetsInlineLimit: 0` in every `vite.config.ts`.** QWebEngine chokes on data: URIs for SVGs < 4KB.
8. **`qtSyncGuard` flag in the React→Qt theme listener.** Without it: React sets theme → Qt emits → React sets → infinite loop. Currently lines 31-67 of `App.tsx`.
9. **localStorage keys are persisted state.** Renaming or moving any of these wipes user preferences across upgrades:
   - `theme-name`, `theme-mode`, `editor-theme-name`, `editor-use-app-theme`
   - `page-transparency`, `surface-transparency`
   - `font-family-app`, `font-family-editor` (whatever the current keys are — preserve verbatim)

### Commit cadence + pause points

- **One commit per step.** Six steps → six commits, each with the verify-gate as the body.
- **Pause for human review after Step 1, Step 4.** These are the structural shifts; the others are mechanical.
- **Steam through 2, 3, 5, 6** unless something breaks.
- **Branch:** stays on `template`. The whole template is the deliverable.

### Ask before you do these

- Run `xmake run test-all` (takes the desktop for ~30s)
- Run `xmake run test-pywinauto` or `xmake run test-desktop` (ditto)
- Delete `app/web/shared/` (single biggest destructive move — happens at the end of Step 1 once everything's been moved out)
- Rename or remove any of the localStorage keys listed above
- Change the default URL on app launch (Step 4 changes it from `app://main/` → `app://app/` — this *is* the change, just confirm before flipping)

### Verify with eyes, not just builds

A green `xmake build desktop` means it compiled. It does not mean the app works. After every step:

```bash
xmake run start-desktop                       # background launch, CDP on :9222
echo 'console.log(await snapshot())' \
  | npx tsx tools/playwright-cdp/run.ts       # see what's actually rendered
echo 'console.log(await screenshot("verify.png"))' \
  | npx tsx tools/playwright-cdp/run.ts       # capture the web view
xmake run stop-desktop
```

Read `for-agents/05-tools.md` if any of that is unfamiliar.

---

## Why

Today everything lives in one Vite app (`web/apps/main/`) with components buried in `apps/main/src/`. Consumers have to gut our app to ship theirs. Components that should be reusable aren't, because they were written inside the demo.

Goal: split the web layer so consumers see three distinct things:

1. **`demo`** — playground showing every pattern the template supports. Delete it on day one if you want.
2. **`settings`** — a thin app composing reusable components. Plausibly embeddable into a real product as a free preferences UI.
3. **`app`** — the empty slate where the consumer's product goes. Routes set up, one bridge call wired, nothing else.

Components partition by reuse:
- **Reusable** → workspace package
- **Demo-only forever** → stays inside `web/apps/demo/`

Settings is a thin shell over shared components. If a component is good enough to power the settings app, it's good enough to be a package.

---

## Decisions

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

---

## Target shape

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
│                                          (relocates next to its C++ in the C++ refactor)
└── apps/
    ├── demo/
    ├── settings/
    └── app/
```

`app/` is the empty slate. It depends only on `react`, `react-dom`, `react-router`, `@template/bridges`. No `@template/ui`. No theme system. No fonts beyond the browser default.

---

## Steps

### Step 1 — Bun workspaces scaffolding

**1a. Workspace root**
- Edit `app/web/package.json`: add `"workspaces": ["packages/*", "apps/*"]`. Keep root deps to dev tooling only (typescript, vite, tailwindcss, storybook). Move all runtime deps to per-package or per-app `package.json`s per **Appendix A**.
- Create empty `package.json`s in `web/packages/{ui,preferences,editor,bridges}/` per Appendix A.

**1b. Move files**
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
| `web/shared/lib/utils.ts` | `@template/ui/src/lib/` (shadcn's `cn()` helper — UI-internal) |

**1c. CSS split** — `web/apps/main/src/App.css` is mixed concerns. Split it:
| Chunk | New home |
|---|---|
| `@import "tailwindcss"` + `@source` + `@theme inline` block + `body { … }` | `@template/ui/src/styles/tailwind.css` |
| `:root { --page-opacity: 1; --surface-opacity: 1 }` + `.bg-page` utility | `@template/preferences/src/styles/transparency.css` |
| `.markdown-body` block (DocsTab) | `web/apps/demo/src/App.css` (still demo-local) |
| `.theme-glow` + wallpaper `html:has(...)` rule | `@template/preferences/src/styles/effects.css` |

`web/shared/styles/globals.css` is the Storybook-only global — moves to `.storybook/globals.css` (since it imports `theme.css` for Storybook's preview iframe).

**1d. Update imports inside `web/apps/main/`**
- `@shared/components/ui/*` → `@template/ui`
- `@shared/api/*` → `@template/bridges`
- `@shared/lib/themes`, `fonts`, `tron-grid`, `monaco-theme` → `@template/preferences/lib/*` (or `@template/editor/lib/monaco-theme`)
- `@shared/data/*` → `@template/preferences/data/*`
- `@/hooks/use-sidebar-slot` → `@template/ui/hooks/use-sidebar-slot`

**1e. Storybook**
- Update `.storybook/main.ts` story glob to `web/packages/*/src/**/*.stories.tsx`
- Update `.storybook/preview.ts` global CSS imports to point at `@template/ui` + `@template/preferences` styles
- The Theme/Font addon panels in `.storybook/manager.tsx` still work — they read from the same data files, just at new paths

**1f. Cleanup**
- Run `bun install` at `app/web/` (resolves workspaces)
- Delete `web/shared/` (it's empty now)
- Delete `next-themes` from any `package.json` (dead dep per `web/TODO.md`)

**1g. Vite config update**
- `web/apps/main/vite.config.ts` — drop the `@shared` alias, keep `@` alias to `./src`. `@template/*` resolves via Bun workspaces, no Vite alias needed.

**Verify:**
```bash
cd app
xmake build desktop && xmake run start-desktop
echo 'console.log(await snapshot())' | npx tsx tools/playwright-cdp/run.ts
# every tab should still load; theme picker still works; bridge calls still work
xmake run stop-desktop
xmake run test-bun         # bridge round trips still pass
```
Commit: `🧱 Step 1: bun workspaces — packages extracted from shared/`

---

### Step 2 — Extract preferences UI components

`SettingsTab.tsx` currently inlines the theme picker, font pickers, transparency sliders, and dark-mode toggle. Pull each one out.

- `<ThemePicker/>` — searchable list w/ color preview dots. Reads from `@template/preferences/data`. Calls `applyTheme(...)`. Pushes to Qt via `@template/bridges` `getSystemBridge().setQtTheme(...)`. Exposes `value` + `onChange` props plus an internal default.
- `<FontPicker target="app" | "editor"/>` — one component, two instances. Reads from `google-fonts.json`. Persists to localStorage (preserve key names from **Before you start**).
- `<TransparencySlider target="page" | "surface"/>` — one component, two instances. Writes `--page-opacity` / `--surface-opacity` on `:root`.
- `<DarkModeToggle/>` — handles `setDarkMode()` + Qt sync, with the `qtSyncGuard` pattern preserved.
- `<AppearancePanel/>` — composite of the four above. The "give me everything" component. This is what the `settings` app's `/appearance` route renders.

Each gets a `.stories.tsx` next to it in Storybook.

**Verify:**
```bash
xmake build desktop && xmake run start-desktop
# SettingsTab in main app now renders <AppearancePanel/> — visually identical
echo 'await screenshot("settings-after.png")' | npx tsx tools/playwright-cdp/run.ts
xmake run stop-desktop
bun run typecheck
bun run storybook   # verify each component in isolation
```
Commit: `🎨 Step 2: extract preferences components`

---

### Step 3 — `react-router` migration in `web/apps/main/`

Add `react-router` to `apps/main/package.json` (~v6 latest).

**`main.tsx` simplification.** Remove the hash-based `Root = route === '#/dialog' ? DialogView : App` branch. Always render `<App/>`.

**`App.tsx` rewrite to use `<HashRouter>`:**
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

- Sidebar uses `<NavLink to="/editor">` etc. instead of `setCurrentTab`.
- `document.title` updates per route via a `useEffect` keyed on `useLocation()`.
- The `/dialog` route renders `<DialogRoute/>` (renamed from `DialogView`) and is *outside* the sidebar layout (no shell chrome).
- `app://main/#/dialog` continues to work (HashRouter reads the hash).

**Verify:**
```bash
xmake build desktop && xmake run start-desktop
# every tab navigates; URL hash updates per tab
echo 'await snapshot()' | npx tsx tools/playwright-cdp/run.ts
echo 'console.log(await eval_js("window.location.hash"))' | npx tsx tools/playwright-cdp/run.ts
# also verify /dialog still loads by navigating manually
xmake run stop-desktop
```
Commit: `🧭 Step 3: react-router migration`

---

### Step 4 — Carve `main` into `demo` + `settings` + `app`

This is the big structural step. Three sub-steps to keep verifiable.

**4a. Rename `main` → `demo`**
- `mv web/apps/main web/apps/demo`
- Update `web/package.json` scripts: `dev:main` → `dev:demo`, `build:main` → `build:demo`, etc.
- Update `app/desktop/xmake.lua`: `WEB_APPS = {"main"}` → `WEB_APPS = {"demo"}` (more added in 4d)
- Update `app/desktop/src/widgets/scheme_handler.cpp`: route `app://main/` → `app://demo/`
- Update `app/desktop/src/application.cpp`: `appUrl("main")` → `appUrl("demo")` (changes again in 4d)
- Update `playwright.config.ts`, `.env.example`, `index.html` `<title>` (still uses `%VITE_APP_NAME%`), `vite-env.d.ts`
- Verify: `xmake build desktop && xmake run desktop` opens demo at `app://demo/`. Identical behavior to before.

**4b. Create `settings` app**
- Copy the per-app skeleton from **Appendix C** to `web/apps/settings/`.
- `package.json` depends on `@template/ui`, `@template/preferences`, `@template/bridges`.
- `main.tsx` does the bootstrap blocks listed for `settings` in **Appendix B**.
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
- `routes/AppearanceRoute.tsx` → `<ThemePicker/>` + `<DarkModeToggle/>`
- `routes/FontsRoute.tsx` → `<FontPicker target="app"/>` + `<FontPicker target="editor"/>`
- `routes/TransparencyRoute.tsx` → `<TransparencySlider target="page"/>` + `<TransparencySlider target="surface"/>`

**4c. Create `app` (empty slate)**
- Copy per-app skeleton from **Appendix C** to `web/apps/app/`.
- `package.json` depends on `react`, `react-dom`, `react-router`, `@template/bridges` only.
- `main.tsx` does only what's listed for `app` in **Appendix B**: bridges-ready check + render. No theme system, no fonts, no Monaco.
- `App.tsx`:
  ```tsx
  <HashRouter>
    <Routes>
      <Route path="/" element={<HomeRoute />} />
    </Routes>
  </HashRouter>
  ```
- `HomeRoute.tsx`:
  ```tsx
  export default function HomeRoute() {
    const [theme, setTheme] = useState<unknown>(null)
    useEffect(() => {
      getSystemBridge().then(s => s.getQtTheme()).then(setTheme)
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
- `signalReady()` must still fire after mount.

**4d. Wire all three apps into the desktop shell**
- `app/desktop/xmake.lua`: `WEB_APPS = {"demo", "settings", "app"}`
- `app/desktop/src/widgets/scheme_handler.cpp`: register all three hosts. `app://demo/`, `app://settings/`, `app://app/`.
- `app/desktop/src/application.cpp`: change default `appUrl("demo")` → `appUrl("app")`.
- `app/desktop/src/menus/menu_bar.cpp`: add menu entries
  - `Tools → Open Demo` → loads `app://demo/` in current window
  - `Tools → Open Settings` → loads `app://settings/` in current window
  - `Tools → Open App` → loads `app://app/` in current window (so users can get back)
- `web/package.json` scripts: add `dev:settings`, `build:settings`, `dev:app`, `build:app`.

**Verify:**
```bash
xmake build desktop && xmake run start-desktop
# default URL is app://app/ — empty slate with bridge call result
echo 'console.log(await snapshot())' | npx tsx tools/playwright-cdp/run.ts
echo 'console.log(await eval_js("location.href"))' | npx tsx tools/playwright-cdp/run.ts
# Use Tools menu to navigate to demo and settings; verify each renders
xmake run stop-desktop
xmake run test-bun
```
Commit: `🪓 Step 4: split main → demo + settings + app`

---

### Step 5 — Trim the test suite

**Delete:**
- All Playwright-desktop tests (Playwright-browser + pywinauto cover the matrix)
- All Bun tests in `lib/web-shell/tests/web/` except one round trip
- All Playwright-browser tests in `tests/playwright/` except one demo flow
- All extra pywinauto tests (one native flow stays — backend scope, not this doc)

**Keep:**
- `tests/playwright/demo-todos.spec.ts` (rename) — open `app://demo/`, navigate to todos route, add a todo, see it appear
- `lib/web-shell/tests/web/bridge-roundtrip.test.ts` (rename) — one bridge call round trip via WebSocket against the real `dev-server`

**Keep helpers untouched:**
- `tests/pywinauto/native_dialogs.py`
- `tests/pywinauto/win32_helpers.py`
- `tests/pywinauto/conftest.py`

Update `xmake.lua` test target wiring if test file paths changed.

**Verify:**
```bash
xmake run test-bun       # green in <1s
xmake run test-browser   # green in <10s
```
Commit: `🧪 Step 5: trim frontend tests to demonstration set`

---

### Step 6 — Frontend doc updates

Rewrite the relevant for-agents docs to match the new layout:

- `for-agents/01-getting-started.md` — project layout section, `xmake run dev-web` → which app to open (`bun run dev:demo` etc.)
- `for-agents/02-architecture.md` — multi-app section needs the new package + app structure; bridge proxy section unchanged
- `for-agents/03-adding-features.md` — "adding a new web app" recipe needs updating; "scaffold-bridge" callouts unchanged for now
- `for-agents/06-gotchas.md` — `assetsInlineLimit: 0` per app; bun workspaces gotchas
- `for-agents/08-theming.md` — paths inside `@template/preferences` instead of `web/shared/`

For-humans docs: same updates, lighter tone.

**Verify:** read each doc top to bottom against the new tree. Every `web/shared/` path mentioned in docs is updated. Every `web/apps/main/` reference is updated.

Commit: `📚 Step 6: docs reflect new web layout`

---

## Out of scope

- **C++ layout shift** — `<root>/lib/` for pure domain, `app/framework/`, `app/bridges/`. Has its own doc.
- **`scaffold-bridge` tool update** — needs to know about the new `lib/` + `app/bridges/` split. Lands after the C++ refactor.
- **Backend tests** — Catch2 + pywinauto trim is its own pass.
- **Wasm app re-targeting** — currently the wasm build targets `apps/main`. Will need to point at one of the three new apps (probably `app`). Touches `wasm/CMakeLists.txt`/xmake equivalents and `dev-wasm.lua`. Belongs in a follow-up wasm-pass doc.

---

# Appendices

## Appendix A — Per-package dependency allocation

Move these from the current root `app/web/package.json` to the locations below.

### `@template/ui` — shadcn primitives + cn helper + sidebar slot

```jsonc
// web/packages/ui/package.json
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

### `@template/preferences` — themes + fonts + appearance UI

```jsonc
// web/packages/preferences/package.json
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

### `@template/editor` — Monaco wrapper

```jsonc
// web/packages/editor/package.json
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

### `@template/bridges` — TS transport + bridge interfaces

```jsonc
// web/packages/bridges/package.json
{
  "name": "@template/bridges",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {}
}
```

(No runtime deps; pure TS that talks to native QWebChannel / WS / Embind through globals provided by the host.)

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

- `next-themes` — dead dep (per `web/TODO.md`).

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

Every app under `web/apps/<name>/` gets these files. Replace `<NAME>` with the app name throughout.

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
  "dependencies": {
    /* see Appendix A — per-app deps */
  }
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
    assetsInlineLimit: 0,  // QWebEngine chokes on data: URIs
  },
  server: { port: <UNIQUE_PORT> },  // demo: 5173, settings: 5174, app: 5175
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
```

### `web/apps/<NAME>/tsconfig.json` + `tsconfig.app.json`

Mirror the existing `web/apps/main/` files; no per-app divergence needed beyond the path. The root `web/tsconfig.json` is the shared base.

### `web/apps/<NAME>/.env.example`

```
VITE_APP_NAME=<your app name>
```

### `web/apps/<NAME>/src/vite-env.d.ts`

```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_APP_NAME: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

### `web/apps/<NAME>/src/App.css`

For `demo` and `settings`:
```css
@import "@template/ui/styles/tailwind.css";
@import "@template/preferences/styles/transparency.css";
@import "@template/preferences/styles/effects.css";
/* demo only: @template/preferences glow + wallpaper rules already imported above */
```

For `app`:
```css
/* No theme system. Add your own styles here. */
```

(`demo` adds its own `.markdown-body` block on top — DocsTab-specific.)

### `VITE_APP_NAME` propagation

Already wired by xmake (`app/xmake/dev.lua`, `app/xmake/dev-wasm.lua`, `app/desktop/xmake.lua`) and CI (`.github/workflows/{ci,release}.yml`). Each new app's `index.html` uses `%VITE_APP_NAME%` placeholder; Vite substitutes at build time. No new wiring needed beyond the per-app files above.

---

## Appendix D — Files removed from `app/web/` after the refactor

After Step 1 lands cleanly, `web/shared/` is empty and gets deleted. Specifically:

- `web/shared/api/` (5 files) → `@template/bridges`
- `web/shared/components/ui/` (~50 files) → `@template/ui`
- `web/shared/data/` (themes + fonts) → `@template/preferences`
- `web/shared/lib/` (5 files) → split between `@template/preferences` (themes, fonts, tron-grid, theme-effects) and `@template/editor` (monaco-theme) and `@template/ui` (utils)
- `web/shared/styles/` (2 files) → `@template/ui/src/styles/tailwind.css` + `.storybook/globals.css`
- `web/shared/hooks/` (if any) → `@template/ui/src/hooks/`

After Step 4 lands cleanly, `web/apps/main/` is renamed to `web/apps/demo/`. The original `main` directory no longer exists.

---

## Order of operations summary

1. **Bun workspaces scaffolding** — move files into packages, delete `shared/`, update imports, drop `next-themes` (pause for review)
2. **Extract preferences UI components** — `<ThemePicker>` + `<FontPicker>` + `<TransparencySlider>` + `<DarkModeToggle>` + `<AppearancePanel>` (steam through)
3. **`react-router` migration in `apps/main/`** — replace hand-rolled hash check with `<HashRouter>` (steam through)
4. **Carve `main` → `demo` + `settings` + `app`** — three apps, default URL to `app://app/`, menu entries to navigate (pause for review)
5. **Trim frontend tests** — one Bun + one Playwright-browser (steam through)
6. **Update for-agents + for-humans docs** — paths and structure (steam through)

Each step ends with a green build and the app working. Pause/redirect at any boundary. 🔥
