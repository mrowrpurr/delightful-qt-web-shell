import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as monaco from 'monaco-editor'
import { initVimMode, VimMode } from 'monaco-vim'
import { buildMonacoTheme, buildMonacoThemeFromVars } from '@shared/lib/monaco-theme'
import { isDarkMode, getThemesSync, loadThemes } from '@shared/lib/themes'
import { getEditorFont, injectGoogleFont } from '@shared/lib/fonts'
import { Button } from '@shared/components/ui/button'
import { getSystemBridge } from '@shared/api/system-bridge'

// Lazy-init bridge
let systemBridge: Awaited<ReturnType<typeof getSystemBridge>> | null = null
getSystemBridge().then(b => { systemBridge = b }).catch(() => {})

// Register vim ex commands globally
;(VimMode as any).Vim.defineEx('write', 'w', () => {
  window.dispatchEvent(new CustomEvent('editor-save'))
})

const CUSTOM_THEME = 'delightful-custom'

const SAMPLE_CODE = `// Welcome to the editor! 🎉
// Vim mode is enabled — press Escape, then try :w or /search

interface Bridge {
  readTextFile(path: string): Promise<{ text: string }>
  openFileHandle(path: string): Promise<{ handle: string; size: number }>
  readFileChunk(handle: string, offset: number, length: number): Promise<{ data: string }>
  closeFileHandle(handle: string): Promise<{ ok: boolean }>
}

async function previewFile(bridge: Bridge, path: string) {
  const { handle, size } = await bridge.openFileHandle(path)
  const { data } = await bridge.readFileChunk(handle, 0, 4096)
  await bridge.closeFileHandle(handle)

  const text = atob(data)
  console.log(\`Preview of \${path} (\${size} bytes):\`)
  console.log(text)
}
`

