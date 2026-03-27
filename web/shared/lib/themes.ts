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
  themesPromise ??= fetch('/themes.json')
    .then(r => r.json())
    .then((data: ThemeEntry[]) => { themesCache = data; return data })
  return themesPromise
}

export function getThemesSync(): ThemeEntry[] | null {
  return themesCache
}

const ALL_VARS = [
  '--background', '--foreground', '--card', '--card-foreground',
  '--popover', '--popover-foreground', '--primary', '--primary-foreground',
  '--secondary', '--secondary-foreground', '--muted', '--muted-foreground',
  '--accent', '--accent-foreground', '--destructive', '--destructive-foreground',
  '--border', '--input', '--ring',
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
  for (const key of ALL_VARS) {
    if (vars[key]) {
      root.style.setProperty(key, vars[key])
    } else {
      root.style.removeProperty(key)
    }
  }
  localStorage.setItem('theme-name', theme.name)
}

export function initTheme() {
  const savedName = localStorage.getItem('theme-name')
  if (!savedName) return
  loadThemes().then(themes => {
    const theme = themes.find(t => t.name === savedName)
    if (theme) applyTheme(theme, isDarkMode())
  })
}
