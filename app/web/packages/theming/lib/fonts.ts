export interface GoogleFont {
  f: string  // family
  c: string  // category: sans-serif, serif, display, handwriting, monospace
}

let fontsData: GoogleFont[] = []

export function setFontData(data: GoogleFont[]) {
  fontsData = data
}

export function loadGoogleFonts(): Promise<GoogleFont[]> {
  return Promise.resolve(fontsData)
}

export function getGoogleFontsSync(): GoogleFont[] {
  return fontsData
}

const fontReadyPromises = new Map<string, Promise<void>>()

export function injectGoogleFont(family: string) {
  const id = `gfont-${family.replace(/\s+/g, '-')}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@300;400;500;600;700&display=swap`
  fontReadyPromises.set(family, new Promise<void>(resolve => {
    link.onload = () => {
      document.fonts.load(`16px "${family}"`).then(() => resolve(), () => resolve())
    }
    link.onerror = () => resolve()
  }))
  document.head.appendChild(link)
}

export function waitForFont(family: string): Promise<void> {
  return fontReadyPromises.get(family) ?? Promise.resolve()
}

export function applyFont(family: string | null, target: 'app' | 'editor' = 'app') {
  const key = target === 'editor' ? 'editor-font-family' : 'app-font-family'
  if (family) {
    injectGoogleFont(family)
    if (target === 'app') {
      document.body.style.fontFamily = `"${family}", sans-serif`
    }
    localStorage.setItem(key, family)
  } else {
    if (target === 'app') {
      document.body.style.fontFamily = ''
    }
    localStorage.removeItem(key)
  }
}

export function getEditorFont(): string | null {
  return localStorage.getItem('editor-font-family')
}

export function initFont() {
  const saved = localStorage.getItem('app-font-family')
  if (saved) {
    injectGoogleFont(saved)
    document.body.style.fontFamily = `"${saved}", sans-serif`
  }
  const editorFont = localStorage.getItem('editor-font-family')
  if (editorFont) injectGoogleFont(editorFont)
}
