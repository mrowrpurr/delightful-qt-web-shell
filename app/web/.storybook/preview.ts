import type { Preview } from '@storybook/react-vite'
import { addons } from 'storybook/preview-api'
import '../shared/styles/globals.css'

// Storybook is a dev tool, not the production load path — it imports themes.json
// directly so the addon panel has the full data to search/select. The desktop app
// uses lazy-loaded per-theme modules (see web/shared/lib/themes.ts).
import { applyTheme, isDarkMode, setDarkMode } from '@app/theming/lib/themes'
import { setFontData, initFont, applyFont, getGoogleFontsSync } from '@app/theming/lib/fonts'
import themesJson from '@app/theming/data/themes.json'
import fontsJson from '@app/theming/data/google-fonts.json'

interface RawThemeEntry {
  name: string
  source?: string
  light: Record<string, string>
  dark: Record<string, string>
}

const themes: RawThemeEntry[] = themesJson as RawThemeEntry[]
setFontData(fontsJson as any)
initFont()

// Apply the saved theme on Storybook startup
const savedName = localStorage.getItem('theme-name') || 'Default'
const initialTheme = themes.find(t => t.name === savedName)
if (initialTheme) applyTheme({ name: initialTheme.name, light: initialTheme.light, dark: initialTheme.dark }, isDarkMode())

// Listen for theme/font changes from the addon panel
const channel = addons.getChannel()

channel.on('theme-addon:request-data', () => {
  channel.emit('theme-addon:data', {
    themes,
    fonts: getGoogleFontsSync(),
  })
})

channel.on('theme-addon:set-theme', ({ name, dark }: { name: string; dark: boolean }) => {
  setDarkMode(dark)
  const theme = themes.find(t => t.name === name)
  if (theme) applyTheme({ name: theme.name, light: theme.light, dark: theme.dark }, dark)
  document.body.style.backgroundColor = ''
})

channel.on('theme-addon:set-font', ({ family }: { family: string | null }) => {
  applyFont(family, 'app')
})

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    a11y: {
      test: 'todo',
    },
    backgrounds: { disable: true },
  },
}

export default preview
