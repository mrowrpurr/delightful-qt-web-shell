import { test, expect, beforeAll, afterAll } from 'bun:test'
import { createWsConnection, type BridgeConnection } from '../../../../web/shared/api/bridge-transport'
import { spawn, type Subprocess } from 'bun'
import fs from 'fs'
import path from 'path'
import os from 'os'

// These tests launch the REAL dev-server and verify that SystemBridge's
// file I/O, directory listing, and streaming handle methods work correctly
// through the actual bridge protocol using def_type request DTOs.
//
// Methods NOT tested here (they open native OS dialogs, can't run headless):
//   - openFileChooser, openFolderChooser, openDialog
//
// Clipboard NOT tested here — dev-server uses QCoreApplication which has
// no clipboard support (requires QGuiApplication / QApplication).

const PORT = 19878
let server: Subprocess
let conn: BridgeConnection

let tmpDir: string

interface SystemBridge {
  listFolder(req: { path: string }): Promise<{ entries: Array<{ name: string; isDir: boolean; size: number }> }>
  globFolder(req: { path: string; pattern: string; recursive: boolean }): Promise<{ paths: string[] }>
  readTextFile(req: { path: string }): Promise<{ text: string }>
  readFileBytes(req: { path: string }): Promise<{ data: string }>
  openFileHandle(req: { path: string }): Promise<{ handle: string; size: number }>
  readFileChunk(req: { handle: string; offset: number; length: number }): Promise<{ data: string; bytesRead: number }>
  closeFileHandle(req: { handle: string }): Promise<{ ok: boolean }>
  getDroppedFiles(): Promise<string[]>
  getReceivedArgs(): Promise<string[]>
}

