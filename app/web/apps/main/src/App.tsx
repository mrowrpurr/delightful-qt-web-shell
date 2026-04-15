import { useEffect, useState } from 'react'
import { signalReady } from '@shared/api/bridge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@shared/components/ui/tabs'
import { applyTheme, getThemesSync, setDarkMode as persistDarkMode } from '@shared/lib/themes'
import { getSystemBridge } from '@shared/api/system-bridge'
import { applyThemeEffects } from './theme-effects'
import DocsTab from './tabs/DocsTab'
import TodosTab from './tabs/TodosTab'
import FileBrowserTab from './tabs/FileBrowserTab'
import SystemTab from './tabs/SystemTab'
import EditorTab from './tabs/EditorTab'
import SettingsTab from './tabs/SettingsTab'

// Global listener for Qt theme changes — always active regardless of which tab is visible.
let qtThemeCleanup: (() => void) | null = null
let qtSyncGuard = false

async function setupQtThemeListener() {
  try {
    const system = await getSystemBridge()
    qtThemeCleanup = system.qtThemeChanged(async () => {
      if (qtSyncGuard) return
      qtSyncGuard = true
      try {
        const state = await system.getQtTheme()
        const themes = getThemesSync()
        const theme = themes.find(t => t.name === state.displayName)

        persistDarkMode(state.isDark)

        if (theme) {
          applyTheme(theme, state.isDark)
          applyThemeEffects(theme.name)
          localStorage.setItem('theme-name', theme.name)

          // Sync editor if it follows app theme
          if (localStorage.getItem('editor-use-app-theme') !== 'false') {
            localStorage.setItem('editor-theme-name', theme.name)
          }
          window.dispatchEvent(new CustomEvent('editor-theme-changed'))
        }

        // Notify SettingsTab to refresh its state (if mounted)
        window.dispatchEvent(new CustomEvent('qt-theme-synced'))
      } finally {
        qtSyncGuard = false
      }
    })
  } catch {
    // WASM/browser mode — no bridge
  }
}
setupQtThemeListener()

const TAB_TITLES: Record<string, string> = {
  docs: '📖 Docs',
  editor: '✏️ Editor',
  todos: '✅ Todos',
  files: '📂 Files',
  system: '⚙️ System',
  settings: '🎨 Settings',
}

export default function App() {
  useEffect(() => { signalReady() }, [])

  // Initialize tab from URL hash if present (e.g. #tab=editor).
  // The hash is set by this component on tab change, and the URL is
  // saved/restored by the Qt shell across app restarts.
  const [currentTab, setCurrentTab] = useState(() => {
    const hash = window.location.hash
    if (hash.startsWith('#tab=')) {
      const tab = hash.slice(5)
      if (tab in TAB_TITLES) return tab
    }
    return 'docs'
  })

  // Update document.title and URL hash when the active tab changes.
  // Title drives the dock widget tab label via the web engine's titleChanged signal.
  // Hash is part of the URL that the shell can read and restore.
  useEffect(() => {
    document.title = TAB_TITLES[currentTab] ?? import.meta.env.VITE_APP_NAME ?? 'App'
    history.replaceState(null, '', `#tab=${currentTab}`)
  }, [currentTab])

  const [pageTransparency, setPageTransparency] = useState(
    () => parseInt(localStorage.getItem('page-transparency') ?? '0', 10) || 0
  )

  // Listen for transparency changes from Settings tab
  useEffect(() => {
    const handler = () => {
      setPageTransparency(parseInt(localStorage.getItem('page-transparency') ?? '0', 10) || 0)
    }
    window.addEventListener('page-transparency-changed', handler)
    return () => window.removeEventListener('page-transparency-changed', handler)
  }, [])

  return (
    <div
      className={`min-h-screen text-foreground ${pageTransparency === 0 ? 'bg-background' : ''}`}
      style={pageTransparency > 0 ? {
        backgroundColor: `oklch(from var(--color-background) l c h / ${(100 - pageTransparency) / 100})`,
      } : undefined}
    >
      <Tabs value={currentTab} onValueChange={setCurrentTab} className="w-full">
        <div className="border-b border-border flex justify-center py-2 sticky top-0 z-50 bg-background/95 backdrop-blur-sm">
          <TabsList className="h-10">
            <TabsTrigger value="docs">📖 Docs</TabsTrigger>
            <TabsTrigger value="editor">✏️ Editor</TabsTrigger>
            <TabsTrigger value="todos">✅ Todos</TabsTrigger>
            <TabsTrigger value="files">📂 Files</TabsTrigger>
            <TabsTrigger value="system">⚙️ System</TabsTrigger>
            <TabsTrigger value="settings">🎨 Settings</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="docs"><DocsTab /></TabsContent>
        <TabsContent value="editor"><EditorTab /></TabsContent>
        <TabsContent value="todos"><TodosTab /></TabsContent>
        <TabsContent value="files"><FileBrowserTab /></TabsContent>
        <TabsContent value="system"><SystemTab /></TabsContent>
        <TabsContent value="settings"><SettingsTab /></TabsContent>
      </Tabs>
    </div>
  )
}
