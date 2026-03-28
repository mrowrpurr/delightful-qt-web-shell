import { test, expect, beforeAll, afterAll } from 'bun:test'
import { createWsConnection, type BridgeConnection } from '../../../../web/shared/api/bridge-transport'
import { spawn, type Subprocess } from 'bun'
import fs from 'fs'
import path from 'path'
import os from 'os'

// These tests launch the REAL dev-server and verify that SystemBridge's
// file I/O, directory listing, and streaming handle methods work correctly
// through the actual bridge protocol.
//
// Methods NOT tested here (they open native OS dialogs, can't run headless):
//   - openFileChooser, openFolderChooser, openDialog
//
// Clipboard NOT tested here — dev-server uses QCoreApplication which has
// no clipboard support (requires QGuiApplication / QApplication).

const PORT = 19878  // different from type_conversion_test to avoid conflicts
let server: Subprocess
let conn: BridgeConnection

// Temp directory for test files — cleaned up in afterAll
let tmpDir: string

interface SystemBridge {
  // Directory listing
  listFolder(path: string): Promise<{ entries: Array<{ name: string; isDir: boolean; size: number }> }>
  globFolder(path: string, pattern: string, recursive: boolean): Promise<{ paths: string[] }>
  // Simple file reads
  readTextFile(path: string): Promise<{ text: string }>
  readFileBytes(path: string): Promise<{ data: string }>
  // Streaming handles
  openFileHandle(path: string): Promise<{ handle: string; size: number }>
  readFileChunk(handle: string, offset: number, length: number): Promise<{ data: string; bytesRead: number }>
  closeFileHandle(handle: string): Promise<{ ok: boolean }>
  // Args / drop (no-op in headless, but we can call getters)
  getDroppedFiles(): Promise<string[]>
  getReceivedArgs(): Promise<string[]>
}

beforeAll(async () => {
  // Create temp directory with test fixtures
  tmpDir = path.join(os.tmpdir(), `system-bridge-test-${Date.now()}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  fs.mkdirSync(path.join(tmpDir, 'subdir'), { recursive: true })

  // Create test files
  fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'Hello, World!')
  fs.writeFileSync(path.join(tmpDir, 'data.json'), '{"key": "value"}')
  fs.writeFileSync(path.join(tmpDir, 'binary.bin'), Buffer.from([0x00, 0x01, 0x02, 0xFF]))
  fs.writeFileSync(path.join(tmpDir, 'large.txt'), 'A'.repeat(10000))
  fs.writeFileSync(path.join(tmpDir, 'subdir', 'nested.txt'), 'nested content')
  fs.writeFileSync(path.join(tmpDir, 'subdir', 'nested.json'), '{}')

  // Find and launch dev-server
  const binaryPath = fs.readFileSync('build/.dev-server-binary.txt', 'utf8').trim()
  if (!fs.existsSync(binaryPath))
    throw new Error(`dev-server binary not found at ${binaryPath} — run xmake build dev-server`)

  server = spawn([binaryPath, '--port', String(PORT)], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  // Wait for server to be ready
  const start = Date.now()
  while (Date.now() - start < 10000) {
    try {
      conn = await createWsConnection(`ws://localhost:${PORT}`)
      return
    } catch {
      await new Promise(r => setTimeout(r, 200))
    }
  }
  throw new Error('dev-server did not start within 10s')
})

