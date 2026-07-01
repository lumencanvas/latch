import type { NodeExecutorFn, ExecutionContext } from '@/engine/ExecutionEngine'

export class CompilationError extends Error {
  constructor(
    message: string,
    public originalError?: Error
  ) {
    super(message)
    this.name = 'CompilationError'
  }
}

/**
 * Compiles custom node executor code into a NodeExecutorFn.
 *
 * The executor code should be in ES module format with a default export:
 * ```javascript
 * export default function(ctx) {
 *   const input = ctx.inputs.get('input1') ?? 0;
 *   return new Map([['output1', input * 2]]);
 * }
 * ```
 *
 * Or as an arrow function:
 * ```javascript
 * export default (ctx) => {
 *   return new Map([['result', ctx.controls.get('value')]]);
 * }
 * ```
 *
 * The context object provides:
 * - ctx.nodeId: string - Unique node instance ID
 * - ctx.inputs: Map<string, unknown> - Input values keyed by port ID
 * - ctx.controls: Map<string, unknown> - Control values keyed by control ID
 * - ctx.definition: NodeDefinition - The node's definition
 * - ctx.deltaTime: number - Seconds since last frame
 * - ctx.totalTime: number - Seconds since execution started
 * - ctx.frameCount: number - Current frame number
 *
 * The executor must return a Map<string, unknown> with output port IDs as keys.
 */
export function compileExecutor(code: string, nodeId: string): NodeExecutorFn {
  // Transform ES module syntax to CommonJS-style for Function constructor
  // This handles: export default function(ctx) { ... }
  //           and: export default (ctx) => { ... }

  let transformedCode = code.trim()

  // Handle "export default function name(ctx)" or "export default function(ctx)"
  transformedCode = transformedCode.replace(
    /export\s+default\s+function\s*\w*\s*\(/,
    'return function('
  )

  // Handle "export default (ctx) =>" or "export default ctx =>"
  transformedCode = transformedCode.replace(
    /export\s+default\s+(\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/,
    'return $1 =>'
  )

  // If no export default was found, try to detect a standalone function
  if (!transformedCode.startsWith('return')) {
    // Check if the code is just a function expression
    if (transformedCode.match(/^function\s*\w*\s*\(/)) {
      transformedCode = 'return ' + transformedCode
    } else if (transformedCode.match(/^\([^)]*\)\s*=>/) || transformedCode.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*\s*=>/)) {
      transformedCode = 'return ' + transformedCode
    } else {
      throw new CompilationError(
        `Invalid executor format for node "${nodeId}". Expected "export default function(ctx) { ... }" or "export default (ctx) => { ... }"`
      )
    }
  }

  try {
    // Create a factory function that returns the executor.
    // NOTE: `new Function` is NOT a sandbox — the executor runs on the main thread with
    // full ambient authority (fetch, WebSocket, navigator, dynamic import). It only isolates
    // the LEXICAL scope, not capabilities. True confinement of community executors (a Worker
    // with a message-port-only surface) is the SECURITY_MODEL step-5 follow-on; the capability
    // gate protects broker CREDENTIALS, not arbitrary egress by community code.
    const factory = new Function(transformedCode)
    const executor = factory()

    if (typeof executor !== 'function') {
      throw new CompilationError(
        `Executor for node "${nodeId}" must export a function`
      )
    }

    // Wrap the executor to handle errors and ensure proper return type
    const wrappedExecutor: NodeExecutorFn = async (ctx: ExecutionContext) => {
      try {
        const result = await executor(ctx)

        // Validate return type
        if (!(result instanceof Map)) {
          // If the result is a plain object, convert it to a Map
          if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
            return new Map(Object.entries(result))
          }

          console.warn(
            `Executor for node "${nodeId}" returned ${typeof result}, expected Map. ` +
            `Returning empty output.`
          )
          return new Map()
        }

        return result
      } catch (error) {
        console.error(`Error in custom executor "${nodeId}":`, error)
        // Return empty outputs on error, don't crash the execution engine
        return new Map()
      }
    }

    return wrappedExecutor
  } catch (error) {
    if (error instanceof CompilationError) {
      throw error
    }
    throw new CompilationError(
      `Failed to compile executor for node "${nodeId}": ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    )
  }
}

/**
 * Validates that executor code is syntactically correct without executing it.
 * Returns true if valid, throws CompilationError if not.
 */
export function validateExecutorSyntax(code: string): boolean {
  try {
    // Just check if the code can be parsed
    new Function(code.replace(/export\s+default\s+/, 'return '))
    return true
  } catch (error) {
    throw new CompilationError(
      `Syntax error in executor code: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    )
  }
}