export default function EditorTab() {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof monaco | null>(null)
  const vimRef = useRef<any>(null)
  const statusRef = useRef<HTMLDivElement>(null)
  const [vimEnabled, setVimEnabled] = useState(true)
  const [editingTheme, setEditingTheme] = useState(false)
  const [themeFilePath, setThemeFilePath] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [fileName, setFileName] = useState('sample.ts')

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }, [])

  const applyEditorTheme = useCallback(() => {
    if (!monacoRef.current) return
    const editorThemeName = localStorage.getItem('editor-theme-name')
    const themes = getThemesSync()
    const dark = isDarkMode()

    let themeData: monaco.editor.IStandaloneThemeData
    if (editorThemeName && themes) {
      const theme = themes.find(t => t.name === editorThemeName)
      if (theme) {
        const vars = dark ? theme.dark : theme.light
        const transparency = parseInt(localStorage.getItem('editor-transparency') ?? '0', 10)
        themeData = buildMonacoThemeFromVars(vars, dark, transparency)
      } else {
        themeData = buildMonacoTheme(dark)
      }
    } else {
      const transparency = parseInt(localStorage.getItem('editor-transparency') ?? '0', 10)
      themeData = buildMonacoTheme(dark)
      if (transparency > 0) {
        const style = getComputedStyle(document.documentElement)
        const vars: Record<string, string> = {}
        for (const name of ['--background', '--foreground', '--primary', '--accent', '--muted',
          '--muted-foreground', '--card', '--border', '--popover', '--ring', '--input',
          '--chart-1', '--chart-2', '--chart-4', '--chart-5']) {
          const val = style.getPropertyValue(name).trim()
          if (val) vars[name] = val
        }
        themeData = buildMonacoThemeFromVars(vars, dark, transparency)
      }
    }

    monacoRef.current.editor.defineTheme(CUSTOM_THEME, themeData)
    monacoRef.current.editor.setTheme(CUSTOM_THEME)
  }, [])

  // Load the current QSS theme file into the editor
  const loadThemeFile = useCallback(async () => {
    if (!systemBridge) return
    try {
      const fileInfo = await systemBridge.getQtThemeFilePath()
      if ('embedded' in fileInfo) {
        setEditingTheme(false)
        setThemeFilePath(null)
        return
      }
      const filePath = (fileInfo as { path: string }).path
      if (!filePath) {
        setEditingTheme(false)
        setThemeFilePath(null)
        return
      }
      setThemeFilePath(filePath)
      const result = await systemBridge.readTextFile(filePath)
      if ('text' in result && editorRef.current) {
        editorRef.current.setValue(result.text)
        setEditingTheme(true)
        // Extract filename for display
        const parts = filePath.replace(/\\/g, '/').split('/')
        setFileName(parts[parts.length - 1])
        // Set language to CSS for QSS syntax highlighting
        const model = editorRef.current.getModel()
        if (model && monacoRef.current) {
          monacoRef.current.editor.setModelLanguage(model, 'css')
        }
      }
    } catch {
      setEditingTheme(false)
    }
  }, [])

  // Save the editor content back to the theme file
  const saveThemeFile = useCallback(async () => {
    if (!systemBridge || !themeFilePath || !editorRef.current) return
    const content = editorRef.current.getValue()
    try {
      await systemBridge.writeTextFile(themeFilePath, content)
      showToast(`✅ Saved ${fileName}`)
    } catch (e: any) {
      showToast(`❌ Save failed: ${e.message}`)
    }
  }, [themeFilePath, fileName, showToast])

  // Load sample code (reset)
  const loadSampleCode = useCallback(() => {
    if (!editorRef.current) return
    editorRef.current.setValue(SAMPLE_CODE)
    setEditingTheme(false)
    setThemeFilePath(null)
    setFileName('sample.ts')
    const model = editorRef.current.getModel()
    if (model && monacoRef.current) {
      monacoRef.current.editor.setModelLanguage(model, 'typescript')
    }
  }, [])

  const handleMount: OnMount = useCallback((editor, monacoInstance) => {
    editorRef.current = editor
    monacoRef.current = monacoInstance

    applyEditorTheme()

    // Apply editor font if set
    const editorFont = getEditorFont()
    if (editorFont) {
      injectGoogleFont(editorFont)
      editor.updateOptions({ fontFamily: `"${editorFont}", monospace` })
    }

    // Enable vim mode
    if (statusRef.current) {
      vimRef.current = initVimMode(editor, statusRef.current)
    }

    // Ctrl+S / Cmd+S saves the theme file
    editor.addAction({
      id: 'save-theme',
      label: 'Save Theme File',
      keybindings: [monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS],
      run: () => {
        window.dispatchEvent(new CustomEvent('editor-save'))
      },
    })

    editor.focus()
  }, [applyEditorTheme])

  // Listen for save events (Ctrl+S and :w)
  useEffect(() => {
    const handler = () => { saveThemeFile() }
    window.addEventListener('editor-save', handler)
    return () => window.removeEventListener('editor-save', handler)
  }, [saveThemeFile])

  // Page-level Ctrl+S capture — catches it even when Monaco doesn't have focus.
  // preventDefault stops it from bubbling to Qt's Save action.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        e.stopPropagation()
        if (editingTheme) {
          window.dispatchEvent(new CustomEvent('editor-save'))
        }
      }
    }
    window.addEventListener('keydown', handler, true) // capture phase
    return () => window.removeEventListener('keydown', handler, true)
  }, [editingTheme])

  // Listen for Qt toolbar/menu Save action (saveRequested signal from bridge).
  // This makes the toolbar Save button and File > Save context-aware.
  useEffect(() => {
    if (!systemBridge || !editingTheme) return
    const cleanup = systemBridge.saveRequested(() => {
      window.dispatchEvent(new CustomEvent('editor-save'))
    })
    return cleanup
  }, [editingTheme])

  // Listen for theme/font changes from Settings tab
  useEffect(() => {
    const onThemeChanged = () => applyEditorTheme()
    const onFontChanged = () => {
      if (!editorRef.current) return
      const font = getEditorFont()
      editorRef.current.updateOptions({
        fontFamily: font ? `"${font}", monospace` : 'monospace',
      })
    }
    window.addEventListener('editor-theme-changed', onThemeChanged)
    window.addEventListener('editor-font-changed', onFontChanged)
    return () => {
      window.removeEventListener('editor-theme-changed', onThemeChanged)
      window.removeEventListener('editor-font-changed', onFontChanged)
    }
  }, [applyEditorTheme])

  // When the Qt theme changes, reload the file if we're editing a theme
  useEffect(() => {
    const handler = () => {
      // Always load the new theme file when Qt theme changes
      loadThemeFile()
    }
    window.addEventListener('qt-theme-synced', handler)
    return () => window.removeEventListener('qt-theme-synced', handler)
  }, [loadThemeFile])

  // Preload themes so they're available for the editor
  useEffect(() => { loadThemes() }, [])

  const toggleVim = useCallback(() => {
    if (vimEnabled && vimRef.current) {
      vimRef.current.dispose()
      vimRef.current = null
    } else if (!vimEnabled && editorRef.current && statusRef.current) {
      vimRef.current = initVimMode(editorRef.current, statusRef.current)
    }
    setVimEnabled(!vimEnabled)
  }, [vimEnabled])

  return (
    <div className="flex flex-col h-[calc(100vh-44px)]">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
        <h2 className="text-sm font-semibold text-primary">
          {editingTheme ? '🎨 Theme Editor' : '✏️ Monaco Editor'}
        </h2>
        <span className="text-xs text-muted-foreground">{fileName}</span>
        <div className="flex-1" />

        {toast && (
          <span className="text-xs font-medium text-primary animate-pulse">{toast}</span>
        )}

        {editingTheme ? (
          <>
            <Button
              variant="default"
              size="sm"
              onClick={saveThemeFile}
              className="text-xs h-7"
            >
              💾 Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadSampleCode}
              className="text-xs h-7"
            >
              📝 Sample Code
            </Button>
          </>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={loadThemeFile}
            className="text-xs h-7"
          >
            🎨 Edit Current Theme
          </Button>
        )}

        <Button
          variant={vimEnabled ? 'default' : 'outline'}
          size="sm"
          onClick={toggleVim}
          className="text-xs h-7"
        >
          {vimEnabled ? '⌨️ Vim ON' : '⌨️ Vim OFF'}
        </Button>
      </div>
      <div className="flex-1">
        <Editor
          defaultLanguage="typescript"
          defaultValue={SAMPLE_CODE}
          onMount={handleMount}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 12 },
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
          }}
        />
      </div>
      <div
        ref={statusRef}
        className="h-6 px-3 text-xs font-mono text-muted-foreground bg-card border-t border-border flex items-center"
      />
    </div>
  )
}
