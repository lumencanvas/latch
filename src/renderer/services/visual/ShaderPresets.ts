/**
 * Shader Presets Library
 *
 * Built-in shaders for common effects and creative coding.
 * All shaders support both Shadertoy mode (mainImage) and raw GLSL.
 */

export interface ShaderPreset {
  id: string
  name: string
  category: 'generator' | 'effect' | 'utility' | 'artistic'
  description: string
  fragmentCode: string
  vertexCode?: string
  // Uniforms that this shader uses (for auto-generating inputs)
  uniforms: UniformDefinition[]
}

export interface UniformDefinition {
  name: string
  type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'int' | 'sampler2D' | 'samplerCube'
  label: string
  default: number | number[]
  min?: number
  max?: number
  step?: number
}

// ============================================================================
// Generator Shaders - Create visuals from scratch
// ============================================================================

const gradientShader: ShaderPreset = {
  id: 'gradient',
  name: 'Gradient',
  category: 'generator',
  description: 'Smooth color gradient',
  uniforms: [
    { name: 'u_color1', type: 'vec3', label: 'Color 1', default: [1.0, 0.0, 0.5] },
    { name: 'u_color2', type: 'vec3', label: 'Color 2', default: [0.0, 0.5, 1.0] },
    { name: 'u_angle', type: 'float', label: 'Angle', default: 0, min: 0, max: 6.28, step: 0.01 },
  ],
  fragmentCode: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;

  // Rotate UV
  float angle = u_angle;
  vec2 center = vec2(0.5);
  uv -= center;
  uv = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * uv;
  uv += center;

  vec3 col = mix(u_color1, u_color2, uv.x);
  fragColor = vec4(col, 1.0);
}`,
}

const noiseShader: ShaderPreset = {
  id: 'noise',
  name: 'Noise',
  category: 'generator',
  description: 'Animated Perlin-like noise',
  uniforms: [
    { name: 'u_scale', type: 'float', label: 'Scale', default: 5.0, min: 0.1, max: 20, step: 0.1 },
    { name: 'u_speed', type: 'float', label: 'Speed', default: 1.0, min: 0, max: 5, step: 0.1 },
    { name: 'u_octaves', type: 'float', label: 'Octaves', default: 4, min: 1, max: 8, step: 1 },
  ],
  fragmentCode: `// Simple noise functions
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p, float octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  for(float i = 0.0; i < 8.0; i++) {
    if(i >= octaves) break;
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;

  float n = fbm(uv * u_scale + iTime * u_speed * 0.5, u_octaves);

  fragColor = vec4(vec3(n), 1.0);
}`,
}

const plasmaShader: ShaderPreset = {
  id: 'plasma',
  name: 'Plasma',
  category: 'generator',
  description: 'Classic plasma effect',
  uniforms: [
    { name: 'u_scale', type: 'float', label: 'Scale', default: 3.0, min: 0.5, max: 10, step: 0.1 },
    { name: 'u_speed', type: 'float', label: 'Speed', default: 1.0, min: 0, max: 5, step: 0.1 },
  ],
  fragmentCode: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float t = iTime * u_speed;

  float v = 0.0;
  v += sin((uv.x * u_scale + t));
  v += sin((uv.y * u_scale + t) / 2.0);
  v += sin((uv.x * u_scale + uv.y * u_scale + t) / 2.0);

  vec2 c = uv * u_scale / 2.0;
  v += sin(sqrt(c.x * c.x + c.y * c.y + 1.0) + t);
  v = v / 2.0;

  vec3 col = vec3(
    sin(v * 3.14159),
    sin(v * 3.14159 + 2.094),
    sin(v * 3.14159 + 4.188)
  ) * 0.5 + 0.5;

  fragColor = vec4(col, 1.0);
}`,
}

