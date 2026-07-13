#!/usr/bin/env node
/* eslint-env node */
/**
 * LATCH node scaffold (Workstream A2). Generates a self-contained, co-located node —
 * `registry/<cat>/<id>/node.ts` + a `node.test.ts` — from a template, so authoring a
 * node is a 60-second copy-me task. Invoked via the npm scripts:
 *
 *   npm run new-node -- <category> <id> [--name "Nice Name"] [--component] [--stateful]
 *   npm run new-node -- <category> <family> --set <id1> <id2> ...     # one nodes.ts family
 *   npm run new-category -- <id> [--label "Nice"] [--icon LucideName] [--color "#abc"] [--starter <nodeId>]
 *
 * Fails loudly if an id already exists (mirrors the registry glob's dup-id guard). The
 * generated files use ONLY the public authoring surface: `defineNode`/`defineNodes`/
 * `defineCategory`, the `ExecutionContext` typed accessors, and the `tests/helpers/testNode`
 * runner — the same shapes the guide documents.
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY = join(ROOT, 'src/renderer/registry')

function fail(msg) {
  console.error(`\x1b[31m✖ ${msg}\x1b[0m`)
  process.exit(1)
}

// ── argv parsing ──────────────────────────────────────────────────────────────
// argv: [node, new-node.mjs, <mode>, ...rest]  (mode is baked into the npm script)
const [mode, ...rest] = process.argv.slice(2)
const positional = []
const flags = {}
for (let i = 0; i < rest.length; i++) {
  const a = rest[i]
  if (a.startsWith('--')) {
    const key = a.slice(2)
    // --set is variadic (consumes the remaining positionals); boolean flags take no value.
    if (key === 'set') { flags.set = rest.slice(i + 1).filter((x) => !x.startsWith('--')); break }
    if (key === 'component' || key === 'stateful') { flags[key] = true; continue }
    flags[key] = rest[++i]
  } else {
    positional.push(a)
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────
export const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
export const toTitle = (id) => id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
export const toPascal = (id) => id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name === 'node.ts' || name === 'nodes.ts') out.push(p)
  }
  return out
}

/** Every node id currently registered (parsed from the node.ts/nodes.ts sources). */
function existingIds() {
  const ids = new Set()
  for (const file of walk(REGISTRY)) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\bid:\s*['"]([^'"]+)['"]/g)) ids.add(m[1])
  }
  return ids
}

function assertFreshIds(ids) {
  const taken = existingIds()
  for (const id of ids) {
    if (!KEBAB.test(id)) fail(`id "${id}" must be kebab-case (e.g. my-node)`)
    if (taken.has(id)) fail(`node id "${id}" already exists — pick another (the registry rejects duplicates)`)
  }
}

function write(path, contents) {
  if (existsSync(path)) fail(`${path} already exists`)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, contents)
  console.log(`\x1b[32m  + ${path.replace(ROOT + '/', '')}\x1b[0m`)
}

// ── templates (exported so the scaffold has a unit guard) ───────────────────────
export function nodeTs({ id, name, category, component, stateful }) {
  const pascal = toPascal(id)
  const imports = [
    `import { defineNode } from '@/engine/defineNode'`,
    `import type { NodeDefinition } from '@/stores/nodes'`,
    `import type { ExecutionContext } from '@/engine/ExecutionEngine'`,
  ]
  if (stateful) imports.push(`import { defineNodeState } from '@/engine/nodeState'`)
  if (component) imports.push(`import { markRaw } from 'vue'`, `import ${pascal}Node from './${pascal}Node.vue'`)

  const state = stateful
    ? `\n// Per-node state — auto-drained on stop/gc (its dispose runs for you). Keyed by node id.\nexport const ${toPascal(id).charAt(0).toLowerCase() + toPascal(id).slice(1)}State = defineNodeState<{ last: number }>({\n  label: '${id}',\n})\n`
    : ''

  const execBody = stateful
    ? `  const value = ctx.num('in')\n  const s = ${toPascal(id).charAt(0).toLowerCase() + toPascal(id).slice(1)}State.getOrCreate(ctx.nodeId, () => ({ last: 0 }))\n  s.last = value\n  return new Map<string, unknown>([['out', value]])`
    : `  const value = ctx.num('in')\n  return new Map<string, unknown>([['out', value]])`

  return `${imports.join('\n')}
${state}
const definition: NodeDefinition = {
  id: '${id}',
  name: '${name}',
  version: '1.0.0',
  category: '${category}',
  description: 'TODO: describe what ${id} does',
  icon: 'box',
  platforms: ['web', 'electron'],
  inputs: [
    { id: 'in', type: 'number', label: 'In' },
  ],
  outputs: [
    { id: 'out', type: 'number', label: 'Out' },
  ],
  controls: [],
}

// Runtime behavior. Read inputs/controls via the typed accessors: ctx.num / ctx.bool /
// ctx.str (each takes an optional fallback) and ctx.trig / ctx.level for triggers.
const executor = (ctx: ExecutionContext) => {
${execBody}
}

export default defineNode({ definition, executor${component ? `, component: markRaw(${pascal}Node)` : ''} })
`
}

export function nodeTestTs({ id, name, stateful }) {
  return `import { describe, it, expect${stateful ? ', beforeEach' : ''} } from 'vitest'
import spec from './node'
import { runNode${stateful ? ', resetNodeState' : ''} } from '../../../../../tests/helpers/testNode'
${stateful ? '\nbeforeEach(resetNodeState)\n' : ''}
describe('${id} (${name})', () => {
  it('passes its input through to its output', async () => {
    const out = await runNode(spec, { inputs: { in: 42 } })
    expect(out.get('out')).toBe(42)
    // TODO: replace with real assertions for ${id}.
  })
})
`
}

