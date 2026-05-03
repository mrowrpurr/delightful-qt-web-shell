#!/usr/bin/env bun
/**
 * Generates theme outputs from the source themes.json:
 *
 *   Qt side (per theme):
 *     desktop/styles/compiled/<slug>-dark.qss
 *     desktop/styles/compiled/<slug>-light.qss
 *
 *   Web side (per theme + index):
 *     web/packages/theming/data/themes/<slug>.ts   — { light, dark } CSS vars (one chunk per theme)
 *     web/packages/theming/data/themes-index.ts    — [{ name, slug, pL, pD }] for the picker (one chunk)
 *
 * The web outputs let main.tsx skip parsing the 3MB themes.json at startup.
 *
 * Uses desktop/styles/shared/widgets.qss.template as the widget map,
 * replacing $variable references with actual color values.
 *
 * Run:  bun run tools/generate-qss-themes.ts
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'fs'
import { join, resolve } from 'path'

const ROOT = resolve(import.meta.dir, '..')
const THEMES_JSON = join(ROOT, 'web/packages/theming/data/themes.json')
const TEMPLATE_PATH = join(ROOT, 'desktop/styles/shared/widgets.qss.template')
const COMPILED_DIR = join(ROOT, 'desktop/styles/compiled')
const WEB_THEMES_DIR = join(ROOT, 'web/packages/theming/data/themes')
const WEB_INDEX_PATH = join(ROOT, 'web/packages/theming/data/themes-index.ts')

// ── Types ─────────────────────────────────────────────────────────

interface ThemeEntry {
  name: string
  source: string
  light: Record<string, string>
  dark: Record<string, string>
}

// ── Helpers ───────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Convert HSL string to QSS-compatible format.
 * QSS doesn't support modern space-separated HSL: hsl(310 100% 64%)
 * Must be comma-separated: hsl(310, 100%, 64%)
 */
function toQssColor(value: string): string {
  if (!value) return 'transparent'
  if (value.startsWith('#')) return value

  const hslMatch = value.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/)
  if (hslMatch) {
    return `hsl(${hslMatch[1]}, ${hslMatch[2]}%, ${hslMatch[3]}%)`
  }

  return value
}

// The variables used in the template
const THEME_VARS = [
  'background', 'foreground',
  'card', 'card-foreground',
  'popover', 'popover-foreground',
  'primary', 'primary-foreground',
  'secondary', 'secondary-foreground',
  'muted', 'muted-foreground',
  'accent', 'accent-foreground',
  'destructive', 'destructive-foreground',
  'border', 'input', 'ring',
]

const FALLBACK_DARK: Record<string, string> = {
  'background': '#242424', 'foreground': '#e0e0e0',
  'card': '#2a2a2a', 'card-foreground': '#e0e0e0',
  'popover': '#2a2a2a', 'popover-foreground': '#e0e0e0',
  'primary': '#7c6ef0', 'primary-foreground': '#ffffff',
  'secondary': '#3a3a3a', 'secondary-foreground': '#e0e0e0',
  'muted': '#2a2a2a', 'muted-foreground': '#888888',
  'accent': '#3a3a4a', 'accent-foreground': '#e0e0e0',
  'destructive': '#ef4444', 'destructive-foreground': '#ffffff',
  'border': '#3a3a3a', 'input': '#3a3a3a', 'ring': '#7c6ef0',
}

const FALLBACK_LIGHT: Record<string, string> = {
  'background': '#ffffff', 'foreground': '#0a0a0a',
  'card': '#ffffff', 'card-foreground': '#0a0a0a',
  'popover': '#ffffff', 'popover-foreground': '#0a0a0a',
  'primary': '#7c6ef0', 'primary-foreground': '#ffffff',
  'secondary': '#f4f4f5', 'secondary-foreground': '#0a0a0a',
  'muted': '#f4f4f5', 'muted-foreground': '#71717a',
  'accent': '#f4f4f5', 'accent-foreground': '#0a0a0a',
  'destructive': '#ef4444', 'destructive-foreground': '#ffffff',
  'border': '#e4e4e7', 'input': '#e4e4e7', 'ring': '#7c6ef0',
}

// ── Generate QSS ──────────────────────────────────────────────────

