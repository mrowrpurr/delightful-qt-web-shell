#!/usr/bin/env bun
// Validates that TypeScript bridge interfaces match C++ Q_INVOKABLE methods.
//
// Usage:
//   xmake run validate-bridges       (starts dev-server automatically)
//   bun run tools/validate-bridges.ts (requires dev-server on :9876)
//
// Connects to the dev-server's WebSocket, calls __meta__ to get the C++ method
// manifest, then parses the TypeScript interface files and checks for drift.

import { readFileSync } from 'fs'
import { join } from 'path'

const WS_URL = process.env.BRIDGE_WS_URL || 'ws://localhost:9876'
const BRIDGE_TS = join(import.meta.dir, '..', 'web', 'shared', 'api', 'bridge.ts')

// ── Fetch C++ manifest via __meta__ ─────────────────────────────────

interface MethodMeta {
  name: string
  returnType: string
  paramCount: number
  params: { name: string; type: string }[]
}

interface BridgeMeta {
  methods: MethodMeta[]
  signals: string[]
}

async function fetchMeta(): Promise<Record<string, BridgeMeta>> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL)
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error(`Connection timeout. Is the dev-server running on ${WS_URL}?`))
    }, 5000)

    ws.onopen = () => {
      ws.send(JSON.stringify({ method: '__meta__', args: [], id: 0 }))
    }
    ws.onmessage = (e: MessageEvent) => {
      clearTimeout(timeout)
      const msg = JSON.parse(e.data)
      ws.close()
      if (msg.error) reject(new Error(msg.error))
      else resolve(msg.result.bridges)
    }
    ws.onerror = () => {
      clearTimeout(timeout)
      reject(new Error(`Cannot connect to ${WS_URL}. Start the dev-server first:\n  xmake run dev-server`))
    }
  })
}

// ── Parse TypeScript interfaces ─────────────────────────────────────

interface TsMethod {
  name: string
  paramCount: number
  isSignal: boolean
}

