/**
 * Monaco worker environment — configured ONCE, before any `monaco.editor.create()`.
 *
 * Monaco spins up language-service Web Workers. This build doesn't ship the per-language worker
 * bundles, so without a `getWorker` override Monaco tries to load a worker from a default URL that
 * 404s and emits an UNCAUGHT ErrorEvent on `window` (surfaces as "Uncaught [object Event]"). We
 * return a no-op inline worker: basic editing + syntax highlighting still work; only cross-model
 * IntelliSense/validation is skipped — which the node code editors don't need.
 *
 * Imported for side-effect by EVERY direct Monaco consumer (MonacoEditor.vue, FunctionNode.vue) so
 * the environment is set regardless of which mounts first. Previously the config lived only in
 * MonacoEditor.vue, so a bare Function node mounted before any shader editor left MonacoEnvironment
 * unset → the uncaught error on every Function-node mount.
 */

if (typeof self !== 'undefined' && !self.MonacoEnvironment) {
  self.MonacoEnvironment = {
    getWorker() {
      const blob = new Blob(['self.onmessage = function() {}'], { type: 'application/javascript' })
      return new Worker(URL.createObjectURL(blob))
    },
  }
}

export {}
