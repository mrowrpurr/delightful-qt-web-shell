// Bun WebSocket server that implements the TodoBridge protocol.
// Used by Playwright tests and Vite dev mode.
// Same JSON-RPC-over-WebSocket protocol that the C++ server will use.

interface TodoList {
  id: string
  name: string
  created_at: string
}

interface TodoItem {
  id: string
  list_id: string
  text: string
  done: boolean
  created_at: string
}

interface ConnectionState {
  lists: TodoList[]
  items: TodoItem[]
  nextId: number
}

function createHandlers(state: ConnectionState) {
  return {
    listLists() {
      return state.lists.map(l => ({
        ...l,
        item_count: state.items.filter(i => i.list_id === l.id).length,
      }))
    },

    getList(listId: string) {
      const list = state.lists.find(l => l.id === listId)
      if (!list) return { error: 'List not found' }
      return {
        list: { ...list, item_count: state.items.filter(i => i.list_id === list.id).length },
        items: state.items.filter(i => i.list_id === listId),
      }
    },

    addList(name: string) {
      const list: TodoList = {
        id: String(state.nextId++),
        name,
        created_at: new Date().toISOString(),
      }
      state.lists.push(list)
      return { ...list, item_count: 0 }
    },

    addItem(listId: string, text: string) {
      const item: TodoItem = {
        id: String(state.nextId++),
        list_id: listId,
        text,
        done: false,
        created_at: new Date().toISOString(),
      }
      state.items.push(item)
      return item
    },

    toggleItem(itemId: string) {
      const item = state.items.find(i => i.id === itemId)
      if (!item) return { error: 'Item not found' }
      item.done = !item.done
      return item
    },

    search(query: string) {
      const lower = query.toLowerCase()
      return state.items.filter(i => i.text.toLowerCase().includes(lower))
    },
  } as Record<string, (...args: any[]) => any>
}

// Each WebSocket connection gets its own isolated state.
// This means parallel Playwright workers don't interfere with each other.
const server = Bun.serve<ConnectionState>({
  port: 9876,
  fetch(req, server) {
    if (server.upgrade(req, {
      data: { lists: [], items: [], nextId: 1 },
    })) return
    return new Response('TodoBridge WebSocket server')
  },
  websocket: {
    message(ws, message) {
      try {
        const { method, args, id } = JSON.parse(message as string)
        const handlers = createHandlers(ws.data)
        const handler = handlers[method]
        if (!handler) {
          ws.send(JSON.stringify({ id, error: `Unknown method: ${method}` }))
          return
        }
        const result = handler(...(args || []))
        ws.send(JSON.stringify({ id, result }))
      } catch (e) {
        ws.send(JSON.stringify({ error: String(e) }))
      }
    },
  },
})

console.log(`TodoBridge WebSocket server listening on ws://localhost:${server.port}`)
