/**
 * Visual executors — Workstream B thin re-export shim.
 *
 * The visual executor bodies are co-located in registry/visual/<id>/node.ts and the shared state /
 * helpers / lifecycle live in registry/visual/shared.ts. This module survives ONLY to preserve the
 * getThreeShaderRenderer / getShaderRenderer imports that the opencv, clasp, and ai executors resolve
 * from './visual' (a relative sibling import). When those categories co-locate, they can import these
 * from the services directly and this shim can go.
 */
export { getThreeShaderRenderer } from '@/services/visual/ThreeShaderRenderer'
export { getShaderRenderer } from '@/services/visual/ShaderRenderer'
