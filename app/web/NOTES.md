# 🏴‍☠️ Web Migration Notes

Working notes for the "make this template actually be a shadcn template" effort.
Pairs with `COMPONENT_AUDIT.md` and `THEME_AUDIT.md` in this folder.

---

## Decisions locked in

- **shadcn-first is the rule.** Every primitive we consume comes from `@shared/components/ui/` — the files there are shadcn-CLI-generated, rendering Radix (or cmdk) primitives with Tailwind classes baked in. They *are* the components, not wrappers around them. Hand-rolling a primitive when shadcn ships one is a drift that other agents will replicate. Code-as-docs: the signal is *what's in `shared/components/ui/`* and *what feature code imports from it*.
- **Left-side `Sidebar` replaces the top `TabsList`** as the main app chrome. Full replacement, not contained. This is also the move that activates all 8 `--sidebar-*` theme vars — killing two problems with one install.
- **Every one of the 31 theme vars in `themes.json` should be consumed somewhere real.** If a var is dead, either a component is missing or the var gets trimmed. No more "~18k lines of unread JSON."
- **The root `shared/components/ui/` IS the reusability signal.** Per decision 5, it holds the full shadcn catalog. Feature code imports from there; agents learn the rule by seeing the imports and the populated folder.
- **Typed bridge helpers (`getSystemBridge()`), never `getBridge<T>('name')` in feature code.** The magic string is gross — it leaks the C++ registration name into every call site and turns a rename into a runtime error. `getBridge<T>(name)` stays as a framework internal; every registered bridge ships a `getFooBridge()` wrapper alongside its TypeScript interface. Feature code only ever imports the typed helper.
- **Install the full shadcn catalog (~50 components), not just what the demo uses right now.** This is a *template* — its job is to be a launching pad, not a minimal example. Reasons: (1) tree-shaking means unused components add zero runtime cost; (2) Storybook becomes a living inventory — browse every primitive against all 1030 themes and 1900 fonts; (3) cloning the template and wanting a Dialog/DataTable/etc. is `import`, not remembering to run the CLI. Components we own, we can theme-tweak if Qt rendering needs it.
- **One in-app "Components" page showing every installed primitive on a single scroll.** A new sidebar item — e.g. `🧩 Components` — that renders every shadcn primitive in realistic usage against the live theme. Complements Storybook (isolated, controls-driven) by showing everything together *inside the themed shell*, so theme authors can spot "this theme makes Badge unreadable" across 1030 themes in one glance. Also the single best way for template users to see "what do I have available?" without running Storybook.

## Open questions

- [ ] **Chart demo placement.** Does the Chart live in its own new tab (e.g. "Stats") or inside TodosTab (completion-over-time)? A dedicated tab is cleaner for a template; embedded is more realistic.
- [ ] **`--radius` per-theme.** Easy to move into `themes.json`, but does it actually vary per theme we've imported? Worth a spot-check before adding a field to 1030 entries.

---

## Phases

Execution order. Each phase ends in a testable outcome. Kickoff docs (e.g. `PHASE_1.md`) give the new-agent handoff for each.

### Phase 1 — Install & theme activation *(foundation, no visible change)*
- Install the full shadcn catalog → `shared/components/ui/` grows from 4 files to ~50.
- Extend `applyTheme()` in `shared/lib/themes.ts` to emit all 31 vars (currently 19).
- **Exit:** catalog present on disk; `:root` carries `--sidebar-*` + `--chart-*` after a theme switch; no regressions.
- **Kickoff:** `PHASE_1.md`

### Phase 2 — Shell restructure *(visible shape change)*
- Replace top `TabsList` with `Sidebar` in `App.tsx`. Preserve URL hash routing + `document.title` behavior.
- Delete custom `shared/components/ui/tabs.tsx`; any in-page tab usage → Radix `tabs`.
- Add the `🧩 Components` sidebar item with a skeleton page (Phase 3 fills it).
- **Exit:** left sidebar renders; all existing tabs still work; `--sidebar-*` vars visibly drive chrome.