export function componentVue({ pascal, id }) {
  return `<script setup lang="ts">
// Bespoke SFC for the "${id}" node (the code escape hatch — most nodes need only \`ui\`/BaseNode).
// Receives the Vue Flow node props; render your custom UI + ports here.
defineProps<{ id: string; data: Record<string, unknown> }>()
</script>

<template>
  <div class="${id}-node">
    <!-- TODO: custom node UI -->
    ${pascal}
  </div>
</template>

<style scoped>
.${id}-node {
  padding: var(--space-2);
}
</style>
`
}

export function nodesTs({ category, ids }) {
  const specs = ids.map((id) => `  {
    definition: {
      id: '${id}',
      name: '${toTitle(id)}',
      version: '1.0.0',
      category: '${category}',
      description: 'TODO: describe ${id}',
      icon: 'box',
      platforms: ['web', 'electron'],
      inputs: [{ id: 'in', type: 'number', label: 'In' }],
      outputs: [{ id: 'out', type: 'number', label: 'Out' }],
      controls: [],
    },
    executor: (ctx: ExecutionContext) => new Map<string, unknown>([['out', ctx.num('in')]]),
  },`).join('\n')

  return `import { defineNodes } from '@/engine/defineNode'
import type { ExecutionContext } from '@/engine/ExecutionEngine'

// One unit → many nodes. \`defineNodes([...])\` registers a whole family from a single file;
// the registry flattens it (dup-id / count / pure-set guards apply per spec). Generate a
// parametric set here (e.g. ['a','b','c'].map(makeNode)) or list them out.
export default defineNodes([
${specs}
])
`
}

export function categoryTs({ id, label, icon, color }) {
  return `import { defineCategory } from '@/engine/defineCategory'
import { ${icon} } from 'lucide-vue-next'

// Drop-in category: this file + the node.ts files under registry/${id}/ are all it takes —
// zero edits to stores/nodes.ts. Pass a lucide COMPONENT as \`icon\` to render it in the palette
// (a string is accepted as inert metadata but renders the neutral fallback).
export default defineCategory({
  id: '${id}',
  label: '${label}',
  icon: ${icon},
  color: '${color}',
})
`
}

// ── commands ──────────────────────────────────────────────────────────────────
function scaffoldNode() {
  const [category, idOrFamily] = positional
  if (!category || !idOrFamily) fail('usage: npm run new-node -- <category> <id> [--name "X"] [--component] [--stateful]  |  <category> <family> --set <id1> <id2> ...')

  if (flags.set) {
    const ids = flags.set
    if (!ids.length) fail('--set needs at least one node id')
    assertFreshIds(ids)
    const dir = join(REGISTRY, category, idOrFamily)
    write(join(dir, 'nodes.ts'), nodesTs({ category, ids }))
    console.log(`\n\x1b[36m✔ nodes.ts family "${idOrFamily}" (${ids.length} nodes) under registry/${category}/\x1b[0m`)
    console.log(`  Next: fill in the executors, then \`npm run test:unit\`.`)
    return
  }

  const id = idOrFamily
  assertFreshIds([id])
  const name = flags.name ?? toTitle(id)
  const dir = join(REGISTRY, category, id)
  write(join(dir, 'node.ts'), nodeTs({ id, name, category, component: !!flags.component, stateful: !!flags.stateful }))
  write(join(dir, 'node.test.ts'), nodeTestTs({ id, name, stateful: !!flags.stateful }))
  if (flags.component) write(join(dir, `${toPascal(id)}Node.vue`), componentVue({ pascal: toPascal(id), id }))
  console.log(`\n\x1b[36m✔ node "${id}" under registry/${category}/\x1b[0m`)
  console.log(`  Next: edit node.ts (ports/executor), flesh out node.test.ts, then \`npm run test:unit\`.`)
}

function scaffoldCategory() {
  const [id] = positional
  if (!id) fail('usage: npm run new-category -- <id> [--label "X"] [--icon LucideName] [--color "#abc"] [--starter <nodeId>]')
  if (!KEBAB.test(id)) fail(`category id "${id}" must be kebab-case`)
  const dir = join(REGISTRY, id)
  if (existsSync(join(dir, 'category.ts'))) fail(`registry/${id}/category.ts already exists`)

  const label = flags.label ?? toTitle(id)
  const icon = flags.icon ?? 'Box'
  const color = flags.color ?? '#6B7280'
  write(join(dir, 'category.ts'), categoryTs({ id, label, icon, color }))

  // A starter node so the new category is non-empty (and shows in the palette immediately).
  const starterId = flags.starter ?? `${id}-hello`
  assertFreshIds([starterId])
  const starterDir = join(dir, starterId)
  write(join(starterDir, 'node.ts'), nodeTs({ id: starterId, name: toTitle(starterId), category: id, component: false, stateful: false }))
  write(join(starterDir, 'node.test.ts'), nodeTestTs({ id: starterId, name: toTitle(starterId), stateful: false }))

  console.log(`\n\x1b[36m✔ category "${id}" (label "${label}", icon ${icon}) + starter node "${starterId}"\x1b[0m`)
  console.log(`  It appears in the palette on next run — zero edits to stores/nodes.ts. Next: \`npm run test:unit\`.`)
}

// Only dispatch when run as a CLI (not when imported by the scaffold's unit test).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (mode === 'category') scaffoldCategory()
  else if (mode === 'node') scaffoldNode()
  else fail(`unknown mode "${mode}" (expected the npm script to pass "node" or "category")`)
}
