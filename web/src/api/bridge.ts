import { createQtConnection, createWsConnection, type BridgeConnection } from './bridge-transport'
import { createWasmConnection } from './wasm-transport'

// ── Domain types ──────────────────────────────────────────────────────
// Snake_case field names match the C++ structs and JSON wire format.
// No mapping layer = zero boilerplate when adding new fields.

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
// Every bridge method returns a Promise. Add methods here and on the
// C++ side (Q_INVOKABLE) — the plumbing connects them automatically.

export interface TodoBridge {
  listLists(): Promise<TodoList[]>
  getList(listId: string): Promise<ListDetail>
  addList(name: string): Promise<TodoList>
  addItem(listId: string, text: string): Promise<TodoItem>
  toggleItem(itemId: string): Promise<TodoItem>
  deleteList(listId: string): Promise<{ ok: boolean }>
  deleteItem(itemId: string): Promise<{ ok: boolean }>
  renameList(listId: string, newName: string): Promise<TodoList>
  search(query: string): Promise<TodoItem[]>
  dataChanged(callback: () => void): () => void
}

// ── Connection singleton ────────────────────────────────────────────
// Auto-detects the right transport. You never need to think about this.

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

// getBridge — NOT a React hook. It's a plain async function that returns a
// typed proxy to a named C++ bridge. Safe to call at module scope.
export async function getBridge<T extends object>(name: string): Promise<T> {
  const conn = await getConnection()
  return conn.bridge<T>(name)
}

export async function signalReady(): Promise<void> {
  const conn = await getConnection()
  return conn.signalReady()
}