### Phase 3 — Primitive swaps + bridge helpers *(biggest phase)*
- Swap every hand-rolled primitive to shadcn: `Combobox` (ThemePicker + FontPicker), `Switch` (3 toggles), `Input`, `Checkbox`, `ScrollArea`, `Sonner`.
- Delete-list button bug resolves via `Button variant="ghost" size="icon"` + `lucide-react` Trash icon.
- Add `getSystemBridge()` / `getTodoBridge()` typed helpers; kill every `getBridge<T>('name')` in feature code.
- Fix module-scope `await getBridge(...)` no-catch crashes.
- Each swap seeds a demo on the Components page.
- **Exit:** zero hand-rolled primitives outside `shared/components/ui/`; zero magic-string bridge access; Components page demonstrates every swap.

### Phase 4 — Chart demo & vocabulary completion
- Build the chart demo (placement per open question — likely a `📊 Stats` sidebar item).
- Wire `--chart-*` vars; make sure all 5 chart vars land somewhere (currently Monaco skips `chart-3`).
- **Exit:** all 31 theme vars have a real consumer.

### Phase 5 — Leak cleanup & agent docs
- Swap `App.css` hardcoded `#1a1a1a` → theme vars.
- Consolidate duplicate `DEFAULT_DARK`/`DEFAULT_LIGHT` palettes or fill `Default` in `themes.json`.
- Merge `theme.css` + `App.css` `@theme` blocks.
- Decide `--radius` per-theme (open question — spot-check first).
- Update `docs/DelightfulQtWebShell/for-agents/` with a "Component patterns" doc matching the new reality.
- **Exit:** no hardcoded hex escaping the theme system; one `@theme` block; agent docs describe the current code.

---

## TODO — Bucket 1: shadcn install + swaps

**Step 0 — install the full catalog**, not just what the demo uses today. `bunx shadcn@latest add --all` from `app/web/`. See the "install them all" decision above.

- [x] **Full catalog installed (Phase 1, 2026-04-22).** `bunx --bun shadcn@latest add --all --overwrite` → 53 new files + 4 overwritten in `shared/components/ui/`. shadcn auto-added deps: `@base-ui/react`, `@hookform/resolvers`, `cmdk`, `date-fns`, `embla-carousel-react`, `input-otp`, `next-themes`, `radix-ui`, `react-day-picker`, `react-hook-form`, `react-resizable-panels`, `recharts`, `sonner`, `vaul`, `zod`. Config at `app/web/components.json` + `app/web/tsconfig.json`.

The swaps below are the ones that actually replace hand-rolled code *today* — everything else is now installed and available for the next feature without friction.

- [ ] `sidebar` — replaces the top tab bar in `App.tsx`. Activates `--sidebar-*` (8 vars).
- [ ] `combobox` (pulls `popover` + `command`) — replaces `ThemePicker` (~130 lines) and `FontPicker` (~130 lines) in `SettingsTab.tsx`.
- [ ] `switch` — replaces three hand-rolled toggles: dark-mode switch in `SettingsTab`, "Use in Code Editor" toggles in `SettingsTab`, agent/human toggle in `DocsTab`.
- [ ] `input` — replaces every bare `<input className="h-9 rounded-md border border-input...">` across `TodosTab`, `DialogView`, `FileBrowserTab`, and the search inputs inside the pickers.
- [ ] `checkbox` — replaces the `○` / `✓` emoji + `role="checkbox"` hack in `TodosTab` item rows.
- [ ] `scroll-area` — replaces `max-h-60 overflow-y-auto` ad-hoc containers in `FileBrowserTab` and the pickers.
- [ ] `sonner` (toast) — replaces the `setState + setTimeout` pattern in `EditorTab`, `TodosTab`, `SystemTab`, `DialogView` (4 copies of the same toast pattern).
- [ ] `button` (already present) — but use `variant="ghost" size="icon"` with a `lucide-react` Trash icon for the delete-list / delete-item buttons. Kills the broken `opacity-0 group-hover` bug in `TodosTab` as a side effect.
- [ ] `chart` — new install, needs a home (see open question).
- [ ] `tabs` — delete custom `shared/components/ui/tabs.tsx`, use the Radix `tabs` that lands via the full-catalog install. Migrate any remaining in-page tab usage (e.g. future grouped sections inside Settings).