const circlesShader: ShaderPreset = {
  id: 'circles',
  name: 'Circles',
  category: 'generator',
  description: 'Animated concentric circles',
  uniforms: [
    { name: 'u_count', type: 'float', label: 'Count', default: 10.0, min: 1, max: 50, step: 1 },
    { name: 'u_speed', type: 'float', label: 'Speed', default: 1.0, min: 0, max: 5, step: 0.1 },
    { name: 'u_thickness', type: 'float', label: 'Thickness', default: 0.02, min: 0.001, max: 0.1, step: 0.001 },
  ],
  fragmentCode: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  uv = uv * 2.0 - 1.0;
  uv.x *= iResolution.x / iResolution.y;

  float d = length(uv);
  float t = iTime * u_speed;

  float rings = fract(d * u_count - t);
  float circle = smoothstep(0.5 - u_thickness, 0.5, rings) -
                 smoothstep(0.5, 0.5 + u_thickness, rings);

  vec3 col = vec3(circle) * (0.5 + 0.5 * cos(iTime + d * 3.0 + vec3(0, 2, 4)));

  fragColor = vec4(col, 1.0);
}`,
}

const wavesShader: ShaderPreset = {
  id: 'waves',
  name: 'Waves',
  category: 'generator',
  description: 'Animated sine waves',
  uniforms: [
    { name: 'u_frequency', type: 'float', label: 'Frequency', default: 10.0, min: 1, max: 50, step: 0.5 },
    { name: 'u_amplitude', type: 'float', label: 'Amplitude', default: 0.1, min: 0.01, max: 0.5, step: 0.01 },
    { name: 'u_speed', type: 'float', label: 'Speed', default: 2.0, min: 0, max: 10, step: 0.1 },
    { name: 'u_layers', type: 'float', label: 'Layers', default: 5.0, min: 1, max: 10, step: 1 },
  ],
  fragmentCode: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;

  float col = 0.0;
  for(float i = 1.0; i <= 10.0; i++) {
    if(i > u_layers) break;
    float wave = sin(uv.x * u_frequency * i + iTime * u_speed / i) * u_amplitude / i;
    col += smoothstep(0.01, 0.0, abs(uv.y - 0.5 - wave));
  }

  vec3 color = col * (0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0, 2, 4)));

  fragColor = vec4(color, 1.0);
}`,
}

const voronoiShader: ShaderPreset = {
  id: 'voronoi',
  name: 'Voronoi',
  category: 'generator',
  description: 'Animated Voronoi cells',
  uniforms: [
    { name: 'u_scale', type: 'float', label: 'Scale', default: 5.0, min: 1, max: 20, step: 0.5 },
    { name: 'u_speed', type: 'float', label: 'Speed', default: 1.0, min: 0, max: 5, step: 0.1 },
  ],
  fragmentCode: `vec2 hash2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  uv *= u_scale;

  vec2 i_uv = floor(uv);
  vec2 f_uv = fract(uv);

  float minDist = 1.0;
  vec2 minPoint;

  for(int y = -1; y <= 1; y++) {
    for(int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = hash2(i_uv + neighbor);
      point = 0.5 + 0.5 * sin(iTime * u_speed + 6.2831 * point);

      float d = length(neighbor + point - f_uv);
      if(d < minDist) {
        minDist = d;
        minPoint = point;
      }
    }
  }

  vec3 col = 0.5 + 0.5 * cos(iTime + minPoint.xyx * 3.0 + vec3(0, 2, 4));
  col *= (1.0 - minDist);

  fragColor = vec4(col, 1.0);
}`,
}

// ============================================================================
// Effect Shaders - Process input textures
// ============================================================================

const chromaticAberrationShader: ShaderPreset = {
  id: 'chromatic-aberration',
  name: 'Chromatic Aberration',
  category: 'effect',
  description: 'RGB channel separation effect',
  uniforms: [
    { name: 'u_amount', type: 'float', label: 'Amount', default: 0.01, min: 0, max: 0.1, step: 0.001 },
    { name: 'u_angle', type: 'float', label: 'Angle', default: 0, min: 0, max: 6.28, step: 0.01 },
  ],
  fragmentCode: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 dir = vec2(cos(u_angle), sin(u_angle)) * u_amount;

  float r = texture(iChannel0, uv + dir).r;
  float g = texture(iChannel0, uv).g;
  float b = texture(iChannel0, uv - dir).b;

  fragColor = vec4(r, g, b, 1.0);
}`,
}

const pixelateShader: ShaderPreset = {
  id: 'pixelate',
  name: 'Pixelate',
  category: 'effect',
  description: 'Pixelation effect',
  uniforms: [
    { name: 'u_pixels', type: 'float', label: 'Pixels', default: 64, min: 4, max: 512, step: 4 },
  ],
  fragmentCode: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;

  float pixels = u_pixels;
  vec2 pixelSize = vec2(1.0) / pixels;
  uv = floor(uv / pixelSize) * pixelSize + pixelSize * 0.5;

  fragColor = texture(iChannel0, uv);
}`,
}

