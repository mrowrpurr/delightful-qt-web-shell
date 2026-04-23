# 🏴‍☠️ Phase 2 Kickoff — Sidebar Replaces Top Tabs

You're the agent picking up Phase 2. Phase 1 is landed (commit `cfc2487`). Read this start to finish before running anything.

---

## Who's who

- **You** — the agent executing Phase 2.
- **Purr** (Mrowr Purr, M.P.) — the human. Lead on all decisions. Direct. Match her energy. Use emoji. Never say "the user."
- **The coordinator agent** (Claude Opus 4.7) — tracks the plan across phases. Interface is `NOTES.md` and git history.

## Read these before you touch code

1. **`app/Ethos.md`** — non-negotiable. Especially the "Own every failure" and "Never declare success without proof" rules.
2. **`app/web/PHASE_1.md`** — the shared backstory (why this effort exists, the 7 locked decisions). Don't re-read the Phase 1 playbook, but do read the preamble.
3. **`app/web/NOTES.md`** — live working doc. The "Phase 1 findings" section is critical context for what you're walking into.
4. **`app/web/COMPONENT_AUDIT.md`** and **`app/web/THEME_AUDIT.md`** — audits that drove this plan.
5. **`app/docs/DelightfulQtWebShell/for-agents/`** — the project-wide guide if you need architecture, testing, or tools info.

---

## What Phase 1 gave you

From `cfc2487`:

- **~53 shadcn components installed** in `app/web/shared/components/ui/` — including `sidebar.tsx`, `separator.tsx`, `tabs.tsx` (the Radix version, overwrote the old custom one).
- **`applyTheme()` now emits all 31 theme vars** — `--sidebar-*` and `--chart-*` land on `:root` with every theme switch.
- **No var-name rename needed.** Phase 1 confirmed `shared/components/ui/sidebar.tsx` expects `--sidebar` (not `--sidebar-background`) — matches `themes.json` already.
- **`globals.css` has a shadcn-added block** (`@custom-variant dark`, `:root { --sidebar: ... }`, `@theme inline { --color-sidebar: var(--sidebar); ... }`). **Do not delete it.** It's what makes `bg-sidebar` Tailwind utilities resolve. Our runtime `<style>` tag from `applyTheme()` overrides these defaults when a theme is picked — no conflict.
- **Workspace layout changed:** `app/package.json` now declares `"workspaces": ["web"]`. Run `bun install` from `app/` root, not from `app/web/`. `app/web/bun.lock` is gone; root lockfile is authoritative.
- **`test-browser` is red (6/6 fail)** from Phase 1 — "tab buttons not found." This is expected: Phase 2 rewrites this UI. The tests will need rewriting. **This is your problem to land green by the end of Phase 2.**

---

## Phase 2 goal

Replace the top tab bar in `App.tsx` with a **left-side `Sidebar`**. Same navigation, different shape. All existing tabs become sidebar items. Add one new sidebar item — **`🧩 Components`** — with a skeleton page (Phase 3 fills it in). URL hash routing and `document.title` behavior must keep working.

Visible change, substantial QA surface.

---

## The 7 locked decisions (don't relitigate)

Verbatim from `NOTES.md`. You don't need to re-read, just don't drift:

1. shadcn-first for every primitive.
2. Left-side `Sidebar` replaces the top `TabsList`.
3. All 31 theme vars consumed somewhere real.
4. `shared/components/ui/` holds the full catalog; feature code imports from there.
5. Typed bridge helpers only (`getSystemBridge()`), no `getBridge<T>('name')` magic strings.
6. Full shadcn catalog installed (done in Phase 1).
7. In-app `🧩 Components` page as a sidebar item — skeleton added in Phase 2, filled in Phase 3.

---

## Phase 2 — Execution playbook

### Step 0 — Baseline

```bash
# Pull latest template branch, verify clean tree
git pull origin template
git status

# Install deps (root workspace now — see Phase 1 findings)
cd app
bun install

# Baseline tests
xmake run test-todo-store
xmake run test-bun

# test-browser is already red from Phase 1 — record that, don't try to fix it yet
xmake run test-browser  # expect 6/6 fail — that's pre-existing
```

**Do NOT** run `test-all`, `test-pywinauto`, or `test-desktop` without asking Purr first — those take over her desktop.

Launch the app, screenshot each current tab against a distinctive theme (e.g. "Mrowr Purr - Tron") for a visual diff reference later. Save to something like `phase-2-before-*.png`. Use headless playwright-cdp (see `docs/DelightfulQtWebShell/for-agents/05-tools.md`).

