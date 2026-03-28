# Session Handoff (2026-03-27)

## What Was Built This Session

### Desktop Features
- **File I/O bridge** — openFileChooser, openFolderChooser, listFolder, globFolder, readTextFile, readFileBytes, streaming handles (openFileHandle/readFileChunk/closeFileHandle)
- **Drag & drop** — event filter on QWebEngineView's focusProxy() intercepts drag events
- **Tabs** — QTabWidget, Ctrl+T/W, middle-click, reactive titles via document.title
- **Multiple windows** — Ctrl+N, shared bridges, close-to-tray on last window only
- **CLI arg passing** — single-instance pipe sends all args, parser.parse() not process()
- **URL protocol** — cross-platform registration, prompt on first launch, Tools menu toggle
- **Close-to-tray** — last window hides, secondary windows close normally

### UI Framework
- **Tailwind v4** + **shadcn/ui** (Button, Tabs, Card, Radix Select)
- **Storybook** at web/ level with stories alongside components
- **Monaco editor** with vim mode (monaco-vim)
- **1000+ shadcn themes** with searchable picker, dark/light toggle
- **1900+ Google Fonts** with searchable picker
- **Custom theme effects** — Dragon wallpapers, Tron SVG/canvas grid, Synthwave glow
- **Separate app vs editor settings** — theme, font, page transparency, editor transparency

### App Layout
Full-width tabbed app (no more splitter/docs side panel):
- 📖 Docs — live markdown viewer with doc picker
- ✏️ Editor — Monaco + vim
- ✅ Todos — bridge CRUD demo
- 📂 Files — file I/O demo (3 tiers)
- ⚙️ System — clipboard, drag & drop, CLI args
- 🎨 Settings — theme/font/transparency for app + editor

### Build System
- Killed web build stamp files — always rebuild Vite (~3s), stamps were a multi-team footgun
- assetsInlineLimit: 0 — small SVGs were getting inlined as data URIs that broke in QWebEngine
- JSON data (themes, fonts) imported via Vite, NOT fetch (fetch can't use app:// scheme)
- body uses var(--color-background) so light themes work through transparency

### Docs
- Agent docs: 07-desktop-capabilities.md (new), paths fixed across 01-06, new gotchas
- Human docs: paths fixed, "What's in the Box" section, multi-app architecture
- README: two targets (desktop + WASM), full feature list

### Tests
- Playwright browser e2e: fixed for tabbed app (goToTodos fixture), all 6 pass
- Bridge validator: fixed path (web/src/api → web/shared/api)
- Playwright config: bun run dev → dev:main
- Catch2 + Bun: pass (unchanged)
- **Pywinauto: had issues during this session.** The conftest close_dialogs fixture needs to also close the URL protocol registration prompt ("Delightful Qt Web Shell" QMessageBox) and the "Save" QMessageBox that appears after the file picker. Approach with caution — test on real desktop, don't assume.

## Git State
- Branch: `qt-delightfulness`
- Clean working tree
- Deleted leftover vitest.config.ts and vitest.shims.d.ts (Storybook init artifacts, referenced uninstalled packages)

## Key Gotchas Discovered
- `fetch()` doesn't work with `app://` custom URL scheme — use Vite JSON imports
- Vite inlines assets < 4KB as data URIs — set `assetsInlineLimit: 0`
- Theme CSS vars need both `--background` AND `--color-background` for Tailwind v4
- Theme overrides must use `<style>` injection, not inline styles (QWebEngine inconsistency)
- `oklch(from var(...) l c h / alpha)` for page transparency
- Default theme has empty light/dark objects — needs fallback colors
- Native `<select>` has white box bug in QWebEngine — use custom dropdown
- QWebEngineView's focusProxy() swallows drag events — need event filter
- Stack-allocated MainWindow in main() — never deleteLater() on it
- QCommandLineParser.process() shows error dialog on unknown flags — use parse()

## What's NOT Done
- Dark/light theme on Qt side (View > Theme, QActionGroup, QSS) — user has strong opinions, deferred
- WASM bridge doesn't have file I/O or openDialog (desktop-only features)
- Human docs 03-tutorial and 04-testing not updated for tabbed layout
- Pywinauto tests need careful attention (see note above)
