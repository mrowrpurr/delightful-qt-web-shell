#!/usr/bin/env node
// MCP server that connects to a running Qt app via CDP (Chrome DevTools Protocol).
// Exposes tools for snapshotting, clicking, filling, and evaluating JS on the live app.
//
// Usage: npx tsx tools/cdp-mcp/server.ts
// Requires: xmake run dev-desktop (Qt app with CDP on port 9222)
// NOTE: Must run under Node, not Bun — Bun's ws polyfill mishandles the HTTP 101 upgrade.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { chromium, type Browser, type Page } from "playwright"

const CDP_URL = "http://localhost:9222"

let browser: Browser | null = null
let appPage: Page | null = null

// ── console message buffer ─────────────────────────────────────────

interface ConsoleEntry {
  timestamp: string
  level: string
  text: string
}

const MAX_CONSOLE_BUFFER = 100
const consoleBuffer: ConsoleEntry[] = []

function pushConsoleEntry(entry: ConsoleEntry) {
  if (consoleBuffer.length >= MAX_CONSOLE_BUFFER) consoleBuffer.shift()
  consoleBuffer.push(entry)
}

async function getPage(): Promise<Page> {
  if (appPage && !appPage.isClosed()) return appPage

  browser = await chromium.connectOverCDP(CDP_URL)
  const pages = browser.contexts().flatMap(c => c.pages())
  const page = pages.find(p => {
    const url = p.url()
    return url !== "about:blank" && !url.startsWith("devtools://")
  })
  if (!page) throw new Error("No app page found. Is dev-desktop running?")

  page.on("console", (msg) => {
    pushConsoleEntry({
      timestamp: new Date().toISOString(),
      level: msg.type(),   // "log" | "warn" | "error" | "info" | "debug" etc.
      text: msg.text(),
    })
  })

  appPage = page
  return page
}

const server = new McpServer({
  name: "cdp-mcp",
  version: "0.1.0",
})

// ── snapshot ────────────────────────────────────────────────────────

server.registerTool(
  "snapshot",
  {
    description: "Get an accessibility snapshot of the running Qt app page",
    inputSchema: {},
  },
  async () => {
    const page = await getPage()
    const snapshot = await page.locator("body").ariaSnapshot()
    const title = await page.title()
    const url = page.url()
    return {
      content: [{
        type: "text" as const,
        text: `Page: ${title} (${url})\n\n${snapshot}`,
      }],
    }
  },
)

// ── screenshot ──────────────────────────────────────────────────────

server.registerTool(
  "screenshot",
  {
    description: "Take a screenshot of the running Qt app",
    inputSchema: {
      path: z.string().optional().describe("File path to save screenshot (default: screenshot.png)"),
    },
  },
  async ({ path }) => {
    const page = await getPage()
    const filePath = path || "screenshot.png"
    await page.screenshot({ path: filePath })
    return {
      content: [{
        type: "text" as const,
        text: `Screenshot saved to ${filePath}`,
      }],
    }
  },
)

// ── click ───────────────────────────────────────────────────────────

server.registerTool(
  "click",
  {
    description: "Click an element by test ID or CSS selector",
    inputSchema: {
      testId: z.string().optional().describe("data-testid value"),
      selector: z.string().optional().describe("CSS selector (used if testId not provided)"),
    },
  },
  async ({ testId, selector }) => {
    const page = await getPage()
    if (testId) {
      await page.getByTestId(testId).click()
      return { content: [{ type: "text" as const, text: `Clicked [data-testid="${testId}"]` }] }
    }
    if (selector) {
      await page.click(selector)
      return { content: [{ type: "text" as const, text: `Clicked ${selector}` }] }
    }
    throw new Error("Provide testId or selector")
  },
)

// ── fill ────────────────────────────────────────────────────────────

server.registerTool(
  "fill",
  {
    description: "Fill an input by test ID or CSS selector",
    inputSchema: {
      testId: z.string().optional().describe("data-testid value"),
      selector: z.string().optional().describe("CSS selector (used if testId not provided)"),
      value: z.string().describe("Text to type into the input"),
    },
  },
  async ({ testId, selector, value }) => {
    const page = await getPage()
    if (testId) {
      await page.getByTestId(testId).fill(value)
      return { content: [{ type: "text" as const, text: `Filled [data-testid="${testId}"] with "${value}"` }] }
    }
    if (selector) {
      await page.fill(selector, value)
      return { content: [{ type: "text" as const, text: `Filled ${selector} with "${value}"` }] }
    }
    throw new Error("Provide testId or selector")
  },
)

