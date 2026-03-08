import { test as base, expect, chromium, type Page, type Browser } from '@playwright/test'
import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'

// Unified test fixture: same tests run against either a browser or the real Qt app.
//
//   DESKTOP=1 npx playwright test    → launches Qt .exe, connects via CDP
//   npx playwright test              → normal Playwright browser + Vite dev server
//
// Requires: playwright-core patch (patches/playwright-core@*.patch)

const isDesktop = process.env.DESKTOP === '1'

if (isDesktop) {
  // QtWebEngine reports targets as type "other" instead of "page"
  process.env.PW_CHROMIUM_ATTACH_TO_OTHER = '1'
}

function getExePath(): string {
  return fs.readFileSync('build/.desktop-binary.txt', 'utf8').trim()
}

type Fixtures = { page: Page; goHome: () => Promise<void> }

const desktopTest = base.extend<Fixtures>({
      page: async ({}, use) => {
        let qtProcess: ChildProcess | null = null
        let browser: Browser | null = null

        try {
          // Launch the real Qt app with CDP enabled
          qtProcess = spawn(getExePath(), [], {
            env: { ...process.env, QTWEBENGINE_REMOTE_DEBUGGING: '9222' },
            stdio: 'ignore',
          })

          // Wait for CDP to be available
          await new Promise<void>((resolve, reject) => {
            qtProcess!.on('error', (err) => reject(new Error(`Failed to launch Qt app: ${err.message}`)))
            const start = Date.now()
            const poll = async () => {
              try {
                const res = await fetch('http://localhost:9222/json')
                const pages = await res.json() as Array<{ webSocketDebuggerUrl: string }>
                if (pages.length > 0) return resolve()
              } catch {}
              if (Date.now() - start > 15_000) return reject(new Error('Qt app CDP timeout'))
              setTimeout(poll, 250)
            }
            poll()
          })

          // Connect Playwright to the running Qt app
          browser = await chromium.connectOverCDP('http://localhost:9222')

          // Find the actual app page (skip devtools:// and blank pages)
          const findAppPage = (): Page | undefined =>
            browser!.contexts().flatMap(c => c.pages()).find(p => {
              const url = p.url()
              return url !== 'about:blank' && !url.startsWith('devtools://')
            })

          const start = Date.now()
          let page: Page | undefined
          while (Date.now() - start < 10_000) {
            page = findAppPage()
            if (page) break
            await new Promise(r => setTimeout(r, 500))
          }
          if (!page) throw new Error('No app page found in Qt')

          await use(page)
        } finally {
          await browser?.close().catch(() => {})
          qtProcess?.kill()
        }
      },
      goHome: async ({ page }, use) => {
        await use(async () => {
          await expect(page.getByTestId('heading')).toBeVisible({ timeout: 10_000 })
        })
      },
    })

const browserTest = base.extend<Fixtures>({
      goHome: async ({ page }, use) => {
        await use(async () => {
          await page.goto('/')
          await expect(page.getByTestId('heading')).toBeVisible({ timeout: 10_000 })
        })
      },
    })

export const test = isDesktop ? desktopTest : browserTest

export { expect }
