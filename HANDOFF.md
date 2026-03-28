# Session Handoff (2026-03-27)

## What Exists Now

Full details in agent docs (`docs/for-agents/`). Key points:

### Architecture
- **Multi-app web layer** — `web/apps/main/`, `web/apps/docs/`, `web/shared/api/`. SchemeHandler routes by host.
- **Tabs** — Ctrl+T/W, middle-click, reactive titles via `document.title`. QTabWidget in MainWindow.
- **Multiple windows** — Ctrl+N. Shared bridges. Close-to-tray on last window only.
- **Hash routing** — `#/dialog` renders DialogView. Pattern for settings, about, etc.

### SystemBridge
- File choosers, listFolder, globFolder
- readTextFile, readFileBytes, streaming handles (openFileHandle/readFileChunk/closeFileHandle)
- Clipboard, drag & drop (focusProxy event filter)
- CLI args + single-instance pipe
- URL protocol registration (cross-platform, prompt on first launch, Tools menu)

### UI Framework
- **Tailwind v4** + **shadcn/ui** components (Button, Tabs, Card, Select via Radix)
- **Storybook** at web/ level, stories alongside components
- **Monaco editor** with vim mode (monaco-vim), shared instance in main.tsx
- **1000+ shadcn themes** in themes.json (Vite JSON import, NOT fetch — app:// doesn't support fetch)
- **1900+ Google Fonts** in google-fonts.json with injection + font preview
- **Custom theme effects**: Dragon wallpapers, Tron SVG/canvas grid, Synthwave glow CSS
- Theme system maps `--background` → both `--background` AND `--color-background` (Tailwind v4)
- Themes injected via `<style>` element (inline styles unreliable in QWebEngine)

### App Layout (Tabbed)
Full-width single app (no more splitter/docs side panel):
- 📖 **Docs** — live markdown viewer with Radix Select doc picker
- ✏️ **Editor** — Monaco + vim, themed from settings
- ✅ **Todos** — bridge CRUD demo with shadcn components
- 📂 **Files** — file I/O demo (3 tiers), glob, image preview
- ⚙️ **System** — clipboard, drag & drop, CLI args, URL protocol
- 🎨 **Settings** — separate app vs editor: theme picker (searchable), font picker (searchable), page transparency (oklch alpha), editor transparency, dark/light toggle

### Build System
- No more web build stamp files — always rebuilds Vite (~3s)
- `assetsInlineLimit: 0` — small SVGs were getting inlined as data URIs that broke in QWebEngine
- `body { background-color: var(--color-background) }` — prevents dark C++ paint from showing through light themes

### Qlementine Icons
- tintedIcon() in menu_bar.cpp, CompositionMode_SourceIn for dark theme

## Git State
- Branch: `qt-delightfulness`
- All committed and pushed

## What's NOT Done
- Dark/light theme on Qt side (View > Theme menu with QActionGroup + QSS) — user has strong opinions, deferred
- WASM bridge doesn't have file I/O or openDialog (desktop-only)
- Human docs (02-architecture, 03-tutorial, 04-testing) haven't been updated for tabbed app / theming / Monaco
- Tests haven't been updated for the new tabbed UI (data-testids may have moved)
