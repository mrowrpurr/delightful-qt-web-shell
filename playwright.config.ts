import { defineConfig } from '@playwright/test'

// ── Mode selection ───────────────────────────────────────────────────
//
//   npx playwright test                → browser (Chromium + Vite + C++ backend)
//   DESKTOP=1 npx playwright test      → desktop (real Qt app via CDP)
//
// Same tests, same assertions, different runtime.

const isDesktop = process.env.DESKTOP === '1'

export default defineConfig({
  timeout: 30_000,
  testDir: './tests/playwright',
  use: isDesktop ? {} : { baseURL: 'http://localhost:5173' },

  // In desktop mode, the Qt app is the server — no Vite or backend needed.
  webServer: isDesktop ? [] : [
    {
      command: 'bun run dev',
      cwd: './web',
      port: 5173,
      reuseExistingServer: !process.env.CI,
      env: { VITE_APP_NAME: process.env.VITE_APP_NAME || 'Test App' },
    },
    {
      command: 'xmake run dev-server',
      port: 9876,
      stdout: 'pipe' as const,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
