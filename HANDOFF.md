# Session Handoff (2026-03-26)

## What Exists Now

Full details in the agent docs (`docs/for-agents/`). Key points:

- **Multi-app web layer** — `web/apps/main/`, `web/apps/docs/`, `web/shared/api/`. SchemeHandler routes by host.
- **Tabs** — Ctrl+T/W, middle-click, reactive titles via `document.title`. QTabWidget in MainWindow.
- **Multiple windows** — Ctrl+N. Shared bridges. Close-to-tray on last window only.
- **SystemBridge** — file choosers, listFolder, globFolder, readTextFile, readFileBytes, streaming handles (openFileHandle/readFileChunk/closeFileHandle), clipboard, drag & drop, CLI args, URL protocol.
- **URL protocol registration** — cross-platform. Prompt on first launch. Tools > Register/Unregister.
- **Hash routing** — `#/dialog` renders DialogView. Pattern for settings, about, etc.
- **Qlementine icons** — tintedIcon() for dark theme. Read Icons16.hpp from xmake cache.

## Doc Set

- **01-getting-started** — onboarding, project layout, build/run, dev modes
- **02-architecture** — mental model, proxy pattern, transports, multi-app web layer
- **03-adding-features** — four-file method recipe, new bridge scaffolding, signals, new web app recipe, hash route recipe
- **04-testing** — five layers, what-to-test matrix, common failures
- **05-tools** — playwright-cdp, pywinauto, screenshots, desktop sharing
- **06-gotchas** — silent failures, build traps, multi-app/Vite gotchas, WASM gotchas
- **07-desktop-capabilities** — SystemBridge API reference, desktop shell features (tabs, windows, tray, menus)

## Git State

- Branch: `qt-delightfulness`
- Working tree: doc updates in progress

## What's NOT Done

- Dark/light theme toggle (View > Theme, QActionGroup, QSS)
- Human docs (`docs/for-humans/`) need the same path fixes + feature updates
- WASM bridge doesn't have file I/O or openDialog (desktop-only)
