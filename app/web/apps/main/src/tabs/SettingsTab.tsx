import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { cn } from '@shared/lib/utils'
import { applyTheme, loadThemes, getThemesSync, isDarkMode, setDarkMode, extractPreviewColor, extractBgColor, type ThemeEntry } from '@shared/lib/themes'
import { loadGoogleFonts, getGoogleFontsSync, applyFont, type GoogleFont } from '@shared/lib/fonts'
import { applyThemeEffects } from '../theme-effects'
import { getSystemBridge } from '@shared/api/system-bridge'

// Lazy-init the system bridge (may not be available in WASM/browser mode)
let systemBridge: Awaited<ReturnType<typeof getSystemBridge>> | null = null
getSystemBridge().then(b => { systemBridge = b }).catch(() => {})

// ── Toggle switch ─────────────────────────────────────────

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none"
        style={{ backgroundColor: checked ? 'var(--color-primary)' : 'var(--color-input)' }}
      >
        <span
          className={cn(
            'pointer-events-none block h-4 w-4 rounded-full shadow-lg ring-0 transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
          style={{ backgroundColor: 'var(--color-background)' }}
        />
      </button>
      <span className="text-sm text-muted-foreground">{label}</span>
    </label>
  )
}

// ── Notify editor to rebuild its theme ────────────────────

function notifyEditor() {
  window.dispatchEvent(new CustomEvent('editor-theme-changed'))
}

// ── Theme picker with search ──────────────────────────────

