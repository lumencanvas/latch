import { describe, it, expect } from 'vitest'
import type { NodeDefinition, ControlDefinition } from '@/stores/nodes'
import cvThresholdSpec from '@/registry/opencv/cv-threshold/node'
import claspVideoReceiveSpec from '@/registry/clasp/clasp-video-receive/node'
import httpRequestSpec from '@/registry/connectivity/http-request/node'
const httpRequestNode = httpRequestSpec.definition

// cv-threshold + clasp-video-receive are co-located; read the def off the node.ts default spec.
const cvThresholdNode = cvThresholdSpec.definition
const claspVideoReceiveNode = claspVideoReceiveSpec.definition

/**
 * Phase 3b: the built-in producers moved off the three legacy visibility schemas onto the unified
 * `when`. Guards the migration against a typo/regression — and, since every consumer now honors
 * `when`, these declarations are exactly what makes the panel/canvas honoring consistent.
 */
function control(node: NodeDefinition, id: string): ControlDefinition {
  const c = node.controls.find((x) => x.id === id)
  if (!c) throw new Error(`no control ${id}`)
  return c
}

describe('registry migrated to unified `when`', () => {
  it('cv-threshold uses `when`, not legacy visibleWhen', () => {
    expect(control(cvThresholdNode, 'threshold').when).toEqual({ mode: 'binary' })
    expect(control(cvThresholdNode, 'blockSize').when).toEqual({ mode: 'adaptive' })
    expect(control(cvThresholdNode, 'c').when).toEqual({ mode: 'adaptive' })
    for (const c of cvThresholdNode.controls) expect(c.visibleWhen).toBeUndefined()
  })

  it('clasp-video-receive uses `when`', () => {
    expect(control(claspVideoReceiveNode, 'room').when).toEqual({ videoMode: 'room' })
    expect(control(claspVideoReceiveNode, 'peerId').when).toEqual({ videoMode: 'room' })
    expect(control(claspVideoReceiveNode, 'address').when).toEqual({ videoMode: 'direct' })
    for (const c of claspVideoReceiveNode.controls) expect(c.visibleWhen).toBeUndefined()
  })

  it('http-request lifts showWhen out of props into top-level `when`', () => {
    expect(control(httpRequestNode, 'url').when).toEqual({ templateId: '' })
    expect(control(httpRequestNode, 'method').when).toEqual({ templateId: '' })
    expect(control(httpRequestNode, 'url').props?.showWhen).toBeUndefined()
    expect(control(httpRequestNode, 'method').props?.showWhen).toBeUndefined()
  })
})
