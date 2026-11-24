# Dependency stubs

`@huggingface/transformers` hard-depends on `onnxruntime-node` and `sharp`, native packages
that are only used by its Node.js build. LATCH runs transformers in the browser
(`transformers.web.js`, which never imports either), so `package.json` points both at these
empty local packages via `dependencies` + `overrides`:

- `npm install` works on platforms those binaries don't support (Android/Termux — issue #1).
- Installs and the desktop package drop ~300 MB of unused native binaries.

If LATCH ever needs transformers in Node (e.g. a server-side script), remove the override.

`onnxruntime-common@1.24.3` is a direct dependency because `transformers.web.js` imports it
without declaring it — it used to be hoisted only through the real `onnxruntime-node`. Keep it
at the version `onnxruntime-node` (transformers' pin) would have brought in.