const vignetteShader: ShaderPreset = {
  id: 'vignette',
  name: 'Vignette',
  category: 'effect',
  description: 'Dark corners vignette effect',
  uniforms: [
    { name: 'u_intensity', type: 'float', label: 'Intensity', default: 0.5, min: 0, max: 2, step: 0.05 },
    { name: 'u_softness', type: 'float', label: 'Softness', default: 0.5, min: 0.1, max: 1, step: 0.05 },
  ],
  fragmentCode: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec4 col = texture(iChannel0, uv);

  vec2 center = uv - 0.5;
  float d = length(center);
  float vignette = 1.0 - smoothstep(u_softness, u_softness + 0.5, d * u_intensity * 2.0);

  fragColor = vec4(col.rgb * vignette, col.a);
}`,
}

const glitchShader: ShaderPreset = {
  id: 'glitch',
  name: 'Glitch',
  category: 'effect',
  description: 'Digital glitch effect',
  uniforms: [
    { name: 'u_intensity', type: 'float', label: 'Intensity', default: 0.5, min: 0, max: 1, step: 0.01 },
    { name: 'u_speed', type: 'float', label: 'Speed', default: 5.0, min: 0, max: 20, step: 0.5 },
  ],
  fragmentCode: `float rand(float n) {
  return fract(sin(n) * 43758.5453);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;

  float t = floor(iTime * u_speed);

  // Random block offset
  float blockY = floor(uv.y * 10.0) / 10.0;
  float blockOffset = (rand(t + blockY) - 0.5) * u_intensity * 0.2;

  // Random scanline
  float scanline = rand(t) > 0.9 ? (rand(t * 2.0) - 0.5) * u_intensity : 0.0;

  vec2 offset = vec2(blockOffset + scanline, 0.0);

  // RGB split on glitch
  float split = rand(t) > 0.8 ? u_intensity * 0.05 : 0.0;

  float r = texture(iChannel0, uv + offset + vec2(split, 0.0)).r;
  float g = texture(iChannel0, uv + offset).g;
  float b = texture(iChannel0, uv + offset - vec2(split, 0.0)).b;

  fragColor = vec4(r, g, b, 1.0);
}`,
}

const edgeDetectShader: ShaderPreset = {
  id: 'edge-detect',
  name: 'Edge Detection',
  category: 'effect',
  description: 'Sobel edge detection',
  uniforms: [
    { name: 'u_threshold', type: 'float', label: 'Threshold', default: 0.1, min: 0, max: 1, step: 0.01 },
  ],
  fragmentCode: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 texel = 1.0 / iResolution.xy;

  // Sobel kernels
  float tl = dot(texture(iChannel0, uv + texel * vec2(-1, 1)).rgb, vec3(0.299, 0.587, 0.114));
  float t  = dot(texture(iChannel0, uv + texel * vec2(0, 1)).rgb, vec3(0.299, 0.587, 0.114));
  float tr = dot(texture(iChannel0, uv + texel * vec2(1, 1)).rgb, vec3(0.299, 0.587, 0.114));
  float l  = dot(texture(iChannel0, uv + texel * vec2(-1, 0)).rgb, vec3(0.299, 0.587, 0.114));
  float r  = dot(texture(iChannel0, uv + texel * vec2(1, 0)).rgb, vec3(0.299, 0.587, 0.114));
  float bl = dot(texture(iChannel0, uv + texel * vec2(-1, -1)).rgb, vec3(0.299, 0.587, 0.114));
  float b  = dot(texture(iChannel0, uv + texel * vec2(0, -1)).rgb, vec3(0.299, 0.587, 0.114));
  float br = dot(texture(iChannel0, uv + texel * vec2(1, -1)).rgb, vec3(0.299, 0.587, 0.114));

  float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
  float gy = -tl - 2.0*t - tr + bl + 2.0*b + br;
  float edge = sqrt(gx*gx + gy*gy);

  edge = edge > u_threshold ? 1.0 : 0.0;

  fragColor = vec4(vec3(edge), 1.0);
}`,
}

