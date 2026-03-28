// Special theme effects — glow, wallpapers, animated tron grid.
// These are applied on top of the base CSS variable theme.

import { startTronGrid, stopTronGrid } from '@shared/lib/tron-grid'

// Import backgrounds as Vite assets — they get hashed URLs that work in QRC
import dragonBg from './themes/dragon.png'
import dragonLegacyBg from './themes/dragon-legacy.jpg'
import tronBg from './themes/tron.svg'
import tronAnimatedBg from './themes/tron-animated.svg'
import tronMovingBg from './themes/tron-moving.svg'

const GLOW_THEMES = new Set([
  "Mrowr Purr - Synthwave '84",
  'Mrowr Purr - Tron',
  'Mrowr Purr - Tron (Animated)',
  'Mrowr Purr - Tron (Moving)',
  'Mrowr Purr - Dragon',
])

const WALLPAPER_THEMES: Record<string, { bg: string; bgColor: string }> = {
  'Mrowr Purr - Dragon': {
    bg: `url('${dragonBg}') center / cover no-repeat fixed`,
    bgColor: 'hsl(330 30% 6%)',
  },
  'Mrowr Purr - Dragon (Legacy)': {
    bg: `url('${dragonLegacyBg}') center / cover no-repeat fixed`,
    bgColor: 'hsl(215 20% 8%)',
  },
  'Mrowr Purr - Tron': {
    bg: `url('${tronBg}') center / cover no-repeat fixed`,
    bgColor: 'hsl(220 80% 4%)',
  },
  'Mrowr Purr - Tron (Animated)': {
    bg: `url('${tronAnimatedBg}') center / cover no-repeat fixed`,
    bgColor: 'hsl(220 80% 4%)',
  },
  'Mrowr Purr - Tron (Moving)': {
    bg: `url('${tronMovingBg}') center / cover no-repeat fixed`,
    bgColor: 'hsl(220 80% 4%)',
  },
}

function clearEffects() {
  const root = document.documentElement
  root.style.removeProperty('background')
  root.style.removeProperty('background-color')
  document.body.style.removeProperty('background')
  root.classList.remove('theme-glow')
  stopTronGrid()

  // Restore opaque app background
  const appDiv = document.getElementById('root')?.firstElementChild as HTMLElement | null
  if (appDiv) appDiv.style.removeProperty('background')
}

function applyWallpaper(bg: string, bgColor: string) {
  const root = document.documentElement
  // background shorthand: color first, then image on top.
  // SVGs have transparent backgrounds — the bgColor shows behind the lines.
  root.style.setProperty('background', `${bgColor} ${bg}`)
  document.body.style.setProperty('background', 'transparent', 'important')

  const appDiv = document.getElementById('root')?.firstElementChild as HTMLElement | null
  if (appDiv) appDiv.style.setProperty('background', 'transparent', 'important')
}

export function applyThemeEffects(themeName: string) {
  clearEffects()

  // Glow effect (CSS class for neon text shadows etc.)
  if (GLOW_THEMES.has(themeName)) {
    document.documentElement.classList.add('theme-glow')
  }

  // Wallpaper background
  const wallpaper = WALLPAPER_THEMES[themeName]
  if (wallpaper) {
    applyWallpaper(wallpaper.bg, wallpaper.bgColor)
  }

  // Animated tron grid canvas
  if (themeName === 'Mrowr Purr - Tron (Moving)') {
    const canvas = startTronGrid()
    if (!canvas.parentElement) document.body.prepend(canvas)
  }
}
