import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import DialogView from './DialogView'
import './App.css'

// Monaco setup — share a single instance between @monaco-editor/react and monaco-vim.
// The web worker must be configured before any editor mounts.
import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
self.MonacoEnvironment = { getWorker: () => new editorWorker() }
loader.config({ monaco })

// Load theme + font data (imported at build time — fetch doesn't work with app:// scheme)
import { setThemeData, initTheme } from '@shared/lib/themes'
import { setFontData, initFont } from '@shared/lib/fonts'
import themesJson from '../public/themes.json'
import fontsJson from '../public/google-fonts.json'
setThemeData(themesJson as any)
setFontData(fontsJson as any)

// Apply saved theme + font before first render to prevent flash
import { applyThemeEffects } from './theme-effects'
initTheme()
initFont()
applyThemeEffects(localStorage.getItem('theme-name') || 'Default')

// Hash-based routing — same React app, different content.
// The main window loads app://main/ (no hash) → full app.
// A dialog loads app://main/#/dialog → lightweight dialog UI.
// No React Router needed — the hash is set once at load time.
const route = window.location.hash

const Root = route === '#/dialog' ? DialogView : App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
