import { useEffect } from 'react'
import { signalReady } from '@shared/api/bridge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@shared/components/ui/tabs'
import DocsTab from './tabs/DocsTab'
import TodosTab from './tabs/TodosTab'
import FileBrowserTab from './tabs/FileBrowserTab'
import SystemTab from './tabs/SystemTab'
import EditorTab from './tabs/EditorTab'
import SettingsTab from './tabs/SettingsTab'

export default function App() {
  // signalReady() tells Qt to dismiss the loading overlay.
  // Must run once after first render. Never remove this.
  useEffect(() => { signalReady() }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Tabs defaultValue="docs" className="w-full">
        <div className="border-b border-border px-4">
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