function parseTsBridgeInterfaces(source: string): Record<string, TsMethod[]> {
  const bridges: Record<string, TsMethod[]> = {}

  // Find interface blocks with proper brace matching (handles nested { } in types)
  const interfaceStartRe = /export\s+interface\s+(\w+Bridge)\s*\{/g
  let startMatch
  while ((startMatch = interfaceStartRe.exec(source))) {
    const interfaceName = startMatch[1]
    let depth = 1
    let pos = startMatch.index + startMatch[0].length
    while (pos < source.length && depth > 0) {
      if (source[pos] === '{') depth++
      else if (source[pos] === '}') depth--
      pos++
    }
    const body = source.slice(startMatch.index + startMatch[0].length, pos - 1)
    const methods: TsMethod[] = []

    // Match method lines: methodName(params): ReturnType
    // Signals look like: signalName(callback: () => void): () => void
    for (const line of body.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('//')) continue

      // Match: name(params): returnType
      // Use a non-greedy match for params that handles nested parens for callback types
      const methodMatch = trimmed.match(/^(\w+)\s*\(/)
      if (!methodMatch) continue

      const name = methodMatch[1]

      // Detect signals: the return type ends with "() => void" (subscription pattern)
      const isSignal = trimmed.endsWith('() => void')
        && trimmed.includes('callback:')

      // Count params by finding the parameter list between the outer parens
      let paramCount = 0
      if (!isSignal) {
        // Extract content between first ( and matching )
        let depth = 0
        let paramStart = trimmed.indexOf('(')
        let paramEnd = paramStart
        for (let i = paramStart; i < trimmed.length; i++) {
          if (trimmed[i] === '(') depth++
          else if (trimmed[i] === ')') { depth--; if (depth === 0) { paramEnd = i; break } }
        }
        const paramStr = trimmed.slice(paramStart + 1, paramEnd).trim()
        if (paramStr) {
          paramCount = paramStr.split(',').length
        }
      }

      methods.push({ name, paramCount, isSignal })
    }

    bridges[interfaceName] = methods
  }

  return bridges
}

// ── Validation ──────────────────────────────────────────────────────

interface Issue {
  level: 'error' | 'warning'
  bridge: string
  message: string
}

function validate(
  cppBridges: Record<string, BridgeMeta>,
  tsBridges: Record<string, TsMethod[]>,
): Issue[] {
  const issues: Issue[] = []

  // Map TS interface names to bridge registration names
  // Convention: TodoBridge → "todos" (lowercase, strip "Bridge")
  // But we also check by exact match if available
  const tsNameToCppName = new Map<string, string>()

  for (const tsName of Object.keys(tsBridges)) {
    // Try convention: "TodoBridge" → "todos" (lowercase first word)
    const stripped = tsName.replace(/Bridge$/, '')
    // Try: exact lowercase, with trailing 's' for plurals
    const candidates = [
      stripped.toLowerCase(),
      stripped.toLowerCase() + 's',
      stripped,
    ]
    for (const candidate of candidates) {
      if (cppBridges[candidate]) {
        tsNameToCppName.set(tsName, candidate)
        break
      }
    }
  }

  for (const [tsName, tsMethods] of Object.entries(tsBridges)) {
    const cppName = tsNameToCppName.get(tsName)
    if (!cppName) {
      issues.push({
        level: 'warning',
        bridge: tsName,
        message: `TypeScript interface "${tsName}" has no matching C++ bridge. Expected a bridge named "${tsName.replace(/Bridge$/, '').toLowerCase()}" or similar.`,
      })
      continue
    }

    const cpp = cppBridges[cppName]
    const cppMethodNames = new Set(cpp.methods.map(m => m.name))
    const cppSignalNames = new Set(cpp.signals)

    // Check each TS method exists in C++
    for (const tsMethod of tsMethods) {
      if (tsMethod.isSignal) {
        if (!cppSignalNames.has(tsMethod.name)) {
          issues.push({
            level: 'error',
            bridge: tsName,
            message: `Signal "${tsMethod.name}" declared in TypeScript but missing from C++ bridge "${cppName}".`,
          })
        }
        continue
      }

      if (!cppMethodNames.has(tsMethod.name)) {
        issues.push({
          level: 'error',
          bridge: tsName,
          message: `Method "${tsMethod.name}" declared in TypeScript but missing from C++ bridge "${cppName}". Did you forget to add Q_INVOKABLE?`,
        })
        continue
      }

      // Check arity
      const cppMethod = cpp.methods.find(m => m.name === tsMethod.name)!
      if (tsMethod.paramCount !== cppMethod.paramCount) {
        issues.push({
          level: 'error',
          bridge: tsName,
          message: `Method "${tsMethod.name}" has ${tsMethod.paramCount} params in TypeScript but ${cppMethod.paramCount} in C++.`,
        })
      }
    }

    // Check each C++ method exists in TS
    const tsMethodNames = new Set(tsMethods.filter(m => !m.isSignal).map(m => m.name))
    const tsSignalNames = new Set(tsMethods.filter(m => m.isSignal).map(m => m.name))

    for (const cppMethod of cpp.methods) {
      if (!tsMethodNames.has(cppMethod.name)) {
        issues.push({
          level: 'warning',
          bridge: tsName,
          message: `C++ method "${cppMethod.name}" on bridge "${cppName}" has no TypeScript declaration. Add it to ${tsName}.`,
        })
      }
    }

    for (const signal of cpp.signals) {
      if (!tsSignalNames.has(signal)) {
        issues.push({
          level: 'warning',
          bridge: tsName,
          message: `C++ signal "${signal}" on bridge "${cppName}" has no TypeScript subscription. Add it to ${tsName}.`,
        })
      }
    }
  }

  return issues
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 Validating bridge interfaces...\n')

  // 1. Fetch C++ manifest
  let cppBridges: Record<string, BridgeMeta>
  try {
    cppBridges = await fetchMeta()
  } catch (e: any) {
    console.error(`❌ ${e.message}`)
    process.exit(1)
  }

  const bridgeNames = Object.keys(cppBridges)
  const totalMethods = bridgeNames.reduce((n, b) => n + cppBridges[b].methods.length, 0)
  console.log(`  C++ bridges: ${bridgeNames.join(', ')} (${totalMethods} methods)\n`)

  // 2. Parse TypeScript
  const tsSource = readFileSync(BRIDGE_TS, 'utf8')
  const tsBridges = parseTsBridgeInterfaces(tsSource)
  const tsNames = Object.keys(tsBridges)
  const tsTotalMethods = tsNames.reduce((n, b) => n + tsBridges[b].length, 0)
  console.log(`  TS interfaces: ${tsNames.join(', ')} (${tsTotalMethods} members)\n`)

  // 3. Validate
  const issues = validate(cppBridges, tsBridges)

  if (issues.length === 0) {
    console.log('✅ All bridge interfaces match! C++ ↔ TypeScript in sync.\n')

    // Print summary table
    for (const [cppName, meta] of Object.entries(cppBridges)) {
      console.log(`  ${cppName}:`)
      for (const m of meta.methods) {
        const params = m.params.map(p => `${p.name}: ${p.type}`).join(', ')
        console.log(`    ${m.name}(${params}) → ${m.returnType}`)
      }
      if (meta.signals.length) {
        console.log(`    signals: ${meta.signals.join(', ')}`)
      }
      console.log()
    }
    process.exit(0)
  }

  // Print issues
  const errors = issues.filter(i => i.level === 'error')
  const warnings = issues.filter(i => i.level === 'warning')

  for (const issue of errors) {
    console.log(`  ❌ [${issue.bridge}] ${issue.message}`)
  }
  for (const issue of warnings) {
    console.log(`  ⚠️  [${issue.bridge}] ${issue.message}`)
  }

  console.log(`\n  ${errors.length} error(s), ${warnings.length} warning(s)`)

  if (errors.length > 0) {
    console.log('\n  Fix: ensure every Q_INVOKABLE method in C++ has a matching')
    console.log('  declaration in the TypeScript interface, and vice versa.')
    process.exit(1)
  }
}

main()