afterAll(() => {
  server?.kill()
  // Clean up temp files
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

function bridge() {
  return conn.bridge<SystemBridge>('system')
}

// Helper: normalize paths for cross-platform comparison
function normPath(p: string) {
  return p.replace(/\\/g, '/')
}

// ── readTextFile ──────────────────────────────────────────────────────

test('readTextFile returns file contents as UTF-8 string', async () => {
  const result = await bridge().readTextFile(path.join(tmpDir, 'hello.txt'))
  expect(result.text).toBe('Hello, World!')
})

test('readTextFile reads JSON file correctly', async () => {
  const result = await bridge().readTextFile(path.join(tmpDir, 'data.json'))
  expect(result.text).toBe('{"key": "value"}')
})

test('readTextFile throws for nonexistent file', async () => {
  try {
    await bridge().readTextFile(path.join(tmpDir, 'nope.txt'))
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('does not exist')
  }
})

// ── readFileBytes ─────────────────────────────────────────────────────

test('readFileBytes returns base64 encoded content', async () => {
  const result = await bridge().readFileBytes(path.join(tmpDir, 'binary.bin'))
  const decoded = Buffer.from(result.data, 'base64')
  expect(decoded[0]).toBe(0x00)
  expect(decoded[1]).toBe(0x01)
  expect(decoded[2]).toBe(0x02)
  expect(decoded[3]).toBe(0xFF)
})

test('readFileBytes throws for nonexistent file', async () => {
  try {
    await bridge().readFileBytes(path.join(tmpDir, 'nope.bin'))
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('does not exist')
  }
})

// ── listFolder ────────────────────────────────────────────────────────

test('listFolder returns entries with name, isDir, size', async () => {
  const result = await bridge().listFolder(tmpDir)
  const entries = result.entries

  const names = entries.map(e => e.name).sort()
  expect(names).toContain('hello.txt')
  expect(names).toContain('data.json')
  expect(names).toContain('binary.bin')
  expect(names).toContain('large.txt')
  expect(names).toContain('subdir')

  // subdir should be flagged as directory
  const subdir = entries.find(e => e.name === 'subdir')
  expect(subdir?.isDir).toBe(true)

  // hello.txt should have correct size
  const hello = entries.find(e => e.name === 'hello.txt')
  expect(hello?.isDir).toBe(false)
  expect(hello?.size).toBe(13)  // "Hello, World!" = 13 bytes
})

test('listFolder throws for nonexistent folder', async () => {
  try {
    await bridge().listFolder(path.join(tmpDir, 'nonexistent'))
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('does not exist')
  }
})

test('listFolder excludes . and ..', async () => {
  const result = await bridge().listFolder(tmpDir)
  const names = result.entries.map(e => e.name)
  expect(names).not.toContain('.')
  expect(names).not.toContain('..')
})

// ── globFolder ────────────────────────────────────────────────────────
// Note: recursive param is required over the wire (C++ default params
// don't translate through JSON-RPC — must always pass all 3 args).

test('globFolder matches by pattern', async () => {
  const result = await bridge().globFolder(tmpDir, '*.txt', false)
  const paths = result.paths.map(normPath)
  expect(paths.length).toBe(2)  // hello.txt, large.txt
  expect(paths.some(p => p.endsWith('/hello.txt'))).toBe(true)
  expect(paths.some(p => p.endsWith('/large.txt'))).toBe(true)
})

test('globFolder matches JSON files', async () => {
  const result = await bridge().globFolder(tmpDir, '*.json', false)
  const paths = result.paths.map(normPath)
  expect(paths.length).toBe(1)
  expect(paths[0]).toContain('data.json')
})

test('globFolder recursive finds nested files', async () => {
  const result = await bridge().globFolder(tmpDir, '*.txt', true)
  const paths = result.paths.map(normPath)
  expect(paths.length).toBe(3)  // hello.txt, large.txt, subdir/nested.txt
  expect(paths.some(p => p.endsWith('/nested.txt'))).toBe(true)
})

test('globFolder non-recursive does NOT find nested files', async () => {
  const result = await bridge().globFolder(tmpDir, '*.txt', false)
  const paths = result.paths.map(normPath)
  expect(paths.length).toBe(2)  // hello.txt, large.txt — no nested.txt
  expect(paths.some(p => p.endsWith('/nested.txt'))).toBe(false)
})

test('globFolder throws for nonexistent folder', async () => {
  try {
    await bridge().globFolder(path.join(tmpDir, 'nope'), '*.txt', false)
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('does not exist')
  }
})

// ── File handles (streaming) ──────────────────────────────────────────

test('openFileHandle returns handle and size', async () => {
  const result = await bridge().openFileHandle(path.join(tmpDir, 'hello.txt'))
  expect(result.size).toBe(13)
  expect(typeof result.handle).toBe('string')

  // Clean up
  await bridge().closeFileHandle(result.handle)
})

test('openFileHandle throws for nonexistent file', async () => {
  try {
    await bridge().openFileHandle(path.join(tmpDir, 'nope.txt'))
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('does not exist')
  }
})

test('readFileChunk reads correct bytes from offset', async () => {
  const openResult = await bridge().openFileHandle(path.join(tmpDir, 'hello.txt'))
  const handle = openResult.handle

  // Read "Hello" (first 5 bytes)
  const chunk1 = await bridge().readFileChunk(handle, 0, 5)
  expect(chunk1.bytesRead).toBe(5)
  const decoded1 = Buffer.from(chunk1.data, 'base64').toString('utf8')
  expect(decoded1).toBe('Hello')

  // Read "World" (bytes 7-11)
  const chunk2 = await bridge().readFileChunk(handle, 7, 5)
  expect(chunk2.bytesRead).toBe(5)
  const decoded2 = Buffer.from(chunk2.data, 'base64').toString('utf8')
  expect(decoded2).toBe('World')

  await bridge().closeFileHandle(handle)
})

test('readFileChunk throws for invalid handle', async () => {
  try {
    await bridge().readFileChunk('bogus-handle-123', 0, 10)
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('Invalid handle')
  }
})

test('closeFileHandle succeeds for open handle', async () => {
  const openResult = await bridge().openFileHandle(path.join(tmpDir, 'hello.txt'))
  const closeResult = await bridge().closeFileHandle(openResult.handle)
  expect(closeResult.ok).toBe(true)
})

test('closeFileHandle throws for invalid handle', async () => {
  try {
    await bridge().closeFileHandle('bogus-handle-456')
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('Invalid handle')
  }
})

test('double close throws on second close', async () => {
  const openResult = await bridge().openFileHandle(path.join(tmpDir, 'hello.txt'))
  const handle = openResult.handle

  await bridge().closeFileHandle(handle)
  try {
    await bridge().closeFileHandle(handle)
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('Invalid handle')
  }
})

test('streaming reads entire file in chunks', async () => {
  const openResult = await bridge().openFileHandle(path.join(tmpDir, 'large.txt'))
  const handle = openResult.handle
  const size = openResult.size
  expect(size).toBe(10000)

  // Read in 4096-byte chunks
  let totalRead = 0
  let allData = Buffer.alloc(0)
  while (totalRead < size) {
    const chunkSize = Math.min(4096, size - totalRead)
    const chunk = await bridge().readFileChunk(handle, totalRead, chunkSize)
    const decoded = Buffer.from(chunk.data, 'base64')
    allData = Buffer.concat([allData, decoded])
    totalRead += chunk.bytesRead
  }

  expect(totalRead).toBe(10000)
  expect(allData.toString('utf8')).toBe('A'.repeat(10000))

  await bridge().closeFileHandle(handle)
})

// ── Getter methods (no-op state, but must not crash) ──────────────────

test('getDroppedFiles returns empty array when nothing dropped', async () => {
  const result = await bridge().getDroppedFiles()
  expect(Array.isArray(result)).toBe(true)
  expect(result.length).toBe(0)
})

test('getReceivedArgs returns array', async () => {
  const result = await bridge().getReceivedArgs()
  expect(Array.isArray(result)).toBe(true)
})
