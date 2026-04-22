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

## TODO — Bucket 1: shadcn install + swaps

**Step 0 — install the full catalog**, not just what the demo uses today. `npx shadcn@latest add <every component>` — or batch-install via CLI arg list. See the "install them all" decision above.

The swaps below are the ones that actually replace hand-rolled code *today* — everything else gets installed so it's available for the next feature without friction.

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

- [ ] Extend `applyTheme()` in `shared/lib/themes.ts` to emit **all 31 variables** (currently emits 19). The chart/sidebar vars are in the JSON but never reach `:root`.
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
