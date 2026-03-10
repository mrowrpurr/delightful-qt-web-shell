import { test, expect, afterEach } from 'bun:test'
import { createWsBridge } from '../../../../web/src/api/bridge-transport'
import type { TodoBridge } from '../../../../web/src/api/bridge'

// Each test spins up its own WebSocket server on a random port.
// The Proxy bridge connects and we verify the JSON-RPC protocol.

let servers: Array<{ stop(): void }> = []

afterEach(() => {
  for (const s of servers) s.stop()
  servers = []
})

function startServer(
  handler: (ws: any, data: any) => void,
  signals: string[] = ['dataChanged'],
) {
  const server = Bun.serve({
    port: 0,
    fetch(req, server) {
      if (server.upgrade(req)) return
      return new Response('')
    },
    websocket: {
      message(ws: any, msg: string | Buffer) {
        const data = JSON.parse(msg as string)
        if (data.method === '__meta__') {
          ws.send(JSON.stringify({ id: data.id, result: { signals } }))
          return
        }
        handler(ws, data)
      },
    },
  })
  servers.push(server)
  return server
}

test('sends correct JSON-RPC message for a no-arg method', async () => {
  const received: any[] = []
  const server = startServer((ws, data) => {
    received.push(data)
    ws.send(JSON.stringify({ id: data.id, result: [] }))
  })

  const bridge = await createWsBridge<TodoBridge>(`ws://localhost:${server.port}`)
  await bridge.listLists()

  expect(received).toHaveLength(1)
  expect(received[0].method).toBe('listLists')
  expect(received[0].args).toEqual([])
  expect(typeof received[0].id).toBe('number')
})

test('sends args for methods with parameters', async () => {
  const received: any[] = []
  const server = startServer((ws, data) => {
    received.push(data)
    ws.send(JSON.stringify({ id: data.id, result: { id: '1', name: 'Test' } }))
  })

  const bridge = await createWsBridge<TodoBridge>(`ws://localhost:${server.port}`)
  await bridge.addList('Groceries')

  expect(received[0].method).toBe('addList')
  expect(received[0].args).toEqual(['Groceries'])
})

test('sends multiple args correctly', async () => {
  const received: any[] = []
  const server = startServer((ws, data) => {
    received.push(data)
    ws.send(JSON.stringify({ id: data.id, result: { id: '1', text: 'Milk' } }))
  })

  const bridge = await createWsBridge<TodoBridge>(`ws://localhost:${server.port}`)
  await bridge.addItem('list-1', 'Milk')

  expect(received[0].method).toBe('addItem')
  expect(received[0].args).toEqual(['list-1', 'Milk'])
})

test('resolves with the result from the server', async () => {
  const server = startServer((ws, data) => {
    ws.send(JSON.stringify({
      id: data.id,
      result: [
        { id: '1', name: 'Groceries', item_count: 2, created_at: '2026-01-01' },
      ],
    }))
  })

  const bridge = await createWsBridge<TodoBridge>(`ws://localhost:${server.port}`)
  const lists = await bridge.listLists()

  expect(lists).toHaveLength(1)
  expect(lists[0].name).toBe('Groceries')
  expect(lists[0].item_count).toBe(2)
})

test('rejects when server returns an error', async () => {
  const server = startServer((ws, data) => {
    ws.send(JSON.stringify({ id: data.id, error: 'Not found' }))
  })

  const bridge = await createWsBridge<TodoBridge>(`ws://localhost:${server.port}`)
  try {
    await bridge.getList('nonexistent')
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toBe('Not found')
  }
})

test('increments request IDs for concurrent calls', async () => {
  const received: any[] = []
  const server = startServer((ws, data) => {
    received.push(data)
    ws.send(JSON.stringify({ id: data.id, result: [] }))
  })

  const bridge = await createWsBridge<TodoBridge>(`ws://localhost:${server.port}`)
  await Promise.all([bridge.listLists(), bridge.search('test')])

  const ids = received.map(r => r.id)
  expect(ids[0]).not.toBe(ids[1])
})

test('dataChanged fires when server pushes an event', async () => {
  let sendEvent: (() => void) | null = null
  const server = startServer((ws, data) => {
    ws.send(JSON.stringify({ id: data.id, result: [] }))
    // Save a reference so we can push events later
    sendEvent = () => ws.send(JSON.stringify({ event: 'dataChanged' }))
  })

  const bridge = await createWsBridge<TodoBridge>(`ws://localhost:${server.port}`)

  // Make an initial call to establish the connection
  await bridge.listLists()

  // Register listener
  let eventFired = false
  bridge.dataChanged(() => { eventFired = true })

  // Push the event
  sendEvent!()

  // Give it a moment to propagate
  await new Promise(r => setTimeout(r, 50))
  expect(eventFired).toBe(true)
})

test('appReady sends a no-arg call and resolves', async () => {
  const received: any[] = []
  const server = startServer((ws, data) => {
    received.push(data)
    ws.send(JSON.stringify({ id: data.id, result: {} }))
  }, ['dataChanged', 'ready'])

  const bridge = await createWsBridge<TodoBridge>(`ws://localhost:${server.port}`)
  await bridge.appReady()

  expect(received).toHaveLength(1)
  expect(received[0].method).toBe('appReady')
  expect(received[0].args).toEqual([])
})

test('dataChanged cleanup removes the listener', async () => {
  let sendEvent: (() => void) | null = null
  const server = startServer((ws, data) => {
    ws.send(JSON.stringify({ id: data.id, result: [] }))
    sendEvent = () => ws.send(JSON.stringify({ event: 'dataChanged' }))
  })

  const bridge = await createWsBridge<TodoBridge>(`ws://localhost:${server.port}`)
  await bridge.listLists()

  let count = 0
  const cleanup = bridge.dataChanged(() => { count++ })

  sendEvent!()
  await new Promise(r => setTimeout(r, 50))
  expect(count).toBe(1)

  // Remove listener
  cleanup()

  sendEvent!()
  await new Promise(r => setTimeout(r, 50))
  expect(count).toBe(1) // should NOT have incremented
})
