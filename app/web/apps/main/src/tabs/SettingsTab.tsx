import { useState, useEffect, useCallback } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@shared/lib/utils'
import { applyTheme, loadTheme, loadThemeIndex, isDarkMode, setDarkMode, type ThemeIndexEntry } from '@shared/lib/themes'
import { loadGoogleFonts, getGoogleFontsSync, applyFont, type GoogleFont } from '@shared/lib/fonts'
import { applyThemeEffects } from '../theme-effects'
import { getSystemBridge } from '@shared/api/system-bridge'
import { Switch } from '@shared/components/ui/switch'
import { Label } from '@shared/components/ui/label'
import { Button } from '@shared/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@shared/components/ui/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@shared/components/ui/command'

// Lazy-init the system bridge (may not be available in WASM/browser mode)
let systemBridge: Awaited<ReturnType<typeof getSystemBridge>> | null = null
getSystemBridge().then(b => { systemBridge = b }).catch(() => {})

// ── Notify editor to rebuild its theme ────────────────────

function notifyEditor() {
  window.dispatchEvent(new CustomEvent('editor-theme-changed'))
}

// ── Theme picker (Popover + cmdk Command) ──────────────────

function ThemePicker({ value, isDark, onChange }: {
  value: string
  isDark: boolean
  onChange: (name: string) => void
}) {
  const [index, setIndex] = useState<ThemeIndexEntry[]>([])
  const [open, setOpen] = useState(false)

  // Lazy-load the picker index only when the popover first opens —
  // saves the ~150KB chunk on cold starts that never visit the picker.
  useEffect(() => {
    if (open && index.length === 0) {
      loadThemeIndex().then(setIndex)
    }
  }, [open, index.length])

  const previewFor = (entry: ThemeIndexEntry) => (isDark ? entry.pD : entry.pL) || '#888'
  const currentEntry = index.find(t => t.name === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-card hover:bg-card"
          data-testid="theme-picker-trigger"
        >
          <span className="flex items-center gap-2 truncate">
            <span
              className="w-4 h-4 rounded-full shrink-0 border border-border"
              style={{ backgroundColor: currentEntry ? previewFor(currentEntry) : 'var(--primary)' }}
            />
            <span className="truncate">{value || 'Default'}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={index.length ? `Search ${index.length} themes...` : 'Loading themes...'} />
          <CommandList>
            <CommandEmpty>No themes found</CommandEmpty>
            {index.map(t => (
              <CommandItem
                key={t.name}
                value={t.name}
                onSelect={() => { onChange(t.name); setOpen(false) }}
                className="gap-3"
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: previewFor(t) }}
                />
                <span className={cn('flex-1 truncate', t.name === value && 'font-medium')}>{t.name}</span>
                {t.name === value && <Check className="size-4 shrink-0 text-primary" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ── Font picker (Popover + cmdk Command) ───────────────────

const CATEGORY_LABELS: Record<string, string> = {
  'sans-serif': 'Sans', 'serif': 'Serif', 'display': 'Display',
  'handwriting': 'Script', 'monospace': 'Mono',
}

const SYSTEM_FONT_VALUE = '__system_default__'

function FontPicker({ value, onChange }: {
  value: string | null
  onChange: (family: string | null) => void
}) {
  const [fonts, setFonts] = useState<GoogleFont[]>(getGoogleFontsSync() ?? [])
  const [open, setOpen] = useState(false)
  useEffect(() => { loadGoogleFonts().then(setFonts) }, [])

  const select = useCallback((family: string | null) => {
    onChange(family)
    setOpen(false)
  }, [onChange])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-card hover:bg-card"
          data-testid="font-picker-trigger"
        >
          <span className="truncate">{value || 'System default'}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={`Search ${fonts.length} fonts...`} />
          <CommandList>
            <CommandEmpty>No fonts found</CommandEmpty>
            <CommandItem
              value={SYSTEM_FONT_VALUE}
              onSelect={() => select(null)}
              className="gap-3"
            >
              <span className={cn('flex-1 truncate', value === null && 'font-medium')}>System default</span>
              {value === null && <Check className="size-4 shrink-0 text-primary" />}
            </CommandItem>
            {fonts.map(font => (
              <CommandItem
                key={font.f}
                value={font.f}
                onSelect={() => select(font.f)}
                className="gap-3"
              >
                <span className={cn('flex-1 truncate', font.f === value && 'font-medium')}>{font.f}</span>
                <span className="text-xs text-muted-foreground shrink-0">{CATEGORY_LABELS[font.c] || font.c}</span>
                {font.f === value && <Check className="size-4 shrink-0 text-primary" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// ── Settings page ─────────────────────────────────────────

export default function SettingsTab() {
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
    // Sync to Qt
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
    // Sync to Qt
    if (systemBridge) {
      systemBridge.setQtTheme({ displayName: name, isDark: dark }).catch(() => {})
    }
  }, [dark, editorUseAppTheme])

  // ── Refresh local state when Qt theme changes (handled globally in App.tsx) ──
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
    window.dispatchEvent(new CustomEvent('page-transparency-changed'))
  }, [])

  const onEditorTransparency = useCallback((value: number) => {
    setEditorTransparency(value)
    localStorage.setItem('editor-transparency', String(value))
    notifyEditor()
  }, [])

  return (
    <div className="max-w-lg mx-auto p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-primary mb-1">Appearance</h2>
        <p className="text-sm text-muted-foreground">Theme, font, and editor settings. Saved to localStorage.</p>
      </div>

      {/* Dark/Light */}
      <div className="flex items-center justify-between">
        <Label htmlFor="dark-mode-switch" className="flex-col items-start gap-1">
          <span className="font-medium">Dark Mode</span>
          <span className="font-normal text-muted-foreground">Toggle between light and dark themes</span>
        </Label>
        <Switch id="dark-mode-switch" checked={dark} onCheckedChange={onDarkToggle} />
      </div>

      {/* Theme */}
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

      {/* Font */}
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

      {/* Page Transparency */}
      <div>
        <p className="text-sm font-medium mb-1">Page Transparency</p>
        <p className="text-sm text-muted-foreground mb-3">Make the page background see-through so wallpaper themes show through</p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            value={pageTransparency}
            onChange={e => onPageTransparency(parseInt(e.target.value, 10))}
            className="flex-1 accent-primary"
          />
          <span className="text-sm text-muted-foreground tabular-nums w-10 text-right">{pageTransparency}%</span>
        </div>
      </div>

      {/* Editor Transparency */}
      <div>
        <p className="text-sm font-medium mb-1">Code Editor Transparency</p>
        <p className="text-sm text-muted-foreground mb-3">Make the editor background see-through</p>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            value={editorTransparency}
            onChange={e => onEditorTransparency(parseInt(e.target.value, 10))}
            className="flex-1 accent-primary"
          />
          <span className="text-sm text-muted-foreground tabular-nums w-10 text-right">{editorTransparency}%</span>
        </div>
      </div>
    </div>
  )
}