// ── press ───────────────────────────────────────────────────────────

server.registerTool(
  "press",
  {
    description: "Press a key (e.g. Enter, Tab, Escape)",
    inputSchema: {
      testId: z.string().optional().describe("data-testid of focused element"),
      selector: z.string().optional().describe("CSS selector of focused element"),
      key: z.string().describe("Key to press (e.g. Enter, Tab, Escape)"),
    },
  },
  async ({ testId, selector, key }) => {
    const page = await getPage()
    if (testId) {
      await page.getByTestId(testId).press(key)
    } else if (selector) {
      await page.press(selector, key)
    } else {
      await page.keyboard.press(key)
    }
    return { content: [{ type: "text" as const, text: `Pressed ${key}` }] }
  },
)

// ── evaluate ────────────────────────────────────────────────────────

server.registerTool(
  "evaluate",
  {
    description: "Evaluate JavaScript in the app's page context",
    inputSchema: {
      expression: z.string().describe("JavaScript expression to evaluate"),
    },
  },
  async ({ expression }) => {
    const page = await getPage()
    const result = await page.evaluate(expression)
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      }],
    }
  },
)

// ── text_content ────────────────────────────────────────────────────

server.registerTool(
  "text_content",
  {
    description: "Get text content of an element by test ID or CSS selector",
    inputSchema: {
      testId: z.string().optional().describe("data-testid value"),
      selector: z.string().optional().describe("CSS selector (used if testId not provided)"),
    },
  },
  async ({ testId, selector }) => {
    const page = await getPage()
    let text: string | null
    if (testId) {
      text = await page.getByTestId(testId).textContent()
    } else if (selector) {
      text = await page.textContent(selector)
    } else {
      throw new Error("Provide testId or selector")
    }
    return { content: [{ type: "text" as const, text: text || "(empty)" }] }
  },
)

// ── wait_for ────────────────────────────────────────────────────────

server.registerTool(
  "wait_for",
  {
    description: "Wait for an element to appear by test ID or CSS selector",
    inputSchema: {
      testId: z.string().optional().describe("data-testid value"),
      selector: z.string().optional().describe("CSS selector (used if testId not provided)"),
      timeout: z.number().optional().describe("Timeout in ms (default: 5000)"),
    },
  },
  async ({ testId, selector, timeout }) => {
    const page = await getPage()
    const ms = timeout || 5000
    if (testId) {
      await page.getByTestId(testId).waitFor({ timeout: ms })
      return { content: [{ type: "text" as const, text: `[data-testid="${testId}"] visible` }] }
    }
    if (selector) {
      await page.waitForSelector(selector, { timeout: ms })
      return { content: [{ type: "text" as const, text: `${selector} visible` }] }
    }
    throw new Error("Provide testId or selector")
  },
)

// ── console_messages ───────────────────────────────────────────────

server.registerTool(
  "console_messages",
  {
    description: "Return buffered browser console messages (last 100). Optionally filter by level, limit count, and clear the buffer.",
    inputSchema: {
      level: z.string().optional().describe("Filter by level (e.g. 'error', 'warn', 'log', 'info', 'debug')"),
      count: z.number().optional().describe("Max number of messages to return (most recent first)"),
      clear: z.boolean().optional().describe("Clear the buffer after reading (default: false)"),
    },
  },
  async ({ level, count, clear }) => {
    let messages = level
      ? consoleBuffer.filter(m => m.level === level)
      : [...consoleBuffer]

    if (count !== undefined) {
      messages = messages.slice(-count)
    }

    const text = messages.length === 0
      ? "(no console messages)"
      : JSON.stringify(messages, null, 2)

    if (clear) {
      consoleBuffer.length = 0
    }

    return {
      content: [{
        type: "text" as const,
        text,
      }],
    }
  },
)

// ── start ───────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("cdp-mcp: ready (connecting to CDP at " + CDP_URL + ")")
}

main().catch((err) => {
  console.error("cdp-mcp fatal:", err)
  process.exit(1)
})
