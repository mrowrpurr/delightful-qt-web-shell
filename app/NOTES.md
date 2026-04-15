# Notes

Ideas, observations, and future work. Not urgent — just catalogued.

## Web / Browser Mode

- **Clipboard button on Todos tab** — why is it here? Clipboard demo belongs on the System tab (where it already exists). Remove or repurpose.
- **"Quick Add" button** — misleading name. It opens a React-in-a-QDialog (WebDialog). Rename to "Open React Dialog" or similar to make the demo purpose clear.
- **Drag & drop in browser** — not a drop target in web mode (the drop handler is on Qt's `focusProxy()`, not HTML5 drag events). Expected, but worth noting for anyone building a browser-first app from this template.
- **dev-server crash** — `system.copyToClipboard()` crashes the headless dev-server with "Cannot create a QWidget without QApplication". Clipboard uses `QGuiApplication::clipboard()` which needs a QApplication. Guard it or create a minimal QApplication in dev-server.
- **Desktop-only features in browser** — Browse Folder, Open File, Quick Add, Drag & Drop all no-op silently in browser mode. Consider showing a "desktop only" indicator or disabling these buttons when running in browser/WASM.

## WASM

- **No-op stub proxy added for missing WASM bridges** — `wasm-transport.ts` now returns a stub proxy (every method resolves `{}`) for bridges not registered in WASM, instead of throwing. Console warns `WASM: bridge "system" not available — using no-op stub`. This unblocks the app but all SystemBridge calls are silent no-ops.
- **WASM SystemBridge doesn't exist yet** — only `TodoBridge` has a WASM implementation (`todo_wasm_bridge.hpp`). Need to create `system_wasm_bridge.hpp` with the browser-portable subset: clipboard (`navigator.clipboard`), file I/O (OPFS), maybe drag & drop (HTML5). Desktop-only methods (native dialogs, URL protocol, tray) return `{error: "desktop only"}` or similar.
- **WASM FileBrowserTab** — also references the system bridge for file I/O. Will need OPFS-backed implementations in the WASM SystemBridge.
- **WASM tab status** — all tabs render except System tab (disappears when navigated to). Todos, Docs, Editor, Settings, File Browser all load. System tab likely crashes in React due to a stub return not matching expected shape.

## Build

- **WASM target pulls desktop-only packages** — `xmake f -p wasm` prompts to install catch2, libsass, and qlementine-icons. None are needed for WASM. The `wasm-app` target should exclude these dependencies.

## UI / Architecture

- **shadcn MenuBar for web** — want a web-side menu bar using shadcn components, with an abstraction over QMenu/QAction so the same menu definition works in both Qt (native) and browser (React). Lets the WASM/browser app have menus too.
- **Storybook theme + font support** — Storybook needs theme switching (1000+ shadcn themes) and Google Fonts support. The theme system (`shared/lib/themes.ts`) and font system (`shared/lib/fonts.ts`) are pure browser code — no Qt dependency. Needs:
  - Move `themes.json` and `google-fonts.json` from `apps/main/src/data/` to `shared/data/` so Storybook can import them
  - Storybook toolbar addon or decorator for theme/font picking
  - Tron/wallpaper effects are app-specific (Vite asset imports) — skip in Storybook, that's fine
  - Goal: someone who clones this template can immediately preview all themes + fonts in Storybook without setup pain

## Docks

- Question: do we support dock splitting in the main window yet? creating and deleting docs? including with tabifying.
