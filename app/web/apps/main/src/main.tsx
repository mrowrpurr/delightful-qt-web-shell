import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import DialogView from './DialogView'
import './App.css'

// Page-load timing — flows through LoggingWebPage to qDebug on desktop.
const t0 = performance.now()
const lap = (label: string) => console.log(`[load-time] web: ${label} at ${(performance.now() - t0).toFixed(1)}ms`)
lap('main.tsx start')

// Monaco setup — share a single instance between @monaco-editor/react and monaco-vim.
// The web worker must be configured before any editor mounts.
import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
self.MonacoEnvironment = { getWorker: () => new editorWorker() }
loader.config({ monaco })

// Theme: try the synchronous fast-path first (cached CSS from a previous
// applyTheme()). On miss, dynamic-import the saved theme's module.
// The full themes-index + per-theme modules are split into their own
// chunks by Vite — main.tsx never parses the 3MB themes.json.
import { tryFastTheme, isDarkMode, loadTheme, applyTheme, slugifyThemeName } from '@app/theming/lib/themes'
import { setFontData, initFont } from '@app/theming/lib/fonts'
import fontsJson from '@app/theming/data/google-fonts.json'

setFontData(fontsJson as any)

// Transparency knobs — write CSS vars on :root from saved settings.
// Sliders persist 0–100 (% transparent); CSS vars want 0..1 opacity.
function applyTransparency(key: string, cssVar: string) {
  const pct = parseInt(localStorage.getItem(key) ?? '0', 10) || 0
  document.documentElement.style.setProperty(cssVar, String((100 - pct) / 100))
}
applyTransparency('page-transparency', '--page-opacity')
applyTransparency('surface-transparency', '--surface-opacity')

const usedFastPath = tryFastTheme()
lap(usedFastPath ? 'theme: fast-path (cached CSS injected)' : 'theme: cold-path (no cache, will fetch)')

// Apply theme effects + font (these don't need theme vars, just the name)
import { applyThemeEffects } from '@app/theming/lib/theme-effects'
const savedThemeName = localStorage.getItem('theme-name') || 'Default'
initFont()
applyThemeEffects(savedThemeName)
lap('font + effects init done')

// Cold path: no cached CSS yet — BLOCK render until the saved theme's
// module is loaded and applied. Otherwise React mounts with un-themed
// CSS and the user sees "Default" for ~the duration of the dynamic import.
// Top-level await is supported (target: esnext).
if (!usedFastPath) {
  const theme = await loadTheme(savedThemeName)
  if (theme) {
    applyTheme(theme, isDarkMode())
    lap('cold-path theme loaded + applied (blocked render)')
  } else {
    // Saved name doesn't match any theme module (edge case after rename/delete)
    console.warn('[theme] no module for', savedThemeName, '(slug:', slugifyThemeName(savedThemeName), ')')
  }
}

// Sync React's persisted theme state to Qt on startup.
// React owns the truth (localStorage persists across sessions, Qt doesn't).
import { getSystemBridge } from '@shared/api/system-bridge'
getSystemBridge().then(system => {
  system.setQtTheme({ displayName: savedThemeName, isDark: isDarkMode() })
}).catch(() => {}) // WASM/browser mode — no bridge

// Hash-based routing — same React app, different content.
// The main window loads app://main/ (no hash) → full app.
// A dialog loads app://main/#/dialog → lightweight dialog UI.
// No React Router needed — the hash is set once at load time.
const route = window.location.hash

const Root = route === '#/dialog' ? DialogView : App

lap('about to render')
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
lap('render call returned')
