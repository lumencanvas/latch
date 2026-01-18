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
  type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'int' | 'sampler2D'
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
 * Parse uniform declarations from GLSL code
 * Returns uniforms that start with u_ (user uniforms)
 */
export function parseUniformsFromCode(code: string): UniformDefinition[] {
  const uniforms: UniformDefinition[] = []

  // Match uniform declarations: uniform type name;
  const uniformRegex = /uniform\s+(float|int|vec2|vec3|vec4|sampler2D)\s+(u_\w+)\s*;/g
  let match

  while ((match = uniformRegex.exec(code)) !== null) {
    const type = match[1] as UniformDefinition['type']
    const name = match[2]

    // Create label from name (u_myParam -> My Param)
    const label = name
      .replace(/^u_/, '')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, s => s.toUpperCase())
      .trim()

    let defaultValue: number | number[]
    switch (type) {
      case 'float':
      case 'int':
        defaultValue = 0
        break
      case 'vec2':
        defaultValue = [0, 0]
        break
      case 'vec3':
        defaultValue = [0, 0, 0]
        break
      case 'vec4':
        defaultValue = [0, 0, 0, 1]
        break
      case 'sampler2D':
        defaultValue = 0 // texture unit
        break
      default:
        defaultValue = 0
    }

    uniforms.push({
      name,
      type,
      label,
      default: defaultValue,
      min: type === 'float' ? 0 : undefined,
      max: type === 'float' ? 1 : undefined,
      step: type === 'float' ? 0.01 : undefined,
    })
  }

  return uniforms
}
