# Competitor Landscape & Pain Points

Sourced research into where node/flow creative tools frustrate users, what makes
people abandon them, and where LATCH (free, open, web+desktop, local-file,
in-browser-ML) can credibly do better. Claims trace to real user sentiment
(forums, Reddit, HN, GitHub, news, reviews); confidence is flagged where sourcing
is thin. **Skeptic corrections are kept** so we don't repeat a false claim.

Verdict tags: **WIN** (LATCH structurally better) · **PLAUSIBLE** (with good
execution) · **MATCH** (table stakes; don't market against) · **SHARED/WORSE**
(LATCH ties or loses — never overclaim).

---

## A. Pro real-time tools (TouchDesigner, Max/MSP, vvvv gamma, Houdini, Notch)

**TouchDesigner** — Free tier hard-capped at **1280×1280 output** (unusable for
real installs); Pro $2200 / Commercial $600; proprietary binary `.toe`/`.tox` →
spawned third-party escape tools (Embody/TDN). Windows-centric (no Linux/web/
mobile; macOS materially slower). Spaghetti at scale (no native reroute → null-OP
hacks); recurring random crashes; unattended installs need third-party watchdogs
(Stalker). **SKEPTIC:** "no search" is false — F3 global search exists. Verdicts:
cost/lock-in/cross-platform/diff = **WIN**; perf/stability = **SHARED/WORSE**;
search & per-node live preview = **MATCH**.
(derivative.ca user guide; forum.derivative.ca threads on source-control, spaghetti, crashes)

**Max/MSP** — Subscription "renting forever" (perpetual still exists — don't
overclaim); Max-for-Live gated behind Ableton Suite ($749); `.maxpat` **git-diff
is meaningless** (object reorder = whole file changed) → spawned `sortpatcheron
save`, `maxdiff`; **merging corrupts patches** (teams avoid merges). Number boxes
"show only the last value — the patcher lies about dataflow"; cryptic errors don't
name the offending object. C/C++ externals = toolchain/codesigning pain. **No web
or mobile target** (years of requests; RNBO only partial). Single-threaded audio.
Verdicts: cost/diff/cross-platform/custom-node-toolchain = **WIN**; per-port value
inspection + error-to-node = **PLAUSIBLE**; DSP/single-thread audio = **WORSE**.
(cycling74.com forums; Ableton maxdevtools)

**vvvv gamma** — Commercial needs paid Developer + per-machine Device licenses;
**Windows-only** (.NET/Stride; Mac/Linux only via buggy virtualization) — the #1
reason people pick TD instead. Very low-level nodes → "hundreds of nodes" per
patch; data-thin debugging (IOBoxes throttle ~5fps); **git on `.vl` XML can
silently corrupt on merge** (vendor says avoid merges); .NET GC stutter is an
accepted real-time tax. **Strength to respect:** mature driverless Art-Net/DMX/
OSC/MIDI interop — **vvvv LEADS**, LATCH trails in-browser. Verdicts:
cost/cross-platform = **WIN**; per-node preview/debug = **PLAUSIBLE**; GC stutter =
**SHARED**; hardware interop = **WORSE** (lean on Electron/@clasp-to).
(forum.vvvv.org; thegraybook version-control best-practice)

**Houdini** (VFX, not live — transferable *lessons* only): dense VOP networks get
hard to follow and pros **migrate to typing VEX** (evidence that dense inner logic
beats a visual subgraph → LATCH needs a first-class code/expression node);
**recook propagates downstream** (LATCH's dirty-propagation must memoize unchanged
subgraphs); reading a misspelled `@attr` silently *creates* an empty one (warn on
suspicious bindings); `.hip` binary = no git merge. Slider-drag recompiles VOPs
(0.5–1s lag) → **separate "edit structure" from "tweak value" (hot uniform
update)** — directly applies to LATCH shader nodes.
(sidefx.com docs; tokeru.com/cgwiki)

**Notch** — Cost is the #1 acknowledged barrier (£99–£189/mo + separate **paid
Playback License to play content at all** + CodeMeter **dongle** = single point of
failure at showtime); **Windows-only, no macOS "for the foreseeable future"**;
crashes/PC-reboots on heavy scenes; file corruption on interrupted save;
extensibility limited to **one JavaScript node** (can't author true custom node
types). Verdicts: cost/dongle/cross-platform/extensibility = **WIN**; raw heavy-
scene GPU = **WORSE**; show-control pipeline integration = LATCH not like-for-like.
(notch.one pricing/forum; cdm.link review)