### Step 1 — Wire the Sidebar in `App.tsx`

Current shape in `web/apps/main/src/App.tsx`:
- Uses the (now Radix) `Tabs` primitive at the top.
- `TabsList` with 6 `TabsTrigger` items: Docs, Editor, Todos, Files, System, Settings.
- `TabsContent` for each.
- `currentTab` state + `useEffect` that sets `document.title` and `window.location.hash`.

Replace the top `TabsList` with a `Sidebar` from `@shared/components/ui/sidebar`. Tabs content stays the same — only the *navigation chrome* changes.

**Sidebar structure** (pseudo-shape — check the actual shadcn API in `shared/components/ui/sidebar.tsx`):

```
<SidebarProvider>
  <Sidebar>
    <SidebarHeader>  ← app name + maybe icon
    <SidebarContent>
      <SidebarMenu>
        <SidebarMenuItem>  ← one per current tab + Components
      </SidebarMenu>
    </SidebarContent>
    <SidebarFooter>  ← optional — dark/light toggle could live here
  </Sidebar>
  <SidebarInset>  ← main content area where TabsContent renders
</SidebarProvider>
```

Items (order):
- 📖 Docs (`docs`)
- ✏️ Editor (`editor`)
- ✅ Todos (`todos`)
- 📂 Files (`files`)
- ⚙️ System (`system`)
- 🎨 Settings (`settings`)
- 🧩 Components (`components`) ← **new**

### Step 2 — Preserve URL hash routing

App.tsx currently initializes `currentTab` from `window.location.hash` and writes back on change:

```typescript
const [currentTab, setCurrentTab] = useState(() => {
  const hash = window.location.hash.replace(/^#/, '')
  return hash && hash in TAB_TITLES ? hash : 'docs'
})

useEffect(() => {
  document.title = TAB_TITLES[currentTab] ?? ...
  window.location.hash = currentTab
}, [currentTab])
```

**Keep this exact pattern.** The Qt shell saves/restores the URL hash across sessions, and `document.title` drives the dock widget tab label via the web engine's `titleChanged` signal. Add a `components` entry to `TAB_TITLES` for the new item.

### Step 3 — Delete the obsolete custom Tabs file

Phase 1 overwrote `shared/components/ui/tabs.tsx` with the Radix version (verify via `git show cfc2487 -- app/web/shared/components/ui/tabs.tsx`).

