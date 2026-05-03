// Theme loading + application.
//
// Source-of-truth for theme data is generated, not bundled:
//   themes-index.ts          — picker list (lazy-loaded)
//   themes/<slug>.ts         — per-theme {light, dark} vars (lazy-loaded)
//
// Run `bun run tools/generate-qss-themes.ts` to regenerate after editing
// web/packages/theming/data/themes.json.

export interface ThemeVars extends Record<string, string> {}

export interface ThemeEntry {
  name: string
  light: ThemeVars
  dark: ThemeVars
}

export type { ThemeIndexEntry } from '../data/themes-index'

// Every theme defines these 31 vars for both light and dark.
// applyTheme() writes them to :root as `--foo` AND `--color-foo` so both
// direct `var(--foo)` lookups and Tailwind v4 utilities (`bg-foo`) resolve.
const ALL_VARS = [
  'background', 'foreground',
  'card', 'card-foreground',
  'popover', 'popover-foreground',
  'primary', 'primary-foreground',
  'secondary', 'secondary-foreground',
  'accent', 'accent-foreground',
  'destructive', 'destructive-foreground',
  'muted', 'muted-foreground',
  'border', 'input', 'ring',
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
  'sidebar', 'sidebar-foreground',
  'sidebar-primary', 'sidebar-primary-foreground',
  'sidebar-accent', 'sidebar-accent-foreground',
  'sidebar-border', 'sidebar-ring',
]

const THEME_CSS_CACHE_KEY = 'theme-css'

export function isDarkMode(): boolean {
  return localStorage.getItem('theme-mode') !== 'light'
}

export function setDarkMode(dark: boolean) {
  localStorage.setItem('theme-mode', dark ? 'dark' : 'light')
}

// Mirrors slugify() in tools/generate-qss-themes.ts.
export function slugifyThemeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Lazy-loaded picker index. Cached after first call so dark/light flip
// doesn't re-fetch.
let cachedIndex: import('../data/themes-index').ThemeIndexEntry[] | null = null

export async function loadThemeIndex() {
  if (!cachedIndex) {
    const mod = await import('../data/themes-index')
    cachedIndex = mod.themeIndex
  }
  return cachedIndex
}

// Vite glob: turns each ../data/themes/*.ts file into its own dynamic chunk.
// Path is relative to this file (web/shared/lib/themes.ts).
const themeLoaders = import.meta.glob<{ light: ThemeVars; dark: ThemeVars }>(
  '../data/themes/*.ts'
)

export async function loadTheme(name: string): Promise<ThemeEntry | null> {
  const slug = slugifyThemeName(name)
  const key = `../data/themes/${slug}.ts`
  const loader = themeLoaders[key]
  if (!loader) return null
  const mod = await loader()
  return { name, light: mod.light, dark: mod.dark }
}

// Inject or update the <style> element holding theme overrides.
let themeStyleEl: HTMLStyleElement | null = null

function buildThemeCss(vars: ThemeVars): string {
  const lines: string[] = []
  for (const name of ALL_VARS) {
    const value = vars[`--${name}`]
    if (value) {
      lines.push(`--${name}: ${value};`)
      lines.push(`--color-${name}: ${value};`)
    }
  }
  return `:root { ${lines.join(' ')} }`
}

function injectThemeCss(css: string) {
  if (!themeStyleEl) {
    themeStyleEl = document.getElementById('theme-overrides') as HTMLStyleElement | null
  }
  if (!themeStyleEl) {
    themeStyleEl = document.createElement('style')
    themeStyleEl.id = 'theme-overrides'
    document.head.appendChild(themeStyleEl)
  }
  themeStyleEl.textContent = css
}

export function applyTheme(theme: ThemeEntry, dark: boolean) {
  const css = buildThemeCss(dark ? theme.dark : theme.light)
  injectThemeCss(css)
  localStorage.setItem('theme-name', theme.name)
  // Cache the rendered CSS so the next page load skips fetching the theme module.
  localStorage.setItem(THEME_CSS_CACHE_KEY, css)
}

/**
 * Synchronous fast-path for first paint.
 *
 * If a previous applyTheme() cached the CSS, inject it directly with no
 * dynamic imports and no JSON parsing. Returns true if it injected.
 *
 * Caller is responsible for the cold path (call loadTheme() + applyTheme()
 * if this returns false).
 */
export function tryFastTheme(): boolean {
  const cached = localStorage.getItem(THEME_CSS_CACHE_KEY)
  if (!cached) return false
  injectThemeCss(cached)
  return true
}

export function extractPreviewColor(theme: ThemeEntry, isDark: boolean): string {
  return (isDark ? theme.dark : theme.light)['--primary'] || '#888'
}
