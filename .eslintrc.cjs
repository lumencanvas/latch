module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:vue/vue3-recommended',
  ],
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'vue'],
  rules: {
    // TypeScript
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',

    // Vue
    'vue/multi-word-component-names': 'off',
    'vue/require-default-prop': 'off',
    'vue/no-v-html': 'off',

    // General
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
  },
  overrides: [
    {
      // opencv.worker.ts is a CLASSIC worker: it relies on `importScripts()` to
      // load opencv.js. A single ES `import`/`export` makes Vite emit it as a
      // MODULE worker, which silently drops `importScripts` and breaks it at
      // runtime. Forbid module syntax here so that footgun can't be pulled.
      files: ['**/opencv.worker.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'ImportDeclaration',
            message:
              'opencv.worker.ts is a classic worker — no ES imports (would break importScripts). Inline the code instead.',
          },
          {
            selector: 'ExportNamedDeclaration',
            message: 'opencv.worker.ts is a classic worker — no ES exports (would make it a module worker).',
          },
          {
            selector: 'ExportDefaultDeclaration',
            message: 'opencv.worker.ts is a classic worker — no ES exports (would make it a module worker).',
          },
        ],
      },
    },
  ],
  // public/vendor holds third-party builds (opencv.js — minified emscripten/UMD)
  // that we serve verbatim; never lint them.
  ignorePatterns: ['dist', 'dist-electron', 'out', 'node_modules', '*.config.ts', 'public/vendor'],
}
