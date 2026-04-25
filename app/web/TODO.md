# 🏴‍☠️ Phase TODO

Quick status for the shadcn-template migration. Detailed plan + rationale lives in `NOTES.md`. Each phase has a kickoff doc (`PHASE_N.md`) for the agent picking it up.

## Phase status

- [x] **Phase 1 — Install & theme activation** *(commit `cfc2487`, 2026-04-22)*
  - 53 shadcn components installed in `shared/components/ui/`.
  - `applyTheme()` extended from 19 → 31 vars (`chart-1..5`, `sidebar-*`).
  - No visible UI change.
- [x] **Phase 2 — Sidebar replaces top tabs** *(commit `74a6847`, code-complete; bookkeeping not closed)*
  - `App.tsx` uses `Sidebar` + `SidebarProvider`; seven items (Docs, Editor, Todos, Files, System, Settings, Components).
  - Hash routing + `document.title` preserved exactly.
  - `ComponentsTab.tsx` skeleton landed for Phase 3 to fill.
  - `data-testid="sidebar-<id>"` on every menu button.
  - **Loose ends:** commit message still says `(WIP)`; `NOTES.md` never got a "Phase 2 findings" section; Phase 2 checkboxes in `NOTES.md` not flipped. Pre-Phase-3 cleanup, not blocking.
- [x] **Phase 3 — Primitive swaps + bridge helpers** *(this commit)*
  - Combobox (Popover + cmdk Command) replaces ThemePicker + FontPicker in `SettingsTab` (~260 lines deleted).
  - Switch + Label replace 3 hand-rolled toggles in `SettingsTab` and the agent/human toggle in `DocsTab`. Inline `Toggle` component deleted.
  - shadcn `Input` replaces every bare `<input>` in `TodosTab`, `DialogView`, `FileBrowserTab`.
  - shadcn `Checkbox` replaces the `○`/`✓` emoji + `role="checkbox"` hack in `TodosTab` (row stays `role="checkbox"` for click-anywhere ergonomics; checkbox is `pointer-events-none` decoration, `data-done` preserved).
  - shadcn `ScrollArea` replaces the `max-h-60 overflow-y-auto` listing in `FileBrowserTab`.
  - `Sonner` mounted at app root in `App.tsx` and inside `DialogView` (separate window). Four `setState + setTimeout` toast copies deleted.
  - Icon `Button` + `lucide-react` `Trash2` kills the broken `opacity-0 group-hover` delete-list/delete-item buttons.
  - `getTodoBridge()` added (`web/shared/api/todo-bridge.ts`). All five `getBridge<T>('name')` magic-string call sites migrated to typed helpers.
  - No-catch module-scope await pattern standardised — `TodosTab`, `SystemTab`, `FileBrowserTab`, `DialogView` no longer crash on import if the bridge fails to resolve.
  - `ComponentsTab` populated: 50 sections, one per primitive on disk.
  - Sonner's shipped wrapper rewired to `isDarkMode()` from `@shared/lib/themes` (next-themes was a dead dependency in this app).
- [ ] **Phase 4 — Chart demo + vocabulary completion**
  - Build chart demo (placement TBD: own `📊 Stats` sidebar item vs embedded in TodosTab).
  - Wire `--chart-*` so all 5 chart vars have a real consumer (Monaco currently skips `chart-3`).
- [ ] **Phase 5 — Leak cleanup & agent docs** *(partially done early)*
  - **Already landed in `ea7f5f7`:** `App.css` `#1a1a1a` hex leak → `var(--color-muted)`; `theme.css` + `App.css` `@theme` blocks merged into single `@theme inline`; duplicate `DEFAULT_DARK`/`DEFAULT_LIGHT` palettes removed; `Default` theme populated in `themes.json`.
  - **Still open:** `--radius` per-theme decision (spot-check first whether it actually varies); update `docs/DelightfulQtWebShell/for-agents/` with a "Component patterns" doc matching the post-Phase-3 reality.

## Out-of-band findings to carry forward

- `lucide-react` is on `^1.8.0` — that's a **deprecated fork**, current real lucide is `^0.5xx.0`. Phase 2 watch-out flagged this; needs verifying once Phase 3 puts lucide icons in real use (Trash, Switch chrome, etc.).
- Pre-existing npm leakage outside Phase scope: `xmake/setup.lua:23` (`npx playwright install`), `app/playwright.config.ts:33` (`command: 'npx vite'`). Could be `bunx`/`bun run`.
- `SystemTab` reportedly crashes in WASM mode (Phase 2 watch-out, not yet investigated).
