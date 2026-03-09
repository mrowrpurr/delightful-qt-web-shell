// ── Domain types ──────────────────────────────────────────────────────

export interface TodoList {
  id: string
  name: string
  item_count: number
  created_at: string
}

export interface TodoItem {
  id: string
  list_id: string
  text: string
  done: boolean
  created_at: string
}

export interface ListDetail {
  list: TodoList
  items: TodoItem[]
}

// ── Bridge interface ──────────────────────────────────────────────────
// Every bridge method returns a Promise. Same interface whether backed
// by QWebChannel (production), WebSocket (dev/test), or anything else.

export interface TodoBridge {
  listLists(): Promise<TodoList[]>
  getList(listId: string): Promise<ListDetail>
  addList(name: string): Promise<TodoList>
  addItem(listId: string, text: string): Promise<TodoItem>
  toggleItem(itemId: string): Promise<TodoItem>
  search(query: string): Promise<TodoItem[]>
  onDataChanged(callback: () => void): () => void
}

// ── Convention: on* methods → event subscriptions ────────────────────
// onDataChanged → listens for "dataChanged" event/signal
// onItemAdded   → listens for "itemAdded" event/signal
// Works automatically for any signal. No per-method code needed.

function eventNameFromProp(prop: string): string | null {
  const match = prop.match(/^on([A-Z].*)$/)
  if (!match) return null
  return match[1][0].toLowerCase() + match[1].slice(1)
}

// ── WebSocket bridge (dev / test / Playwright) ────────────────────────
// A Proxy that turns any interface into WebSocket JSON-RPC calls.
// Zero per-method code. The interface IS the implementation.

export function createWsBridge<T extends object>(url: string): T {
  let ws: WebSocket | null = null
  let nextId = 0
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  const eventListeners: Record<string, Array<() => void>> = {}

  const ready = new Promise<void>((resolve, reject) => {
    ws = new WebSocket(url)
    ws.onopen = () => resolve()
    ws.onerror = () => reject(new Error(`WebSocket connection failed: ${url}`))
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.id !== undefined && pending.has(msg.id)) {
        const p = pending.get(msg.id)!
        pending.delete(msg.id)
        if (msg.error) p.reject(new Error(msg.error))
        else p.resolve(msg.result)
      }
      if (msg.event) {
        eventListeners[msg.event]?.forEach(cb => cb())
      }
    }
  })

  return new Proxy({} as T, {
    get(_, prop) {
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined
      const eventName = eventNameFromProp(prop)
      if (eventName) {
        return (callback: () => void) => {
          const listeners = eventListeners[eventName] ??= []
          listeners.push(callback)
          return () => {
            const idx = listeners.indexOf(callback)
            if (idx >= 0) listeners.splice(idx, 1)
          }
        }
      }
      return async (...args: any[]) => {
        await ready
        return new Promise((resolve, reject) => {
          const id = nextId++
          pending.set(id, { resolve, reject })
          ws!.send(JSON.stringify({ method: prop, args, id }))
        })
      }
    },
  }) as T
}

// ── Qt WebChannel bridge (production) ─────────────────────────────────
// Also a Proxy — same zero-boilerplate pattern as WsBridge.
// Methods route through QWebChannel's callback API.
// on* methods connect to Qt signals via signal.connect().

declare global {
  interface Window {
    qt?: { webChannelTransport: unknown }
    QWebChannel?: new (
      transport: unknown,
      callback: (channel: { objects: Record<string, any> }) => void
    ) => void
    AndroidBridge?: { invoke(method: string, argsJson: string): string }
    __bridgeEvent?: (event: string) => void
  }
}

export function createQtBridge<T extends object>(): T {
  let bridge: any = null
  const ready = new Promise<void>((resolve) => {
    new window.QWebChannel!(window.qt!.webChannelTransport, (channel) => {
      bridge = channel.objects.bridge
      resolve()
    })
  })

  return new Proxy({} as T, {
    get(_, prop) {
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined
      const eventName = eventNameFromProp(prop)
      if (eventName) {
        return (callback: () => void) => {
          let disconnected = false
          ready.then(() => {
            if (disconnected) return
            bridge?.[eventName]?.connect(callback)
          })
          return () => {
            disconnected = true
            bridge?.[eventName]?.disconnect(callback)
          }
        }
      }
      return async (...args: any[]) => {
        await ready
        return new Promise((resolve, reject) => {
          bridge[prop](...args, (result: string) => {
            try {
              const data = JSON.parse(result)
              if (data.error) reject(new Error(data.error))
              else resolve(data)
            } catch (e) {
              reject(e)
            }
          })
        })
      }
    },
  }) as T
}

// ── Android bridge (native WebView) ───────────────────────────────────
// window.AndroidBridge.invoke() is synchronous (runs on a JNI thread).
// Events are pushed from Kotlin via window.__bridgeEvent().

export function createAndroidBridge<T extends object>(): T {
  const eventListeners: Record<string, Array<() => void>> = {}

  window.__bridgeEvent = (event: string) => {
    eventListeners[event]?.forEach(cb => cb())
  }

  return new Proxy({} as T, {
    get(_, prop) {
      if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined
      const eventName = eventNameFromProp(prop)
      if (eventName) {
        return (callback: () => void) => {
          const listeners = eventListeners[eventName] ??= []
          listeners.push(callback)
          return () => {
            const idx = listeners.indexOf(callback)
            if (idx >= 0) listeners.splice(idx, 1)
          }
        }
      }
      return async (...args: any[]) => {
        const result = window.AndroidBridge!.invoke(prop as string, JSON.stringify(args))
        const data = JSON.parse(result)
        if (data.error) throw new Error(data.error)
        return data
      }
    },
  }) as T
}

// ── Auto-detect (singleton) ───────────────────────────────────────────

let _bridge: TodoBridge | null = null

export function createBridge(): TodoBridge {
  if (!_bridge) {
    if (window.AndroidBridge?.invoke)
      _bridge = createAndroidBridge<TodoBridge>()
    else if (window.qt?.webChannelTransport && window.QWebChannel)
      _bridge = createQtBridge<TodoBridge>()
    else {
      const wsUrl = import.meta.env.VITE_BRIDGE_WS_URL || 'ws://localhost:9876'
      _bridge = createWsBridge<TodoBridge>(wsUrl)
    }
  }
  return _bridge
}
