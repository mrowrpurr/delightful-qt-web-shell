// Internal transport implementations. You don't need to touch this file.
// See bridge.ts for the public API.

declare global {
  interface Window {
    qt?: { webChannelTransport: unknown }
    QWebChannel?: new (
      transport: unknown,
      callback: (channel: { objects: Record<string, any> }) => void
    ) => void
  }
}

// ── BridgeConnection ─────────────────────────────────────────────────
// Shared connection to the C++ shell. Scoped proxies per named bridge.

export interface BridgeConnection {
  bridge<T extends object>(name: string): T
  signalReady(): Promise<void>
  onDisconnect?: () => void
}

// ── WebSocket transport ──────────────────────────────────────────────

export async function createWsConnection(url: string): Promise<BridgeConnection> {
  let nextId = 0
  const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  const eventListeners: Record<string, Array<(...args: any[]) => void>> = {}

  // Maps bridge name → set of signal names
  const bridgeSignals = new Map<string, Set<string>>()

  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url)
    const timeout = setTimeout(() => {
      socket.close()
      reject(new Error(`WebSocket connection timeout (5s): ${url}`))
    }, 5000)
    socket.onerror = () => { clearTimeout(timeout); reject(new Error(`WebSocket connection failed: ${url}`)) }
    socket.onopen = () => { clearTimeout(timeout); resolve(socket) }
  })

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id)!
      pending.delete(msg.id)
      if (msg.error) p.reject(new Error(msg.error))
      else p.resolve(msg.result)
    }
    if (msg.event) {
      // Events are keyed as "bridgeName:eventName" (or just "eventName" for shell)
      const key = msg.bridge ? `${msg.bridge}:${msg.event}` : msg.event
      eventListeners[key]?.forEach(cb => cb(msg.args))
    }
  }

  // Build the connection object early so onclose can call onDisconnect
  let onDisconnect: (() => void) | undefined

  ws.onclose = () => {
    // Reject all pending calls so callers don't hang forever
    for (const [id, p] of pending) {
      p.reject(new Error('WebSocket disconnected'))
      pending.delete(id)
    }
    console.warn('[bridge] WebSocket disconnected')
    onDisconnect?.()
  }

  // Query the shell for all bridges and their signals
  const meta = await new Promise<any>((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ method: '__meta__', args: [], id }))
  })
  for (const [bridgeName, info] of Object.entries(meta?.bridges ?? {}) as [string, any][])
    bridgeSignals.set(bridgeName, new Set(info.signals ?? []))

  function makeBridgeProxy<T extends object>(bridgeName: string): T {
    const signals = bridgeSignals.get(bridgeName) ?? new Set<string>()
    return new Proxy({} as T, {
      get(_, prop) {
        if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined
        const name = prop as string

        if (signals.has(name)) {
          return (callback: (...args: any[]) => void) => {
            const key = `${bridgeName}:${name}`
            const listeners = eventListeners[key] ??= []
            listeners.push(callback)
            return () => {
              const idx = listeners.indexOf(callback)
              if (idx >= 0) listeners.splice(idx, 1)
            }
          }
        }

        return (...args: any[]) =>
          new Promise((resolve, reject) => {
            const id = nextId++
            pending.set(id, { resolve, reject })
            ws.send(JSON.stringify({ bridge: bridgeName, method: name, args, id }))
          })
      },
    })
  }

  const conn: BridgeConnection = {
    bridge<T extends object>(name: string): T {
      return makeBridgeProxy<T>(name)
    },
    signalReady(): Promise<void> {
      return new Promise((resolve, reject) => {
        const id = nextId++
        pending.set(id, { resolve: () => resolve(), reject })
        ws.send(JSON.stringify({ method: 'appReady', args: [], id }))
      })
    },
    set onDisconnect(cb: (() => void) | undefined) { onDisconnect = cb },
    get onDisconnect() { return onDisconnect },
  }
  return conn
}

// ── QWebChannel transport ────────────────────────────────────────────

export async function createQtConnection(): Promise<BridgeConnection> {
  const channel = await new Promise<Record<string, any>>((resolve) => {
    new window.QWebChannel!(window.qt!.webChannelTransport, (ch) => {
      resolve(ch.objects)
    })
  })

  const lifecycle = channel._lifecycle

  function makeBridgeProxy<T extends object>(bridgeName: string): T {
    const adapter = channel[bridgeName]
    if (!adapter) throw new Error(`Unknown bridge: ${bridgeName}`)

    // Signal listeners keyed by signal name
    const signalListeners: Record<string, Array<(...args: any[]) => void>> = {}

    // Subscribe to the generic bridgeSignal from BridgeChannelAdapter
    // and route to per-signal listeners
    if (adapter.bridgeSignal?.connect) {
      adapter.bridgeSignal.connect((signalName: string, data: string) => {
        const listeners = signalListeners[signalName]
        if (!listeners) return
        const parsed = data ? JSON.parse(data) : undefined
        listeners.forEach(cb => cb(parsed))
      })
    }

    return new Proxy({} as T, {
      get(_, prop) {
        if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined
        const name = prop as string

        // Check if this is a known signal (registered via on first subscribe)
        // We can't detect signals from the adapter anymore (it has one generic signal),
        // so we use a heuristic: if the caller passes a function as the first arg, it's a signal subscription.
        // OR: we hardcode nothing and let the proxy decide at call time.

        // Method call — route through dispatch
        return (...args: any[]) => {
          // Signal subscription: if first arg is a function, treat as signal
          if (args.length === 1 && typeof args[0] === 'function') {
            const callback = args[0]
            const listeners = signalListeners[name] ??= []
            listeners.push(callback)
            return () => {
              const idx = listeners.indexOf(callback)
              if (idx >= 0) listeners.splice(idx, 1)
            }
          }

          // Method call
          return new Promise((resolve, reject) => {
            const requestArg = args.length === 1 && typeof args[0] === 'object' ? args[0] : (args.length === 0 ? {} : args[0])
            adapter.dispatch(name, requestArg, (result: any) => {
              try {
                const data = typeof result === 'string' ? JSON.parse(result) : result
                if (data?.error) reject(new Error(data.error))
                else resolve(data)
              } catch (e) {
                reject(e)
              }
            })
          })
        }
      },
    })
  }

  return {
    bridge<T extends object>(name: string): T {
      return makeBridgeProxy<T>(name)
    },
    signalReady(): Promise<void> {
      return new Promise((resolve, reject) => {
        lifecycle.appReady((result: any) => {
          try {
            const data = typeof result === 'string' ? JSON.parse(result) : result
            if (data?.error) reject(new Error(data.error))
            else resolve()
          } catch (e) {
            reject(e)
          }
        })
      })
    },
  }
}
