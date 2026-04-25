# 🏴‍☠️ Phase 3 Kickoff — Primitive Swaps + Typed Bridge Helpers

You're the agent picking up Phase 3. Phases 1 and 2 are landed. Read this start to finish before running anything.

This is **the biggest phase**. The drift loop dies here — after Phase 3 the next agent reading this codebase sees `Combobox` from `@shared/components/ui/` and `getTodoBridge()` from a typed helper, and the wrong pattern is no longer in front of them to copy. That's the whole point.

---

## Who's who

- **You** — the agent executing Phase 3.
- **Purr** (Mrowr Purr, M.P.) — the human. Lead on all decisions. Direct. Match her energy. Use emoji. Never say "the user."
- **The coordinator agent** (Claude Opus 4.7) — tracks the plan across phases. Interface is `NOTES.md`, `TODO.md`, and git history.

## Read these before you touch code

1. **`app/Ethos.md`** — non-negotiable. Especially "Own every failure," "Fix root causes not symptoms," "Never declare success without proof."
2. **`app/web/PHASE_1.md`** preamble — the shared backstory (drift loop, dead theme vocabulary, the 7 locked decisions). Skip the playbook.
3. **`app/web/PHASE_2.md`** preamble — what Phase 2 inherited and what it shipped. Same — skip the playbook.
4. **`app/web/NOTES.md`** — live working doc. The "Decisions locked in," "TODO — Bucket 1/2/3," and "Running observations" sections are your map.
5. **`app/web/TODO.md`** — phase status at a glance, including the early Phase 5 work that already landed in `ea7f5f7`.
6. **`app/web/COMPONENT_AUDIT.md`** — file-by-file inventory of every hand-rolled primitive. This is your hit list.
7. **`app/web/THEME_AUDIT.md`** — what each consumer reads. Less critical for Phase 3 but useful when you wire Sonner toasts (theme tokens) and the Components page.
8. **`app/docs/DelightfulQtWebShell/for-agents/`** — project-wide guide. `02-architecture.md` for the bridge model, `04-testing.md` for the test layers, `05-tools.md` for playwright-cdp and screenshots, `08-theming.md` for how the live theme reaches your components.

---

## What Phases 1 & 2 gave you

**Phase 1 (`cfc2487`):**
- 53 shadcn components in `app/web/shared/components/ui/`. Every primitive you'll need is already on disk — no `bunx shadcn add` needed.
- `applyTheme()` emits all 31 vars. Sidebar and chart tokens land on `:root` automatically.

**Phase 2 (`74a6847`, code-complete):**
- Left-side `Sidebar` is the app chrome in `App.tsx`. Seven items, including the `🧩 Components` skeleton at `apps/main/src/tabs/ComponentsTab.tsx`.
- `getSystemBridge()` is already in use in `App.tsx:32` — the typed-helper pattern exists for `system`. **You're extending the same pattern to `todos`.**
- Hash routing + `document.title` preserved exactly. Don't break it.
- `data-testid="sidebar-<id>"` on every menu button — your test selectors should hook those.