## TODO — Bucket 2: light up the theme vocabulary

- [x] **`applyTheme()` now emits all 31 variables (Phase 1, 2026-04-22).** `ALL_VARS` in `shared/lib/themes.ts` extended from 19 → 31: added `chart-1..5` (5) and `sidebar`, `sidebar-foreground`, `sidebar-primary`, `sidebar-primary-foreground`, `sidebar-accent`, `sidebar-accent-foreground`, `sidebar-border`, `sidebar-ring` (8). `DEFAULT_DARK` and `DEFAULT_LIGHT` fallbacks extended in kind. Each var still written twice (`--foo` + `--color-foo`) for Tailwind v4 utility resolution.
- [ ] Wire `sidebar` as the main app shell — replaces the top `TabsList` in `App.tsx`. (Install is covered by Bucket 1 Step 0.) Activates all 8 `--sidebar-*` vars.
- [ ] Build the chart demo — placement TBD (see open question). (Install is covered by Bucket 1 Step 0.) Activates `--chart-*` vars.
- [ ] Move `--radius` into `themes.json` per-theme (currently hard-coded in `theme.css` + `App.css`). Remove from the `@theme` blocks.
- [ ] **QSS template stays at 19 vars.** Qt has no sidebar/chart concept — that boundary is correct.

## TODO — Bucket 3: leaks, duplication, consistency

- [ ] **`App.css` hardcodes `#1a1a1a`** for `code` / `pre` / `blockquote` / `th` backgrounds — swap to `var(--color-muted)` or `var(--color-card)`. Currently breaks on light themes.
- [ ] **Consolidate Default palette.** `DEFAULT_DARK` / `DEFAULT_LIGHT` exists in both `shared/lib/themes.ts` and `tools/generate-qss-themes.ts` as identical copies. Either single-source them, or — better — give the `Default` theme real values in `themes.json` so the empty-palette branch disappears.
- [ ] **`theme.css` and `App.css` both declare near-identical `@theme` blocks.** Merge.
- [ ] **SystemBridge access style** — **Decision:** standardise on `getSystemBridge()`. Kill every `getBridge<SystemBridge>('system')` call site in favour of the typed helper. Magic strings leak the registration name and break silently on rename. Same pattern for every bridge: add `getTodoBridge()` alongside `getSystemBridge()` so `getBridge<T>(name)` becomes framework-internal and feature code never sees the string.
- [ ] **Module-scope `await getBridge(...)` with no catch** in `TodosTab`, `SystemTab`, `FileBrowserTab`, `DialogView` — failure crashes tab mount. The `getSystemBridge().then().catch()` pattern in `EditorTab` / `SettingsTab` is more resilient. Standardise.
- [ ] **Duplicate `Toggle` inline** in `SettingsTab` and `DocsTab` — auto-resolves when `Switch` replaces both.
- [ ] **Double-naming tax** (`--background` + `--color-background`) — keep, it's the documented QWebEngine workaround. Just note it stays.

---

## Running observations

*Add as we go. These aren't tasks — they're context agents will want later.*

