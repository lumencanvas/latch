import type { FlowSnippet } from './flow-snippets'

/**
 * The second shelf of example flows: computer vision (YOLO, OpenCV, captioning), shader chains,
 * a Frutiger Aero piece and "Inventory of a Room", the flow that uses most of what LATCH has.
 * Same contract as flow-snippets.ts: every port, type and control value is pinned by
 * tests/unit/data/starter-flows.test.ts. Built with two tiny helpers so long flows stay readable.
 */

type SnippetNode = FlowSnippet['nodes'][number]
type SnippetEdge = FlowSnippet['edges'][number]

const node = (id: string, type: string, x: number, y: number, data: Record<string, unknown> = {}): SnippetNode =>
  ({ id, type, position: { x, y }, data })

/** Wires as `'from.port > to.port'` strings, numbered in order. */
function wires(...specs: string[]): SnippetEdge[] {
  return specs.map((spec, i) => {
    const [from, to] = spec.split('>').map((s) => s.trim())
    const [source, sourceHandle] = from.split('.')
    const [target, targetHandle] = to.split('.')
    return { id: `se-${i + 1}`, source, sourceHandle, target, targetHandle }
  })
}

/** Ports a custom-GLSL Shader node exposes for its `uniform float u_*` declarations. */
const floatPorts = (...names: Array<[string, string]>) => names.map(([id, label]) => ({ id, type: 'number', label }))

// ── GLSL used by the custom Shader nodes below ───────────────────────────────

const CHROME_GLSL = `// Liquid chrome: reads iChannel0 as a height map and reflects a studio environment off it.
uniform float u_tint;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 px = 3.0 / iResolution.xy;
  float h  = texture(iChannel0, uv).r;
  float hx = texture(iChannel0, uv + vec2(px.x, 0.0)).r;
  float hy = texture(iChannel0, uv + vec2(0.0, px.y)).r;
  vec3 n = normalize(vec3((h - hx) * 4.0, (h - hy) * 4.0, 0.12));
  vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
  float y = r.y;
  vec3 env = mix(vec3(0.06, 0.07, 0.1), vec3(0.85, 0.9, 1.0), smoothstep(-0.2, 0.05, y));
  env = mix(env, vec3(0.25, 0.35, 0.55), smoothstep(0.1, 0.9, y));
  env += vec3(1.0) * exp(-pow((y - 0.02) / 0.035, 2.0)) * 1.2;
  env += vec3(1.0, 0.95, 0.9) * pow(max(0.0, dot(r, normalize(vec3(0.5, 0.6, 0.6)))), 40.0) * 2.0;
  vec3 iri = 0.5 + 0.5 * cos(6.2831 * (h * 2.0 + vec3(0.0, 0.33, 0.67)) + iTime * 0.3);
  fragColor = vec4(mix(env, env * iri * 1.4, u_tint), 1.0);
}`

const AERO_SKY_GLSL = `// Frutiger Aero sky: azure gradient, drifting clouds, sun with rays and lens flare, aurora
// ribbons that swell with the music (u_pulse), a glossy hill over a mirror lake, foreground bokeh.
uniform float u_glow;
uniform float u_pulse;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p *= 2.0; a *= 0.5; }
  return v;
}

vec3 skyAt(vec2 uv, vec2 p, float ar) {
  vec3 sky = mix(vec3(0.72, 0.93, 1.0), vec3(0.02, 0.36, 0.86), pow(uv.y, 0.75));
  float c = fbm(vec2(p.x * 1.4 + iTime * 0.025, p.y * 2.6));
  float cl = smoothstep(0.5, 0.82, c) * smoothstep(0.3, 0.95, uv.y);
  sky = mix(sky, vec3(1.0), cl * 0.85);
  sky += vec3(0.25, 0.5, 0.7) * cl * (1.0 - smoothstep(0.62, 0.85, c)) * 0.3;
  vec2 sun = vec2(0.8 * ar, 0.84);
  float d = length(p - sun);
  float glow = clamp(u_glow, 0.0, 2.0);
  sky += vec3(1.0, 0.97, 0.88) * (0.05 / (d + 0.02)) * 0.4 * glow;
  float ang = atan(p.y - sun.y, p.x - sun.x);
  sky += pow(max(0.0, sin(ang * 14.0 + iTime * 0.15)), 10.0) * smoothstep(1.0, 0.0, d) * 0.14 * glow;
  float pulse = 0.9 + 0.9 * clamp(u_pulse, 0.0, 1.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float y = 0.5 + 0.07 * fi + 0.06 * sin(p.x * (1.3 + 0.2 * fi) + iTime * (0.22 + 0.07 * fi) + fi * 2.0);
    float w = 0.01 + 0.008 * fi;
    float band = exp(-pow((uv.y - y) / w, 2.0));
    float sheen = 0.6 + 0.4 * sin(p.x * 6.0 - iTime * 0.8 + fi);
    sky += mix(vec3(0.35, 1.0, 0.65), vec3(0.45, 0.85, 1.0), fi / 3.0) * band * sheen * pulse * 0.6;
  }
  return sky;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float ar = iResolution.x / iResolution.y;
  vec2 p = vec2(uv.x * ar, uv.y);

  float horizon = 0.2;
  vec3 col;
  if (uv.y > horizon) {
    col = skyAt(uv, p, ar);
  } else {
    // Mirror lake: the sky reflected, rippled, darkened toward the viewer.
    float depth = (horizon - uv.y) / horizon;
    vec2 r = vec2(uv.x + 0.004 * sin(uv.y * 160.0 + iTime * 2.0) * depth, 2.0 * horizon - uv.y);
    col = skyAt(r, vec2(r.x * ar, r.y), ar) * mix(0.92, 0.55, depth) * vec3(0.85, 0.95, 1.0);
    float glint = vnoise(vec2(p.x * 40.0 + iTime * 0.6, uv.y * 220.0 / (0.2 + depth)));
    col += vec3(1.0) * smoothstep(0.82, 0.98, glint) * (1.0 - depth) * 0.35;
  }

  // Glossy hill with a wet specular sheen along its crest.
  float hill = 0.3 + 0.09 * sin(p.x * 1.1 + 0.4) + 0.025 * sin(p.x * 3.3 + 1.0);
  float hillLeft = smoothstep(0.95 * ar, 0.2 * ar, p.x);
  hill = mix(horizon - 0.01, hill, hillLeft);
  float inHill = smoothstep(hill + 0.003, hill - 0.003, uv.y) * step(horizon - 0.02, uv.y);
  vec3 grass = mix(vec3(0.1, 0.48, 0.06), vec3(0.6, 0.95, 0.22), smoothstep(horizon, hill, uv.y));
  grass += vec3(0.95, 1.0, 0.75) * exp(-pow((uv.y - (hill - 0.025)) / 0.018, 2.0)) * 0.6;
  grass *= 0.92 + 0.08 * vnoise(p * 90.0);
  col = mix(col, grass, inHill);

  // Lens flare: ghosts on the line from the sun through the centre.
  vec2 sun = vec2(0.8, 0.84);
  vec2 axis = vec2(0.5) - sun;
  for (int i = 1; i < 5; i++) {
    float fi = float(i);
    vec2 g = sun + axis * (fi * 0.55);
    float gd = length((uv - g) * vec2(ar, 1.0));
    float rad = 0.02 + 0.025 * fi;
    float ring = smoothstep(rad, rad * 0.8, gd) * (0.5 + 0.5 * smoothstep(rad * 0.6, rad, gd));
    col += mix(vec3(0.5, 1.0, 0.8), vec3(0.6, 0.7, 1.0), fi / 4.0) * ring * 0.07 * clamp(u_glow, 0.0, 2.0);
  }

  // Foreground bokeh drifting upward.
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    vec2 c = vec2(fract(hash(vec2(fi, 1.0)) + 0.01 * sin(iTime * 0.3 + fi)), fract(hash(vec2(fi, 7.0)) + iTime * (0.01 + 0.01 * hash(vec2(fi, 3.0)))));
    float rad = 0.03 + 0.05 * hash(vec2(fi, 9.0));
    float bd = length((uv - c) * vec2(ar, 1.0));
    float disc = smoothstep(rad, rad * 0.9, bd);
    col += vec3(0.8, 1.0, 0.95) * disc * (0.05 + 0.07 * smoothstep(rad * 0.7, rad, bd));
  }

  col *= 1.0 - 0.22 * pow(length(uv - 0.5) * 1.2, 2.0);
  fragColor = vec4(col, 1.0);
}`

