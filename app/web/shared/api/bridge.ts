import { createQtConnection, createWsConnection, type BridgeConnection } from './bridge-transport'
import { createWasmConnection } from './wasm-transport'

// ── Connection singleton ────────────────────────────────────────────
// Auto-detects the right transport. You never need to think about this.
//
// Domain bridges live in their own files (system-bridge.ts, todo-bridge.ts, …)
// and expose typed helpers like getSystemBridge() / getTodoBridge(). Feature
// code should call those helpers, not getBridge<T>(name) — magic strings leak
// the C++ registration name into every call site.

let _connection: Promise<BridgeConnection> | null = null

function getConnection(): Promise<BridgeConnection> {
  if (!_connection) {
    if (import.meta.env.VITE_TRANSPORT === 'wasm')
      _connection = createWasmConnection()
    else if (window.qt?.webChannelTransport && window.QWebChannel)
      _connection = createQtConnection()
    else {
      const wsUrl = import.meta.env.VITE_BRIDGE_WS_URL || 'ws://localhost:9876'
      _connection = createWsConnection(wsUrl).then(conn => {
        // Reset singleton when the connection drops so the next call reconnects
        conn.onDisconnect = () => { _connection = null }
        return conn
      }).catch(err => {
        // Reset so the next call retries the connection
        _connection = null
        throw err
      })
    }
  }
  return _connection
}

// ── Public API ──────────────────────────────────────────────────────

// getBridge — framework internal. Domain bridges should expose their own
// typed helper (e.g. getTodoBridge()) instead of having callers pass a name.
export async function getBridge<T extends object>(name: string): Promise<T> {
  const conn = await getConnection()
  return conn.bridge<T>(name)
}

export async function signalReady(): Promise<void> {
  const conn = await getConnection()
  return conn.signalReady()
}
