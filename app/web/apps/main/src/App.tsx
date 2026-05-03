import { useEffect, useRef, useState } from 'react'
import { SidebarSlotProvider } from '@app/ui/hooks/use-sidebar-slot'
import { signalReady } from '@shared/api/bridge'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@app/ui/components/sidebar'
import { applyTheme, loadTheme, setDarkMode as persistDarkMode } from '@shared/lib/themes'
import { getSystemBridge } from '@shared/api/system-bridge'
import { Toaster } from '@app/ui/components/sonner'
import { applyThemeEffects } from './theme-effects'
import DocsTab from './tabs/DocsTab'
import TodosTab from './tabs/TodosTab'
import FileBrowserTab from './tabs/FileBrowserTab'
import SystemTab from './tabs/SystemTab'
import EditorTab from './tabs/EditorTab'
import SettingsTab from './tabs/SettingsTab'
import ComponentsTab from './tabs/ComponentsTab'
import ChatTab from './tabs/ChatTab'

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
        const theme = await loadTheme(state.displayName)

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
  chat: '💬 Chat',
  system: '⚙️ System',
  settings: '🎨 Settings',
  components: '🧩 Components',
}

const NAV_ITEMS = [
  { id: 'docs', label: 'Docs', icon: '📖' },
  { id: 'editor', label: 'Editor', icon: '✏️' },
  { id: 'todos', label: 'Todos', icon: '✅' },
  { id: 'files', label: 'Files', icon: '📂' },
  { id: 'chat', label: 'Chat', icon: '💬' },
  { id: 'system', label: 'System', icon: '⚙️' },
  { id: 'settings', label: 'Settings', icon: '🎨' },
  { id: 'components', label: 'Components', icon: '🧩' },
] as const

export default function App() {
  // Slot for page-contributed sidebar content. Pages call useSidebarSlot(<JSX/>)
  // and portal their JSX into the div whose ref we expose via context.
  const sidebarSlotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    console.log(`[load-time] web: App mounted, calling signalReady at ${performance.now().toFixed(1)}ms (since page nav)`)
    signalReady()
  }, [])

  // Initialize tab from URL hash (e.g. app://main/#editor → "editor").
  // Hash routing is required because custom URL schemes (app://) don't
  // support history.replaceState with path changes — Chromium treats
  // the origin as scheme-only, so any path change is cross-origin.
  // The full URL (including hash) is saved/restored by the Qt shell.
  const [currentTab, setCurrentTab] = useState(() => {
    const hash = window.location.hash.replace(/^#/, '')
    return hash && hash in TAB_TITLES ? hash : 'docs'
  })

  // Update document.title and URL hash when the active tab changes.
  // Title drives the dock widget tab label via the web engine's titleChanged signal.
  useEffect(() => {
    document.title = TAB_TITLES[currentTab] ?? import.meta.env.VITE_APP_NAME ?? 'App'
    window.location.hash = currentTab
  }, [currentTab])

  const renderTab = () => {
    switch (currentTab) {
      case 'docs': return <DocsTab />
      case 'editor': return <EditorTab />
      case 'todos': return <TodosTab />
      case 'files': return <FileBrowserTab />
      case 'chat': return <ChatTab />
      case 'system': return <SystemTab />
      case 'settings': return <SettingsTab />
      case 'components': return <ComponentsTab />
      default: return <DocsTab />
    }
  }

  return (
    <div className="min-h-screen text-foreground bg-page">
      <SidebarProvider defaultOpen>
        <SidebarSlotProvider value={sidebarSlotRef}>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:gap-0">
              <span className="overflow-hidden whitespace-nowrap px-2 text-base font-semibold opacity-100 transition-opacity duration-150 ease-linear delay-200 group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:delay-0">
                {import.meta.env.VITE_APP_NAME ?? 'App'}
              </span>
              <SidebarTrigger
                data-testid="sidebar-trigger"
                className="group-data-[collapsible=icon]:mx-auto"
              />
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarMenu>
                {NAV_ITEMS.map(item => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={currentTab === item.id}
                      onClick={() => setCurrentTab(item.id)}
                      tooltip={item.label}
                      data-testid={`sidebar-${item.id}`}
                    >
                      <span
                        aria-hidden
                        className="inline-flex size-4 shrink-0 items-center justify-center text-base leading-none"
                      >
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
            <div ref={sidebarSlotRef} />
          </SidebarContent>
        </Sidebar>
        <SidebarInset>
          {renderTab()}
        </SidebarInset>
        </SidebarSlotProvider>
      </SidebarProvider>
      <Toaster />
    </div>
  )
}
