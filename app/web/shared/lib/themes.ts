export interface ThemeEntry {
  name: string
  source: string
  light: Record<string, string>
  dark: Record<string, string>
}

// Lazy-loaded at runtime. The app that uses themes must call setThemeData()
// with the imported JSON before any theme operations work.
let themesData: ThemeEntry[] = []

export function setThemeData(data: ThemeEntry[]) {
  themesData = data
}

export function loadThemes(): Promise<ThemeEntry[]> {
  return Promise.resolve(themesData)
}

export function getThemesSync(): ThemeEntry[] {
  return themesData
}

// Theme JSON uses --background, --foreground, etc.
// Tailwind v4 @theme uses --color-background, --color-foreground, etc.
// We set BOTH so the theme works with Tailwind utility classes AND direct var references.
const ALL_VARS = [
  // Surface (6)
  'background', 'foreground',
  'card', 'card-foreground',
  'popover', 'popover-foreground',
  // Action (8)
  'primary', 'primary-foreground',
  'secondary', 'secondary-foreground',
  'accent', 'accent-foreground',
  'destructive', 'destructive-foreground',
  // Support (5)
  'muted', 'muted-foreground',
  'border', 'input', 'ring',
  // Chart (5)
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
  // Sidebar (8)
  'sidebar', 'sidebar-foreground',
  'sidebar-primary', 'sidebar-primary-foreground',
  'sidebar-accent', 'sidebar-accent-foreground',
  'sidebar-border', 'sidebar-ring',
]

// Fallback colors when theme has empty vars for a mode (e.g. Default theme)
const DEFAULT_DARK: Record<string, string> = {
  '--background': '#242424', '--foreground': '#e0e0e0',
  '--card': '#2a2a2a', '--card-foreground': '#e0e0e0',
  '--popover': '#2a2a2a', '--popover-foreground': '#e0e0e0',
  '--primary': '#7c6ef0', '--primary-foreground': '#ffffff',
  '--secondary': '#3a3a3a', '--secondary-foreground': '#e0e0e0',
  '--muted': '#2a2a2a', '--muted-foreground': '#888888',
  '--accent': '#3a3a4a', '--accent-foreground': '#e0e0e0',
  '--destructive': '#ef4444', '--destructive-foreground': '#ffffff',
  '--border': '#3a3a3a', '--input': '#3a3a3a', '--ring': '#7c6ef0',
  '--chart-1': '#7c6ef0', '--chart-2': '#3a3a4a', '--chart-3': '#ef4444',
  '--chart-4': '#888888', '--chart-5': '#e0e0e0',
  '--sidebar': '#2a2a2a', '--sidebar-foreground': '#e0e0e0',
  '--sidebar-primary': '#7c6ef0', '--sidebar-primary-foreground': '#ffffff',
  '--sidebar-accent': '#3a3a4a', '--sidebar-accent-foreground': '#e0e0e0',
  '--sidebar-border': '#3a3a3a', '--sidebar-ring': '#7c6ef0',
}

const DEFAULT_LIGHT: Record<string, string> = {
  '--background': '#ffffff', '--foreground': '#0a0a0a',
  '--card': '#ffffff', '--card-foreground': '#0a0a0a',
  '--popover': '#ffffff', '--popover-foreground': '#0a0a0a',
  '--primary': '#7c6ef0', '--primary-foreground': '#ffffff',
  '--secondary': '#f4f4f5', '--secondary-foreground': '#0a0a0a',
  '--muted': '#f4f4f5', '--muted-foreground': '#71717a',
  '--accent': '#f4f4f5', '--accent-foreground': '#0a0a0a',
  '--destructive': '#ef4444', '--destructive-foreground': '#ffffff',
  '--border': '#e4e4e7', '--input': '#e4e4e7', '--ring': '#7c6ef0',
  '--chart-1': '#7c6ef0', '--chart-2': '#f4f4f5', '--chart-3': '#ef4444',
  '--chart-4': '#71717a', '--chart-5': '#0a0a0a',
  '--sidebar': '#ffffff', '--sidebar-foreground': '#0a0a0a',
  '--sidebar-primary': '#7c6ef0', '--sidebar-primary-foreground': '#ffffff',
  '--sidebar-accent': '#f4f4f5', '--sidebar-accent-foreground': '#0a0a0a',
  '--sidebar-border': '#e4e4e7', '--sidebar-ring': '#7c6ef0',
}

export function isDarkMode(): boolean {
  return localStorage.getItem('theme-mode') !== 'light'
}

export function setDarkMode(dark: boolean) {
  localStorage.setItem('theme-mode', dark ? 'dark' : 'light')
}

// We inject a <style> element to override Tailwind's @layer theme vars.
// Inline styles on :root SHOULD override @layer, but QWebEngine's Chromium
// can be inconsistent. A <style> with :root {} is bulletproof.
let themeStyleEl: HTMLStyleElement | null = null

export function applyTheme(theme: ThemeEntry, dark: boolean) {
  const themeVars = dark ? theme.dark : theme.light
  const fallback = dark ? DEFAULT_DARK : DEFAULT_LIGHT
  const hasVars = Object.keys(themeVars).length > 0
  const vars = hasVars ? themeVars : fallback

  const lines: string[] = []
  for (const name of ALL_VARS) {
    const value = vars[`--${name}`] || fallback[`--${name}`]
    if (value) {
      lines.push(`--${name}: ${value};`)
      lines.push(`--color-${name}: ${value};`)
    }
  }

  // Inject or update the theme <style> element
  if (!themeStyleEl) {
    themeStyleEl = document.createElement('style')
    themeStyleEl.id = 'theme-overrides'
    document.head.appendChild(themeStyleEl)
  }
  themeStyleEl.textContent = `:root { ${lines.join(' ')} }`

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
