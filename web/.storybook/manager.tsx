import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { addons, types } from 'storybook/manager-api'

const ADDON_ID = 'theme-font-addon'
const PANEL_ID = `${ADDON_ID}/panel`

// We can't import shared/lib here (manager runs in a separate iframe),
// so we communicate with the preview iframe via Storybook's channel.

const CATEGORY_LABELS: Record<string, string> = {
  'sans-serif': 'Sans', 'serif': 'Serif', 'display': 'Display',
  'handwriting': 'Script', 'monospace': 'Mono',
}

interface ThemeEntry { name: string; source: string; light: Record<string, string>; dark: Record<string, string> }
interface GoogleFont { f: string; c: string }

function SearchableList<T>({ items, value, onSelect, renderItem, searchPlaceholder, getKey, getLabel }: {
  items: T[]
  value: string | null
  onSelect: (item: T | null) => void
  renderItem: (item: T, isSelected: boolean) => React.ReactNode
  searchPlaceholder: string
  getKey: (item: T) => string
  getLabel: (item: T) => string
}) {
  const [search, setSearch] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(item => getLabel(item).toLowerCase().includes(q))
  }, [items, search, getLabel])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px', borderBottom: '1px solid var(--appBorderColor, #333)' }}>
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '6px 8px', fontSize: '12px',
            border: '1px solid var(--appBorderColor, #444)',
            borderRadius: '4px', background: 'var(--appContentBg, #1a1a1a)',
            color: 'var(--textColor, #ccc)', outline: 'none',
          }}
        />
      </div>
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
        {filtered.map(item => {
          const key = getKey(item)
          const isSelected = key === value
          return (
            <button
              key={key}
              onClick={() => onSelect(item)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                padding: '4px 8px', fontSize: '12px', border: 'none', borderRadius: '3px',
                background: isSelected ? 'var(--barSelectedColor, #7c6ef0)' : 'transparent',
                color: isSelected ? '#fff' : 'var(--textColor, #ccc)',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              {renderItem(item, isSelected)}
            </button>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#888' }}>
            No results
          </div>
        )}
      </div>
    </div>
  )
}

function ThemeFontPanel() {
  const [themes, setThemes] = useState<ThemeEntry[]>([])
  const [fonts, setFonts] = useState<GoogleFont[]>([])
  const [currentTheme, setCurrentTheme] = useState(localStorage.getItem('theme-name') || 'Default')
  const [dark, setDark] = useState(localStorage.getItem('theme-mode') !== 'light')
  const [currentFont, setCurrentFont] = useState<string | null>(localStorage.getItem('app-font-family'))
  const [tab, setTab] = useState<'themes' | 'fonts'>('themes')
  const channel = addons.getChannel()

  useEffect(() => {
    // Request data from preview iframe
    channel.emit('theme-addon:request-data')
    channel.on('theme-addon:data', (data: { themes: ThemeEntry[]; fonts: GoogleFont[] }) => {
      setThemes(data.themes)
      setFonts(data.fonts)
    })
    return () => { channel.off('theme-addon:data') }
  }, [channel])

  const onThemeSelect = useCallback((theme: ThemeEntry | null) => {
    if (!theme) return
    setCurrentTheme(theme.name)
    channel.emit('theme-addon:set-theme', { name: theme.name, dark })
  }, [channel, dark])

  const onDarkToggle = useCallback(() => {
    const newDark = !dark
    setDark(newDark)
    channel.emit('theme-addon:set-theme', { name: currentTheme, dark: newDark })
  }, [dark, currentTheme, channel])

  const onFontSelect = useCallback((font: GoogleFont | null) => {
    const family = font?.f ?? null
    setCurrentFont(family)
    channel.emit('theme-addon:set-font', { family })
  }, [channel])

  const tabStyle = (active: boolean) => ({
    flex: 1, padding: '6px', fontSize: '12px', border: 'none', cursor: 'pointer',
    borderBottom: active ? '2px solid var(--barSelectedColor, #7c6ef0)' : '2px solid transparent',
    background: 'transparent', color: active ? 'var(--textColor, #ccc)' : '#888',
    fontWeight: active ? 600 : 400,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: '13px' }}>
      {/* Dark mode toggle */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--appBorderColor, #333)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', color: 'var(--textColor, #ccc)' }}>
          {dark ? '🌙 Dark' : '☀️ Light'}
        </span>
        <button
          onClick={onDarkToggle}
          style={{
            width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
            background: dark ? '#7c6ef0' : '#888', position: 'relative', transition: 'background 0.2s',
          }}
        >
          <span style={{
            width: '16px', height: '16px', borderRadius: '50%', background: '#fff', position: 'absolute',
            top: '2px', left: dark ? '18px' : '2px', transition: 'left 0.2s',
          }} />
        </button>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--appBorderColor, #333)' }}>
        <button style={tabStyle(tab === 'themes')} onClick={() => setTab('themes')}>
          🎨 Themes ({themes.length})
        </button>
        <button style={tabStyle(tab === 'fonts')} onClick={() => setTab('fonts')}>
          🔤 Fonts ({fonts.length})
        </button>
      </div>

      {/* Content */}
      {tab === 'themes' ? (
        <SearchableList
          items={themes}
          value={currentTheme}
          onSelect={onThemeSelect}
          searchPlaceholder={`Search ${themes.length} themes...`}
          getKey={t => t.name}
          getLabel={t => t.name}
          renderItem={(t, isSelected) => (
            <>
              <span style={{
                width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                border: '1px solid #555', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: (dark ? t.dark : t.light)['--background'] || (dark ? '#1e1e1e' : '#fff'),
              }}>
                <span style={{
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: (dark ? t.dark : t.light)['--primary'] || '#888',
                }} />
              </span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
              {isSelected && <span>✓</span>}
            </>
          )}
        />
      ) : (
        <SearchableList
          items={fonts}
          value={currentFont}
          onSelect={onFontSelect}
          searchPlaceholder={`Search ${fonts.length} fonts...`}
          getKey={f => f.f}
          getLabel={f => f.f}
          renderItem={(f, isSelected) => (
            <>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.f}</span>
              <span style={{ fontSize: '10px', color: '#888', flexShrink: 0 }}>{CATEGORY_LABELS[f.c] || f.c}</span>
              {isSelected && <span>✓</span>}
            </>
          )}
        />
      )}
    </div>
  )
}

addons.register(ADDON_ID, () => {
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: '🎨 Theme',
    render: ({ active }) => active ? (
      <div style={{ height: '100%', overflow: 'auto' }}>
        <ThemeFontPanel />
      </div>
    ) : null,
  })
})
