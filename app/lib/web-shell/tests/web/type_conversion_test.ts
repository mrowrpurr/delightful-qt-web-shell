import { test, expect, beforeAll, afterAll } from 'bun:test'
import { createWsConnection, type BridgeConnection } from '../../../../web/shared/api/bridge-transport'
import { spawn, type Subprocess } from 'bun'
import fs from 'fs'

// Tests for the def_type bridge system — typed bridges with def_type DTOs.
// Launches the REAL dev-server and verifies end-to-end bridge behavior.

const PORT = 19877
let server: Subprocess
let conn: BridgeConnection

interface TodoBridgeForTest {
  addList(req: { name: string }): Promise<{ id: string; name: string; item_count: number; created_at: string }>
  listLists(): Promise<Array<{ id: string; name: string; item_count: number; created_at: string }>>
  getList(req: { list_id: string }): Promise<{ list: any; items: any[] }>
  addItem(req: { list_id: string; text: string }): Promise<{ id: string; list_id: string; text: string; done: boolean }>
  toggleItem(req: { item_id: string }): Promise<{ id: string; text: string; done: boolean }>
  deleteList(req: { list_id: string }): Promise<{ ok: boolean }>
  deleteItem(req: { item_id: string }): Promise<{ ok: boolean }>
  renameList(req: { list_id: string; new_name: string }): Promise<{ id: string; name: string }>
  search(req: { query: string }): Promise<Array<{ id: string; text: string }>>
  listAdded: (cb: (data: any) => void) => () => void
  listRenamed: (cb: (data: any) => void) => () => void
  listDeleted: (cb: (data: any) => void) => () => void
  itemAdded: (cb: (data: any) => void) => () => void
  itemToggled: (cb: (data: any) => void) => () => void
  itemDeleted: (cb: (data: any) => void) => () => void
}

beforeAll(async () => {
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
})

function todos() {
  return conn.bridge<TodoBridgeForTest>('todos')
}

// ── TodoBridge method tests ──────────────────────────────────────────

test('addList creates a list and returns it', async () => {
  const list = await todos().addList({ name: 'Groceries' })
  expect(list.name).toBe('Groceries')
  expect(typeof list.id).toBe('string')
  expect(list.item_count).toBe(0)
  expect(typeof list.created_at).toBe('string')
})

test('listLists returns array of lists', async () => {
  const lists = await todos().listLists()
  expect(Array.isArray(lists)).toBe(true)
  expect(lists.length).toBeGreaterThan(0)
  expect(lists[0].name).toBe('Groceries')
})

test('addItem creates an item in a list', async () => {
  const lists = await todos().listLists()
  const item = await todos().addItem({ list_id: lists[0].id, text: 'Milk' })
  expect(item.text).toBe('Milk')
  expect(item.done).toBe(false)
  expect(item.list_id).toBe(lists[0].id)
})

test('getList returns list details with items', async () => {
  const lists = await todos().listLists()
  const detail = await todos().getList({ list_id: lists[0].id })
  expect(detail.list.name).toBe('Groceries')
  expect(detail.items.length).toBeGreaterThan(0)
  expect(detail.items[0].text).toBe('Milk')
})

test('toggleItem flips done state', async () => {
  const lists = await todos().listLists()
  const detail = await todos().getList({ list_id: lists[0].id })
  const itemId = detail.items[0].id

  const toggled = await todos().toggleItem({ item_id: itemId })
  expect(toggled.done).toBe(true)

  const toggledBack = await todos().toggleItem({ item_id: itemId })
  expect(toggledBack.done).toBe(false)
})

test('renameList changes the list name', async () => {
  const lists = await todos().listLists()
  const renamed = await todos().renameList({ list_id: lists[0].id, new_name: 'Shopping' })
  expect(renamed.name).toBe('Shopping')
})

test('search finds items by text', async () => {
  const results = await todos().search({ query: 'Milk' })
  expect(results.length).toBeGreaterThan(0)
  expect(results[0].text).toBe('Milk')
})

test('deleteItem removes an item', async () => {
  const lists = await todos().listLists()
  const detail = await todos().getList({ list_id: lists[0].id })
  const result = await todos().deleteItem({ item_id: detail.items[0].id })
  expect(result.ok).toBe(true)
})

test('deleteList removes a list', async () => {
  const lists = await todos().listLists()
  const result = await todos().deleteList({ list_id: lists[0].id })
  expect(result.ok).toBe(true)
})

test('getList throws for nonexistent list', async () => {
  try {
    await todos().getList({ list_id: 'nonexistent' })
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('not found')
  }
})

test('unknown method returns error', async () => {
  const b = todos() as any
  try {
    await b.thisMethodDoesNotExist()
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('Unknown method')
  }
})

// ── Signal data test ─────────────────────────────────────────────────

test('signal carries payload data when addList is called', async () => {
  let signalData: any = null
  todos().listAdded((data: any) => { signalData = data })

  const list = await todos().addList({ name: 'Signal Test' })

  await new Promise(r => setTimeout(r, 100))

  expect(signalData).not.toBeNull()
  expect(signalData.name).toBe('Signal Test')
  expect(signalData.id).toBe(list.id)
})