const kaleidoscopeShader: ShaderPreset = {
  id: 'kaleidoscope',
  name: 'Kaleidoscope',
  category: 'effect',
  description: 'Mirror reflection kaleidoscope',
  uniforms: [
    { name: 'u_segments', type: 'float', label: 'Segments', default: 6, min: 2, max: 16, step: 1 },
    { name: 'u_rotation', type: 'float', label: 'Rotation', default: 0, min: 0, max: 6.28, step: 0.01 },
  ],
  fragmentCode: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  uv = uv * 2.0 - 1.0;
  uv.x *= iResolution.x / iResolution.y;

  // Convert to polar
  float angle = atan(uv.y, uv.x) + u_rotation + iTime * 0.2;
  float radius = length(uv);

  // Mirror segments
  float segments = u_segments;
  float segmentAngle = 3.14159 * 2.0 / segments;
  angle = mod(angle, segmentAngle);
  angle = abs(angle - segmentAngle * 0.5);

  // Back to cartesian
  vec2 newUV = vec2(cos(angle), sin(angle)) * radius;
  newUV = newUV * 0.5 + 0.5;

  fragColor = texture(iChannel0, newUV);
}`,
}

// ============================================================================
// Utility Shaders
// ============================================================================

const solidColorShader: ShaderPreset = {
  id: 'solid-color',
  name: 'Solid Color',
  category: 'utility',
  description: 'Simple solid color output',
  uniforms: [
    { name: 'u_color', type: 'vec3', label: 'Color', default: [1.0, 0.5, 0.0] },
    { name: 'u_alpha', type: 'float', label: 'Alpha', default: 1.0, min: 0, max: 1, step: 0.01 },
  ],
  fragmentCode: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  fragColor = vec4(u_color, u_alpha);
}`,
}

const uvDebugShader: ShaderPreset = {
  id: 'uv-debug',
  name: 'UV Debug',
  category: 'utility',
  description: 'Visualize UV coordinates',
  uniforms: [],
  fragmentCode: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  fragColor = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.0);
}`,
}

const passthroughShader: ShaderPreset = {
  id: 'passthrough',
  name: 'Passthrough',
  category: 'utility',
  description: 'Pass texture through unchanged',
  uniforms: [],
  fragmentCode: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  fragColor = texture(iChannel0, uv);
}`,
}

// ============================================================================
// Artistic Shaders
// ============================================================================

const watercolorShader: ShaderPreset = {
  id: 'watercolor',
  name: 'Watercolor',
  category: 'artistic',
  description: 'Watercolor paint effect',
  uniforms: [
    { name: 'u_wetness', type: 'float', label: 'Wetness', default: 0.5, min: 0, max: 1, step: 0.01 },
    { name: 'u_granulation', type: 'float', label: 'Granulation', default: 0.3, min: 0, max: 1, step: 0.01 },
  ],
  fragmentCode: `float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 texel = 1.0 / iResolution.xy;

  // Distort UVs for wet paint look
  float noise = hash(uv * 100.0 + iTime * 0.1);
  vec2 distort = (vec2(hash(uv * 50.0), hash(uv * 50.0 + 100.0)) - 0.5) * u_wetness * 0.03;
  uv += distort;

  // Sample with slight blur
  vec4 col = vec4(0.0);
  for(float i = -1.0; i <= 1.0; i++) {
    for(float j = -1.0; j <= 1.0; j++) {
      col += texture(iChannel0, uv + vec2(i, j) * texel * 2.0);
    }
  }
  col /= 9.0;

  // Add paper texture / granulation
  float paper = hash(fragCoord.xy * 0.5) * u_granulation * 0.2;
  col.rgb = mix(col.rgb, col.rgb * (1.0 - paper), u_granulation);

  fragColor = col;
}`,
}

