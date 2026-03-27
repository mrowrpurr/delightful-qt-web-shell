import { useEffect, useState } from 'react'
import { signalReady } from '@shared/api/bridge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@shared/components/ui/tabs'
import DocsTab from './tabs/DocsTab'
import TodosTab from './tabs/TodosTab'
import FileBrowserTab from './tabs/FileBrowserTab'
import SystemTab from './tabs/SystemTab'
import EditorTab from './tabs/EditorTab'
import SettingsTab from './tabs/SettingsTab'

export default function App() {
  useEffect(() => { signalReady() }, [])

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
      className="min-h-screen text-foreground"
      style={{
        backgroundColor: pageTransparency > 0
          ? `oklch(from var(--color-background) l c h / ${(100 - pageTransparency) / 100})`
          : undefined,
      }}
    >
      <Tabs defaultValue="docs" className="w-full">
        <div className="border-b border-border flex justify-center py-2">
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