If any *in-page* tab usage exists (e.g. grouped sections inside Settings — doesn't today, but could tomorrow), it'll Just Work with the Radix API. The outer app-level tabs are going away entirely, replaced by the Sidebar.

**Don't delete the file** — it's the Radix `Tabs` now, and Phase 3 may use it for grouped sections. Just stop using it for top-level nav in `App.tsx`.

### Step 4 — Skeleton Components page

New file: `web/apps/main/src/tabs/ComponentsTab.tsx`. Minimum viable:

```
<h2>Components</h2>
<p>Every installed shadcn primitive, live against the current theme.
   Populated in Phase 3.</p>
```

That's it. Phase 3 fills it in. Just ship a stub so the sidebar item routes to *something*.

### Step 5 — Theme-drive the Sidebar visibly

The whole point: theme switches should visibly change the sidebar chrome. After wiring, verify in DevTools:

1. Open the app, open DevTools, inspect `:root`.
2. Change a theme in Settings.
3. Confirm `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-accent`, `--sidebar-border`, `--sidebar-ring` all change.
4. Confirm the sidebar *visibly* changes — background, text, selected-item highlight, border.

If a theme change updates `:root` but the sidebar doesn't move visually, the sidebar.tsx Tailwind classes aren't consuming the tokens correctly — fix the classes or the var-name mapping, don't paper it over.

### Step 6 — Lucide-react version check

Phase 1 noted `lucide-react` may be on an old `^1.8.0` line (modern releases are `0.5xx.0`). Sidebar almost certainly imports lucide icons. If they don't render or look wrong, fix the version:

```bash
cd app
bun remove lucide-react
bun add lucide-react@latest
```

### Step 7 — Fix (or rewrite) `test-browser`

The 6 Playwright browser tests in `app/tests/playwright/` look for top-tab buttons that no longer exist. Either:
- Update the selectors to match sidebar items, OR
- Rewrite the specs entirely if the test intent is now different.

**`test-browser` must be green by Phase 2 exit.** Don't leave broken tests behind.

### Step 8 — Qt dock widget / window title

The Qt side uses the web engine's `titleChanged` signal to update the dock tab label. As long as `document.title = TAB_TITLES[currentTab]` still runs on navigation, this works. Sanity-check by launching the desktop app and clicking through sidebar items — the window title should update.

### Step 9 — Update `NOTES.md`, commit, push

1. Check off Phase 2 items in the Phases section + Bucket 1 sidebar/tabs items.
2. Add a "Phase 2 findings" section to NOTES.md (structure like "Phase 1 findings"). Anything worth knowing for Phase 3 goes here.
3. Single commit. Emoji-prefixed title: e.g. `🏴‍☠️ Phase 2: Sidebar replaces top tabs, Components skeleton added`.
4. Push to `origin/template`.
5. Tell Purr: "Phase 2 done, ready for review."

---

## Phase 2 exit criteria

All must be true:

- [ ] Left-side Sidebar renders in `App.tsx` — no top tab bar.
- [ ] Seven sidebar items: 📖 Docs, ✏️ Editor, ✅ Todos, 📂 Files, ⚙️ System, 🎨 Settings, 🧩 Components.
- [ ] Clicking each item navigates to the corresponding tab content.
- [ ] URL hash updates (e.g. `#editor` when Editor is selected).
- [ ] `document.title` updates on navigation (check the Qt window title).
- [ ] Theme switches visibly change sidebar chrome colors.
- [ ] `🧩 Components` item routes to a skeleton page (not a 404).
- [ ] `xmake run test-todo-store` ✅
- [ ] `xmake run test-bun` ✅
- [ ] `xmake run test-browser` ✅ (was red from Phase 1 — must be green now)
- [ ] `bun run build` inside `web/` ✅ (no TS errors)
- [ ] `NOTES.md` has a "Phase 2 findings" section for Phase 3.

---

## Out of Phase 2 scope (do NOT touch)

- **No primitive swaps.** ThemePicker, FontPicker, inline Toggles, bare `<input>`s all stay hand-rolled. That's Phase 3.
- **No bridge helpers.** `getSystemBridge()` / magic-string cleanup is Phase 3.
- **No Components page content.** Skeleton only.
- **No Chart demo.** Phase 4.
- **No C++ / Qt / WASM changes.** Web only.
- **No `@theme` block merging or `App.css` hardcode cleanup.** Phase 5.
- **Don't delete the shadcn-added `globals.css` block** (`@custom-variant dark`, default `--sidebar: ...`, `@theme inline { ... }`) — Phase 1 notes explain why.

---

## Watch-outs

- **The `SidebarProvider` wraps the whole layout.** It owns state like open/collapsed. Make sure the provider is at the right level — probably right inside `<StrictMode>` in `main.tsx` or at the top of `App`. Check shadcn docs for the pattern.
- **Hash routing collision.** If the sidebar's open/collapsed state is stored in localStorage by shadcn, fine. If it tries to use the URL, make sure it doesn't clobber `window.location.hash` which we use for tab state.
- **Mobile / narrow width.** shadcn Sidebar collapses on mobile by default. Make sure the default desktop experience is expanded. The app ships as a desktop (Qt) shell, so the "mobile" case is the WASM/browser mode when the window is narrow — decide if we collapse or not.
- **Lucide icons.** If they look weird or broken, fix the version (Step 6). Don't leave wonky icons.
- **`SystemTab` crashes in WASM mode.** Phase 1 didn't touch this. Not your problem in Phase 2 either, but if you see it while testing, note it in findings.

---

## Guardrails (Ethos)

- Run the tests *before* you write a line. Red baselines that were red in Phase 1 are still red in Phase 1's exit state — known, but not yours to ignore. `test-browser` is explicitly yours to turn green.
- Fix root causes. If a sidebar click doesn't update the tab, don't wrap it in a timeout. Find why.
- Own every failure. If you break something that was green, it's yours.
- Never destructive git. No `git reset --hard`, no `git checkout .`. Another session may have work in the tree.
- No `// TODO` comments in code. Put those in NOTES.md.

---

## If you get stuck

- **shadcn Sidebar API**: read `shared/components/ui/sidebar.tsx` directly. It's ~724 lines with comments. The exports tell you the shape.
- **URL hash / document.title**: existing pattern in `App.tsx` is the spec. Don't reinvent.
- **Playwright browser tests**: `tests/playwright/` directory. Selectors probably need updating to `data-testid` attributes you add to sidebar items.
- **Qt window title**: see `docs/DelightfulQtWebShell/for-agents/07-desktop-capabilities.md` Tabs section.
- **Anything feels off**: stop, flag Purr in a short message. Don't paper over it.

🏴‍☠️
