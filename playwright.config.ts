import { defineConfig } from '@playwright/test'

// ── Mode selection ───────────────────────────────────────────────────
//
//   npx playwright test                → browser (Chromium + Vite + backend)
//   DESKTOP=1 npx playwright test      → desktop (real Qt app via CDP)
//   BRIDGE_SERVER=bun npx playwright test  → browser with Bun mock backend
//
// Same tests, same assertions, different runtime.

const isDesktop = process.env.DESKTOP === '1'
const useBun = process.env.BRIDGE_SERVER === 'bun'

const bridgeServer = useBun
  ? { command: 'bun run tests/helpers/server.ts', port: 9876 }
  : { command: 'xmake run test-server', port: 9876, stdout: 'pipe' as const }

export default defineConfig({
  timeout: 30_000,
  testDir: './tests/e2e',
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
      ...bridgeServer,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