const halftoneShader: ShaderPreset = {
  id: 'halftone',
  name: 'Halftone',
  category: 'artistic',
  description: 'Halftone dot pattern',
  uniforms: [
    { name: 'u_dotSize', type: 'float', label: 'Dot Size', default: 5.0, min: 1, max: 20, step: 0.5 },
    { name: 'u_angle', type: 'float', label: 'Angle', default: 0.785, min: 0, max: 3.14, step: 0.01 },
  ],
  fragmentCode: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec4 texCol = texture(iChannel0, uv);
  float luma = dot(texCol.rgb, vec3(0.299, 0.587, 0.114));

  // Rotate coordinates
  vec2 coord = fragCoord;
  float s = sin(u_angle);
  float c = cos(u_angle);
  coord = mat2(c, -s, s, c) * coord;

  // Create dot pattern
  vec2 cell = mod(coord, u_dotSize) / u_dotSize - 0.5;
  float dot = length(cell);

  // Size based on luminance
  float radius = (1.0 - luma) * 0.5;
  float pattern = smoothstep(radius + 0.05, radius - 0.05, dot);

  fragColor = vec4(vec3(pattern), 1.0);
}`,
}

// ============================================================================
// Export all presets
// ============================================================================

export const SHADER_PRESETS: ShaderPreset[] = [
  // Generators
  gradientShader,
  noiseShader,
  plasmaShader,
  circlesShader,
  wavesShader,
  voronoiShader,

  // Effects
  chromaticAberrationShader,
  pixelateShader,
  vignetteShader,
  glitchShader,
  edgeDetectShader,
  kaleidoscopeShader,

  // Utility
  solidColorShader,
  uvDebugShader,
  passthroughShader,

  // Artistic
  watercolorShader,
  halftoneShader,
]

export function getPresetById(id: string): ShaderPreset | undefined {
  return SHADER_PRESETS.find(p => p.id === id)
}

export function getPresetsByCategory(category: ShaderPreset['category']): ShaderPreset[] {
  return SHADER_PRESETS.filter(p => p.category === category)
}

/**
 * Inject uniform declarations into GLSL code
 * This prepends uniform declarations at the start of the code so that
 * parseUniformsFromCode() can find them. Used when loading preset shaders
 * whose code uses uniforms without declaring them.
 */
export function injectUniformDeclarations(code: string, uniforms: UniformDefinition[]): string {
  if (!uniforms || uniforms.length === 0) return code

  // Generate uniform declarations
  const declarations: string[] = []
  for (const u of uniforms) {
    let glslType: string
    switch (u.type) {
      case 'float':
        glslType = 'float'
        break
      case 'int':
        glslType = 'int'
        break
      case 'vec2':
        glslType = 'vec2'
        break
      case 'vec3':
        glslType = 'vec3'
        break
      case 'vec4':
        glslType = 'vec4'
        break
      case 'sampler2D':
        glslType = 'sampler2D'
        break
      default:
        continue
    }
    declarations.push(`uniform ${glslType} ${u.name};`)
  }

  // Prepend declarations to code
  const declarationBlock = `// Auto-generated uniform declarations\n${declarations.join('\n')}\n\n`
  return declarationBlock + code
}

// Module-level regex for parsing uniform declarations
// Comprehensive regex that matches:
// - Optional precision (lowp, mediump, highp)
// - Type (float, int, bool, vec2-4, mat2-4, sampler2D, etc.)
// - Name (any valid identifier)
// - Optional array size
const UNIFORM_REGEX = /uniform\s+(?:(?:lowp|mediump|highp)\s+)?(float|int|bool|vec2|vec3|vec4|ivec2|ivec3|ivec4|bvec2|bvec3|bvec4|mat2|mat3|mat4|sampler2D|samplerCube)\s+(\w+)(?:\s*\[\s*(\d+)\s*\])?\s*;/gi

// Built-in uniforms that should NOT create input ports
const BUILT_IN_UNIFORMS = new Set([
  'iTime', 'iResolution', 'iMouse', 'iFrame', 'iDate', 'iTimeDelta',
  'iChannel0', 'iChannel1', 'iChannel2', 'iChannel3',
  'iChannelTime', 'iChannelResolution', 'iSampleRate',
  'u_time', 'u_resolution', 'u_mouse', 'u_frame',
  'u_texture', 'u_texture0', 'u_texture1', 'u_texture2', 'u_texture3',
])

/**
 * Parse uniform declarations from GLSL code
 * Robust parser that handles:
 * - Various GLSL syntax variations
 * - Precision qualifiers (lowp, mediump, highp)
 * - Layout qualifiers
 * - Comments (single and multi-line)
 * - Array uniforms
 * - Multiple declarations on one line
 *
 * Returns all user uniforms (u_*) and common custom uniforms
 */
