import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@shared/components/ui/card'
import { Button } from '@shared/components/ui/button'
import { loadThemes, applyTheme, isDarkMode, setDarkMode, type ThemeEntry } from '@shared/lib/themes'
import { loadGoogleFonts, applyFont, getEditorFont, type GoogleFont } from '@shared/lib/fonts'

export default function SettingsTab() {
  const [themes, setThemes] = useState<ThemeEntry[]>([])
  const [fonts, setFonts] = useState<GoogleFont[]>([])
  const [dark, setDark] = useState(isDarkMode)
  const [appThemeName, setAppThemeName] = useState(localStorage.getItem('theme-name') || 'Default')
  const [editorThemeName, setEditorThemeName] = useState(localStorage.getItem('editor-theme-name') || '')
  const [appFontFamily, setAppFontFamily] = useState(localStorage.getItem('app-font-family') || '')
  const [editorFontFamily, setEditorFontFamily] = useState(localStorage.getItem('editor-font-family') || '')
  const [editorTransparency, setEditorTransparency] = useState(
    parseInt(localStorage.getItem('editor-transparency') ?? '0', 10)
  )
  const [themeFilter, setThemeFilter] = useState('')
  const [fontFilter, setFontFilter] = useState('')

  useEffect(() => {
    loadThemes().then(setThemes)
    loadGoogleFonts().then(setFonts)
  }, [])

  const handleAppTheme = useCallback((theme: ThemeEntry) => {
    setAppThemeName(theme.name)
    applyTheme(theme, dark)
  }, [dark])

  const handleDarkToggle = useCallback(() => {
    const newDark = !dark
    setDark(newDark)
    setDarkMode(newDark)
    const theme = themes.find(t => t.name === appThemeName)
    if (theme) applyTheme(theme, newDark)
  }, [dark, themes, appThemeName])

  const handleEditorTheme = useCallback((name: string) => {
    setEditorThemeName(name)
    localStorage.setItem('editor-theme-name', name)
    // Editor picks this up via a custom event
    window.dispatchEvent(new CustomEvent('editor-theme-changed'))
  }, [])

  const handleAppFont = useCallback((family: string) => {
    setAppFontFamily(family)
    applyFont(family || null, 'app')
  }, [])

  const handleEditorFont = useCallback((family: string) => {
    setEditorFontFamily(family)
    applyFont(family || null, 'editor')
    window.dispatchEvent(new CustomEvent('editor-font-changed'))
  }, [])

  const handleTransparency = useCallback((value: number) => {
    setEditorTransparency(value)
    localStorage.setItem('editor-transparency', String(value))
    window.dispatchEvent(new CustomEvent('editor-theme-changed'))
  }, [])

  const filteredThemes = themes.filter(t =>
    t.name.toLowerCase().includes(themeFilter.toLowerCase())
  )

  const filteredFonts = fonts.filter(f =>
    f.f.toLowerCase().includes(fontFilter.toLowerCase())
  )

  return (
    <div className="max-w-2xl mx-auto p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-primary mb-1">Settings</h2>
        <p className="text-sm text-muted-foreground">Theme, font, and editor appearance. Saved to localStorage.</p>
      </div>

      {/* Dark/Light toggle */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">🌓 Color Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant={dark ? 'default' : 'outline'} size="sm" onClick={handleDarkToggle}>
            {dark ? '🌙 Dark' : '☀️ Light'}
          </Button>
        </CardContent>
      </Card>

      {/* App Theme */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">🎨 App Theme</CardTitle>
          <CardDescription>Applied to the entire UI. {themes.length} themes available.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <input
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Search themes..."
            value={themeFilter}
            onChange={e => setThemeFilter(e.target.value)}
          />
          <div className="max-h-48 overflow-y-auto rounded-md border border-border">
            {filteredThemes.slice(0, 100).map(theme => (
              <button
                key={theme.name}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm cursor-pointer transition-colors text-left ${
                  theme.name === appThemeName ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-accent/50'
                }`}
                onClick={() => handleAppTheme(theme)}
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{
                  background: (dark ? theme.dark : theme.light)['--primary'] || '#7c6ef0'
                }} />
                {theme.name}
              </button>
            ))}
            {filteredThemes.length > 100 && (
              <div className="px-3 py-1.5 text-xs text-muted-foreground">
                ...and {filteredThemes.length - 100} more. Filter to narrow down.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Editor Theme (override) */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">🖥️ Editor Theme</CardTitle>
          <CardDescription>Override for Monaco editor. Leave empty to follow app theme.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex gap-2">
            <span className="text-sm text-muted-foreground self-center flex-1">
              {editorThemeName || '(follows app theme)'}
            </span>
            {editorThemeName && (
              <Button variant="ghost" size="sm" onClick={() => handleEditorTheme('')}>Clear</Button>
            )}
          </div>
          <div className="max-h-32 overflow-y-auto rounded-md border border-border">
            {filteredThemes.slice(0, 50).map(theme => (
              <button
                key={theme.name}
                className={`flex w-full items-center px-3 py-1 text-xs cursor-pointer transition-colors text-left ${
                  theme.name === editorThemeName ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-accent/50'
                }`}
                onClick={() => handleEditorTheme(theme.name)}
              >
                {theme.name}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* App Font */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">🔤 App Font</CardTitle>
          <CardDescription>Google Fonts — applied to the entire UI.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <input
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Search fonts..."
            value={fontFilter}
            onChange={e => setFontFilter(e.target.value)}
          />
          <div className="flex gap-2">
            <span className="text-sm text-muted-foreground self-center flex-1">
              {appFontFamily || '(system default)'}
            </span>
            {appFontFamily && (
              <Button variant="ghost" size="sm" onClick={() => handleAppFont('')}>Reset</Button>
            )}
          </div>
          <div className="max-h-36 overflow-y-auto rounded-md border border-border">
            {filteredFonts.slice(0, 80).map(font => (
              <button
                key={font.f}
                className={`flex w-full items-center justify-between px-3 py-1 text-xs cursor-pointer transition-colors text-left ${
                  font.f === appFontFamily ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:bg-accent/50'
                }`}
                onClick={() => handleAppFont(font.f)}
              >
                <span>{font.f}</span>
                <span className="text-[10px] opacity-50">{font.c}</span>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Editor Font */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">⌨️ Editor Font</CardTitle>
          <CardDescription>Override for Monaco editor. Monospace recommended.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          <span className="text-sm text-muted-foreground self-center flex-1">
            {editorFontFamily || '(Monaco default)'}
          </span>
          {editorFontFamily ? (
            <Button variant="ghost" size="sm" onClick={() => handleEditorFont('')}>Reset</Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => {
            const family = prompt('Editor font family (e.g. "Fira Code", "JetBrains Mono"):')
            if (family) handleEditorFont(family)
          }}>Set Font</Button>
        </CardContent>
      </Card>

      {/* Editor Transparency */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">🔍 Editor Transparency</CardTitle>
          <CardDescription>Make the editor background see-through. 0 = opaque, 100 = fully transparent.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            value={editorTransparency}
            onChange={e => handleTransparency(parseInt(e.target.value, 10))}
            className="flex-1 accent-primary"
          />
          <span className="text-sm text-muted-foreground w-10 text-right">{editorTransparency}%</span>
        </CardContent>
      </Card>
    </div>
  )
}
