import { useCallback, useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type * as monaco from 'monaco-editor'
import { initVimMode, VimMode } from 'monaco-vim'
import { buildMonacoTheme, buildMonacoThemeFromVars } from '@shared/lib/monaco-theme'
import { isDarkMode, getThemesSync, loadThemes } from '@shared/lib/themes'
import { getEditorFont, injectGoogleFont } from '@shared/lib/fonts'
import { Button } from '@shared/components/ui/button'

// Register vim ex commands globally
;(VimMode as any).Vim.defineEx('write', 'w', () => {})

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
        // Rebuild with transparency from current CSS vars
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

    editor.focus()
  }, [applyEditorTheme])

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
        <h2 className="text-sm font-semibold text-primary">Monaco Editor</h2>
        <span className="text-xs text-muted-foreground">TypeScript</span>
        <div className="flex-1" />
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
