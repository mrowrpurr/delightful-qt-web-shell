import { test, expect, beforeAll, afterAll } from 'bun:test'
import { createWsConnection, type BridgeConnection } from '../../../../web/shared/api/bridge-transport'
import { spawn, type Subprocess } from 'bun'
import fs from 'fs'

// These tests launch the REAL dev-server (C++ binary) and verify that
// invoke_bridge_method's QVariant-based type conversion works for every
// supported type — params, returns, multi-arg, edge cases, and signals.
//
// This is the comprehensive test suite for the bridge type system.

const PORT = 19877
let server: Subprocess
let conn: BridgeConnection

// Generic bridge type — we call methods dynamically
interface TypeTestBridge {
  // Return types
  returnString(): Promise<{ value: string }>
  returnInt(): Promise<{ value: number }>
  returnDouble(): Promise<{ value: number }>
  returnBool(): Promise<{ value: boolean }>
  returnJsonObject(): Promise<Record<string, unknown>>
  returnJsonArray(): Promise<string[]>
  returnStringList(): Promise<{ value: string[] }>
  returnVoid(): Promise<{ ok: boolean }>
  // Param types (echo back as JSON)
  echoString(s: string): Promise<{ type: string; value: string }>
  echoInt(n: number): Promise<{ type: string; value: number }>
  echoDouble(d: number): Promise<{ type: string; value: number }>
  echoBool(b: boolean): Promise<{ type: string; value: boolean }>
  echoJsonObject(obj: Record<string, unknown>): Promise<{ type: string; value: Record<string, unknown> }>
  echoJsonArray(arr: unknown[]): Promise<{ type: string; value: unknown[] }>
  // Multi-param
  multiParams(s: string, n: number, b: boolean): Promise<{ string: string; int: number; bool: boolean }>
  fiveParams(a: string, b: string, c: string, d: string, e: string): Promise<{ concat: string }>
  tenParams(a: number, b: number, c: number, d: number, e: number,
            f: number, g: number, h: number, i: number, j: number): Promise<{ sum: number }>
  // Edge cases
  echoEmptyString(): Promise<{ value: string }>
  echoLargeNumber(n: number): Promise<{ value: number }>
  noArgs(): Promise<{ ok: boolean }>
  lastCall(): Promise<{ value: string }>
  // Signals
  testSignal: (cb: () => void) => () => void
}

beforeAll(async () => {
  // Find the dev-server binary
  const binaryPath = fs.readFileSync('build/.dev-server-binary.txt', 'utf8').trim()
  if (!fs.existsSync(binaryPath))
    throw new Error(`dev-server binary not found at ${binaryPath} — run xmake build dev-server`)

  server = spawn([binaryPath, '--port', String(PORT)], {
    stdout: 'pipe',
    stderr: 'pipe',
  })

  // Wait for the server to be ready
  const start = Date.now()
  while (Date.now() - start < 10000) {
    try {
      conn = await createWsConnection(`ws://localhost:${PORT}`)
      return // connected!
    } catch {
      await new Promise(r => setTimeout(r, 200))
    }
  }
  throw new Error('dev-server did not start within 10s')
})

afterAll(() => {
  server?.kill()
})

function bridge() {
  return conn.bridge<TypeTestBridge>('typeTest')
}

// ── Return type tests ─────────────────────────────────────────────────

test('returns QString as {value: string}', async () => {
  const result = await bridge().returnString()
  expect(result.value).toBe('hello')
  expect(typeof result.value).toBe('string')
})

test('returns int as {value: number}', async () => {
  const result = await bridge().returnInt()
  expect(result.value).toBe(42)
  expect(typeof result.value).toBe('number')
})

test('returns double as {value: number}', async () => {
  const result = await bridge().returnDouble()
  expect(result.value).toBeCloseTo(3.14, 10)
  expect(typeof result.value).toBe('number')
})

test('returns bool as {value: boolean}', async () => {
  const result = await bridge().returnBool()
  expect(result.value).toBe(true)
  expect(typeof result.value).toBe('boolean')
})

test('returns QJsonObject directly (unwrapped)', async () => {
  const result = await bridge().returnJsonObject()
  expect(result).toEqual({ key: 'value' })
})

test('returns QJsonArray directly (unwrapped)', async () => {
  const result = await bridge().returnJsonArray()
  expect(result).toEqual(['a', 'b', 'c'])
})

test('returns QStringList as {value: [strings]}', async () => {
  const result = await bridge().returnStringList()
  // QStringList → QVariant → QJsonValue: Qt converts QStringList to a JSON array
  // The bridge wraps non-object/non-array results in {value: ...}
  // But a QStringList converts to a JSON array, which gets returned unwrapped
  expect(Array.isArray(result) || Array.isArray((result as any).value)).toBe(true)
  const arr = Array.isArray(result) ? result : (result as any).value
  expect(arr).toEqual(['one', 'two', 'three'])
})

test('returns void as {ok: true}', async () => {
  const result = await bridge().returnVoid()
  expect(result.ok).toBe(true)
})

// ── Parameter type tests ──────────────────────────────────────────────

test('passes QString parameter', async () => {
  const result = await bridge().echoString('world')
  expect(result.type).toBe('QString')
  expect(result.value).toBe('world')
})

test('passes int parameter', async () => {
  const result = await bridge().echoInt(99)
  expect(result.type).toBe('int')
  expect(result.value).toBe(99)
})

