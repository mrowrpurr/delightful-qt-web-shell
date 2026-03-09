// Bun HTTP server for hosted web deployment.
// Serves the React build + exposes a REST/SSE API backed by an in-memory TodoStore.
// All connected clients share the same store instance.

import { resolve } from "path"

// ── Types ────────────────────────────────────────────────────────────

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

// ── Shared state ─────────────────────────────────────────────────────

const state = { lists: [] as TodoList[], items: [] as TodoItem[], nextId: 1 }

const handlers: Record<string, (...args: any[]) => any> = {
  listLists() {
    return state.lists.map(l => ({
      ...l,
      item_count: state.items.filter(i => i.list_id === l.id).length,
    }))
  },
  getList(listId: string) {
    const list = state.lists.find(l => l.id === listId)
    if (!list) return { error: "List not found" }
    return {
      list: { ...list, item_count: state.items.filter(i => i.list_id === list.id).length },
      items: state.items.filter(i => i.list_id === listId),
    }
  },
  addList(name: string) {
    const list: TodoList = { id: String(state.nextId++), name, created_at: new Date().toISOString() }
    state.lists.push(list)
    return { ...list, item_count: 0 }
  },
  addItem(listId: string, text: string) {
    const item: TodoItem = { id: String(state.nextId++), list_id: listId, text, done: false, created_at: new Date().toISOString() }
    state.items.push(item)
    return item
  },
  toggleItem(itemId: string) {
    const item = state.items.find(i => i.id === itemId)
    if (!item) return { error: "Item not found" }
    item.done = !item.done
    return item
  },
  search(query: string) {
    const lower = query.toLowerCase()
    return state.items.filter(i => i.text.toLowerCase().includes(lower))
  },
}

const mutatingMethods = new Set(["addList", "addItem", "toggleItem"])

// ── SSE clients ──────────────────────────────────────────────────────

const sseClients = new Set<ReadableStreamDefaultController>()

function broadcastEvent(event: string) {
  const data = JSON.stringify({ event })
  for (const controller of sseClients) {
    try { controller.enqueue(`data: ${data}\n\n`) } catch { sseClients.delete(controller) }
  }
}

// ── Static file serving ──────────────────────────────────────────────

const distDir = resolve(import.meta.dir, "../web/dist")

async function serveStatic(pathname: string): Promise<Response | null> {
  const filePath = resolve(distDir, pathname.startsWith("/") ? pathname.slice(1) : pathname)
  if (!filePath.startsWith(distDir)) return null
  const file = Bun.file(filePath)
  if (await file.exists()) return new Response(file)
  return null
}

// ── Server ───────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT || "3000", 10)

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)

    // POST /api/invoke — single dispatch endpoint
    if (req.method === "POST" && url.pathname === "/api/invoke") {
      const { method, args } = await req.json() as { method: string; args: any[] }
      const handler = handlers[method]
      if (!handler) return Response.json({ error: `Unknown method: ${method}` }, { status: 400 })
      const result = handler(...(args || []))
      if (mutatingMethods.has(method)) broadcastEvent("dataChanged")
      return Response.json({ result })
    }

    // GET /api/events — SSE stream
    if (req.method === "GET" && url.pathname === "/api/events") {
      const stream = new ReadableStream({
        start(controller) {
          sseClients.add(controller)
          req.signal.addEventListener("abort", () => sseClients.delete(controller))
        },
      })
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      })
    }

    // Static files from web/dist/
    const staticResp = await serveStatic(url.pathname)
    if (staticResp) return staticResp

    // SPA fallback — serve index.html for unknown paths
    const indexFile = Bun.file(resolve(distDir, "index.html"))
    if (await indexFile.exists()) return new Response(indexFile)

    return new Response("Not Found", { status: 404 })
  },
})

console.log(`Hosted web server listening on http://localhost:${port}`)