const AERO_BUBBLE_GLSL = `// Soap bubbles: the blurred 3D bubble render (iChannel1) is read as a height field, so each
// blob becomes a dome that refracts the sky (iChannel0), with a thin-film rainbow rim, a window
// highlight and a dark edge line.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 px = 1.0 / iResolution.xy;
  float m = texture(iChannel1, uv).r;
  float gx = texture(iChannel1, uv + vec2(px.x * 2.0, 0.0)).r - texture(iChannel1, uv - vec2(px.x * 2.0, 0.0)).r;
  float gy = texture(iChannel1, uv + vec2(0.0, px.y * 2.0)).r - texture(iChannel1, uv - vec2(0.0, px.y * 2.0)).r;
  float inside = smoothstep(0.04, 0.2, m);
  vec3 n = normalize(vec3(-gx * 9.0, -gy * 9.0, 0.3 + m));
  vec3 bg = texture(iChannel0, uv - n.xy * 0.05 * inside).rgb;
  vec3 sky = texture(iChannel0, uv).rgb;
  float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 1.6);
  vec3 film = 0.5 + 0.5 * cos(6.2831 * (fres * 1.6 + m * 0.6 + iTime * 0.07) + vec3(0.0, 2.1, 4.2));
  vec3 col = bg * 1.04 + film * fres * 1.0 + vec3(0.9, 1.0, 1.0) * fres * 0.12;
  float spec = pow(max(dot(n, normalize(vec3(-0.45, 0.6, 0.65))), 0.0), 60.0);
  float spec2 = pow(max(dot(n, normalize(vec3(0.5, -0.5, 0.7))), 0.0), 25.0) * 0.35;
  col += vec3(1.0) * (spec * 1.6 + spec2);
  float edge = smoothstep(0.04, 0.09, m) * (1.0 - smoothstep(0.09, 0.2, m));
  col = mix(col, col * 0.75 + film * 0.25, edge * 0.6);
  fragColor = vec4(mix(sky, col, inside), 1.0);
}`

const CMY_HALFTONE_GLSL = `// Pop-art print: three rotated dot screens (cyan, magenta, yellow) on warm paper.
uniform float u_dot;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec3 src = texture(iChannel0, uv).rgb;
  vec3 col = vec3(1.0, 0.97, 0.9);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float a = 0.26 + fi * 0.52;
    vec2 cell = mat2(cos(a), -sin(a), sin(a), cos(a)) * fragCoord / max(u_dot, 2.0);
    vec2 f = fract(cell) - 0.5;
    float ink = i == 0 ? 1.0 - src.r : (i == 1 ? 1.0 - src.g : 1.0 - src.b);
    float r = sqrt(clamp(ink, 0.0, 1.0)) * 0.55;
    float d = smoothstep(r, r - 0.08, length(f));
    vec3 inkCol = i == 0 ? vec3(0.0, 0.68, 0.94) : (i == 1 ? vec3(0.93, 0.0, 0.55) : vec3(1.0, 0.93, 0.0));
    col *= mix(vec3(1.0), inkCol, d);
  }
  fragColor = vec4(col, 1.0);
}`

const POINTILLIST_GLSL = `// Inventory of a Room: the camera image redrawn as a field of lit points on near-black.
// u_bass swells the points with the music, u_count makes the grid finer as more is seen.
uniform float u_bass;
uniform float u_count;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float cells = 70.0 + min(u_count, 10.0) * 6.0;
  vec2 g = vec2(cells, cells * iResolution.y / iResolution.x);
  vec2 id = floor(uv * g);
  vec2 f = fract(uv * g) - 0.5;
  vec3 cam = texture(iChannel0, (id + 0.5) / g).rgb;
  float l = dot(cam, vec3(0.299, 0.587, 0.114));
  float r = 0.06 + 0.4 * l * (0.85 + u_bass * 0.8);
  float spot = smoothstep(r, r - 0.08, length(f));
  vec3 ink = mix(vec3(0.05, 0.06, 0.12), vec3(1.0, 0.82, 0.55), l);
  ink = mix(ink, vec3(0.78, 0.9, 1.0), pow(l, 4.0));
  float drift = 0.5 + 0.5 * sin(uv.y * 3.0 - iTime * 0.3);
  vec3 bg = vec3(0.01, 0.012, 0.02) + vec3(0.02, 0.015, 0.03) * drift;
  fragColor = vec4(mix(bg, ink, spot), 1.0);
}`