function generateQss(template: string, theme: ThemeEntry, mode: 'dark' | 'light'): string {
  const vars = mode === 'dark' ? theme.dark : theme.light
  const fallback = mode === 'dark' ? FALLBACK_DARK : FALLBACK_LIGHT
  const hasVars = Object.keys(vars).length > 0

  let qss = `/* Auto-generated — ${theme.name} (${mode}) */\n\n` + template

  // Replace $variable references with actual colors.
  // Sort by longest name first so $card-foreground matches before $card.
  const sortedVars = [...THEME_VARS].sort((a, b) => b.length - a.length)

  for (const name of sortedVars) {
    const raw = hasVars ? (vars[`--${name}`] || fallback[name]) : fallback[name]
    const color = toQssColor(raw)
    // Replace $name that's followed by a non-word char (or end of line)
    const scssVar = `$${name}`
    // Use global string replace — escape the $ for regex
    const regex = new RegExp(`\\$${name.replace(/-/g, '\\-')}(?=[^a-zA-Z0-9-]|$)`, 'g')
    qss = qss.replace(regex, color)
  }

  // Strip SCSS-style // comments (QSS doesn't support them)
  qss = qss.replace(/^\s*\/\/.*$/gm, '')
  // Clean up multiple blank lines
  qss = qss.replace(/\n{3,}/g, '\n\n')

  return qss.trim() + '\n'
}

// ── Web outputs ───────────────────────────────────────────────────

/**
 * Per-theme TS module: exports {light, dark} CSS vars.
 * Vite turns each into its own chunk — picked up by dynamic import().
 */
function generateThemeModule(theme: ThemeEntry): string {
  const stringify = (vars: Record<string, string>) =>
    JSON.stringify(vars ?? {}, null, 2)
  return `// Auto-generated — ${theme.name}
export const light = ${stringify(theme.light)}
export const dark = ${stringify(theme.dark)}
`
}

/**
 * Index file: just the data the picker needs to render rows
 * (name + slug for loadTheme(), pL/pD for the colored dot per mode).
 * No background color — outer ring is camouflaged in practice.
 */
function generateIndexModule(entries: { name: string; slug: string; pL: string; pD: string }[]): string {
  return `// Auto-generated — picker index. Full theme vars live in ./themes/<slug>.ts
export interface ThemeIndexEntry {
  name: string
  slug: string
  pL: string  // --primary in light mode
  pD: string  // --primary in dark mode
}

export const themeIndex: ThemeIndexEntry[] = ${JSON.stringify(entries, null, 2)}
`
}

// ── Main ──────────────────────────────────────────────────────────

console.log('Reading themes.json...')
const themes: ThemeEntry[] = JSON.parse(readFileSync(THEMES_JSON, 'utf8'))

console.log('Reading widget template...')
const template = readFileSync(TEMPLATE_PATH, 'utf8')

mkdirSync(COMPILED_DIR, { recursive: true })

// Wipe and recreate the per-theme web dir so removed themes don't linger
rmSync(WEB_THEMES_DIR, { recursive: true, force: true })
mkdirSync(WEB_THEMES_DIR, { recursive: true })

let generated = 0
let skipped = 0
const slugToName: Record<string, string> = {}
const indexEntries: { name: string; slug: string; pL: string; pD: string }[] = []

for (const theme of themes) {
  const slug = slugify(theme.name)
  if (!slug) { skipped++; continue }

  slugToName[slug] = theme.name

  // Qt: per-theme QSS (dark + light)
  for (const mode of ['dark', 'light'] as const) {
    const qss = generateQss(template, theme, mode)
    const qssPath = join(COMPILED_DIR, `${slug}-${mode}.qss`)
    writeFileSync(qssPath, qss)
  }

  // Web: per-theme TS module
  writeFileSync(join(WEB_THEMES_DIR, `${slug}.ts`), generateThemeModule(theme))

  // Web: index entry — picker's primary dot needs the colors at hand
  indexEntries.push({
    name: theme.name,
    slug,
    pL: theme.light?.['--primary'] ?? '',
    pD: theme.dark?.['--primary'] ?? '',
  })

  generated++
}

// Write slug→displayName mapping so C++ can translate between slug and React name
writeFileSync(join(COMPILED_DIR, 'theme-names.json'), JSON.stringify(slugToName, null, 2))

// Write the web-side index module
writeFileSync(WEB_INDEX_PATH, generateIndexModule(indexEntries))

console.log(`\n✅ Qt:  ${generated * 2} QSS files + theme-names.json in desktop/styles/compiled/`)
console.log(`✅ Web: ${generated} per-theme modules in web/packages/theming/data/themes/`)
console.log(`✅ Web: themes-index.ts with ${indexEntries.length} entries`)
if (skipped > 0) console.log(`   (${skipped} themes skipped — empty name)`)
