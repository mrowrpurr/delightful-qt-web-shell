import type * as Monaco from 'monaco-editor'

let _ctx: CanvasRenderingContext2D | null = null
function getCtx(): CanvasRenderingContext2D {
  if (!_ctx) {
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    _ctx = c.getContext('2d')!
  }
  return _ctx
}

export function cssColorToHex(color: string): string {
  const ctx = getCtx()
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = '#888888'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`
}

function hex2(n: number): string {
  return n.toString(16).padStart(2, '0')
}

function withAlpha(hex: string, alpha: number): string {
  return `${hex}${hex2(Math.round(alpha))}`
}

function resolveVar(vars: Record<string, string>, name: string, fallback: string): string {
  const val = vars[name]
  if (!val) return fallback
  if (val.startsWith('#')) return val
  return cssColorToHex(val)
}

function strip(hex: string): string {
  return hex.startsWith('#') ? hex.slice(1) : hex
}

export function buildMonacoThemeFromVars(
  vars: Record<string, string>,
  isDark: boolean,
  transparency: number = 0,
): Monaco.editor.IStandaloneThemeData {
  const bg = resolveVar(vars, '--background', isDark ? '#1e1e1e' : '#ffffff')
  const fg = resolveVar(vars, '--foreground', isDark ? '#d4d4d4' : '#1e1e1e')
  const primary = resolveVar(vars, '--primary', isDark ? '#569cd6' : '#0070c1')
  const accent = resolveVar(vars, '--accent', isDark ? '#264f78' : '#e8e8e8')
  const muted = resolveVar(vars, '--muted', isDark ? '#3c3c3c' : '#e0e0e0')
  const mutedFg = resolveVar(vars, '--muted-foreground', isDark ? '#808080' : '#6e6e6e')
  const card = resolveVar(vars, '--card', isDark ? '#252526' : '#ffffff')
  const border = resolveVar(vars, '--border', isDark ? '#3c3c3c' : '#e0e0e0')
  const popover = resolveVar(vars, '--popover', isDark ? '#252526' : '#ffffff')
  const ring = resolveVar(vars, '--ring', isDark ? '#569cd6' : '#0070c1')
  const input = resolveVar(vars, '--input', isDark ? '#3c3c3c' : '#e0e0e0')
  const chart1 = resolveVar(vars, '--chart-1', isDark ? '#4ec9b0' : '#267f99')
  const chart2 = resolveVar(vars, '--chart-2', isDark ? '#6a9955' : '#098658')
  const chart4 = resolveVar(vars, '--chart-4', isDark ? '#b5cea8' : '#098658')
  const chart5 = resolveVar(vars, '--chart-5', isDark ? '#dcdcaa' : '#795e26')

  const bgAlpha = Math.round(255 * (1 - Math.min(Math.max(transparency, 0), 100) / 100))
  const bgWithTransparency = transparency > 0 ? withAlpha(bg, bgAlpha) : bg

  return {
    base: isDark ? 'vs-dark' : 'vs',
    inherit: true,
    colors: {
      'editor.background': bgWithTransparency,
      'editor.foreground': fg,
      'editorCursor.foreground': primary,
      'editor.selectionBackground': withAlpha(accent, 100),
      'editor.lineHighlightBackground': withAlpha(muted, 40),
      'editorLineNumber.foreground': mutedFg,
      'editorLineNumber.activeForeground': fg,
      'editorWidget.background': card,
      'editorWidget.border': border,
      'editorSuggestWidget.background': popover,
      'editorSuggestWidget.selectedBackground': accent,
      'editorSuggestWidget.border': border,
      'editorHoverWidget.background': popover,
      'editorHoverWidget.border': border,
      'focusBorder': ring,
      'input.background': input,
      'input.border': border,
      'scrollbarSlider.background': withAlpha(muted, 80),
      'scrollbarSlider.hoverBackground': withAlpha(muted, 120),
      'scrollbarSlider.activeBackground': withAlpha(muted, 160),
      'editorGutter.background': bgWithTransparency,
      'editorIndentGuide.background': withAlpha(muted, 60),
      'editorIndentGuide.activeBackground': withAlpha(mutedFg, 100),
    },
    rules: [
      { token: 'comment', foreground: strip(mutedFg), fontStyle: 'italic' },
      { token: 'keyword', foreground: strip(primary) },
      { token: 'string', foreground: strip(chart2) },
      { token: 'number', foreground: strip(chart4) },
      { token: 'type', foreground: strip(chart1) },
      { token: 'type.identifier', foreground: strip(chart1) },
      { token: 'constant', foreground: strip(chart5) },
      { token: 'operator', foreground: strip(mutedFg) },
      { token: 'identifier', foreground: strip(fg) },
      { token: 'delimiter', foreground: strip(mutedFg) },
      { token: 'delimiter.bracket', foreground: strip(mutedFg) },
    ],
  }
}

export function buildMonacoTheme(isDark: boolean): Monaco.editor.IStandaloneThemeData {
  const style = getComputedStyle(document.documentElement)
  const varNames = [
    '--background', '--foreground', '--primary', '--accent', '--muted',
    '--muted-foreground', '--card', '--border', '--popover', '--ring', '--input',
    '--chart-1', '--chart-2', '--chart-4', '--chart-5',
  ]
  const vars: Record<string, string> = {}
  for (const name of varNames) {
    const val = style.getPropertyValue(name).trim()
    if (val) vars[name] = val
  }
  return buildMonacoThemeFromVars(vars, isDark)
}
