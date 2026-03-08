import { test, expect } from '@playwright/test'
import { spawn, type ChildProcess } from 'child_process'
import path from 'path'
import WebSocket from 'ws'

// CDP smoke test: launches the REAL Qt desktop app, connects to its
// WebEngine via Chrome DevTools Protocol, and verifies the React app
// rendered inside Qt.
//
// Note: We use raw CDP instead of Playwright's connectOverCDP because
// QtWebEngine doesn't support Browser.setDownloadBehavior which
// Playwright requires. Raw CDP gives us exactly what we need.
//
// Requires: desktop target built (`xmake build desktop`)

let qtProcess: ChildProcess | null = null

test.afterEach(async () => {
  if (qtProcess) {
    qtProcess.kill()
    qtProcess = null
  }
})

function getExePath(): string {
  const platform = process.platform
  if (platform === 'win32')
    return path.resolve('build/windows/x64/release/Delightful Qt Web Shell.exe')
  if (platform === 'darwin')
    return path.resolve('build/macosx/arm64/release/Delightful Qt Web Shell')
  // Linux
  return path.resolve('build/linux/x86_64/release/delightful-qt-web-shell')
}

function launchQtApp(): Promise<void> {
  return new Promise((resolve, reject) => {
    const exePath = getExePath()

    qtProcess = spawn(exePath, [], {
      env: {
        ...process.env,
        QTWEBENGINE_REMOTE_DEBUGGING: '9222',
      },
      stdio: 'ignore',
    })

    qtProcess.on('error', (err) => reject(new Error(`Failed to launch Qt app: ${err.message}`)))

    // Give the app time to start and render
    setTimeout(resolve, 5000)
  })
}

async function getPageDebugUrl(): Promise<string> {
  // Fetch the list of debuggable pages from Qt's CDP endpoint
  const response = await fetch('http://localhost:9222/json')
  const pages = await response.json() as Array<{ webSocketDebuggerUrl: string; title: string }>
  if (pages.length === 0) throw new Error('No debuggable pages found')
  return pages[0].webSocketDebuggerUrl
}

function cdpEvaluate(wsUrl: string, expression: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const id = 1

    ws.on('open', () => {
      ws.send(JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true },
      }))
    })

    ws.on('message', (data: WebSocket.Data) => {
      const msg = JSON.parse(data.toString())
      if (msg.id === id) {
        ws.close()
        if (msg.result?.result?.value !== undefined) {
          resolve(msg.result.result.value)
        } else if (msg.result?.exceptionDetails) {
          reject(new Error(msg.result.exceptionDetails.text))
        } else {
          resolve(msg.result?.result)
        }
      }
    })

    ws.on('error', reject)
    setTimeout(() => { ws.close(); reject(new Error('CDP timeout')) }, 10_000)
  })
}

test('Qt app renders the React heading', async () => {
  await launchQtApp()

  const wsUrl = await getPageDebugUrl()

  // Evaluate in the page context — check the heading text
  const headingText = await cdpEvaluate(wsUrl,
    `document.querySelector('[data-testid="heading"]')?.textContent || ''`
  )

  expect(headingText).toBe('Delightful Qt Web Shell')
})

test('Qt app bridge responds to method calls', async () => {
  await launchQtApp()

  const wsUrl = await getPageDebugUrl()

  // Create a list via the bridge and verify it shows up
  // First, type into the input and click the button via JS
  await cdpEvaluate(wsUrl, `
    const input = document.querySelector('[data-testid="new-list-input"]');
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    ).set;
    nativeInputValueSetter.call(input, 'Smoke Test List');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  `)

  await cdpEvaluate(wsUrl, `
    document.querySelector('[data-testid="create-list-button"]').click()
  `)

  // Wait a moment for React to re-render
  await new Promise(r => setTimeout(r, 1000))

  // Check the list appeared
  const listText = await cdpEvaluate(wsUrl, `
    document.querySelector('[data-testid="todo-list"]')?.textContent || ''
  `)

  expect(listText).toContain('Smoke Test List')
})