- **Why the themes look "dead":** the 12 unused vars (`--sidebar-*`, `--chart-*`) aren't an authoring mistake. The jln13x import was correct *for a shadcn app*; the app just didn't stay shadcn. Fix the components and the theme vocabulary comes alive automatically.
- **The drift pattern worth naming in the agent docs later:** agents reading the current code see a hand-rolled combobox in `SettingsTab` and a hand-rolled `Tabs` in `shared/components/ui/`, and conclude "custom is the standard here." Next agent reinforces it. The only way to break the loop is to put the correct pattern in the code itself — rules in a README don't get read.
- **Tabs unmount when inactive** in the current custom implementation. Radix `Tabs` also unmounts inactive by default — behavior matches, so migration isn't a behavior risk.
- **Sidebar vs top tabs is a shape change** — title-bar height, URL hash routing (`#docs`, `#editor`, …), and `document.title = TAB_TITLES[...]` in `App.tsx` all need to keep working with Sidebar nav. The hash routing logic survives unchanged; only the visual chrome swaps.
- **Another agent is working in this codebase.** If they touch `SettingsTab`, `App.tsx`, or any theme file, this TODO list may drift. Cross-check before picking up a bucket.

### Phase 1 findings (2026-04-22)

- **Sidebar + chart var names already match.** PHASE_1.md flagged a possible mismatch (old shadcn convention used `--sidebar-background`). **Current shadcn uses `--sidebar` (no suffix)** — same as `themes.json`. Checked via `grep --sidebar shared/components/ui/sidebar.tsx`. No rename needed. `chart.tsx` doesn't hardcode var names at all — consumers pass colors via `ChartConfig` (e.g. `color: 'var(--chart-1)'`), so `--chart-*` names from `themes.json` Just Work.
- **shadcn install added this block to `shared/styles/globals.css`:** `@custom-variant dark`, a default `:root { --sidebar: ... }` (light), `.dark { --sidebar: ... }`, and `@theme inline { --color-sidebar: var(--sidebar); ... }`. Our `applyTheme()` injects a runtime `<style>` tag with `:root { ... }` that overrides these defaults once a real theme is picked — no conflict. The `@theme inline` block is what makes Tailwind utilities like `bg-sidebar` resolve properly. **Do not delete it.**
- **`lucide-react` is still on `^1.8.0`** after the shadcn install. Current lucide-react releases are `^0.5xx.0` — the `1.x` line is actually an older deprecated fork/typo. Icons worked in the existing button/select/tabs, so presumably it still works post-install, but worth double-checking in Phase 2 when the Sidebar lands with `lucide` icons everywhere.
- **Bun workspace added.** `app/package.json` now declares `"workspaces": ["web"]` so one `bun install` at root covers root + `web/`. `app/web/bun.lock` removed — root lockfile is authoritative. `tools/playwright-cdp/` stays OUT of the workspace because it runs on Node (CDP WebSocket polyfill) and has its own `npm install` from `setup.lua:20` — that's intentional, don't change it.
- **Setup target (`xmake/setup.lua`) previously did not install `web/` deps.** Now fixed implicitly by the workspace declaration — root `bun install` inside setup now covers web/. No change needed to `setup.lua` itself.
- **`app/web/package.json`'s `"build"` script was `npm run build:main`.** Fixed to `bun run build:main` in Phase 1 per the "no npm" rule.
- **Pre-existing npm leakage still present** (separate fixes, out of Phase 1 scope):
  - `xmake/setup.lua:23` runs `npx playwright install chromium` — could be `bunx playwright install chromium`
  - `app/playwright.config.ts:33` uses `command: 'npx vite'` — could be `bun run vite` or `bunx vite`
- **Baseline tests status at Phase 1 exit:**
  - `xmake run test-todo-store` ✅ 46 assertions / 17 test cases
  - `xmake run test-bun` ✅ 44/44 pass (needs `xmake build dev-server` first — add to setup or docs)
  - `xmake run test-browser` ❌ 6/6 fail — tab buttons not found. Not investigated (Phase 2/3 rewrites this UI anyway, so the tests will need rewriting regardless)
- **Vite prod build ✅** (`bun run build:main` inside `web/`) — 21s, no TS errors, all 53 shadcn files compile against the existing Tailwind v4 setup. Main chunk is 7.2 MB (1.5 MB gzipped) — size warning, not an error; driven by Monaco languages + recharts + radix. Phase 4+ can revisit with code-splitting.