---

## B. The nearest rival: Cables.gl (browser WebGL node tool)

The most direct comparison and a fair fight (MIT, "always free," grant-funded).
Pains: **cloud-hosted editor, login required, patches default to private cloud**;
an offline Electron build only arrived 2024 because it "previously required an
internet connection." Performance degrades over time in complex patches (audio/
FFT a known bottleneck); the site can **hard-crash browsers** (Firefox/Linux,
mobile Safari); no WebGPU at the 2024 OSS launch; camera/mic permission friction
traps beginners. **Strengths LATCH must match or beat:** zero-install instant
browser **share/embed with no server**, "anything you make is yours," and **every
node documented with live examples**.
Verdicts: local-first/offline/no-login = **WIN**; in-browser ML + realtime
connectivity = **WIN** (differentiators Cables lacks); embed/docs-with-examples =
**MATCH** (must reach parity).
(cables.gl docs; cdm.link; HN 41162036; GitHub discussions)

---

## C. VJ / installation tools (Resolume, Isadora, Pure Data, Vuo)

- **Resolume** (festival standard): "perpetual" license **stagnates without paid
  yearly renewals** (Arena €219/yr); crashes under live load; **no built-in
  autosave/backup, `.avc` corrupts on crash** (recovery = hand-editing XML); DXV
  codec = interop lock-in; **Wire** (its node generator) is a **separate paid
  add-on** perceived as stagnant/under-documented (**SKEPTIC:** not discontinued).
  Strength: **rock-solid live stability + Ableton Link clock sync** — the bar.
- **Isadora**: $725 buy-to-own (**only 2 years of updates**) — its own users say
  "my graduating students love izzy but none can afford it"; crashes on long runs;
  **no built-in kiosk mode** (installs rely on "Restart on Crash"). → LATCH:
  free + **first-class kiosk/restart-forever** is a concrete, named unmet need.
- **Pure Data**: **Pd-extended (the beginner on-ramp) is officially "dead"**;
  ecosystem fragmented into rival stalling forks (Purr Data, Pd-l2ork, PlugData);
  weaker docs than Max; flat namespace → reuse name-collisions at scale. Strength:
  genuine openness + clean canvas + supportive community. → LATCH: **batteries-
  included by default, backed by a maintained open core** so the default distro
  can't be orphaned; scoped groups/namespacing.
- **Vuo** (built as a QC successor): **macOS-only**; the pro/live features VJs need
  (NDI, Art-Net, FFGL, projection warping) are **paywalled in Pro $149**; CE has
  revenue-based commercial restrictions; recurring editor crashes; longevity tied
  to one small vendor — *echoing the QC fate it was built to replace*.
Verdicts across C: cost/renewals/kiosk/autosave/cross-platform = **WIN**; live
stability + clock sync = **MATCH** (must earn); hardware interop = **WORSE**.

---

## D. Discontinuation case studies — the trust wound (LATCH's strongest narrative)

These are the reference traumas creative coders keep citing. The grievance is
always the same two things: **a killed proprietary file format** and **single-
vendor control of the roadmap**.

