# Developer Experience — Custom-Node Authoring

Sourced research into the pain of building custom nodes/extensions across ComfyUI,
Node-RED, n8n, Unreal Blueprints, Blender, and embeddable graph libs (Rete,
Litegraph, React/Vue Flow) — used to **adversarially validate LATCH's
extensibility design** (`defineNode`/glob/`defineNodeState`/`defineProtocol`/
`defineModel`/declarative-`ui`/versioning; see
`docs/plans/EXTENSIBILITY_ARCHITECTURE_2026-06-28.md`). Two real security incidents
verified. Confidence flags inline.

---

## Top custom-node developer pains (cross-ecosystem, ranked)

1. **Authoring ceremony — one node touches many files/registries.** Node-RED
   (`.js`+`.html`+`package.json`); ComfyUI (`NODE_CLASS_MAPPINGS` +
   `NODE_DISPLAY_NAME_MAPPINGS` + class + `INPUT_TYPES` + `RETURN_TYPES` scattered —
   the explicit motivation for ComfyUI's V3 schema rewrite); Blender (~4 classes /
   ~130 lines / manual register-unregister, C-level node = ~8 files).
2. **No sandboxing → real malware/credential theft.** *Verified:* the **2026 n8n
   supply-chain attack** (8+ malicious npm packages exfiltrated **decrypted** OAuth
   tokens; "no sandboxing or isolation between node code and the n8n runtime");
   **ComfyUI ×2** (a credential/wallet stealer `ComfyUI_LLMVISION`; the `ultralytics`
   PyPI cryptominer that hit fresh installs via a popular node's transitive dep).
3. **Declarative-UI hits a hard ceiling, forcing a rewrite to code — and the
   boundary is invisible until you're committed.** n8n's declarative style silently
   can't do file/binary uploads, GraphQL, external deps, or data transforms; devs
   discover this mid-build, then rewrite as programmatic. **The loudest warning for
   LATCH.**
4. **Breaking API churn destroys custom nodes with no deprecation path.** ComfyUI
   ("broke three times in four months… no deprecation warnings, no migration path");
   Blender (4.0 moved group sockets to `NodeTree.interface`, breaking add-ons every
   release); Node-RED (4.0 turned deprecated sync JSONata into an error); n8n v1→v2.
5. **Custom UI / widgets disproportionately hard vs core logic.** Node-RED raw HTML
   + jQuery `oneditprepare`; ComfyUI `WEB_DIRECTORY` JS "far harder, under-taught";
   Litegraph Canvas2D **can't embed real DOM components** ("hard locked") — *ComfyUI
   itself is migrating to a Vue DOM-node model ("Nodes 2.0")*.
6. **No reliable hot reload — restart-driven dev loop.** ComfyUI (restart required;
   "cannot be applied for end users due to imported dependencies"); Node-RED core
   contributor "restarting Node-RED at least 100 times per day"; n8n HMR broken/
   undocumented.
7. **Dependency / shared-resource hell.** ComfyUI single shared Python env (one node
   pack silently breaks another; mutually-exclusive packs over numpy/opencv/peft);
   Blender node-group assets don't carry their image deps + tank the Add menu;
   Unreal hard-references load whole asset trees.
8. **Saved graphs break / nodes go missing across versions; migration manual or
   absent.** ComfyUI missing-node → broken graph; n8n pins old versions forever
   (authors carry every legacy branch); Blender "node type number must never change
   or saved files won't load"; Unreal redirectors silently break.
9. **Untyped / stringly-typed node APIs** — typos surface only at runtime restart
   (ComfyUI string port types; a third-party `comfyui-types` exists just to fix it).
10. **Testing a node in isolation is hard or re-fires upstream side effects** — n8n
    single-node testing now **re-runs the entire upstream workflow** (re-firing paid
    API/LLM calls); Node-RED's `test-helper` is brittle (its own tutorial throws).
11. **Large graphs → spaghetti; reuse mechanisms have holes.** Unreal's three-way
    split (collapsed graph = no reuse; macros expand inline/invisible to debugger;
    functions can't hold latent/async); Blender Geometry Nodes "can't be used in
    studios due to forced repetition."
12. **Big-graph performance walls / re-render storms.** React Flow: moving one node
    re-renders ALL nodes; degrades ~80 nodes (app-state selection) to 5k. Blender:
    cosmetic edits (rename/recolor) force re-evaluation.
13. **Credentials/connections (config nodes) confusing, under-documented, silently
    fail** (Node-RED config nodes; n8n OAuth2 authoring undocumented).
14. **Error/import-failure surfacing is opaque** — ComfyUI showed only
    `(IMPORT FAILED)` with no context (recently fixed).
15. **Docs/scaffolding lag the API; no first-party CLI; learn-by-reverse-
    engineering** (n8n/Node-RED/Unreal K2Node).

(Sources: apatero.com ComfyUI V3/JS guides; docs.comfy.org; blog.comfy.org
security; ComfyUI GitHub issues #7055/#12383/#5290/#11454; nodered.org docs +
discourse; node-red/designs #86/#51; n8n docs + community; Endor Labs / The Hacker
News on the n8n attack; s1t2/unrealcommunity K2Node; michaelnoland Blueprint
complexity; Blender custom_nodes.py template + exppad.com; xyflow issues
#4983/#3044; Rete migration guide; archived Comfy-Org/litegraph.js.)

---

## Validation of LATCH's extensibility design

### Confirmed good (independent ecosystems converge on our direction)

- **`defineNode()` single co-located unit** directly fixes the #1 pain; ComfyUI V3
  and Node-RED's CLI-design discussion are converging on the same fix.
- **Glob auto-discovery + co-located folders** eliminate registration ceremony
  (`NODE_CLASS_MAPPINGS`, `register_class`, `package.json` `node-red`).
- **TS-first / typed ports** fix the stringly-typed runtime-error class — *only a
  win if ports are real TS types, not string IDs.*
- **Declarative `ui` over Vue/DOM** beats Node-RED HTML+jQuery and Litegraph's
  hard-locked Canvas2D widgets — *ComfyUI is migrating toward exactly this.*
- **Web/Vite → real HMR** is a genuine edge over every Python tool's restart loop —
  *validate it actually works per node-folder edit.*
- **Graphs as JSON** beat Unreal's binary `.uasset` — *only if serialization is
  diff-friendly (stable IDs/key order, layout separated).*
- **Web sandbox (no `fs`/`exec`)** is a real, structural security edge over Python
  tools that suffered RCE-class malware.
- **Auto-applying `nodrag`/`nowheel`** via the schema turns Vue Flow's universal
  interaction footgun into a non-issue.

### Reconsider / where the design is weak (act on these)

1. **Declarative UI *will* hit a ceiling — design the escape hatch now.** Make the
   declarative/code boundary **visible up front** and provide a **first-class,
   documented code/Vue-component escape hatch** (not a second-class "you'll have to
   rewrite"). LATCH already keeps `component?` alongside `ui?` — keep it first-class
   and document *when* to reach for it. **Highest-risk design decision.**
2. **"Register-once connections/models" is the exact n8n breach surface.** A node
   that can request a registered, authenticated connection can exfiltrate it (the
   browser sandbox stops `fs`/`exec` but **not `fetch`-to-attacker**). Add
   **capability-scoped, user-approved connection access** (a node declares which
   protocols it needs; the user approves) and a **provenance/trust tier** for
   distributed nodes. Never blanket-hand credentials to any node that asks.
3. **Shared model registry must version-resolve (not last-writer-wins) and
   lazy-load** — or it recreates ComfyUI's collision + Unreal's eager-load bloat.
   Two nodes wanting different model versions must coexist.
4. **Versioning = migration functions + stable node-type IDs + graceful missing-node
   placeholders** — not n8n-style pin-forever (which makes authors carry every old
   branch) and not ComfyUI's shatter-on-missing-node. A saved graph must *degrade,
   never shatter* (render a placeholder node that preserves data + wires).
5. **`defineNode` is a long-term API contract — version it like one from day one.**
   Rete v1→v2 and ComfyUI V3 stranded their communities with rewrites. Commit to
   **deprecation cycles, not removals.**
6. **Big-graph perf is unproven; Vue Flow shares React Flow's failure modes.**
   **Don't state-manage selection/hover in Pinia** (push to CSS); **decouple
   cosmetic edits (move/rename/recolor) from execution**; profile at **500+ nodes**
   before claiming scale.
7. **Ship first-class node testing + inline error surfacing.** A reliable test
   harness (isolated node execution without re-firing upstream side effects — LATCH's
   per-node execution + caching enables this) and **"which node folder failed and
   why"** inline (glob auto-discovery that silently drops a broken node is worse
   than a loud error).
8. **Ship a scaffolding CLI (`latch new-node`) and version docs with the API.**
   Glob removes registration, but a scaffold + API-versioned docs close the
   onboarding gap every ecosystem leaves open.
9. **Reuse/subgraphs are the #1 *scaling* pain — make them true references that can
   contain async** (single source of truth), not Unreal's macro/function/collapsed
   three-way trap. (Aligns with `SUBFLOW_REBUILD_SPEC_2026-06-28.md`.)

> These nine items are folded into the plan as amendments — see
> `06-adversarial-self-audit.md` §"Plan amendments" and the EXTENSIBILITY doc.
