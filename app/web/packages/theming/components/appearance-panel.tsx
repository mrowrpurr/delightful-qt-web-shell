import { useState, useEffect, useCallback } from 'react'
import { applyTheme, loadTheme, isDarkMode, setDarkMode } from '../lib/themes'
import { applyFont } from '../lib/fonts'
import { applyThemeEffects } from '../lib/theme-effects'
import { getSystemBridge } from '@app/bridge/lib/bridges/system-bridge'
import { Switch } from '@app/ui/components/switch'
import { Label } from '@app/ui/components/label'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@app/ui/components/card'
import { ThemePicker } from './theme-picker'
import { FontPicker } from './font-picker'
import { DarkModeToggle } from './dark-mode-toggle'
import { TransparencySlider } from './transparency-slider'

let systemBridge: Awaited<ReturnType<typeof getSystemBridge>> | null = null
getSystemBridge().then(b => { systemBridge = b }).catch(() => {})

function notifyEditor() {
  window.dispatchEvent(new CustomEvent('editor-theme-changed'))
}

export function AppearancePanel() {
  const [dark, setDark] = useState(isDarkMode)
  const [appTheme, setAppTheme] = useState(localStorage.getItem('theme-name') || 'Default')
  const [appFont, setAppFont] = useState<string | null>(localStorage.getItem('app-font-family'))

  const [editorUseAppTheme, setEditorUseAppTheme] = useState(localStorage.getItem('editor-use-app-theme') !== 'false')
  const [editorTheme, setEditorTheme] = useState(localStorage.getItem('editor-theme-name') || 'Default')
  const [editorUseAppFont, setEditorUseAppFont] = useState(localStorage.getItem('editor-use-app-font') !== 'false')
  const [editorFont, setEditorFont] = useState<string | null>(localStorage.getItem('editor-font-family'))
  const [pageTransparency, setPageTransparency] = useState(
    parseInt(localStorage.getItem('page-transparency') ?? '0', 10)
  )
  const [surfaceTransparency, setSurfaceTransparency] = useState(
    parseInt(localStorage.getItem('surface-transparency') ?? '0', 10)
  )
  const [editorTransparency, setEditorTransparency] = useState(
    parseInt(localStorage.getItem('editor-transparency') ?? '0', 10)
  )

  const onDarkToggle = useCallback(async (newDark: boolean) => {
    setDark(newDark)
    setDarkMode(newDark)
    const theme = await loadTheme(appTheme)
    if (theme) applyTheme(theme, newDark)
    applyThemeEffects(appTheme)
    notifyEditor()
    if (systemBridge) {
      systemBridge.setQtTheme({ displayName: appTheme, isDark: newDark }).catch(() => {})
    }
  }, [appTheme])

  const onAppTheme = useCallback(async (name: string) => {
    setAppTheme(name)
    const theme = await loadTheme(name)
    if (theme) applyTheme(theme, dark)
    applyThemeEffects(name)
    if (editorUseAppTheme) {
      setEditorTheme(name)
      localStorage.setItem('editor-theme-name', name)
    }
    notifyEditor()
    if (systemBridge) {
      systemBridge.setQtTheme({ displayName: name, isDark: dark }).catch(() => {})
    }
  }, [dark, editorUseAppTheme])

  useEffect(() => {
    const handler = () => {
      setDark(isDarkMode())
      setAppTheme(localStorage.getItem('theme-name') || 'Default')
      setEditorTheme(localStorage.getItem('editor-theme-name') || 'Default')
    }
    window.addEventListener('qt-theme-synced', handler)
    return () => window.removeEventListener('qt-theme-synced', handler)
  }, [])

  const onAppFont = useCallback((family: string | null) => {
    setAppFont(family)
    applyFont(family, 'app')
  }, [])

  const onEditorUseAppTheme = useCallback((v: boolean) => {
    setEditorUseAppTheme(v)
    localStorage.setItem('editor-use-app-theme', String(v))
    notifyEditor()
  }, [])

  const onEditorTheme = useCallback((name: string) => {
    setEditorTheme(name)
    localStorage.setItem('editor-theme-name', name)
    notifyEditor()
  }, [])

  const onEditorUseAppFont = useCallback((v: boolean) => {
    setEditorUseAppFont(v)
    localStorage.setItem('editor-use-app-font', String(v))
    window.dispatchEvent(new CustomEvent('editor-font-changed'))
  }, [])

  const onEditorFont = useCallback((family: string | null) => {
    setEditorFont(family)
    applyFont(family, 'editor')
    window.dispatchEvent(new CustomEvent('editor-font-changed'))
  }, [])

  const onPageTransparency = useCallback((value: number) => {
    setPageTransparency(value)
    localStorage.setItem('page-transparency', String(value))
    document.documentElement.style.setProperty('--page-opacity', String((100 - value) / 100))
  }, [])

  const onSurfaceTransparency = useCallback((value: number) => {
    setSurfaceTransparency(value)
    localStorage.setItem('surface-transparency', String(value))
    document.documentElement.style.setProperty('--surface-opacity', String((100 - value) / 100))
  }, [])

  const onEditorTransparency = useCallback((value: number) => {
    setEditorTransparency(value)
    localStorage.setItem('editor-transparency', String(value))
    notifyEditor()
  }, [])

  return (
    <div className="max-w-lg mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Theme, font, and editor settings. Saved to localStorage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <DarkModeToggle checked={dark} onChange={onDarkToggle} />

          <div>
            <p className="text-sm font-medium mb-1">Theme</p>
            <p className="text-sm text-muted-foreground mb-3">Choose from 1000+ color themes</p>
            <ThemePicker value={appTheme} isDark={dark} onChange={onAppTheme} />
            <Label htmlFor="editor-use-app-theme" className="mt-3 font-normal text-muted-foreground">
              <Switch id="editor-use-app-theme" checked={editorUseAppTheme} onCheckedChange={onEditorUseAppTheme} size="sm" />
              Use in Code Editor
            </Label>
            {!editorUseAppTheme && (
              <div className="mt-3 ml-1 pl-3 border-l-2 border-border">
                <p className="text-sm font-medium mb-1">Code Editor Theme</p>
                <ThemePicker value={editorTheme} isDark={dark} onChange={onEditorTheme} />
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-medium mb-1">Font</p>
            <p className="text-sm text-muted-foreground mb-3">Choose from 1900+ Google Fonts</p>
            <FontPicker value={appFont} onChange={onAppFont} />
            {appFont && (
              <p className="mt-2 text-sm text-muted-foreground" style={{ fontFamily: `"${appFont}", sans-serif` }}>
                The quick brown fox jumps over the lazy dog
              </p>
            )}
            <Label htmlFor="editor-use-app-font" className="mt-3 font-normal text-muted-foreground">
              <Switch id="editor-use-app-font" checked={editorUseAppFont} onCheckedChange={onEditorUseAppFont} size="sm" />
              Use in Code Editor
            </Label>
            {!editorUseAppFont && (
              <div className="mt-3 ml-1 pl-3 border-l-2 border-border">
                <p className="text-sm font-medium mb-1">Code Editor Font</p>
                <FontPicker value={editorFont} onChange={onEditorFont} />
              </div>
            )}
          </div>

          <TransparencySlider
            label="Page Transparency"
            description="Fade the page background so wallpaper themes show through"
            value={pageTransparency}
            onChange={onPageTransparency}
          />

          <TransparencySlider
            label="Surface Transparency"
            description="Fade cards and the sidebar so the page underneath shows through"
            value={surfaceTransparency}
            onChange={onSurfaceTransparency}
          />

          <TransparencySlider
            label="Code Editor Transparency"
            description="Make the editor background see-through"
            value={editorTransparency}
            onChange={onEditorTransparency}
          />
        </CardContent>
      </Card>
    </div>
  )
}