beforeAll(async () => {
  tmpDir = path.join(os.tmpdir(), `system-bridge-test-${Date.now()}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  fs.mkdirSync(path.join(tmpDir, 'subdir'), { recursive: true })

  fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'Hello, World!')
  fs.writeFileSync(path.join(tmpDir, 'data.json'), '{"key": "value"}')
  fs.writeFileSync(path.join(tmpDir, 'binary.bin'), Buffer.from([0x00, 0x01, 0x02, 0xFF]))
  fs.writeFileSync(path.join(tmpDir, 'large.txt'), 'A'.repeat(10000))
  fs.writeFileSync(path.join(tmpDir, 'subdir', 'nested.txt'), 'nested content')
  fs.writeFileSync(path.join(tmpDir, 'subdir', 'nested.json'), '{}')

  const binaryPath = fs.readFileSync('build/.dev-server-binary.txt', 'utf8').trim()
  if (!fs.existsSync(binaryPath))
    throw new Error(`dev-server binary not found at ${binaryPath} — run xmake build dev-server`)

  server = spawn([binaryPath, '--port', String(PORT)], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

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
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})

function bridge() {
  return conn.bridge<SystemBridge>('system')
}

function normPath(p: string) {
  return p.replace(/\\/g, '/')
}

// ── readTextFile ──────────────────────────────────────────────────────

test('readTextFile returns file contents as UTF-8 string', async () => {
  const result = await bridge().readTextFile({ path: path.join(tmpDir, 'hello.txt') })
  expect(result.text).toBe('Hello, World!')
})

test('readTextFile reads JSON file correctly', async () => {
  const result = await bridge().readTextFile({ path: path.join(tmpDir, 'data.json') })
  expect(result.text).toBe('{"key": "value"}')
})

test('readTextFile throws for nonexistent file', async () => {
  try {
    await bridge().readTextFile({ path: path.join(tmpDir, 'nope.txt') })
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('does not exist')
  }
})

// ── readFileBytes ─────────────────────────────────────────────────────

test('readFileBytes returns base64 encoded content', async () => {
  const result = await bridge().readFileBytes({ path: path.join(tmpDir, 'binary.bin') })
  const decoded = Buffer.from(result.data, 'base64')
  expect(decoded[0]).toBe(0x00)
  expect(decoded[1]).toBe(0x01)
  expect(decoded[2]).toBe(0x02)
  expect(decoded[3]).toBe(0xFF)
})

test('readFileBytes throws for nonexistent file', async () => {
  try {
    await bridge().readFileBytes({ path: path.join(tmpDir, 'nope.bin') })
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('does not exist')
  }
})

// ── listFolder ────────────────────────────────────────────────────────

test('listFolder returns entries with name, isDir, size', async () => {
  const result = await bridge().listFolder({ path: tmpDir })
  const entries = result.entries

  const names = entries.map(e => e.name).sort()
  expect(names).toContain('hello.txt')
  expect(names).toContain('data.json')
  expect(names).toContain('binary.bin')
  expect(names).toContain('large.txt')
  expect(names).toContain('subdir')

  const subdir = entries.find(e => e.name === 'subdir')
  expect(subdir?.isDir).toBe(true)

  const hello = entries.find(e => e.name === 'hello.txt')
  expect(hello?.isDir).toBe(false)
  expect(hello?.size).toBe(13)
})

test('listFolder throws for nonexistent folder', async () => {
  try {
    await bridge().listFolder({ path: path.join(tmpDir, 'nonexistent') })
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('does not exist')
  }
})

test('listFolder excludes . and ..', async () => {
  const result = await bridge().listFolder({ path: tmpDir })
  const names = result.entries.map(e => e.name)
  expect(names).not.toContain('.')
  expect(names).not.toContain('..')
})

// ── globFolder ────────────────────────────────────────────────────────

test('globFolder matches by pattern', async () => {
  const result = await bridge().globFolder({ path: tmpDir, pattern: '*.txt', recursive: false })
  const paths = result.paths.map(normPath)
  expect(paths.length).toBe(2)
  expect(paths.some(p => p.endsWith('/hello.txt'))).toBe(true)
  expect(paths.some(p => p.endsWith('/large.txt'))).toBe(true)
})

test('globFolder matches JSON files', async () => {
  const result = await bridge().globFolder({ path: tmpDir, pattern: '*.json', recursive: false })
  const paths = result.paths.map(normPath)
  expect(paths.length).toBe(1)
  expect(paths[0]).toContain('data.json')
})

test('globFolder recursive finds nested files', async () => {
  const result = await bridge().globFolder({ path: tmpDir, pattern: '*.txt', recursive: true })
  const paths = result.paths.map(normPath)
  expect(paths.length).toBe(3)
  expect(paths.some(p => p.endsWith('/nested.txt'))).toBe(true)
})

test('globFolder non-recursive does NOT find nested files', async () => {
  const result = await bridge().globFolder({ path: tmpDir, pattern: '*.txt', recursive: false })
  const paths = result.paths.map(normPath)
  expect(paths.length).toBe(2)
  expect(paths.some(p => p.endsWith('/nested.txt'))).toBe(false)
})

test('globFolder throws for nonexistent folder', async () => {
  try {
    await bridge().globFolder({ path: path.join(tmpDir, 'nope'), pattern: '*.txt', recursive: false })
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('does not exist')
  }
})

// ── File handles (streaming) ──────────────────────────────────────────

test('openFileHandle returns handle and size', async () => {
  const result = await bridge().openFileHandle({ path: path.join(tmpDir, 'hello.txt') })
  expect(result.size).toBe(13)
  expect(typeof result.handle).toBe('string')
  await bridge().closeFileHandle({ handle: result.handle })
})

test('openFileHandle throws for nonexistent file', async () => {
  try {
    await bridge().openFileHandle({ path: path.join(tmpDir, 'nope.txt') })
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('does not exist')
  }
})

test('readFileChunk reads correct bytes from offset', async () => {
  const openResult = await bridge().openFileHandle({ path: path.join(tmpDir, 'hello.txt') })
  const handle = openResult.handle

  const chunk1 = await bridge().readFileChunk({ handle, offset: 0, length: 5 })
  expect(chunk1.bytesRead).toBe(5)
  expect(Buffer.from(chunk1.data, 'base64').toString('utf8')).toBe('Hello')

  const chunk2 = await bridge().readFileChunk({ handle, offset: 7, length: 5 })
  expect(chunk2.bytesRead).toBe(5)
  expect(Buffer.from(chunk2.data, 'base64').toString('utf8')).toBe('World')

  await bridge().closeFileHandle({ handle })
})

test('readFileChunk throws for invalid handle', async () => {
  try {
    await bridge().readFileChunk({ handle: 'bogus-handle-123', offset: 0, length: 10 })
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('Invalid handle')
  }
})

test('closeFileHandle succeeds for open handle', async () => {
  const openResult = await bridge().openFileHandle({ path: path.join(tmpDir, 'hello.txt') })
  const closeResult = await bridge().closeFileHandle({ handle: openResult.handle })
  expect(closeResult.ok).toBe(true)
})

test('closeFileHandle throws for invalid handle', async () => {
  try {
    await bridge().closeFileHandle({ handle: 'bogus-handle-456' })
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('Invalid handle')
  }
})

test('double close throws on second close', async () => {
  const openResult = await bridge().openFileHandle({ path: path.join(tmpDir, 'hello.txt') })
  const handle = openResult.handle

  await bridge().closeFileHandle({ handle })
  try {
    await bridge().closeFileHandle({ handle })
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('Invalid handle')
  }
})

test('streaming reads entire file in chunks', async () => {
  const openResult = await bridge().openFileHandle({ path: path.join(tmpDir, 'large.txt') })
  const handle = openResult.handle
  const size = openResult.size
  expect(size).toBe(10000)

  let totalRead = 0
  let allData = Buffer.alloc(0)
  while (totalRead < size) {
    const chunkSize = Math.min(4096, size - totalRead)
    const chunk = await bridge().readFileChunk({ handle, offset: totalRead, length: chunkSize })
    const decoded = Buffer.from(chunk.data, 'base64')
    allData = Buffer.concat([allData, decoded])
    totalRead += chunk.bytesRead
  }

  expect(totalRead).toBe(10000)
  expect(allData.toString('utf8')).toBe('A'.repeat(10000))

  await bridge().closeFileHandle({ handle })
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