- **Quartz Composer** — free first-party node tool, killed by attrition (deprecated
  2019, doesn't run on Apple Silicon; OpenGL→Metal). Enduring grief: *"I miss it,
  and would be willing to pay for it… so much more immediate and fun to explore
  than… code."* The death **cascaded downstream** — VDMX phased out QC support
  because the OpenGL→Metal bridge caused "the majority of recent crash logs,"
  breaking artists' show files. The escape route (Origami) was **another
  proprietary vendor** (now under `facebookarchive`).
- **Meta Spark / Spark AR** — shut down 14 Jan 2025 with ~4.5 months' notice;
  **400k–600k creators**. Critically: **published work itself disappears** — third-
  party effects "will no longer be available," while "AR Effects owned by Meta will
  continue." Experienced as lost livelihood/betrayal. Reason: a roadmap pivot to
  glasses. The lesson creators reached: *never depend on a platform you don't
  control; keep project files locally; build a portfolio you host.*
- **Lens Studio** (where Spark refugees fled) — **no general export; output runs
  only inside Snapchat**; hard opaque caps (8MB lens, 10MB ML model); "throw out
  everything you know"; mandatory account + gatekeeper approval. *Another walled
  garden.*
- **Adobe Flash** (the deep precedent) — killing the open-ish `.swf` alongside the
  player made "the creative output of tens of thousands of people inaccessible";
  server-tied work is *permanently* unrecoverable.

**What creators now explicitly demand** (verified sentiment, not assumed):
1. **Open, documented, human-readable file format** they can open forever + a
   commitment to never orphan old files.
2. **Local files / data they hold** (the "local-first" principle — offline,
   ownership, preservation).
3. **Exportable / self-hostable output** so published work survives the platform.
4. **Genuinely open source** (not "fair-code") so the tool survives the company and
   can be forked.
5. **Cross-platform, web+desktop** so it isn't tied to one OS or graphics API.
6. **The "QC sweet spot":** easy to pick up *and* powerful — "TD and Max are too
   heavy to just pick up and play with; QC was the right balance."

→ **The single message LATCH is positioned to own:** *the tool, the format, and
your work all outlive any single company or browser vendor.* This maps 1:1 to what
QC/Flash/Spark creators actually lost. (Verdict: **WIN** — but it's a *promise we
must keep*: open documented format, export, self-host, real OSS license.)

---

## E. Open-source trust & the maker baseline (n8n, Node-RED)

- **n8n** — **not OSI open source**; source-available under the restrictive
  "Sustainable Use License." The founder admitted marketing it "open source" while
  using a non-open license; the community called it **"gaslighting,"** and a live
  migration market to truly-open tools (Activepieces/MIT, Windmill/AGPL) exists.
  **SKEPTIC:** it *can* be self-hosted free for internal use — the precise critique
  is licensing, not runnability. → LATCH: **honest license labeling** is a quiet
  trust advantage; there's demonstrated demand for the genuinely-open position.
- **Node-RED** — LATCH's home-turf baseline: loved for being **open, self-hostable,
  Pi-friendly**, with self-documenting flows and 5,000+ community nodes. Pains:
  editor/runtime **degrades at scale** (~3,000 nodes → CPU/memory limits; subflows
  **duplicate all internal nodes per instance** — a macro trap; cf. LATCH's own
  subflow rebuild); unexpected shutdown can **corrupt persisted context**; **touch/
  tablet node editing is broken** (low-vision user: can't delete a wire without
  deleting the node; rescue gesture works on iOS Safari but not Chrome).
  → LATCH: match open+self-hostable+cheap-hardware, then beat on UX; **cheap reuse
  that doesn't duplicate runtime cost**; **first-class cross-browser touch wiring**.

---

## F. Cross-tool Top pains (merged & ranked by breadth × severity × cleanliness of LATCH win)

1. **Binary/opaque project formats can't be diffed/merged** — *all five* pro tools
   + Resolume/Notch; spawned third-party tools everywhere. → **WIN** *iff* LATCH
   ships deterministic, stable-ordered, **layout-separated-from-logic** JSON.
2. **Cost / paywalled essentials / renewal tax / dongles** — near-universal. →
   **WIN** (free/open).
3. **Platform/format death takes your work with it** (QC, Spark, Flash, Pd-extended)
   + single-vendor "will it exist in 5 years?" → **WIN** (open + local + export).
4. **No web / mobile / limited cross-platform** (Max no web; vvvv+Notch Windows-only;
   TD no Linux/web/mobile) → **WIN** (web+Electron is the core structural edge).
5. **Cloud-by-default vs local ownership** (Cables login/cloud; ProtoPie paywalled
   local save; Lens/Spark cloud output) → **WIN** (local-first, no account).
6. **Crashes / no crash-safety on long unattended runs** + corrupt-on-save → **WIN
   IF EXECUTED** (atomic writes + IndexedDB autosave + recoverable JSON).
7. **No kiosk / installation-deploy story** (Isadora) → **WIN** (first-class kiosk/
   restart-forever/embed) — an explicitly named unmet need.
8. **Debugging = "print/dump everywhere"; values-on-wires hidden** → **PLAUSIBLE**
   (per-port value history/preview + structured error objects).
9. **Errors don't point to the offending node / are cryptic** → **PLAUSIBLE**
   (deep-link errors to the exact node).
10. **Spaghetti / graph organization at scale** → **MATCH/PLAUSIBLE** (reroute,
    grouping, minimap, search, clean view/logic separation — table stakes).
11. **Steep curve / blank-canvas paralysis** → **PLAUSIBLE/partly inherent**
    (templates, drag-to-empty suggestions, live preview, in-context help).
12. **Touch/mobile node editing broken everywhere** → **PLAUSIBLE undefended
    differentiator** (pointer-event multi-touch + large hit areas from the start).
13. **Custom-node authoring needs native toolchains/SDKs** → **WIN** (JS/TS in-repo,
    no compile, no codesigning — see `02-developer-experience.md`).
14. **Node-vs-code: dense inner logic is cleaner as text** → **ACT ON IT** (first-
    class code/expression node for inner logic, nodes for dataflow).
15. **Node tool as a second-class bolt-on** (Resolume Wire) → **WIN** (the graph IS
    the core product).
16. **Real-time GPU/frame budget, GC stutter, single-thread DSP, hardware interop**
    → **SHARED/WORSE** — *do not market against these.*

---

## G. What competitors do WELL — the bar LATCH must match (don't regress)

- **TouchDesigner:** live per-node introspection, no compile ("every node has a live
  data viewer"; "abolishes the separation of authoring and performing"). **The
  single highest bar — table stakes.** Plus global F3 search and a sharing culture.
- **Resolume:** rock-solid live stability + Ableton-Link clock/tempo sync.
- **Cables.gl:** zero-install instant browser share/**embed with no server**, "your
  work is yours," every node documented with **live examples**.
- **Origami Studio:** free with **zero feature limits**, fast/delightful onboarding,
  output legible to non-technical viewers. (SKEPTIC: actively developed — pitch
  *structural risk*, not death.)
- **Node-RED:** very low learning curve, **self-documenting flows**, huge community
  node library, broad device/API reach.
- **vvvv:** mature **driverless hardware/protocol interop** (Art-Net/DMX/OSC/MIDI).
- **Pure Data:** genuine openness, clean uncluttered canvas, help-each-other
  community.
- Reusable **component libraries with clean propagation** (TD COMPs, Houdini HDAs,
  Max abstractions) — avoid Houdini's "reset to inherit" trap.

---

## H. Honesty / confidence notes

- Highest-confidence, fetched-and-verified: Apple Dev Forums, Meta/Spark blog +
  TechCrunch, Wikipedia (QC), VDMX, Cables docs/CDM/HN, n8n license + founder HN
  posts, Node-RED forum, Vuo/Isadora/Pd forums, Notch pricing/forum, derivative.ca.
- **Snippet-only (verify before public quotation):** most Resolume *forum* quotes,
  some Lens Studio community posts.
- **Skeptic corrections to keep:** "TD has no search" is false; Resolume Wire and
  Origami are NOT discontinued (pitch *risk*, not death); n8n *can* self-host;
  Max subscription is optional; "Blueprints are slow" ≈2× native (usually moot).
- **Do not overclaim** the SHARED/WORSE row (#16). LATCH's narrative is **access +
  openness + collaboration + durability**, not raw performance.