function ThemePicker({ value, isDark, onChange }: {
  value: string
  isDark: boolean
  onChange: (name: string) => void
}) {
  const [themes, setThemes] = useState<ThemeEntry[]>(getThemesSync() ?? [])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadThemes().then(setThemes) }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return themes
    const q = search.toLowerCase()
    return themes.filter(t => t.name.toLowerCase().includes(q))
  }, [themes, search])

  useEffect(() => { setHighlightIdx(0) }, [filtered])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx, open])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const select = (name: string) => {
    onChange(name)
    setOpen(false)
    setSearch('')
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { setOpen(true); e.preventDefault() }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[highlightIdx]) select(filtered[highlightIdx].name) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  const currentTheme = themes.find(t => t.name === value)

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 0) }}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-md border border-border text-sm transition-colors text-left cursor-pointer bg-card"
      >
        {currentTheme && (
          <span
            className="w-4 h-4 rounded-full shrink-0 border border-border"
            style={{ backgroundColor: extractPreviewColor(currentTheme, isDark) }}
          />
        )}
        <span className="flex-1 truncate text-foreground">{value || 'Default'}</span>
        <svg className="w-4 h-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border shadow-lg bg-card">
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              placeholder={`Search ${themes.length} themes...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={onKeyDown}
              className="w-full px-2 py-1.5 text-sm border border-input rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div ref={listRef} className="max-h-72 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-sm text-muted-foreground text-center">No themes found</div>
            )}
            {filtered.map((t, i) => (
              <button
                key={t.name}
                onClick={() => select(t.name)}
                onMouseEnter={() => setHighlightIdx(i)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-1.5 text-sm rounded transition-colors cursor-pointer',
                  i === highlightIdx ? 'bg-accent text-accent-foreground' : '',
                  t.name === value ? 'font-medium' : '',
                )}
              >
                <span
                  className="w-5 h-5 rounded-full shrink-0 border border-border flex items-center justify-center"
                  style={{ backgroundColor: extractBgColor(t, isDark) }}
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: extractPreviewColor(t, isDark) }} />
                </span>
                <span className="flex-1 truncate text-left">{t.name}</span>
                {t.source !== 'default' && (
                  <span className="text-xs text-muted-foreground shrink-0">{t.source}</span>
                )}
                {t.name === value && (
                  <svg className="w-4 h-4 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Font picker with search ───────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  'sans-serif': 'Sans', 'serif': 'Serif', 'display': 'Display',
  'handwriting': 'Script', 'monospace': 'Mono',
}

function FontPicker({ value, onChange }: {
  value: string | null
  onChange: (family: string | null) => void
}) {
  const [fonts, setFonts] = useState<GoogleFont[]>(getGoogleFontsSync() ?? [])
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadGoogleFonts().then(setFonts) }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return fonts
    const q = search.toLowerCase()
    return fonts.filter(f => f.f.toLowerCase().includes(q))
  }, [fonts, search])

  useEffect(() => { setHighlightIdx(0) }, [filtered])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[highlightIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx, open])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const select = useCallback((family: string | null) => {
    onChange(family)
    setOpen(false)
    setSearch('')
  }, [onChange])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { setOpen(true); e.preventDefault() }
      return
    }
    const total = filtered.length + 1
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, total - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); highlightIdx === 0 ? select(null) : filtered[highlightIdx - 1] && select(filtered[highlightIdx - 1].f) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 0) }}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-md border border-border text-sm transition-colors text-left cursor-pointer bg-card"
      >
        <span className="flex-1 truncate text-foreground">{value || 'System default'}</span>
        <svg className="w-4 h-4 shrink-0 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border shadow-lg bg-card">
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              placeholder={`Search ${fonts.length} fonts...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={onKeyDown}
              className="w-full px-2 py-1.5 text-sm border border-input rounded bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div ref={listRef} className="max-h-72 overflow-y-auto p-1">
            <button
              onClick={() => select(null)}
              onMouseEnter={() => setHighlightIdx(0)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-1.5 text-sm rounded transition-colors cursor-pointer',
                highlightIdx === 0 ? 'bg-accent text-accent-foreground' : '',
                value === null ? 'font-medium' : '',
              )}
            >
              <span className="flex-1 truncate text-left">System default</span>
              {value === null && (
                <svg className="w-4 h-4 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            {filtered.map((font, i) => (
              <button
                key={font.f}
                onClick={() => select(font.f)}
                onMouseEnter={() => setHighlightIdx(i + 1)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-1.5 text-sm rounded transition-colors cursor-pointer',
                  i + 1 === highlightIdx ? 'bg-accent text-accent-foreground' : '',
                  font.f === value ? 'font-medium' : '',
                )}
              >
                <span className="flex-1 truncate text-left">{font.f}</span>
                <span className="text-xs text-muted-foreground shrink-0">{CATEGORY_LABELS[font.c] || font.c}</span>
                {font.f === value && (
                  <svg className="w-4 h-4 shrink-0 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
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

  const [themes, setThemes] = useState<ThemeEntry[]>([])
  useEffect(() => { loadThemes().then(setThemes) }, [])

  const onDarkToggle = useCallback(() => {
    const newDark = !dark
    setDark(newDark)
    setDarkMode(newDark)
    const theme = themes.find(t => t.name === appTheme)
    if (theme) applyTheme(theme, newDark)
    applyThemeEffects(appTheme)
    notifyEditor()
    // Sync to Qt
    if (systemBridge) {
      systemBridge.setQtTheme({ displayName: appTheme, isDark: newDark }).catch(() => {})
    }
  }, [dark, themes, appTheme])

  const onAppTheme = useCallback((name: string) => {
    setAppTheme(name)
    const theme = themes.find(t => t.name === name)
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
  }, [themes, dark, editorUseAppTheme])

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
        <div>
          <p className="text-sm font-medium">Dark Mode</p>
          <p className="text-sm text-muted-foreground">Toggle between light and dark themes</p>
        </div>
        <button
          role="switch"
          aria-checked={dark}
          onClick={onDarkToggle}
          className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
          style={{ backgroundColor: dark ? 'var(--color-primary)' : 'var(--color-input)' }}
        >
          <span
            className={cn('pointer-events-none block h-5 w-5 rounded-full shadow-lg transition-transform', dark ? 'translate-x-5' : 'translate-x-0')}
            style={{ backgroundColor: 'var(--color-background)' }}
          />
        </button>
      </div>

      {/* Theme */}
      <div>
        <p className="text-sm font-medium mb-1">Theme</p>
        <p className="text-sm text-muted-foreground mb-3">Choose from {themes.length}+ color themes</p>
        <ThemePicker value={appTheme} isDark={dark} onChange={onAppTheme} />
        <Toggle checked={editorUseAppTheme} onChange={onEditorUseAppTheme} label="Use in Code Editor" />
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
        <Toggle checked={editorUseAppFont} onChange={onEditorUseAppFont} label="Use in Code Editor" />
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