const CONSTELLATION_GLSL = `// Inventory of a Room, the memory: every thing named becomes a star, joined in the order it
// was seen, so the room's inventory draws a constellation over the picture. A new name sends a
// ripple out of its star that bends the image; the bass makes the stars breathe.
uniform float u_bass;
uniform float u_count;
uniform float u_new;

float h(float n) { return fract(sin(n * 127.1) * 43758.5453); }
vec2 starPos(float i) {
  vec2 p = vec2(h(i), h(i + 31.7)) * vec2(1.5, 0.75) - vec2(0.75, 0.3);
  return p + 0.025 * vec2(sin(iTime * 0.11 + i * 1.7), cos(iTime * 0.07 + i * 2.3));
}
float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float n = min(u_count, 64.0);
  vec2 newest = n > 0.0 ? starPos(n - 1.0) : vec2(0.0);

  // The ripple from the newest star refracts the picture, with a chromatic edge.
  float d0 = length(p - newest);
  float wave = exp(-pow((d0 - (1.0 - u_new) * 1.1) * 14.0, 2.0)) * u_new;
  vec2 warp = (p - newest) / max(d0, 1e-3) * wave * 0.025;
  vec3 col = vec3(texture(iChannel0, uv - warp * 1.6).r, texture(iChannel0, uv - warp).g, texture(iChannel0, uv - warp * 0.5).b);

  // Aurora over the top of the room, swelling with the music.
  float band = sin(p.x * 2.6 + iTime * 0.15 + sin(p.y * 7.0 - iTime * 0.25) * 0.8);
  float au = smoothstep(0.05, 0.5, p.y) * (0.5 + 0.5 * band) * (0.05 + 0.12 * u_bass);
  col += mix(vec3(0.25, 0.5, 0.95), vec3(0.95, 0.55, 0.75), 0.5 + 0.5 * sin(p.x + iTime * 0.05)) * au;

  vec3 stars = vec3(0.0);
  for (int k = 0; k < 64; k++) {
    float i = float(k);
    if (i >= n) break;
    vec2 s = starPos(i);
    vec3 tint = mix(vec3(1.0, 0.8, 0.55), vec3(0.62, 0.85, 1.0), h(i + 9.0));
    float tw = 0.65 + 0.35 * sin(iTime * (0.8 + 2.0 * h(i + 3.0)) + i);
    float boost = i == n - 1.0 ? 1.0 + 3.0 * u_new : 1.0;
    float r = length(p - s);
    stars += tint * (0.00012 / (r * r + 0.0004) + smoothstep(0.005, 0.0, r)) * tw * (0.7 + 0.8 * u_bass) * boost;
    if (k > 0) stars += tint * 0.18 * smoothstep(0.0025, 0.0, seg(p, starPos(i - 1.0), s)) * tw;
  }
  stars += vec3(1.0, 0.9, 0.75) * wave * 0.35;
  col = col + stars * (1.0 - 0.4 * col);
  col *= 1.0 - 0.35 * dot(p, p); // vignette
  fragColor = vec4(col, 1.0);
}`

const SEED_BAND_GLSL = `// Seed Band: a synthwave horizon that plays along. Kick pumps the sun and grid, snare flashes
// the scanlines, the lead note sets the hue and the section's intensity opens the sky.
uniform float u_kick;
uniform float u_snare;
uniform float u_hue;
uniform float u_energy;

vec3 pal(float t) { return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67))); }

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float horizon = -0.05;
  vec3 tint = pal(u_hue * 0.6 + 0.55);
  // Sky: deep violet to the tint, brighter as the music builds.
  vec3 col = mix(vec3(0.03, 0.01, 0.08), tint * (0.35 + 0.5 * u_energy), smoothstep(0.6, horizon, uv.y));
  // Sun with slices; the kick swells it.
  vec2 sp = uv - vec2(0.0, 0.16);
  float r = 0.24 + 0.03 * u_kick;
  float sun = smoothstep(r, r - 0.006, length(sp));
  float slices = step(0.5, fract((sp.y + iTime * 0.03) * 22.0)) + step(0.06, sp.y);
  vec3 sunCol = mix(vec3(1.0, 0.85, 0.3), vec3(1.0, 0.2, 0.55), smoothstep(0.2, -0.2, sp.y));
  col = mix(col, sunCol, sun * clamp(slices, 0.0, 1.0));
  col += sunCol * 0.25 * exp(-6.0 * max(0.0, length(sp) - r)) * (0.6 + u_kick);
  // Grid floor rushing toward the viewer; the kick lights the lines.
  if (uv.y < horizon) {
    float z = 0.25 / (horizon - uv.y);
    vec2 g = vec2(uv.x * z, z + iTime * (0.8 + u_energy));
    vec2 l = abs(fract(g) - 0.5) / fwidth(g);
    float line = 1.0 - min(min(l.x, l.y), 1.0);
    col = mix(vec3(0.02, 0.0, 0.05), tint * (0.8 + 1.5 * u_kick), line * smoothstep(12.0, 1.0, z));
  }
  // Snare: a quick scanline flash.
  col += vec3(0.9, 0.7, 1.0) * u_snare * 0.25 * (0.5 + 0.5 * sin(fragCoord.y * 1.5));
  fragColor = vec4(col, 1.0);
}`

const YOLO_ONNX = 'https://huggingface.co/onnx-community/yolov10s/resolve/main/onnx/model.onnx'

