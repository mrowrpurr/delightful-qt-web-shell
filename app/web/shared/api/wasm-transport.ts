// WASM transport — routes through bridge dispatch via WasmBridgeWrapper.
// Same architecture as WebSocket, just in-process instead of over the network.

import type { BridgeConnection } from './bridge-transport'

interface WasmBridgeWrapper {
  call(method: string, args: any): any
  subscribe(signal: string, callback: (...args: any[]) => void): void
  methods(): string[]
  signals(): string[]
}

interface WasmModule {
  getBridge(name: string): WasmBridgeWrapper | null
}

// Load the Emscripten module via <script> to bypass Vite's import analysis
// (Vite blocks import() of JS files inside /public)
function loadEmscriptenModule(): Promise<WasmModule> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.type = 'module'
    const wasmUrl = new URL('/wasm-app.js', window.location.origin).href
    const blob = new Blob(
      [`import factory from '${wasmUrl}'; globalThis.__wasmFactory = factory`],
      { type: 'text/javascript' },
    )
    script.src = URL.createObjectURL(blob)
    script.onload = async () => {
      URL.revokeObjectURL(script.src)
      script.remove()
      try {
        const factory = (globalThis as any).__wasmFactory as () => Promise<WasmModule>
        delete (globalThis as any).__wasmFactory
        resolve(await factory())
      } catch (e) {
        reject(e)
      }
    }
    script.onerror = () => reject(new Error('Failed to load wasm-app.js'))
    document.head.appendChild(script)
  })
}

export async function createWasmConnection(): Promise<BridgeConnection> {
  const wasm = await loadEmscriptenModule()

  function makeBridgeProxy<T extends object>(bridgeName: string): T {
    const wrapper = wasm.getBridge(bridgeName)

    // Stub proxy for bridges not implemented in WASM (e.g. SystemBridge).
    if (!wrapper) {
      console.warn(`WASM: bridge "${bridgeName}" not available — using no-op stub`)
      return new Proxy({} as T, {
        get(_, prop) {
          if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined
          return (..._args: any[]) => Promise.resolve({})
        },
      })
    }

    // Build signal set from the wrapper
    const signalNames = new Set<string>(wrapper.signals())

    return new Proxy({} as T, {
      get(_, prop) {
        if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined
        const name = prop as string

        // Signal subscription
        if (signalNames.has(name)) {
          return (callback: (...args: any[]) => void) => {
            wrapper.subscribe(name, callback)
            return () => {} // Embind doesn't support un-registration yet
          }
        }

        // Method call — dispatch through the wrapper, wrap in Promise
        return (...args: any[]) => {
          try {
            // Pass first arg as the request object (matches bridge contract)
            const requestArg = args.length === 1 && typeof args[0] === 'object' ? args[0] : (args.length === 0 ? {} : args[0])
            const result = wrapper.call(name, requestArg)
            if (result?.error) return Promise.reject(new Error(result.error))
            return Promise.resolve(result)
          } catch (e) {
            return Promise.reject(e)
          }
        }
      },
    })
  }

  return {
    bridge<T extends object>(name: string): T {
      return makeBridgeProxy<T>(name)
    },
    signalReady(): Promise<void> {
      return Promise.resolve()
    },
  }
}
