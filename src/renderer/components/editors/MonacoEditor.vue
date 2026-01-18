<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, shallowRef } from 'vue'
import * as monaco from 'monaco-editor'

// Set up Monaco environment for Vite
// Monaco will use a simple fallback without web workers
self.MonacoEnvironment = {
  getWorker: function () {
    // Return a simple inline worker
    const blob = new Blob(
      ['self.onmessage = function() {}'],
      { type: 'application/javascript' }
    )
    return new Worker(URL.createObjectURL(blob))
  },
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    language?: string
    theme?: 'vs-dark' | 'vs' | 'hc-black'
    readOnly?: boolean
    minimap?: boolean
    lineNumbers?: 'on' | 'off' | 'relative'
  }>(),
  {
    language: 'glsl',
    theme: 'vs-dark',
    readOnly: false,
    minimap: false,
    lineNumbers: 'on',
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  error: [error: monaco.editor.IMarker[]]
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const editor = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null)

// Register GLSL language if not already registered
function registerGLSL() {
  const languages = monaco.languages.getLanguages()
  if (!languages.some((l) => l.id === 'glsl')) {
    monaco.languages.register({ id: 'glsl' })

    // GLSL syntax highlighting
    monaco.languages.setMonarchTokensProvider('glsl', {
      keywords: [
        'attribute', 'const', 'uniform', 'varying', 'break', 'continue',
        'do', 'for', 'while', 'if', 'else', 'switch', 'case', 'default',
        'in', 'out', 'inout', 'return', 'discard', 'struct', 'void',
        'true', 'false', 'precision', 'highp', 'mediump', 'lowp',
        'invariant', 'flat', 'smooth', 'layout', 'centroid',
      ],
      typeKeywords: [
        'float', 'int', 'uint', 'bool', 'double',
        'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4',
        'uvec2', 'uvec3', 'uvec4', 'bvec2', 'bvec3', 'bvec4',
        'dvec2', 'dvec3', 'dvec4',
        'mat2', 'mat3', 'mat4', 'mat2x2', 'mat2x3', 'mat2x4',
        'mat3x2', 'mat3x3', 'mat3x4', 'mat4x2', 'mat4x3', 'mat4x4',
        'sampler1D', 'sampler2D', 'sampler3D', 'samplerCube',
        'sampler1DShadow', 'sampler2DShadow', 'samplerCubeShadow',
        'sampler2DRect', 'sampler2DRectShadow',
        'isampler1D', 'isampler2D', 'isampler3D', 'isamplerCube',
        'usampler1D', 'usampler2D', 'usampler3D', 'usamplerCube',
      ],
      builtins: [
        // Math functions
        'radians', 'degrees', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
        'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
        'pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt',
        'abs', 'sign', 'floor', 'trunc', 'round', 'roundEven', 'ceil', 'fract',
        'mod', 'modf', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep',
        // Geometric functions
        'length', 'distance', 'dot', 'cross', 'normalize', 'faceforward',
        'reflect', 'refract',
        // Matrix functions
        'matrixCompMult', 'outerProduct', 'transpose', 'determinant', 'inverse',
        // Vector functions
        'lessThan', 'lessThanEqual', 'greaterThan', 'greaterThanEqual',
        'equal', 'notEqual', 'any', 'all', 'not',
        // Texture functions
        'texture', 'textureProj', 'textureLod', 'textureOffset',
        'texelFetch', 'texelFetchOffset', 'textureSize',
        // Misc
        'dFdx', 'dFdy', 'fwidth',
      ],
      shadertoyUniforms: [
        'iTime', 'iResolution', 'iMouse', 'iFrame', 'iDate', 'iTimeDelta',
        'iChannel0', 'iChannel1', 'iChannel2', 'iChannel3',
        'iChannelTime', 'iChannelResolution', 'iSampleRate',
        'fragCoord', 'fragColor', 'mainImage',
      ],
      operators: [
        '=', '>', '<', '!', '~', '?', ':',
        '==', '<=', '>=', '!=', '&&', '||', '++', '--',
        '+', '-', '*', '/', '&', '|', '^', '%', '<<', '>>', '>>>',
        '+=', '-=', '*=', '/=', '&=', '|=', '^=', '%=', '<<=', '>>=',
      ],
      symbols: /[=><!~?:&|+\-*/^%]+/,
      tokenizer: {
        root: [
          // Shadertoy uniforms (special highlight)
          [/\b(iTime|iResolution|iMouse|iFrame|iDate|iTimeDelta|iChannel[0-3]|iChannelTime|iChannelResolution|iSampleRate|fragCoord|fragColor|mainImage)\b/, 'variable.predefined'],
          // Identifiers and keywords
          [/[a-zA-Z_]\w*/, {
            cases: {
              '@keywords': 'keyword',
              '@typeKeywords': 'type',
              '@builtins': 'predefined',
              '@default': 'identifier',
            },
          }],
          // Whitespace
          { include: '@whitespace' },
          // Delimiters
          [/[{}()[\]]/, '@brackets'],
          [/[<>](?!@symbols)/, '@brackets'],
          [/@symbols/, {
            cases: {
              '@operators': 'operator',
              '@default': '',
            },
          }],
          // Numbers
          [/\d*\.\d+([eE][-+]?\d+)?[fF]?/, 'number.float'],
          [/0[xX][0-9a-fA-F]+[uU]?/, 'number.hex'],
          [/\d+[uU]?/, 'number'],
          // Preprocessor
          [/#\s*\w+/, 'keyword.directive'],
        ],
        whitespace: [
          [/[ \t\r\n]+/, 'white'],
          [/\/\*/, 'comment', '@comment'],
          [/\/\/.*$/, 'comment'],
        ],
        comment: [
          [/[^/*]+/, 'comment'],
          [/\*\//, 'comment', '@pop'],
          [/[/*]/, 'comment'],
        ],
      },
    })

    // GLSL autocompletion
    monaco.languages.registerCompletionItemProvider('glsl', {
      provideCompletionItems: () => {
        const suggestions: monaco.languages.CompletionItem[] = []

        // Shadertoy uniforms
        const shadertoyItems = [
          { label: 'iTime', detail: 'float - Playback time in seconds', insertText: 'iTime' },
          { label: 'iResolution', detail: 'vec2 - Viewport resolution', insertText: 'iResolution' },
          { label: 'iMouse', detail: 'vec4 - Mouse position', insertText: 'iMouse' },
          { label: 'iFrame', detail: 'int - Frame count', insertText: 'iFrame' },
          { label: 'iChannel0', detail: 'sampler2D - Input texture 0', insertText: 'iChannel0' },
          { label: 'iChannel1', detail: 'sampler2D - Input texture 1', insertText: 'iChannel1' },
          { label: 'iChannel2', detail: 'sampler2D - Input texture 2', insertText: 'iChannel2' },
          { label: 'iChannel3', detail: 'sampler2D - Input texture 3', insertText: 'iChannel3' },
          { label: 'fragCoord', detail: 'vec2 - Fragment coordinate', insertText: 'fragCoord' },
        ]

        shadertoyItems.forEach((item) => {
          suggestions.push({
            label: item.label,
            kind: monaco.languages.CompletionItemKind.Variable,
            detail: item.detail,
            insertText: item.insertText,
            range: undefined as unknown as monaco.IRange,
          })
        })

        // Common GLSL functions
        const glslFunctions = [
          { label: 'mix', detail: 'mix(x, y, a) - Linear interpolation', insertText: 'mix(${1:x}, ${2:y}, ${3:a})' },
          { label: 'clamp', detail: 'clamp(x, min, max) - Clamp value', insertText: 'clamp(${1:x}, ${2:min}, ${3:max})' },
          { label: 'smoothstep', detail: 'smoothstep(edge0, edge1, x) - Smooth interpolation', insertText: 'smoothstep(${1:edge0}, ${2:edge1}, ${3:x})' },
          { label: 'length', detail: 'length(v) - Vector length', insertText: 'length(${1:v})' },
          { label: 'normalize', detail: 'normalize(v) - Normalize vector', insertText: 'normalize(${1:v})' },
          { label: 'dot', detail: 'dot(a, b) - Dot product', insertText: 'dot(${1:a}, ${2:b})' },
          { label: 'cross', detail: 'cross(a, b) - Cross product', insertText: 'cross(${1:a}, ${2:b})' },
          { label: 'texture', detail: 'texture(sampler, uv) - Sample texture', insertText: 'texture(${1:sampler}, ${2:uv})' },
          { label: 'sin', detail: 'sin(x) - Sine', insertText: 'sin(${1:x})' },
          { label: 'cos', detail: 'cos(x) - Cosine', insertText: 'cos(${1:x})' },
          { label: 'fract', detail: 'fract(x) - Fractional part', insertText: 'fract(${1:x})' },
          { label: 'floor', detail: 'floor(x) - Floor', insertText: 'floor(${1:x})' },
          { label: 'ceil', detail: 'ceil(x) - Ceiling', insertText: 'ceil(${1:x})' },
          { label: 'abs', detail: 'abs(x) - Absolute value', insertText: 'abs(${1:x})' },
          { label: 'pow', detail: 'pow(x, y) - Power', insertText: 'pow(${1:x}, ${2:y})' },
          { label: 'sqrt', detail: 'sqrt(x) - Square root', insertText: 'sqrt(${1:x})' },
          { label: 'mod', detail: 'mod(x, y) - Modulo', insertText: 'mod(${1:x}, ${2:y})' },
          { label: 'step', detail: 'step(edge, x) - Step function', insertText: 'step(${1:edge}, ${2:x})' },
          { label: 'distance', detail: 'distance(a, b) - Distance between points', insertText: 'distance(${1:a}, ${2:b})' },
          { label: 'reflect', detail: 'reflect(I, N) - Reflect vector', insertText: 'reflect(${1:I}, ${2:N})' },
        ]

        glslFunctions.forEach((item) => {
          suggestions.push({
            label: item.label,
            kind: monaco.languages.CompletionItemKind.Function,
            detail: item.detail,
            insertText: item.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: undefined as unknown as monaco.IRange,
          })
        })

        return { suggestions }
      },
    })
  }
}

onMounted(() => {
  if (!containerRef.value) return

  registerGLSL()

  editor.value = monaco.editor.create(containerRef.value, {
    value: props.modelValue,
    language: props.language,
    theme: props.theme,
    readOnly: props.readOnly,
    minimap: { enabled: props.minimap },
    lineNumbers: props.lineNumbers,
    fontSize: 13,
    fontFamily: 'var(--font-mono), "Fira Code", "JetBrains Mono", monospace',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    wordWrap: 'on',
    renderWhitespace: 'selection',
    cursorBlinking: 'smooth',
    smoothScrolling: true,
    padding: { top: 12, bottom: 12 },
  })

  // Listen for content changes
  editor.value.onDidChangeModelContent(() => {
    const value = editor.value?.getValue() ?? ''
    emit('update:modelValue', value)
  })

  // Listen for marker changes (errors)
  monaco.editor.onDidChangeMarkers((uris) => {
    const model = editor.value?.getModel()
    if (model && uris.includes(model.uri)) {
      const markers = monaco.editor.getModelMarkers({ resource: model.uri })
      emit('error', markers)
    }
  })
})

// Update editor when modelValue changes externally
watch(
  () => props.modelValue,
  (newValue) => {
    if (editor.value && editor.value.getValue() !== newValue) {
      editor.value.setValue(newValue)
    }
  }
)

// Update theme when it changes
watch(
  () => props.theme,
  (newTheme) => {
    monaco.editor.setTheme(newTheme)
  }
)

onUnmounted(() => {
  editor.value?.dispose()
})

// Expose editor instance for external access
defineExpose({
  getEditor: () => editor.value,
  focus: () => editor.value?.focus(),
})
</script>

<template>
  <div
    ref="containerRef"
    class="monaco-editor-container"
  />
</template>

<style scoped>
.monaco-editor-container {
  width: 100%;
  height: 100%;
  min-height: 200px;
}
</style>