**Bonus from `ea7f5f7` (Phase 5 work landed early — don't redo):**
- `App.css` hardcoded `#1a1a1a` → `var(--color-muted)`. Done.
- `theme.css` + `App.css` `@theme` blocks merged into one `@theme inline` referencing live CSS vars. Done.
- `DEFAULT_DARK` / `DEFAULT_LIGHT` fallback maps deleted from `themes.ts`. `applyTheme()` now writes the active theme verbatim.
- `Default` theme in `themes.json` is now populated with a real shadcn-neutral palette (all 31 vars, light + dark).
- **Implication for you:** if a theme ships empty vars, *nothing is applied* and the UI relies on the `@theme inline` defaults. Don't reintroduce fallback maps.

**Pre-existing watch-outs (carry forward, don't fix unless they bite Phase 3):**
- `lucide-react` is on `^1.11.0` (real package, maintained by `ericfennis`, latest on npm). Phase 3 puts lucide icons in real use.
- `SystemTab` reportedly crashes in WASM mode. Not Phase 3's job to fix, but if you see it during testing, document in findings.

---

## Phase 3 goal

Three threads, one phase:

1. **Swap every hand-rolled primitive to shadcn.** Zero hand-rolled primitives outside `shared/components/ui/` by exit.
2. **Add typed bridge helpers; kill all magic-string `getBridge<T>('name')` calls in feature code.** `getBridge<T>(name)` becomes framework-internal only.
3. **Populate the `🧩 Components` page** with a live demo of every swap.

Side effect: the broken delete-list `opacity-0 group-hover` button bug in `TodosTab` resolves for free when you swap to `Button variant="ghost" size="icon"` + lucide Trash.

---

## The 7 locked decisions (don't relitigate)

Verbatim from `NOTES.md`. Don't drift:

1. shadcn-first for every primitive.
2. Left-side `Sidebar` replaces the top `TabsList`. *(done — Phase 2)*
3. All 31 theme vars consumed somewhere real. *(`--chart-*` is Phase 4's job — leave alone here)*
4. `shared/components/ui/` holds the full catalog; feature code imports from there.
5. Typed bridge helpers only (`getSystemBridge()`), no `getBridge<T>('name')` magic strings.
6. Full shadcn catalog installed. *(done — Phase 1)*
7. In-app `🧩 Components` page as a sidebar item. *(skeleton — Phase 2; populate — you)*

---

## Phase 3 — Execution playbook

### Step 0 — Baseline

```bash
git pull origin template
git status

# Workspace install (root, not web/)
cd app
bun install

# Non-invasive tests — invisible to Purr
xmake run test-todo-store
xmake run test-bun
xmake run test-browser
```

Record what passes. **Do NOT** run `test-all`, `test-pywinauto`, or `test-desktop` without asking Purr first — those take over her desktop.

Visual baseline: take headless playwright-cdp screenshots of `Settings`, `Todos`, `Files`, `System`, `Editor`, `Docs` against a distinctive theme (Tron is good — high-contrast cyan). You'll diff against these later.

### Step 1 — Bridge helpers (do this first)

Why first: every primitive swap that touches a tab using a magic-string bridge call is also a chance to migrate the call site. Doing the helper migration up front means you only edit each file once.

**1a. Add `getTodoBridge()`.** Mirror the `system-bridge.ts` pattern.

- Move the `TodoBridge` interface from `web/shared/api/bridge.ts` to a new `web/shared/api/todo-bridge.ts`.
- Add `export async function getTodoBridge(): Promise<TodoBridge> { return getBridge<TodoBridge>('todos') }`.
- Re-export from `bridge.ts` for backward compat **only if there's a non-feature consumer** — there shouldn't be. Feature code imports from `@shared/api/todo-bridge` directly.

**1b. Migrate all five magic-string call sites.**

- `apps/main/src/DialogView.tsx:6` — `getBridge<TodoBridge>('todos')` → `getTodoBridge()`
- `apps/main/src/tabs/TodosTab.tsx:7` — same
- `apps/main/src/tabs/TodosTab.tsx:8` — `getBridge<SystemBridge>('system')` → `getSystemBridge()`
- `apps/main/src/tabs/SystemTab.tsx:7` — same
- `apps/main/src/tabs/FileBrowserTab.tsx:7` — same

**1c. Standardize the no-catch pattern.**

`TodosTab`, `SystemTab`, `FileBrowserTab`, `DialogView` all do top-level `await get*Bridge(...)` with no `.catch()`. If the bridge fails to resolve, the *module* fails to import and the tab crashes on mount.

The model is in `EditorTab.tsx:13` and `SettingsTab.tsx:10`:

```typescript
let systemBridge: SystemBridge | null = null
getSystemBridge().then(b => { systemBridge = b }).catch(() => {})
```

Apply this shape to the four crashy files. Each tab's render path needs a guard for the not-yet-resolved case (typically a `useEffect` that waits for the bridge or a guarded handler).

**1d. Verify.** Search the codebase: `getBridge<` should have **zero** matches in `apps/main/src/`. Magic strings dead.

### Step 2 — Primitive swaps

Order by leverage. Each swap also lays groundwork for the Components page demo (Step 3).

**2a. Combobox** (replaces `ThemePicker` + `FontPicker` in `SettingsTab.tsx`)

- The shadcn `combobox` is a *pattern*, not a single file — built from `popover` + `command`. Both live in `shared/components/ui/`. Reference: shadcn docs.
- Build a single reusable `Combobox` component if there isn't one yet (lives in `shared/components/ui/`), or compose inline at each call site — pick whichever the existing catalog implies.
- Replace `ThemePicker` (~130 lines) and `FontPicker` (~130 lines) inside `SettingsTab.tsx`. Searchable dropdown, theme color preview dots stay (use the existing `getThemeColors(theme)` helper or whatever ships).
- Theme picker filters across 1030 entries, font picker across 1900 — virtualization may be needed. Test with the actual data sets, don't trust a 5-item demo.

**2b. Switch** (replaces three hand-rolled toggles)

- Dark-mode switch in `SettingsTab`.
- "Use in Code Editor" toggles in `SettingsTab` (theme, font — there are two).
- Agent/human toggle in `DocsTab`.
- The duplicate inline `Toggle` component in `SettingsTab` and `DocsTab` is dead after this — delete it.

**2c. Input** (replaces every bare `<input>` with shadcn classes copy-pasted)

- `TodosTab` — new-list input, new-item input.
- `DialogView` — wherever it has bare inputs.
- `FileBrowserTab` — search input.
- The search inputs inside ThemePicker/FontPicker — auto-handled if Combobox already gives you a styled search field.

**2d. Checkbox** (replaces `○` / `✓` emoji + `role="checkbox"` hack in `TodosTab`)

- Real `Checkbox` from `shared/components/ui/checkbox.tsx`.
- Verify the `data-done="true"` attribute is preserved or the existing test (`tests/playwright/todo-lists.spec.ts:52`) breaks.

**2e. ScrollArea** (replaces `max-h-60 overflow-y-auto` ad-hoc containers)

- `FileBrowserTab` directory listing.
- The dropdown lists inside ThemePicker/FontPicker if they're not already wrapped by `Command` (which has its own scroll handling).

**2f. Sonner — toast** (replaces 4 copies of `setState + setTimeout`)

- `EditorTab`, `TodosTab`, `SystemTab`, `DialogView` each duplicate the same "show message for N seconds" pattern.
- Mount `<Toaster />` once at the app root in `App.tsx` (shadcn pattern).
- Replace each duplicate with `toast(...)` calls.

**2g. Button + lucide Trash** (kills the delete-list bug)

- The current `opacity-0 group-hover` delete button in `TodosTab` is broken — hover state doesn't fire reliably and the button is unclickable on touch.
- Swap to `<Button variant="ghost" size="icon" data-testid="delete-list-button"><Trash2 /></Button>` (or whatever icon — lucide naming changed across versions; **check the installed lucide-react before you write the import**, see "Lucide watch-out" above).
- Test: `tests/playwright/todo-lists.spec.ts:55` exercises this button. If it was already passing somehow, don't regress it.

### Step 3 — Populate the Components page

`apps/main/src/tabs/ComponentsTab.tsx` is currently a stub. Each swap above seeds a section.

The page renders **every installed shadcn primitive in realistic usage against the live theme**. One scrollable canvas. Sections by primitive name. Light, narrative captions where helpful — this is also doc.

Don't aim for exhaustive on the first pass — lead with what you swapped (Combobox, Switch, Input, Checkbox, ScrollArea, Sonner, Button). Other primitives (Accordion, Alert, Avatar, Badge, Calendar, Dialog, Drawer, Form, Sheet, Slider, Tooltip, …) get a basic demo each so theme authors can spot regressions across all 1030 themes. **Aim for "every component on disk has a section by Phase 3 exit"** — that's the locked decision (#7).

The Components page is not just a demo — it's how a theme author confirms "Tron Synthwave doesn't break Badge readability." Wire it so a section exists for every component file in `shared/components/ui/`.

### Step 4 — Theming sanity check

After all swaps land:

1. Open the app, visit Settings, change to "Mrowr Purr - Tron." Visit each tab.
2. Visit the Components page — every section should re-color cleanly.
3. Toggle dark/light. Same expectation.
4. Diff against the Step 0 baseline screenshots — chrome should look the same except where you intentionally changed it.

If any primitive doesn't theme correctly, the issue is almost always Tailwind classes consuming the wrong token (or a hardcoded color leaking through). Fix the tokens — don't paper.

### Step 5 — Test sweep

```bash
xmake run test-todo-store    # ✅ — pure C++, unaffected
xmake run test-bun           # ✅ — bridge protocol, unaffected
xmake run test-browser       # must stay green
```

`tests/playwright/todo-lists.spec.ts` exercises:
- `new-list-input` (you swapped to `Input`)
- `create-list-button`
- `todo-list` filter (you swapped delete trigger to icon button)
- `delete-list-button` (Step 2g — under hover handling change)
- `todo-item` + `data-done` attribute (Step 2d — Checkbox swap must preserve this)
- `new-item-input` (Step 2c)
- `add-item-button`

Preserve every `data-testid` referenced. **If a test breaks, the test is the contract** — fix the implementation, not the test, unless the test intent itself is now wrong. If the test intent is wrong, talk to Purr first.

### Step 6 — Update bookkeeping, commit, push

1. Flip the Phase 3 boxes in `NOTES.md` (Bucket 1, Bucket 3 — the bridge-helper and no-catch items).
2. Flip Phase 3 in `TODO.md` to `[x]` with the commit hash.
3. Add a "Phase 3 findings" section to `NOTES.md` mirroring the Phase 1 findings shape. Anything Phase 4 needs to know goes here.
4. Single emoji-prefixed commit. Suggested: `🏴‍☠️ Phase 3: shadcn primitive swaps + typed bridge helpers`.
5. Push to `origin/template`.
6. Tell Purr: "Phase 3 done, ready for review."

**Bonus chore (optional, ask Purr):** the Phase 2 commit (`74a6847`) is still labeled `(WIP)` and `NOTES.md` lacks a "Phase 2 findings" section. Cleaning that up before the Phase 3 commit makes the history readable. Don't rewrite the commit message (history rewrite needs Purr's approval); a quick `NOTES.md` patch noting "Phase 2 landed in `74a6847`" is enough.

---

## Phase 3 exit criteria

All must be true:

- [ ] **Zero hand-rolled primitives** outside `shared/components/ui/`. Grep `apps/main/src` for `<input className=`, `role="checkbox"`, `setTimeout.*(setMessage|setStatus)`, `opacity-0 group-hover` — all should be zero or only inside intentional design choices.
- [ ] **Zero magic-string bridge calls** in feature code. `grep -rn 'getBridge<' app/web/apps/` returns no matches.
- [ ] **`getTodoBridge()` exists** and is the only way feature code reaches the todos bridge.
- [ ] **No-catch module-scope awaits standardized.** `TodosTab`, `SystemTab`, `FileBrowserTab`, `DialogView` follow the `EditorTab`/`SettingsTab` pattern.
- [ ] **`ComponentsTab` populated.** A section exists for every primitive file in `shared/components/ui/`.
- [ ] **Sonner mounted at app root**, all four `setState + setTimeout` toast copies deleted.
- [ ] **Delete-list button works reliably** (no `opacity-0 group-hover` flake).
- [ ] **Inline `Toggle` deleted** from `SettingsTab` and `DocsTab`.
- [ ] **`xmake run test-todo-store`** ✅
- [ ] **`xmake run test-bun`** ✅
- [ ] **`xmake run test-browser`** ✅
- [ ] **`bun run build:main`** inside `web/` ✅ (no TS errors, no big new chunk-size warnings)
- [ ] **Theme regression check passed** — Tron + Default light + Default dark all render cleanly across every tab + the Components page.
- [ ] `NOTES.md` has a "Phase 3 findings" section. `TODO.md` has Phase 3 checked off with the commit hash.

---

## Out of Phase 3 scope (do NOT touch)

- **Chart demo + `--chart-*` wiring.** That's Phase 4. The Components page can include a Chart section, but it doesn't need to be wired to live data.
- **`--radius` per-theme decision.** That's Phase 5 (open question — needs a spot-check first).
- **Updating `docs/DelightfulQtWebShell/for-agents/` agent docs.** That's Phase 5.
- **C++ / Qt / WASM changes.** Web only.
- **Renaming theme variables or touching `widgets.qss.template`.** Stable surface — don't churn.
- **`@theme inline` block in `theme.css`.** Already cleaned up in `ea7f5f7`. Don't re-merge or re-split.
- **Pre-existing npm leakage** (`xmake/setup.lua:23`, `app/playwright.config.ts:33`). Out of scope; flag in findings if you want.

---

## Watch-outs

- **Lucide-react.** On `^1.11.0` (real package). Verify icon names — lucide renamed some between 0.x and 1.x. Check the import resolves before shipping.
- **The `Combobox` swap is the riskiest.** It's the biggest deletion (~260 lines) and ThemePicker/FontPicker have semi-custom behaviors (color preview, font category labels). Read the current implementations carefully before deleting. If the shadcn Combobox can't naturally host the preview/category, compose with the existing `Command` primitive.
- **`Command` virtualization.** 1030 themes + 1900 fonts is a lot. shadcn's `Command` uses `cmdk` which handles big lists, but verify there's no jank. If there is, the fix lives in `cmdk` config, not in your component.
- **Toast positioning + theme tokens.** Sonner needs to read the current theme. shadcn's Sonner ships theme-aware out of the box — verify it actually picks up `--background`, `--foreground` etc. The `next-themes` import (which Sonner uses) is fine; we don't need it for routing.
- **The hash-routing collision risk Phase 2 flagged.** Sidebar collapse state should not write to `window.location.hash`. Confirm none of the new primitives you're adding (Sheet, Drawer, Sidebar features) try to use the URL.
- **`SystemTab` WASM crash** — reportedly pre-existing. If your no-catch standardization touches this file, you may incidentally fix it. If you do, note it in findings. Don't go investigating proactively.
- **`SettingsTab` is the busiest file in this phase.** Combobox swap + Switch swap + bridge migration all hit it. Stage the changes — one commit per swap is fine if it makes review easier (squash at the end if you prefer one commit).

---

## Guardrails (Ethos)

- **Run the tests *before* you write a line.** Baseline is green for `test-todo-store`, `test-bun`, `test-browser`. Anything that goes red is yours.
- **Fix root causes.** If a Switch click doesn't update state, don't wrap it in a timeout. Trace the prop flow.
- **Own every failure.** "Pre-existing" only counts for things you verified red in the baseline.
- **Never destructive git.** No `git reset --hard`, no `git checkout .`, no `git stash`. Another session may have work in the tree. Use `git show HEAD:path/to/file` to see originals.
- **No `// TODO` comments in code.** Notes go in `NOTES.md` findings.
- **If you find something engineeringly wrong while you're swapping primitives — flag it loudly.** Don't bury it in a PR description. Stop the line.

---

## If you get stuck

- **shadcn primitive APIs:** read the file directly in `shared/components/ui/`. They're shadcn-CLI output, fully self-contained, with comments.
- **The bridge model:** `app/docs/DelightfulQtWebShell/for-agents/02-architecture.md`.
- **Driving the running app:** `app/docs/DelightfulQtWebShell/for-agents/05-tools.md` for playwright-cdp.
- **Testing mechanics:** `app/docs/DelightfulQtWebShell/for-agents/04-testing.md`.
- **Theme tokens:** `app/docs/DelightfulQtWebShell/for-agents/08-theming.md`.
- **Anything feels off:** stop, ping Purr in a short message. The cost of asking is low; the cost of a quiet failure is high.

---

## Final note

This is the phase that **kills the drift loop**. The whole reason the migration exists is in `PHASE_1.md`'s preamble — agents look at the existing code, see hand-rolled primitives, conclude "custom is the standard here," and reinforce the loop. Your job is to make `shared/components/ui/` the only answer the next agent ever sees. Boring, mechanical, high-leverage.

🏴‍☠️
