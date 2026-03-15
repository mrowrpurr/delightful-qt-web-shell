// WASM transport — direct Embind calls, no serialization, no network.
// The C++ domain logic runs in the browser as WebAssembly.

import type { BridgeConnection } from './bridge-transport'

interface WasmModule {
  TodoBridge: new () => Record<string, (...args: any[]) => any>
}

// Load the Emscripten module via <script> to bypass Vite's import analysis
// (Vite blocks import() of JS files inside /public)
function loadEmscriptenModule(): Promise<WasmModule> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.type = 'module'
    // Inline module imports the Emscripten factory and stashes it on globalThis
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

  // Bridge instances live in WASM memory
  const bridges: Record<string, Record<string, (...args: any[]) => any>> = {
    todos: new wasm.TodoBridge(),
  }

  function makeBridgeProxy<T extends object>(bridgeName: string): T {
    const raw = bridges[bridgeName]
    if (!raw) throw new Error(`Unknown WASM bridge: ${bridgeName}`)

    return new Proxy({} as T, {
      get(_, prop) {
        if (typeof prop === 'symbol' || prop === 'then' || prop === 'toJSON') return undefined
        const name = prop as string

        // Signal subscription — Embind exposes onDataChanged(callback)
        if (name === 'dataChanged') {
          return (callback: () => void) => {
            raw.onDataChanged(callback)
            // TODO: Embind doesn't support un-registration yet — return a no-op cleanup
            return () => {}
          }
        }

        // Method call — Embind returns JS values directly, wrap in Promise for API consistency
        return (...args: any[]) => {
          try {
            const result = raw[name](...args)
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
      // No shell lifecycle in WASM mode — app is ready immediately
      return Promise.resolve()
    },
  }
}
