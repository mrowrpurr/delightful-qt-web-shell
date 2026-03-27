export interface ThemeEntry {
  name: string
  source: string
  light: Record<string, string>
  dark: Record<string, string>
}

let themesCache: ThemeEntry[] | null = null
let themesPromise: Promise<ThemeEntry[]> | null = null

export function loadThemes(): Promise<ThemeEntry[]> {
  if (themesCache) return Promise.resolve(themesCache)
  themesPromise ??= fetch('./themes.json')
    .then(r => r.json())
    .then((data: ThemeEntry[]) => { themesCache = data; return data })
  return themesPromise
}

export function getThemesSync(): ThemeEntry[] | null {
  return themesCache
}

// Theme JSON uses --background, --foreground, etc.
// Tailwind v4 @theme uses --color-background, --color-foreground, etc.
// We set BOTH so the theme works with Tailwind utility classes AND direct var references.
const ALL_VARS = [
  'background', 'foreground', 'card', 'card-foreground',
  'popover', 'popover-foreground', 'primary', 'primary-foreground',
  'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
  'accent', 'accent-foreground', 'destructive', 'destructive-foreground',
  'border', 'input', 'ring',
]

export function isDarkMode(): boolean {
  return localStorage.getItem('theme-mode') !== 'light'
}

export function setDarkMode(dark: boolean) {
  localStorage.setItem('theme-mode', dark ? 'dark' : 'light')
}

export function applyTheme(theme: ThemeEntry, dark: boolean) {
  const vars = dark ? theme.dark : theme.light
  const root = document.documentElement
  for (const name of ALL_VARS) {
    const value = vars[`--${name}`]
    if (value) {
      // Set both formats: --background (for direct CSS var usage) and
      // --color-background (for Tailwind v4 utility classes like bg-background)
      root.style.setProperty(`--${name}`, value)
      root.style.setProperty(`--color-${name}`, value)
    } else {
      root.style.removeProperty(`--${name}`)
      root.style.removeProperty(`--color-${name}`)
    }
  }
  localStorage.setItem('theme-name', theme.name)
}

export function initTheme() {
  const dark = isDarkMode()
  const savedName = localStorage.getItem('theme-name')
  if (!savedName) return
  loadThemes().then(themes => {
    const theme = themes.find(t => t.name === savedName)
    if (theme) applyTheme(theme, dark)
  })
}

export function extractPreviewColor(theme: ThemeEntry, isDark: boolean): string {
  const vars = isDark ? theme.dark : theme.light
  return vars['--primary'] || '#888'
}

export function extractBgColor(theme: ThemeEntry, isDark: boolean): string {
  const vars = isDark ? theme.dark : theme.light
  return vars['--background'] || (isDark ? '#1e1e1e' : '#fff')
}
