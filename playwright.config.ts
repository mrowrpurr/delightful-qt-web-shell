import { defineConfig } from '@playwright/test'
import fs from 'fs'

// ── Mode selection ───────────────────────────────────────────────────
//
//   npx playwright test                → browser (Chromium + Vite + C++ backend)
//   DESKTOP=1 npx playwright test      → desktop (real Qt app via CDP)
//
// Same tests, same assertions, different runtime.

const isDesktop = process.env.DESKTOP === '1'

// Run the dev-server exe directly so Playwright can kill it cleanly.
// Going through `xmake run` creates a grandchild process that orphans
// on Windows when Playwright terminates the parent xmake process.
function getDevServerCommand(): string {
  try {
    const exe = fs.readFileSync('build/.dev-server-binary.txt', 'utf8').trim()
    if (fs.existsSync(exe)) return exe
  } catch {}
  // Fallback for first run (before any build). Works but leaks on Windows.
  return 'xmake run dev-server'
}

export default defineConfig({
  timeout: 30_000,
  testDir: './tests/playwright',
  use: isDesktop ? {} : { baseURL: 'http://localhost:5173' },

  // In desktop mode, the Qt app is the server — no Vite or backend needed.
  webServer: isDesktop ? [] : [
    {
      command: 'bun run dev:main',
      cwd: './web',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      env: { VITE_APP_NAME: process.env.VITE_APP_NAME || 'Test App' },
    },
    {
      command: getDevServerCommand(),
      port: 9876,
      stdout: 'pipe' as const,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