export function parseUniformsFromCode(code: string): UniformDefinition[] {
  const uniforms: UniformDefinition[] = []
  const seenNames = new Set<string>()

  // Remove comments first to avoid false matches
  const cleanCode = code
    // Remove multi-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Remove single-line comments
    .replace(/\/\/.*$/gm, '')

  // Reset lastIndex since module-level regex retains state
  UNIFORM_REGEX.lastIndex = 0

  let match
  while ((match = UNIFORM_REGEX.exec(cleanCode)) !== null) {
    const rawType = match[1].toLowerCase()
    const name = match[2]
    // Note: match[3] contains array size if present (e.g., uniform float arr[4];)
    // Currently we don't support array uniforms, but the regex captures them

    // Skip built-in uniforms
    if (BUILT_IN_UNIFORMS.has(name)) continue

    // Skip if already seen
    if (seenNames.has(name)) continue
    seenNames.add(name)

    // Normalize type
    let type: UniformDefinition['type']
    switch (rawType) {
      case 'float':
        type = 'float'
        break
      case 'int':
      case 'bool':
        type = 'int'
        break
      case 'vec2':
      case 'ivec2':
      case 'bvec2':
        type = 'vec2'
        break
      case 'vec3':
      case 'ivec3':
      case 'bvec3':
        type = 'vec3'
        break
      case 'vec4':
      case 'ivec4':
      case 'bvec4':
        type = 'vec4'
        break
      case 'sampler2d':
        type = 'sampler2D'
        break
      case 'samplercube':
        type = 'samplerCube'
        break
      default:
        // Skip unsupported types like mat2/mat3/mat4
        continue
    }

    // Create human-readable label from name
    // u_myParam -> My Param
    // brightness -> Brightness
    // u_color1 -> Color 1
    const label = name
      .replace(/^u_/, '')
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/(\d+)/g, ' $1')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^./, s => s.toUpperCase())

    // Determine default value and range based on type and name hints
    let defaultValue: number | number[]
    let min: number | undefined
    let max: number | undefined
    let step: number | undefined

    // Try to infer reasonable defaults from name using word-boundary matching
    // to avoid false positives like "collideDamage" matching "col" for color
    const nameLower = name.toLowerCase()

    // Helper to check if a word appears as a complete word in the name
    // Handles: snake_case, camelCase, and whole word matches
    const hasWord = (word: string): boolean => {
      const pattern = new RegExp(`(?:^|_)${word}(?:_|$|\\d)|(?<=[a-z])${word.charAt(0).toUpperCase()}${word.slice(1)}|^${word}$`, 'i')
      return pattern.test(name)
    }

    // More specific matching - prefer full words over partial matches
    const isColor = hasWord('color') || hasWord('colour') || nameLower.includes('rgb') ||
                    nameLower.endsWith('col') || nameLower.startsWith('col_') || nameLower === 'col'
    const isScale = hasWord('scale') || hasWord('zoom')
    const isSpeed = hasWord('speed') || hasWord('velocity')
    const isAngle = hasWord('angle') || hasWord('rotation') || hasWord('rotate')
    const isCount = hasWord('count') || hasWord('number') || hasWord('segments') || hasWord('num')
    const isSize = hasWord('size') || hasWord('radius') || hasWord('thickness') || hasWord('width') || hasWord('height')
    const isIntensity = hasWord('intensity') || hasWord('amount') || hasWord('strength')
    const isOffset = hasWord('offset') || hasWord('position')

    switch (type) {
      case 'float':
        if (isAngle) {
          defaultValue = 0
          min = 0
          max = 6.28318 // 2*PI
          step = 0.01
        } else if (isScale) {
          defaultValue = 1.0
          min = 0.1
          max = 10
          step = 0.1
        } else if (isSpeed) {
          defaultValue = 1.0
          min = 0
          max = 5
          step = 0.1
        } else if (isCount) {
          defaultValue = 5
          min = 1
          max = 20
          step = 1
        } else if (isSize) {
          defaultValue = 0.1
          min = 0.001
          max = 1
          step = 0.01
        } else if (isIntensity) {
          defaultValue = 0.5
          min = 0
          max = 1
          step = 0.01
        } else {
          // Default float: 0-1 range normalized
          defaultValue = 0.5
          min = 0
          max = 1
          step = 0.01
        }
        break

      case 'int':
        if (isCount) {
          defaultValue = 5
          min = 1
          max = 20
          step = 1
        } else {
          defaultValue = 0
          min = 0
          max = 10
          step = 1
        }
        break

      case 'vec2':
        if (isOffset) {
          defaultValue = [0, 0]
        } else if (isScale) {
          defaultValue = [1, 1]
        } else {
          defaultValue = [0.5, 0.5]
        }
        break

      case 'vec3':
        if (isColor) {
          defaultValue = [1, 1, 1] // White
        } else if (isOffset) {
          defaultValue = [0, 0, 0]
        } else if (isScale) {
          defaultValue = [1, 1, 1]
        } else {
          defaultValue = [0.5, 0.5, 0.5]
        }
        break

      case 'vec4':
        if (isColor) {
          defaultValue = [1, 1, 1, 1] // White with full alpha
        } else {
          defaultValue = [0, 0, 0, 1]
        }
        break

      case 'sampler2D':
        defaultValue = 0 // texture unit
        break

      case 'samplerCube':
        defaultValue = 0 // cubemap texture unit
        break
    }

    uniforms.push({
      name,
      type,
      label,
      default: defaultValue,
      min,
      max,
      step,
    })
  }

  return uniforms
}