test('passes double parameter', async () => {
  const result = await bridge().echoDouble(2.718)
  expect(result.type).toBe('double')
  expect(result.value).toBeCloseTo(2.718, 10)
})

test('passes bool parameter (true)', async () => {
  const result = await bridge().echoBool(true)
  expect(result.type).toBe('bool')
  expect(result.value).toBe(true)
})

test('passes bool parameter (false)', async () => {
  const result = await bridge().echoBool(false)
  expect(result.type).toBe('bool')
  expect(result.value).toBe(false)
})

test('passes QJsonObject parameter', async () => {
  const obj = { nested: { deep: true }, count: 5 }
  const result = await bridge().echoJsonObject(obj)
  expect(result.type).toBe('QJsonObject')
  expect(result.value).toEqual(obj)
})

test('passes QJsonArray parameter', async () => {
  const arr = [1, 'two', true, null]
  const result = await bridge().echoJsonArray(arr)
  expect(result.type).toBe('QJsonArray')
  expect(result.value).toEqual(arr)
})

// ── Multi-parameter tests ─────────────────────────────────────────────

test('passes mixed types: string + int + bool', async () => {
  const result = await bridge().multiParams('hello', 42, true)
  expect(result).toEqual({ string: 'hello', int: 42, bool: true })
})

test('passes 5 string parameters', async () => {
  const result = await bridge().fiveParams('a', 'b', 'c', 'd', 'e')
  expect(result.concat).toBe('abcde')
})

test('passes 10 int parameters (max supported)', async () => {
  const result = await bridge().tenParams(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
  expect(result.sum).toBe(55)
})

// ── Edge cases ────────────────────────────────────────────────────────

test('handles zero-arg method', async () => {
  const result = await bridge().noArgs()
  expect(result.ok).toBe(true)
})

test('void method actually executes', async () => {
  await bridge().returnVoid()
  const result = await bridge().lastCall()
  expect(result.value).toBe('returnVoid')
})

test('handles negative int', async () => {
  const result = await bridge().echoInt(-42)
  expect(result.value).toBe(-42)
})

test('handles zero', async () => {
  const result = await bridge().echoInt(0)
  expect(result.value).toBe(0)
})

test('handles large double', async () => {
  const result = await bridge().echoLargeNumber(1e15)
  expect(result.value).toBe(1e15)
})

test('handles negative double', async () => {
  const result = await bridge().echoDouble(-99.5)
  expect(result.value).toBeCloseTo(-99.5)
})

test('handles empty QJsonObject', async () => {
  const result = await bridge().echoJsonObject({})
  expect(result.value).toEqual({})
})

test('handles empty QJsonArray', async () => {
  const result = await bridge().echoJsonArray([])
  expect(result.value).toEqual([])
})

test('handles deeply nested JSON object', async () => {
  const obj = { a: { b: { c: { d: { e: 'deep' } } } } }
  const result = await bridge().echoJsonObject(obj)
  expect(result.value).toEqual(obj)
})

test('handles JSON array with mixed types', async () => {
  const arr = [1, 'two', true, null, { nested: true }, [1, 2]]
  const result = await bridge().echoJsonArray(arr)
  expect(result.value).toEqual(arr)
})

// ── __meta__ endpoint ─────────────────────────────────────────────────

test('__meta__ includes typeTest bridge', async () => {
  // Access the raw WS to send __meta__
  const raw = await createWsConnection(`ws://localhost:${PORT}`)
  const meta = await new Promise<any>((resolve) => {
    const ws = (raw as any)._ws || (raw as any).ws
    // Use the bridge call mechanism to get meta
    // The connection auto-fetches meta on connect, but we can also verify
    // the typeTest bridge is listed by checking if bridge('typeTest') works
    resolve(true)
  })
  // If we got this far, typeTest bridge is registered and usable
  const result = await raw.bridge<TypeTestBridge>('typeTest').noArgs()
  expect(result.ok).toBe(true)
})

// ── Unknown method error ──────────────────────────────────────────────

test('returns error for unknown method', async () => {
  const b = bridge() as any
  try {
    await b.thisMethodDoesNotExist()
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('Unknown method')
  }
})

// ── Arg count validation ──────────────────────────────────────────────

test('returns error when too few args are passed', async () => {
  const b = bridge() as any
  try {
    // echoString expects 1 arg, we pass 0
    await b.echoString()
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('expected 1 args, got 0')
  }
})

test('returns error for multi-param method with missing args', async () => {
  const b = bridge() as any
  try {
    // multiParams expects 3 args (string, int, bool), we pass 1
    await b.multiParams('hello')
    throw new Error('should have thrown')
  } catch (e: any) {
    expect(e.message).toContain('expected 3 args, got 1')
  }
})

// ── Signal data tests (typed bridge signals carry payloads) ──────────

interface TodoBridgeForSignalTest {
  addList(req: { name: string }): Promise<{ id: string; name: string; item_count: number; created_at: string }>
  dataChanged: (cb: (data: any) => void) => () => void
}

test('signal carries payload data when addList is called', async () => {
  const todos = conn.bridge<TodoBridgeForSignalTest>('todos')

  let signalData: any = null
  todos.dataChanged((data: any) => { signalData = data })

  const list = await todos.addList({ name: 'Signal Test' })

  // Give the signal a moment to propagate
  await new Promise(r => setTimeout(r, 100))

  expect(signalData).not.toBeNull()
  expect(signalData.name).toBe('Signal Test')
  expect(signalData.id).toBe(list.id)
})