export const gallerySnippets: FlowSnippet[] = [
  {
    id: 'seed-band',
    name: 'Seed Band',
    description: 'Type a seed and a whole song plays: the Bellows Workstation writes chords, melodies and grooves from it, and a synthwave horizon moves with the kick, the snare and the melody',
    category: 'audio',
    persona: 'Music & sound',
    relatedNodes: ['bellows-workstation', 'audio-output', 'envelope-visual', 'map-range', 'slider', 'shader', 'main-output'],
    nodes: [
      node('sb-1', 'bellows-workstation', 0, 0, { seed: 'night drive', style: 'synthwave' }),
      node('sb-2', 'audio-output', 380, -160),
      node('sb-3', 'slider', -320, 120, { value: 0.5 }),
      node('sb-4', 'map-range', -320, 260, { inMin: 0, inMax: 1, outMin: -1, outMax: 1 }),
      node('sb-5', 'envelope-visual', 380, 0, { attack: 0.005, decay: 0.28, sustain: 0, release: 0.1 }),
      node('sb-6', 'envelope-visual', 380, 160, { attack: 0.005, decay: 0.15, sustain: 0, release: 0.05 }),
      node('sb-7', 'map-range', 380, 320, { inMin: 48, inMax: 96, outMin: 0, outMax: 1 }),
      node('sb-8', 'smooth', 380, 480, { factor: 0.03 }),
      node('sb-9', 'shader', 720, 0, {
        preset: 'custom', code: SEED_BAND_GLSL,
        _dynamicInputs: floatPorts(['u_kick', 'Kick'], ['u_snare', 'Snare'], ['u_hue', 'Melody hue'], ['u_energy', 'Intensity']),
      }),
      node('sb-10', 'main-output', 1060, 0),
    ],
    edges: wires(
      'sb-1.audio > sb-2.audio',
      'sb-3.value > sb-4.value',
      'sb-4.result > sb-1.energy',
      'sb-1.kick > sb-5.trigger',
      'sb-1.snare > sb-6.trigger',
      'sb-1.lead > sb-7.value',
      'sb-1.intensity > sb-8.value',
      'sb-5.value > sb-9.u_kick',
      'sb-6.value > sb-9.u_snare',
      'sb-7.result > sb-9.u_hue',
      'sb-8.result > sb-9.u_energy',
      'sb-9.texture > sb-10.texture',
    ),
  },
  // ── Showcase ─────────────────────────────────────────────────────────────────
  {
    id: 'inventory-of-a-room',
    name: 'Inventory of a Room',
    description: 'A gallery piece. The machine watches the room, names each new thing it sees and sings the name as a hymn, while you are redrawn in points of light. Everything it has named becomes a star in a growing constellation, and each new name ripples through the picture',
    category: 'ai',
    persona: 'Showcase',
    requires: ['camera', 'model'],
    relatedNodes: ['webcam', 'object-detection-yolo', 'mediapipe-pose', 'shader', 'tracking-overlay', 'text-overlay', 'envelope-visual', 'blur', 'progression', 'poly-voice', 'melody-walk', 'bellows-singer', 'bellows-reverb', 'audio-analyzer', 'blend'],
    nodes: [
      // seeing
      node('sn-1', 'webcam', 0, 0),
      node('sn-2', 'object-detection-yolo', 320, 0, { modelUrl: YOLO_ONNX, threshold: 0.4, interval: 20, showBoxes: false, showLabels: false }),
      node('sn-3', 'mediapipe-pose', 320, 260, { showOverlay: false }),
      node('sn-4', 'gate', 640, 0, { whenClosed: 'hold' }),
      node('sn-5', 'debounce', 960, 0, { delay: 1500 }),
      node('sn-6', 'changed', 1280, 0),
      node('sn-7', 'monitor', 1600, 0, { label: 'Something new' }),
      node('sn-8', 'string-template', 1600, 200, { template: 'the {a}' }),
      node('sn-9', 'counter', 1920, 0, { min: 0, max: 9999 }),
      // the picture
      node('sn-10', 'shader', 640, 620, {
        preset: 'custom',
        code: POINTILLIST_GLSL,
        _dynamicInputs: floatPorts(['u_bass', 'Bass'], ['u_count', 'Things seen']),
      }),
      node('sn-11', 'tracking-overlay', 960, 620, { style: 'dots', color: '#ffe7c2', accent: '#9fd8ff', showBox: false, showCoords: true, web: true, dim: 0 }),
      node('sn-12', 'text-overlay', 1280, 620, {
        text: '{value}',
        subtitle: 'item {value2} of an inventory that never ends',
        position: 'bottom-left',
        size: 64,
        font: 'serif',
        color: '#fff4e2',
        glow: '#ffcf8a',
        glowAmount: 0.35,
      }),
      node('sn-13', 'envelope-visual', 1280, 860, { attack: 0.01, decay: 2, sustain: 0, release: 0.5 }),
      node('sn-14', 'shader', 1600, 620, {
        preset: 'custom',
        code: CONSTELLATION_GLSL,
        _dynamicInputs: floatPorts(['u_bass', 'Bass'], ['u_count', 'Things named'], ['u_new', 'Something new']),
      }),
      node('sn-15', 'blur', 1600, 860, { radius: 14, passes: 2 }),
      node('sn-22', 'blend', 1920, 760, { mode: 'screen', mix: 0.55 }),
      node('sn-23', 'image-fx-rgb-shift', 2240, 760, { u_amount: 0 }),
      node('sn-24', 'image-fx-scanlines', 2560, 760, { u_count: 480, u_intensity: 0.12, u_speed: 0.3 }),
      node('sn-25', 'main-output', 2880, 760),
      // the music
      node('sn-26', 'metronome', 0, 1900, { bpm: 54, subdivision: '1/2' }),
      node('sn-27', 'progression', 320, 1800, { root: 'D', scaleName: 'dorian', bars: 8, octave: 3 }),
      node('sn-28', 'poly-voice', 640, 1800, { preset: 'choir-aah', gain: 0.28, m_attack: 0.7, m_release: 0.7 }),
      node('sn-29', 'bellows-reverb', 960, 1800, { effect: 'fdn', fx_fdn_mix: 0.5, fx_fdn_decay: 8, fx_fdn_size: 2 }),
      node('sn-30', 'audio-output', 1280, 1800),
      node('sn-31', 'melody-walk', 320, 2100, { root: 'D', scaleName: 'dorian', octaveRange: 2, leapChance: 0.15, velocity: 70, seed: 11 }),
      node('sn-32', 'bellows-instrument', 640, 2100, { preset: 'celesta', gain: 0.35, m_release: 0.6 }),
      node('sn-33', 'bellows-delay', 960, 2100, { effect: 'tapeDelay', fx_tapeDelay_time: 0.55, fx_tapeDelay_feedback: 0.5, fx_tapeDelay_mix: 0.35 }),
      node('sn-34', 'audio-output', 1280, 2100),
      node('sn-35', 'bellows-singer', 1920, 260, { voice: 'contralto', shape: 'operatic', melodyMode: 'improvise', improvKey: 'D', improvScale: 'dorian', improvOctave: 4, noteLength: 2, bpm: 60, gain: 0.7 }),
      node('sn-36', 'bellows-reverb', 2240, 260, { effect: 'plate', fx_plate_decay: 0.8, fx_plate_mix: 0.45 }),
      node('sn-37', 'audio-output', 2560, 260),
      node('sn-38', 'audio-analyzer', 1280, 1500, { smoothing: 0.85 }),
      node('sn-39', 'remap', 1600, 1500, { inMin: 0, inMax: 0.4, outMin: 0, outMax: 1, clamp: true }),
      node('sn-40', 'remap', 1600, 1300, { inMin: 0, inMax: 0.4, outMin: 0, outMax: 0.01, clamp: true }),
    ],
    edges: wires(
      'sn-1.texture > sn-2.source',
      'sn-1.video > sn-3.video',
      'sn-2.topLabel > sn-4.value',
      'sn-2.count > sn-4.gate',
      'sn-4.result > sn-5.value',
      'sn-5.result > sn-6.value',
      'sn-6.changed > sn-7.value',
      'sn-6.result > sn-8.a',
      'sn-7.value > sn-9.increment',
      'sn-1.texture > sn-10.iChannel0',
      'sn-2.count > sn-10.u_count',
      'sn-10.texture > sn-11.source',
      'sn-3.landmarks > sn-11.landmarks',
      'sn-11.texture > sn-12.source',
      'sn-5.result > sn-12.value',
      'sn-9.count > sn-12.value2',
      'sn-7.value > sn-13.trigger',
      'sn-12.texture > sn-14.iChannel0',
      'sn-9.count > sn-14.u_count',
      'sn-13.value > sn-14.u_new',
      'sn-39.result > sn-14.u_bass',
      'sn-14.texture > sn-15.texture',
      'sn-14.texture > sn-22.a',
      'sn-15.texture > sn-22.b',
      'sn-22.texture > sn-23.source',
      'sn-23.texture > sn-24.source',
      'sn-24.texture > sn-25.texture',
      'sn-26.bar > sn-27.clock',
      'sn-27.notes > sn-28.notes',
      'sn-27.trigger > sn-28.trigger',
      'sn-28.audio > sn-29.audio',
      'sn-29.audio > sn-30.audio',
      'sn-26.beat > sn-31.clock',
      'sn-31.note > sn-32.note',
      'sn-31.velocity > sn-32.velocity',
      'sn-31.trigger > sn-32.trigger',
      'sn-32.audio > sn-33.audio',
      'sn-33.audio > sn-34.audio',
      'sn-8.result > sn-35.lyrics',
      'sn-7.value > sn-35.trigger',
      'sn-35.audio > sn-36.audio',
      'sn-36.audio > sn-37.audio',
      'sn-29.audio > sn-38.audio',
      'sn-38.bass > sn-39.value',
      'sn-39.result > sn-10.u_bass',
      'sn-38.bass > sn-40.value',
      'sn-40.result > sn-23.u_amount',
    ),
  },
  {
    id: 'frutiger-aero',
    name: 'Frutiger Aero',
    description: 'Soap bubbles rise over an azure sky and a mirror lake, refracting the sky with rainbow film, while aurora ribbons swell with a lydian music box. Each bubble that reaches the top plays a note',
    category: 'visual',
    persona: 'Showcase',
    relatedNodes: ['shader', 'lfo', 'point-stream-3d', 'instances-3d', 'render-3d', 'blur', 'blend', 'audio-analyzer', 'text-overlay', 'progression', 'poly-voice', 'arpeggiator', 'bellows-instrument', 'scale-quantize'],
    nodes: [
      // sky
      node('sn-1', 'shader', 0, 0, { preset: 'custom', code: AERO_SKY_GLSL, _dynamicInputs: floatPorts(['u_glow', 'Sun glow'], ['u_pulse', 'Aurora pulse']) }),
      node('sn-2', 'lfo', -320, 0, { frequency: 0.07, waveform: 'sine' }),
      node('sn-3', 'map-range', -320, 260, { inMin: -1, inMax: 1, outMin: 0.75, outMax: 1.3 }),
      // bubbles: white spheres rendered as a mask, blurred into domes, then lensed over the sky
      node('sn-4', 'point-stream-3d', 0, 560, { direction: 'up', count: 22, speed: 0.8, spreadX: 16, spreadY: 6, length: 16, end: 7, sizeMin: 0.6, sizeMax: 1.8, seed: 3 }),
      node('sn-6', 'instances-3d', 320, 560, { shape: 'sphere', size: 1, valueMode: 'none', color: '#ffffff', color2: '#ffffff', emissive: 2 }),
      node('sn-10', 'scene-3d', 640, 560, { backgroundColor: '#000000' }),
      node('sn-11', 'camera-3d', 640, 840, { posX: 0, posY: 0, posZ: 11, targetX: 0, targetY: 0, targetZ: 0 }),
      node('sn-12', 'render-3d', 960, 560, { width: 1280, height: 720 }),
      node('sn-14', 'blur', 1280, 560, { radius: 6, passes: 2 }),
      node('sn-13', 'shader', 1600, 0, { preset: 'custom', code: AERO_BUBBLE_GLSL }),
      // bloom
      node('sn-5', 'blur', 1600, 560, { radius: 18, passes: 2 }),
      node('sn-15', 'blend', 1920, 0, { mode: 'screen', mix: 0.45 }),
      node('sn-16', 'text-overlay', 2240, 0, {
        text: 'welcome',
        subtitle: 'clear skies · fresh water · new ideas',
        position: 'center',
        size: 72,
        font: 'sans',
        color: '#ffffff',
        glow: '#6fd8ff',
        glowAmount: 0.9,
      }),
      node('sn-17', 'main-output', 2560, 0),
      // music
      node('sn-18', 'metronome', 640, 1500, { bpm: 76, subdivision: '1/2' }),
      node('sn-19', 'progression', 960, 1400, { root: 'F', scaleName: 'lydian', bars: 4, octave: 4 }),
      node('sn-20', 'poly-voice', 1280, 1400, { preset: 'motion-pad', gain: 0.3 }),
      node('sn-21', 'arpeggiator', 1280, 1700, { mode: 'updown', octaves: 2, velocity: 80 }),
      node('sn-22', 'bellows-instrument', 1600, 1700, { preset: 'music-box', gain: 0.45 }),
      node('sn-23', 'bellows-reverb', 1600, 1400, { effect: 'fdn', fx_fdn_mix: 0.45, fx_fdn_decay: 5 }),
      node('sn-24', 'audio-output', 1920, 1400),
      node('sn-25', 'bellows-delay', 1920, 1700, { effect: 'tapeDelay', fx_tapeDelay_mix: 0.3, fx_tapeDelay_wow: 0.2 }),
      node('sn-26', 'audio-output', 2240, 1700),
      node('sn-27', 'random', 640, 1160, { min: 65, max: 89, mode: 'on-trigger', integer: true }),
      node('sn-28', 'scale-quantize', 960, 1160, { root: 'F', scaleName: 'lydian' }),
      node('sn-29', 'bellows-instrument', 1280, 1160, { preset: 'kalimba', gain: 0.3 }),
      node('sn-30', 'audio-output', 1600, 1160),
      // the pad's loudness swells the aurora
      node('sn-7', 'audio-analyzer', 1920, 1100, { smoothing: 0.85 }),
      node('sn-8', 'smooth', 1920, 900, { factor: 0.08 }),
      node('sn-9', 'remap', -320, 520, { inMin: 0, inMax: 0.4, outMin: 0, outMax: 1, clamp: true }),
    ],
    edges: wires(
      'sn-2.value > sn-3.value',
      'sn-3.result > sn-1.u_glow',
      'sn-4.positions > sn-6.positions',
      'sn-6.object > sn-10.objects',
      'sn-10.scene > sn-12.scene',
      'sn-11.camera > sn-12.camera',
      'sn-12.texture > sn-14.texture',
      'sn-1.texture > sn-13.iChannel0',
      'sn-14.texture > sn-13.iChannel1',
      'sn-13.texture > sn-5.texture',
      'sn-13.texture > sn-15.a',
      'sn-5.texture > sn-15.b',
      'sn-15.texture > sn-16.source',
      'sn-16.texture > sn-17.texture',
      'sn-18.bar > sn-19.clock',
      'sn-19.notes > sn-20.notes',
      'sn-19.trigger > sn-20.trigger',
      'sn-20.audio > sn-23.audio',
      'sn-23.audio > sn-24.audio',
      'sn-18.beat > sn-21.clock',
      'sn-19.notes > sn-21.notes',
      'sn-21.note > sn-22.note',
      'sn-21.velocity > sn-22.velocity',
      'sn-21.trigger > sn-22.trigger',
      'sn-22.audio > sn-25.audio',
      'sn-25.audio > sn-26.audio',
      'sn-4.passed > sn-27.trigger',
      'sn-27.result > sn-28.note',
      'sn-28.note > sn-29.note',
      'sn-4.passed > sn-29.trigger',
      'sn-29.audio > sn-30.audio',
      'sn-23.audio > sn-7.audio',
      'sn-7.level > sn-8.value',
      'sn-8.result > sn-9.value',
      'sn-9.result > sn-1.u_pulse',
    ),
  },

  // ── Shaders & visuals (no camera, no mic) ───────────────────────────────────
  {
    id: 'liquid-chrome',
    name: 'Liquid Chrome',
    description: 'A blurred noise shader becomes the height map for a second, custom shader that turns it into rippling chrome, with a slow LFO adding oil-slick colour',
    category: 'visual',
    persona: 'Shaders & visuals',
    relatedNodes: ['shader', 'blur', 'lfo', 'map-range', 'image-fx-rgb-shift', 'main-output'],
    nodes: [
      node('sn-1', 'shader', 0, 0, { preset: 'noise' }),
      node('sn-7', 'blur', 0, 520, { radius: 8, passes: 3 }),
      node('sn-2', 'shader', 320, 0, { preset: 'custom', code: CHROME_GLSL, _dynamicInputs: floatPorts(['u_tint', 'Oil-slick colour']) }),
      node('sn-3', 'lfo', 0, 260, { frequency: 0.05, waveform: 'sine' }),
      node('sn-4', 'map-range', 320, 260, { inMin: -1, inMax: 1, outMin: 0, outMax: 0.35 }),
      node('sn-5', 'image-fx-rgb-shift', 640, 0, { u_amount: 0.004 }),
      node('sn-6', 'main-output', 960, 0),
    ],
    edges: wires(
      'sn-1.texture > sn-7.texture',
      'sn-7.texture > sn-2.iChannel0',
      'sn-3.value > sn-4.value',
      'sn-4.result > sn-2.u_tint',
      'sn-2.texture > sn-5.source',
      'sn-5.texture > sn-6.texture',
    ),
  },
  {
    id: 'pop-halftone',
    name: 'Pop Halftone',
    description: 'Plasma printed as a pop-art halftone: a custom shader lays cyan, magenta and yellow dot screens on paper, then a kaleidoscope whose mirror count steps with an LFO folds it',
    category: 'visual',
    persona: 'Shaders & visuals',
    relatedNodes: ['shader', 'constant', 'image-fx-kaleidoscope', 'lfo', 'map-range', 'quantize', 'time', 'wrap', 'main-output'],
    nodes: [
      node('sn-1', 'shader', 0, 0, { preset: 'plasma' }),
      node('sn-2', 'shader', 320, 0, { preset: 'custom', code: CMY_HALFTONE_GLSL, _dynamicInputs: floatPorts(['u_dot', 'Dot size (px)']) }),
      node('sn-3', 'image-fx-kaleidoscope', 640, 0, { u_segments: 6 }),
      node('sn-5', 'main-output', 960, 0),
      node('sn-4', 'constant', 0, 700, { value: 9 }),
      node('sn-6', 'lfo', 0, 260, { frequency: 0.08, waveform: 'triangle' }),
      node('sn-7', 'map-range', 320, 260, { inMin: -1, inMax: 1, outMin: 3, outMax: 12 }),
      node('sn-8', 'quantize', 640, 260, { step: 1 }),
      node('sn-9', 'time', 0, 500),
      node('sn-10', 'wrap', 320, 500, { min: 0, max: 6.28 }),
    ],
    edges: wires(
      'sn-1.texture > sn-2.iChannel0',
      'sn-4.value > sn-2.u_dot',
      'sn-2.texture > sn-3.source',
      'sn-3.texture > sn-5.texture',
      'sn-6.value > sn-7.value',
      'sn-7.result > sn-8.value',
      'sn-8.result > sn-3.u_segments',
      'sn-9.time > sn-10.value',
      'sn-10.result > sn-3.u_rotation',
    ),
  },
  {
    id: 'signal-decay',
    name: 'Signal Decay',
    description: 'A voronoi field broken down like a dying broadcast: noise drives the glitch, a square LFO crunches the pixels, scanlines and colour fringing finish it',
    category: 'visual',
    persona: 'Shaders & visuals',
    relatedNodes: ['shader', 'image-fx-glitch', 'image-fx-pixelate', 'image-fx-scanlines', 'image-fx-rgb-shift', 'noise', 'lfo', 'time', 'main-output'],
    nodes: [
      node('sn-1', 'shader', 0, 0, { preset: 'voronoi' }),
      node('sn-2', 'image-fx-glitch', 320, 0, { u_intensity: 0.3, u_speed: 6 }),
      node('sn-3', 'image-fx-pixelate', 640, 0, { u_pixels: 160 }),
      node('sn-4', 'image-fx-scanlines', 960, 0, { u_count: 320, u_intensity: 0.35, u_speed: 1.5 }),
      node('sn-5', 'image-fx-rgb-shift', 1280, 0, { u_amount: 0.008 }),
      node('sn-6', 'main-output', 1600, 0),
      node('sn-7', 'time', 0, 300),
      node('sn-8', 'noise', 320, 300, { frequency: 0.6, octaves: 2 }),
      node('sn-9', 'remap', 640, 300, { inMin: 0.3, inMax: 0.8, outMin: 0, outMax: 0.9, clamp: true }),
      node('sn-10', 'lfo', 640, 520, { frequency: 0.25, waveform: 'square' }),
      node('sn-11', 'map-range', 960, 520, { inMin: -1, inMax: 1, outMin: 48, outMax: 240 }),
    ],
    edges: wires(
      'sn-1.texture > sn-2.source',
      'sn-2.texture > sn-3.source',
      'sn-3.texture > sn-4.source',
      'sn-4.texture > sn-5.source',
      'sn-5.texture > sn-6.texture',
      'sn-7.time > sn-8.x',
      'sn-8.normalized > sn-9.value',
      'sn-9.result > sn-2.u_intensity',
      'sn-10.value > sn-11.value',
      'sn-11.result > sn-3.u_pixels',
    ),
  },
  {
    id: 'ink-mandala',
    name: 'Ink Mandala',
    description: 'Layered waves painted through a watercolor shader and mirrored twelve ways, with a soft bloom from a blurred copy screened back on top',
    category: 'visual',
    persona: 'Shaders & visuals',
    relatedNodes: ['shader', 'image-fx-kaleidoscope', 'blur', 'blend', 'color-correction', 'lfo', 'main-output'],
    nodes: [
      node('sn-1', 'shader', 0, 0, { preset: 'waves' }),
      node('sn-2', 'shader', 320, 0, { preset: 'watercolor' }),
      node('sn-3', 'image-fx-kaleidoscope', 640, 0, { u_segments: 12 }),
      node('sn-4', 'blur', 640, 260, { radius: 12, passes: 2 }),
      node('sn-5', 'blend', 960, 0, { mode: 'screen', mix: 0.6 }),
      node('sn-6', 'color-correction', 1280, 0, { contrast: 1.15, saturation: 1.3 }),
      node('sn-7', 'main-output', 1600, 0),
      node('sn-8', 'lfo', 960, 300, { frequency: 0.03, waveform: 'sine' }),
      node('sn-9', 'map-range', 1280, 300, { inMin: -1, inMax: 1, outMin: -40, outMax: 40 }),
    ],
    edges: wires(
      'sn-1.texture > sn-2.iChannel0',
      'sn-2.texture > sn-3.source',
      'sn-3.texture > sn-4.texture',
      'sn-3.texture > sn-5.a',
      'sn-4.texture > sn-5.b',
      'sn-5.texture > sn-6.texture',
      'sn-8.value > sn-9.value',
      'sn-9.result > sn-6.hue',
      'sn-6.texture > sn-7.texture',
    ),
  },

  // ── Camera & tracking ───────────────────────────────────────────────────────
  {
    id: 'yolo-live',
    name: 'YOLO Object Detector',
    description: 'Real-time YOLOv10 object detection on your webcam, running in the browser: corner-bracket boxes, labels, and a live count of what it sees',
    category: 'ai',
    persona: 'Camera & tracking',
    requires: ['camera', 'model'],
    relatedNodes: ['webcam', 'object-detection-yolo', 'text-overlay', 'main-output', 'monitor'],
    nodes: [
      node('sn-1', 'webcam', 0, 0),
      node('sn-2', 'object-detection-yolo', 320, 0, { modelUrl: YOLO_ONNX, threshold: 0.35, interval: 10, boxStyle: 'corners', colorMode: 'class' }),
      node('sn-3', 'text-overlay', 640, 0, { text: '{value} OBJECTS', subtitle: 'top: {value2}', position: 'top-left', size: 32, glow: '#00e5ff' }),
      node('sn-4', 'main-output', 960, 0),
      node('sn-5', 'monitor', 640, 460, { label: 'Detections' }),
    ],
    edges: wires(
      'sn-1.texture > sn-2.source',
      'sn-2.texture > sn-3.source',
      'sn-2.count > sn-3.value',
      'sn-2.topLabel > sn-3.value2',
      'sn-3.texture > sn-4.texture',
      'sn-2.detections > sn-5.value',
    ),
  },
  {
    id: 'say-what-you-see',
    name: 'Say What You See',
    description: 'YOLO watches the camera and a physical-model voice says the name of each new thing that stays in view for a moment',
    category: 'ai',
    persona: 'Camera & tracking',
    requires: ['camera', 'model'],
    relatedNodes: ['webcam', 'object-detection-yolo', 'gate', 'debounce', 'changed', 'monitor', 'bellows-speak', 'bellows-reverb', 'main-output'],
    nodes: [
      node('sn-1', 'webcam', 0, 0),
      node('sn-2', 'object-detection-yolo', 320, 0, { modelUrl: YOLO_ONNX, threshold: 0.45, interval: 15 }),
      node('sn-3', 'main-output', 640, 0),
      node('sn-4', 'gate', 640, 260, { whenClosed: 'hold' }),
      node('sn-5', 'debounce', 960, 260, { delay: 1200 }),
      node('sn-6', 'changed', 1280, 260),
      node('sn-7', 'monitor', 1600, 420, { label: 'New thing' }),
      node('sn-8', 'bellows-speak', 1600, 0, { voice: 'narrator-female' }),
      node('sn-9', 'bellows-reverb', 1920, 0, { effect: 'plate', fx_plate_mix: 0.25 }),
      node('sn-10', 'audio-output', 2240, 0),
    ],
    edges: wires(
      'sn-1.texture > sn-2.source',
      'sn-2.texture > sn-3.texture',
      'sn-2.topLabel > sn-4.value',
      'sn-2.count > sn-4.gate',
      'sn-4.result > sn-5.value',
      'sn-5.result > sn-6.value',
      'sn-6.result > sn-8.text',
      'sn-6.changed > sn-7.value',
      'sn-7.value > sn-8.trigger',
      'sn-8.audio > sn-9.audio',
      'sn-9.audio > sn-10.audio',
    ),
  },
  {
    id: 'narrated-camera',
    name: 'Narrated Camera',
    description: 'A small vision-language model (SmolVLM) looks at the camera every few seconds and describes it in a sentence; the description is written over the picture and read aloud',
    category: 'ai',
    persona: 'AI & voice',
    requires: ['camera', 'model'],
    relatedNodes: ['webcam', 'texture-to-data', 'vla', 'changed', 'monitor', 'bellows-speak', 'text-overlay', 'main-output'],
    nodes: [
      node('sn-1', 'webcam', 0, 0),
      node('sn-2', 'texture-to-data', 320, 0, { continuous: true }),
      node('sn-3', 'vla', 640, 0, { instruction: 'Describe what you see in one short sentence.', maxTokens: 40, interval: 240 }),
      node('sn-4', 'changed', 960, 0),
      node('sn-5', 'monitor', 1280, 220, { label: 'New description' }),
      node('sn-6', 'bellows-speak', 1600, 0, { voice: 'narrator-male', accent: 'received-pronunciation' }),
      node('sn-7', 'audio-output', 1920, 0),
      node('sn-8', 'text-overlay', 960, 460, { text: '', position: 'bottom', size: 28, font: 'serif', box: true, glowAmount: 0.2 }),
      node('sn-9', 'main-output', 1280, 460),
    ],
    edges: wires(
      'sn-1.texture > sn-2.texture',
      'sn-2.data > sn-3.image',
      'sn-3.action > sn-4.value',
      'sn-4.changed > sn-5.value',
      'sn-4.result > sn-6.text',
      'sn-5.value > sn-6.trigger',
      'sn-6.audio > sn-7.audio',
      'sn-1.texture > sn-8.source',
      'sn-3.action > sn-8.subtitle',
      'sn-8.texture > sn-9.texture',
    ),
  },
  {
    id: 'motion-ink',
    name: 'Motion Ink',
    description: 'OpenCV optical flow measures how you move; the blurred motion field smears a plasma like wet ink, and faster movement pushes it harder',
    category: 'opencv',
    persona: 'Camera & tracking',
    requires: ['camera'],
    relatedNodes: ['webcam', 'cv-optical-flow', 'blur', 'shader', 'displacement', 'remap', 'smooth', 'color-correction', 'main-output'],
    nodes: [
      node('sn-1', 'webcam', 0, 0),
      node('sn-2', 'cv-optical-flow', 320, 0, { winSize: 21, interval: 2 }),
      node('sn-3', 'blur', 640, 0, { radius: 10, passes: 2 }),
      node('sn-4', 'shader', 640, 260, { preset: 'plasma' }),
      node('sn-5', 'displacement', 960, 0, { channel: 'rg', strength: 0.15 }),
      node('sn-6', 'smooth', 640, 520, { factor: 0.15 }),
      node('sn-7', 'remap', 960, 520, { inMin: 0, inMax: 4, outMin: 0.05, outMax: 0.6, clamp: true }),
      node('sn-8', 'color-correction', 1280, 0, { saturation: 1.4, contrast: 1.2 }),
      node('sn-9', 'main-output', 1600, 0),
    ],
    edges: wires(
      'sn-1.texture > sn-2.source',
      'sn-2.texture > sn-3.texture',
      'sn-4.texture > sn-5.texture',
      'sn-3.texture > sn-5.displacement',
      'sn-2.motion > sn-6.value',
      'sn-6.result > sn-7.value',
      'sn-7.result > sn-5.strength',
      'sn-5.texture > sn-8.texture',
      'sn-8.texture > sn-9.texture',
    ),
  },
  {
    id: 'duotone-poster',
    name: 'Duotone Poster Cam',
    description: 'OpenCV blur and adaptive threshold turn the camera into black ink, printed onto a slowly turning two-colour gradient with misregistered colour and a dithered grain',
    category: 'opencv',
    persona: 'Camera & tracking',
    requires: ['camera'],
    relatedNodes: ['webcam', 'cv-blur', 'cv-threshold', 'shader', 'blend', 'image-fx-rgb-shift', 'image-fx-dither', 'main-output'],
    nodes: [
      node('sn-1', 'webcam', 0, 0),
      node('sn-2', 'cv-blur', 320, 0, { mode: 'gaussian', kernel: 5, interval: 1 }),
      node('sn-3', 'cv-threshold', 640, 0, { mode: 'adaptive', blockSize: 15, c: 6, interval: 1 }),
      node('sn-4', 'shader', 640, 300, { preset: 'gradient' }),
      node('sn-5', 'blend', 960, 0, { mode: 'multiply', mix: 1 }),
      node('sn-6', 'image-fx-rgb-shift', 1280, 0, { u_amount: 0.006, u_angle: 0.8 }),
      node('sn-7', 'image-fx-dither', 1600, 0, { u_levels: 4, u_scale: 2 }),
      node('sn-8', 'main-output', 1920, 0),
    ],
    edges: wires(
      'sn-1.texture > sn-2.source',
      'sn-2.texture > sn-3.source',
      'sn-3.texture > sn-5.a',
      'sn-4.texture > sn-5.b',
      'sn-5.texture > sn-6.source',
      'sn-6.texture > sn-7.source',
      'sn-7.texture > sn-8.texture',
    ),
  },
  {
    id: 'ghost-presence',
    name: 'Ghost Presence',
    description: 'OpenCV background subtraction keeps only what moves: you appear as a glitching ghost on black, and the more of you moves the harder the signal tears',
    category: 'opencv',
    persona: 'Camera & tracking',
    requires: ['camera'],
    relatedNodes: ['webcam', 'cv-background-subtraction', 'blur', 'blend', 'image-fx-glitch', 'image-fx-scanlines', 'remap', 'main-output'],
    nodes: [
      node('sn-1', 'webcam', 0, 0),
      node('sn-2', 'cv-background-subtraction', 320, 0, { detectShadows: false, varThreshold: 24, interval: 1 }),
      node('sn-3', 'blur', 640, 0, { radius: 6, passes: 2 }),
      node('sn-4', 'blend', 960, 0, { mode: 'multiply', mix: 1 }),
      node('sn-5', 'image-fx-glitch', 1280, 0, { u_intensity: 0.2, u_speed: 8 }),
      node('sn-6', 'image-fx-scanlines', 1600, 0, { u_count: 360, u_intensity: 0.3 }),
      node('sn-7', 'main-output', 1920, 0),
      node('sn-8', 'remap', 960, 280, { inMin: 0, inMax: 0.3, outMin: 0.05, outMax: 0.9, clamp: true }),
    ],
    edges: wires(
      'sn-1.texture > sn-2.source',
      'sn-2.texture > sn-3.texture',
      'sn-1.texture > sn-4.a',
      'sn-3.texture > sn-4.b',
      'sn-4.texture > sn-5.source',
      'sn-5.texture > sn-6.source',
      'sn-6.texture > sn-7.texture',
      'sn-2.foreground > sn-8.value',
      'sn-8.result > sn-5.u_intensity',
    ),
  },
  {
    id: 'corner-constellations',
    name: 'Corner Constellations',
    description: 'The room as a night sky: OpenCV darkens the camera and marks up to 200 corner features as stars, with a live star count',
    category: 'opencv',
    persona: 'Camera & tracking',
    requires: ['camera'],
    relatedNodes: ['webcam', 'cv-grayscale', 'color-correction', 'cv-corners', 'text-overlay', 'main-output'],
    nodes: [
      node('sn-1', 'webcam', 0, 0),
      node('sn-2', 'cv-grayscale', 320, 0, { interval: 1 }),
      node('sn-3', 'color-correction', 640, 0, { brightness: -0.45, contrast: 1.5 }),
      node('sn-4', 'cv-corners', 960, 0, { maxCorners: 200, quality: 0.02, minDistance: 14, radius: 3, color: '#9be7ff', interval: 2 }),
      node('sn-5', 'text-overlay', 1280, 0, { text: '{value} STARS', position: 'bottom-right', size: 24, font: 'mono', glow: '#9be7ff' }),
      node('sn-6', 'main-output', 1600, 0),
    ],
    edges: wires(
      'sn-1.texture > sn-2.source',
      'sn-2.texture > sn-3.texture',
      'sn-3.texture > sn-4.source',
      'sn-4.texture > sn-5.source',
      'sn-4.count > sn-5.value',
      'sn-5.texture > sn-6.texture',
    ),
  },
]