/**
 * Map GLSL uniform type to node port data type
 */
export function uniformTypeToDataType(uniformType: UniformDefinition['type']): string {
  switch (uniformType) {
    case 'float':
    case 'int':
      return 'number'
    case 'vec2':
    case 'vec3':
    case 'vec4':
      return 'data' // vec types use data (arrays)
    case 'sampler2D':
      return 'texture'
    case 'samplerCube':
      return 'cubemap'
    default:
      return 'any'
  }
}

/**
 * Generate dynamic input ports from parsed uniforms
 */
export function generateInputsFromUniforms(uniforms: UniformDefinition[]): Array<{
  id: string
  type: string
  label: string
  default?: unknown
}> {
  return uniforms.map(u => ({
    id: u.name,
    type: uniformTypeToDataType(u.type),
    label: u.label,
    default: u.default,
  }))
}

/**
 * Generate control definitions from parsed uniforms
 * This creates sliders, color pickers, etc. for the properties panel
 */
export function generateControlsFromUniforms(uniforms: UniformDefinition[]): Array<{
  id: string
  type: string
  label: string
  default: unknown
  props?: Record<string, unknown>
}> {
  return uniforms.map(u => {
    const control: {
      id: string
      type: string
      label: string
      default: unknown
      props?: Record<string, unknown>
    } = {
      id: u.name,
      type: 'slider',
      label: u.label,
      default: u.default,
    }

    switch (u.type) {
      case 'float':
        control.type = 'slider'
        control.props = {
          min: u.min ?? 0,
          max: u.max ?? 1,
          step: u.step ?? 0.01,
        }
        break
      case 'int':
        control.type = 'number'
        control.props = {
          min: u.min ?? 0,
          max: u.max ?? 100,
          step: u.step ?? 1,
        }
        break
      case 'vec2':
        control.type = 'vec2'
        break
      case 'vec3': {
        // Check if it looks like a color using word-boundary matching
        // to avoid false positives like "collideDamage" matching "col"
        const nameLower = u.name.toLowerCase()
        const isColor = /(?:^|_)colou?r(?:_|$|\d)/i.test(u.name) ||
                        nameLower.includes('rgb') ||
                        nameLower.endsWith('col') ||
                        nameLower.startsWith('col_') ||
                        nameLower === 'col'
        if (isColor) {
          control.type = 'color'
        } else {
          control.type = 'vec3'
        }
        break
      }
      case 'vec4':
        control.type = 'color' // vec4 often used for color with alpha
        break
      case 'sampler2D':
        // Texture inputs are handled as input ports, not controls
        control.type = 'hidden'
        break
      case 'samplerCube':
        // Cubemap inputs are handled as input ports, not controls
        control.type = 'hidden'
        break
    }

    return control
  }).filter(c => c.type !== 'hidden')
}
