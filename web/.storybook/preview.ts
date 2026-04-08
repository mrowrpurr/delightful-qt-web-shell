import type { Preview } from '@storybook/react-vite'
import { addons } from 'storybook/preview-api'
import '../shared/styles/globals.css'

// Load theme + font data (same as the app does in main.tsx)
import { setThemeData, initTheme, applyTheme, getThemesSync, setDarkMode, isDarkMode } from '../shared/lib/themes'
import { setFontData, initFont, applyFont, getGoogleFontsSync } from '../shared/lib/fonts'
import themesJson from '../shared/data/themes.json'
import fontsJson from '../shared/data/google-fonts.json'

setThemeData(themesJson as any)
setFontData(fontsJson as any)
initTheme()
initFont()

// Listen for theme/font changes from the addon panel
const channel = addons.getChannel()

channel.on('theme-addon:request-data', () => {
  channel.emit('theme-addon:data', {
    themes: getThemesSync(),
    fonts: getGoogleFontsSync(),
  })
})

channel.on('theme-addon:set-theme', ({ name, dark }: { name: string; dark: boolean }) => {
  setDarkMode(dark)
  const themes = getThemesSync()
  const theme = themes.find(t => t.name === name)
  if (theme) applyTheme(theme, dark)
  // Update Storybook background to match
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
