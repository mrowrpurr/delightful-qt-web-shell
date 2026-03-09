// Bun HTTP server for hosted web deployment.
// Serves the React build + exposes a REST/SSE API backed by the real C++ TodoStore via FFI.
// All connected clients share the same store instance — same C++ code as desktop and Android.

import { dlopen, FFIType, CString } from "bun:ffi"
import { readFileSync } from "fs"
import { resolve } from "path"

// ── Load C++ TodoStore shared library ───────────────────────────────────

const libPath = readFileSync(resolve(import.meta.dir, "../build/.todos-ffi-lib.txt"), "utf-8").trim()
const lib = dlopen(libPath, {
  todo_store_create:      { returns: FFIType.ptr },
  todo_store_destroy:     { args: [FFIType.ptr] },
  todo_store_invoke:      { args: [FFIType.ptr, FFIType.cstring, FFIType.cstring], returns: FFIType.ptr },
  todo_store_free_string: { args: [FFIType.ptr] },
})

const store = lib.symbols.todo_store_create()!

function invoke(method: string, args: any[]): any {
  const ptr = lib.symbols.todo_store_invoke(store, Buffer.from(method + "\0"), Buffer.from(JSON.stringify(args) + "\0"))!
  const json = new CString(ptr)
  lib.symbols.todo_store_free_string(ptr)
  return JSON.parse(json as string)
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
      const result = invoke(method, args || [])
      if (result?.error) return Response.json({ error: result.error }, { status: 400 })
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

console.log(`Hosted web server listening on http://localhost:${port} (C++ TodoStore via FFI)`)
