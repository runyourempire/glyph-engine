/**
 * Flow texture generation — physics-motivated, per-region flow synthesis.
 *
 * Instead of Sobel gradients on a depth map (which produces flat, uniform
 * bounding-box regions), this system generates organic flow textures using:
 *
 *   - Curl noise for turbulence (eddies, vortices)
 *   - FBM noise for multi-scale variation
 *   - Per-animation-class physics (water channels, fire updraft, sky drift)
 *   - Mask-aware boundary fading (flow decays to zero at region edges)
 *   - Distance-from-edge channel profiles (river center flows faster)
 *
 * Exports:
 *   generateRegionFlows()  — new system: separate flow PNG per animated region
 *   generateFlowMap()      — backwards-compatible combined flow PNG
 *
 * Output encoding: R = flowX, G = flowY, B = 128 (neutral).
 * Flow components map [-1, 1] to [0, 255], so (128, 128) = zero motion.
 */

import sharp from 'sharp';
import type { ImageRecipe, AnimationClass } from './types.js';

// ---------------------------------------------------------------------------
// Noise primitives
// ---------------------------------------------------------------------------

/**
 * Hash-based 2D value noise. Returns values in [-1, 1].
 * Uses the classic sin-hash trick — fast, sufficient for flow textures.
 */
function noise2D(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 2.0 - 1.0;
}

/**
 * Fractional Brownian Motion — layered noise at increasing frequencies.
 * Returns values roughly in [-1, 1] (normalized by total amplitude).
 */
function fbmNoise(
  x: number,
  y: number,
  octaves: number,
  persistence: number
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmp = 0;

  for (let i = 0; i < octaves; i++) {
    value += noise2D(x * frequency, y * frequency) * amplitude;
    maxAmp += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }

  return value / maxAmp;
}

/**
 * 2D curl noise — produces divergence-free (incompressible) flow vectors.
 * This is the key to organic turbulence: the curl of a scalar noise field
 * naturally forms closed eddies and vortices, never sources or sinks.
 *
 * @param x - x coordinate in noise space
 * @param y - y coordinate in noise space
 * @param scale - frequency multiplier (higher = smaller eddies)
 * @param octaves - FBM octave count
 * @param persistence - FBM amplitude decay per octave
 * @returns [flowX, flowY] — perpendicular to the noise gradient
 */
function curlNoise2D(
  x: number,
  y: number,
  scale: number,
  octaves: number = 4,
  persistence: number = 0.5
): [number, number] {
  const eps = 0.01;
  const sx = x * scale;
  const sy = y * scale;

  // Sample FBM at 4 offset points to approximate the gradient
  const n_up = fbmNoise(sx, (sy + eps), octaves, persistence);
  const n_down = fbmNoise(sx, (sy - eps), octaves, persistence);
  const n_right = fbmNoise((sx + eps), sy, octaves, persistence);
  const n_left = fbmNoise((sx - eps), sy, octaves, persistence);

  // Gradient of the noise field
  const dndx = (n_right - n_left) / (2 * eps);
  const dndy = (n_up - n_down) / (2 * eps);

  // Curl = 90-degree rotation of gradient → divergence-free flow
  return [dndy, -dndx];
}

// ---------------------------------------------------------------------------
// Mask utilities
// ---------------------------------------------------------------------------

/**
 * Load a grayscale mask PNG into a normalized Float32Array (0.0-1.0).
 * The mask PNGs from masks.ts are single-channel (grayscale),
 * where 255 = inside region, 0 = outside.
 */
async function loadMaskData(
  maskBuffer: Buffer,
  width: number,
  height: number
): Promise<Float32Array> {
  const { data, info } = await sharp(maskBuffer)
    .resize(width, height, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const mask = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    // Take only the first channel (grayscale value)
    mask[i] = data[i * channels] / 255.0;
  }
  return mask;
}

/**
 * Blur a Float32Array mask in-place using a 3x3 box filter.
 * Multiple passes approximate a Gaussian blur.
 */
function blurField(
  data: Float32Array,
  width: number,
  height: number,
  passes: number
): void {
  const tmp = new Float32Array(data.length);

  for (let pass = 0; pass < passes; pass++) {
    tmp.set(data);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            sum += tmp[(y + dy) * width + (x + dx)];
          }
        }
        data[y * width + x] = sum / 9;
      }
    }
  }
}

/**
 * Compute an approximate distance-from-edge field from a mask.
 * Pixels deep inside the mask get high values (close to 1.0),
 * pixels near the edge get low values. This creates the "channel
 * profile" where river centers flow faster than banks.
 *
 * Uses iterative erosion: each pass shrinks the mask by 1 pixel,
 * and pixels that survive more passes are further from the edge.
 */
function computeEdgeDistance(
  mask: Float32Array,
  width: number,
  height: number
): Float32Array {
  // Start with a blurred version of the mask — this naturally creates
  // a distance-like gradient (interior pixels stay high, edge pixels
  // are pulled toward zero by neighboring background).
  const distance = new Float32Array(mask);

  // Heavy blur (12 passes) creates a smooth distance field
  blurField(distance, width, height, 12);

  // Normalize to [0, 1] within the mask region
  let maxVal = 0;
  for (let i = 0; i < distance.length; i++) {
    if (mask[i] > 0.1 && distance[i] > maxVal) {
      maxVal = distance[i];
    }
  }

  if (maxVal > 0) {
    for (let i = 0; i < distance.length; i++) {
      distance[i] = Math.min(1.0, distance[i] / maxVal);
      // Zero out anything outside the original mask
      if (mask[i] < 0.05) distance[i] = 0;
    }
  }

  return distance;
}

// ---------------------------------------------------------------------------
// Per-animation-class flow synthesis
// ---------------------------------------------------------------------------

/**
 * Water flow: directional base + curl noise turbulence + channel profile.
 *
 * Physics motivation:
 *   - Rivers flow in a dominant direction (from recipe)
 *   - Turbulence creates eddies along the flow path (curl noise)
 *   - Flow is fastest at the channel center, zero at banks (distance field)
 *   - Depth gradients accelerate downhill flow
 */
function synthesizeWaterFlow(
  mask: Float32Array,
  depthData: Float32Array,
  direction: [number, number],
  speed: number,
  width: number,
  height: number
): { flowX: Float32Array; flowY: Float32Array } {
  const flowX = new Float32Array(width * height);
  const flowY = new Float32Array(width * height);

  const edgeDist = computeEdgeDistance(mask, width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask[i] < 0.01) continue;

      const nx = x / width;
      const ny = y / height;

      // Channel profile: flow peaks at center, zero at edges
      const profile = Math.pow(edgeDist[i], 0.7);

      // Curl noise turbulence (scale 3-5 for medium eddies)
      const [curlX, curlY] = curlNoise2D(nx, ny, 4.0, 4, 0.5);
      const turbulenceStrength = 0.25;

      // Depth gradient acceleration — steeper = faster
      let depthAccel = 1.0;
      if (x > 0 && x < width - 1 && y > 0 && y < height - 1) {
        const gx = (depthData[i + 1] - depthData[i - 1]) * 0.5;
        const gy = (depthData[i + width] - depthData[i - width]) * 0.5;
        const gradMag = Math.sqrt(gx * gx + gy * gy);
        depthAccel = 1.0 + gradMag * 3.0; // boost flow on slopes
      }

      // Combine: base direction + curl turbulence, scaled by channel profile
      const baseX = direction[0] + curlX * turbulenceStrength;
      const baseY = direction[1] + curlY * turbulenceStrength;

      flowX[i] = baseX * speed * profile * depthAccel * mask[i];
      flowY[i] = baseY * speed * profile * depthAccel * mask[i];
    }
  }

  return { flowX, flowY };
}

/**
 * Waterfall flow: strong downward + high-frequency turbulence + impact zone.
 *
 * Physics motivation:
 *   - Gravity pulls water straight down
 *   - Cascade turbulence is high-frequency and chaotic
 *   - Bottom impact zone: water spreads outward in all directions
 *   - Side flanks: light mist drifts upward
 */
function synthesizeWaterfallFlow(
  mask: Float32Array,
  depthData: Float32Array,
  width: number,
  height: number
): { flowX: Float32Array; flowY: Float32Array } {
  const flowX = new Float32Array(width * height);
  const flowY = new Float32Array(width * height);

  // Find vertical extent of the mask to determine impact zone
  let maskMinY = height;
  let maskMaxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] > 0.1) {
        maskMinY = Math.min(maskMinY, y);
        maskMaxY = Math.max(maskMaxY, y);
      }
    }
  }
  const maskHeight = maskMaxY - maskMinY || 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask[i] < 0.01) continue;

      const nx = x / width;
      const ny = y / height;

      // Vertical position within the waterfall (0 = top, 1 = bottom)
      const verticalT = Math.max(0, Math.min(1, (y - maskMinY) / maskHeight));

      // High-frequency curl noise for cascade turbulence
      const [curlX, curlY] = curlNoise2D(nx, ny, 7.0, 5, 0.6);

      let fx: number;
      let fy: number;

      if (verticalT > 0.7) {
        // Impact zone (bottom 30%): chaotic, outward splash
        const impactT = (verticalT - 0.7) / 0.3;
        const chaosScale = 0.5 + impactT * 0.5;

        // Higher turbulence magnitude in impact zone
        const [impactCurlX, impactCurlY] = curlNoise2D(
          nx + 3.7, ny + 2.1, 10.0, 5, 0.55
        );

        fx = impactCurlX * chaosScale * 0.8;
        fy = curlY * chaosScale * 0.3 + 0.2 * (1 - impactT); // decreasing downward, some chaos
      } else {
        // Main cascade: strong downward + lateral turbulence
        fx = curlX * 0.15;
        fy = 0.85 + curlY * 0.1; // strong downward (positive Y = down in UV)
      }

      // Side flanks: slight upward mist
      const edgeDist = computeEdgeDistanceSingle(mask, x, y, width, height);
      if (edgeDist < 0.3 && verticalT > 0.5) {
        const mistStrength = (1.0 - edgeDist / 0.3) * 0.2;
        fy -= mistStrength; // upward mist at edges
      }

      const magnitude = 0.6 + verticalT * 0.4; // accelerates as it falls
      flowX[i] = fx * magnitude * mask[i];
      flowY[i] = fy * magnitude * mask[i];
    }
  }

  return { flowX, flowY };
}

/**
 * Quick single-pixel edge distance estimate.
 * Samples a small neighborhood to find the nearest mask edge.
 */
function computeEdgeDistanceSingle(
  mask: Float32Array,
  px: number,
  py: number,
  width: number,
  height: number
): number {
  const radius = 15;
  let minDist = radius;

  for (let dy = -radius; dy <= radius; dy += 2) {
    for (let dx = -radius; dx <= radius; dx += 2) {
      const sx = px + dx;
      const sy = py + dy;
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;

      if (mask[sy * width + sx] < 0.1) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) minDist = dist;
      }
    }
  }

  return minDist / radius; // 0 = at edge, 1 = deep inside
}

/**
 * Sky flow: smooth directional drift with large-scale deformation.
 *
 * Physics motivation:
 *   - Clouds drift uniformly in wind direction
 *   - Large-scale noise creates slow directional variation (cloud groups)
 *   - Very low frequency, very smooth — no turbulence
 */
function synthesizeSkyFlow(
  mask: Float32Array,
  direction: [number, number],
  speed: number,
  width: number,
  height: number
): { flowX: Float32Array; flowY: Float32Array } {
  const flowX = new Float32Array(width * height);
  const flowY = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask[i] < 0.01) continue;

      const nx = x / width;
      const ny = y / height;

      // Large-scale directional variation (slowly varying wind)
      const windVar = fbmNoise(nx * 0.8, ny * 0.8, 3, 0.4);
      const angleOffset = windVar * 0.3; // subtle direction wander

      // Rotate base direction by the angle offset
      const cos = Math.cos(angleOffset);
      const sin = Math.sin(angleOffset);
      const dirX = direction[0] * cos - direction[1] * sin;
      const dirY = direction[0] * sin + direction[1] * cos;

      // Very gentle magnitude variation
      const magVar = 0.8 + fbmNoise(nx * 0.5 + 7.3, ny * 0.5 + 2.1, 2, 0.3) * 0.2;

      const magnitude = speed * 0.3 * magVar;
      flowX[i] = dirX * magnitude * mask[i];
      flowY[i] = dirY * magnitude * mask[i];
    }
  }

  return { flowX, flowY };
}

/**
 * Fire flow: upward convection + high-frequency lateral flicker.
 *
 * Physics motivation:
 *   - Hot gas rises (strong upward component)
 *   - Turbulent combustion creates chaotic lateral flicker
 *   - Fire center is more laminar (stronger upward), edges are chaotic
 *   - High-frequency noise for flickering tongue shapes
 */
function synthesizeFireFlow(
  mask: Float32Array,
  depthData: Float32Array,
  width: number,
  height: number
): { flowX: Float32Array; flowY: Float32Array } {
  const flowX = new Float32Array(width * height);
  const flowY = new Float32Array(width * height);

  const edgeDist = computeEdgeDistance(mask, width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask[i] < 0.01) continue;

      const nx = x / width;
      const ny = y / height;

      // Center vs edge: fire center is more laminar
      const centeredness = Math.pow(edgeDist[i], 0.5);

      // High-frequency curl noise for lateral flicker (scale 8-12)
      const [flickerX, flickerY] = curlNoise2D(nx, ny, 10.0, 5, 0.55);

      // Secondary noise layer at different scale for asymmetry
      const [chaos2X, chaos2Y] = curlNoise2D(
        nx + 5.1, ny + 3.7, 6.0, 3, 0.5
      );

      // Upward base: stronger at center, chaotic at edges
      const upwardStrength = 0.7 * (0.5 + centeredness * 0.5);

      // Lateral flicker: stronger at edges
      const lateralStrength = 0.4 * (1.0 - centeredness * 0.6);

      const fx = flickerX * lateralStrength + chaos2X * 0.15;
      const fy = -upwardStrength + flickerY * 0.1 + chaos2Y * 0.08;

      const magnitude = 0.5 + centeredness * 0.3;
      flowX[i] = fx * magnitude * mask[i];
      flowY[i] = fy * magnitude * mask[i];
    }
  }

  return { flowX, flowY };
}

/**
 * Smoke flow: upward drift with medium turbulence, slower than fire.
 *
 * Physics motivation:
 *   - Smoke rises (buoyant) but slower than fire
 *   - Medium-scale turbulence (larger eddies than fire)
 *   - Wind influence is stronger (smoke is carried by air currents)
 *   - Dissipates and spreads at the top
 */
function synthesizeSmokeFlow(
  mask: Float32Array,
  direction: [number, number],
  speed: number,
  width: number,
  height: number
): { flowX: Float32Array; flowY: Float32Array } {
  const flowX = new Float32Array(width * height);
  const flowY = new Float32Array(width * height);

  const edgeDist = computeEdgeDistance(mask, width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask[i] < 0.01) continue;

      const nx = x / width;
      const ny = y / height;

      // Medium-scale curl noise for billowing
      const [curlX, curlY] = curlNoise2D(nx, ny, 3.5, 4, 0.5);

      // Upward drift
      const upward = -0.35;

      // Wind influence blends with upward direction
      const windBlend = 0.3;
      const fx = direction[0] * windBlend * speed + curlX * 0.25;
      const fy = upward + direction[1] * windBlend * speed * 0.3 + curlY * 0.15;

      const magnitude = 0.3 + edgeDist[i] * 0.2;
      flowX[i] = fx * magnitude * mask[i];
      flowY[i] = fy * magnitude * mask[i];
    }
  }

  return { flowX, flowY };
}

/**
 * Vegetation flow: barely-perceptible wind sway.
 *
 * Physics motivation:
 *   - Vegetation sways gently in the wind
 *   - Large-scale sinusoidal pattern (coherent wind gusts)
 *   - Mostly horizontal, very low magnitude
 *   - Nearly imperceptible — shader warp does the heavy lifting
 */
function synthesizeVegetationFlow(
  mask: Float32Array,
  width: number,
  height: number
): { flowX: Float32Array; flowY: Float32Array } {
  const flowX = new Float32Array(width * height);
  const flowY = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask[i] < 0.01) continue;

      const nx = x / width;
      const ny = y / height;

      // Large-scale sinusoidal wind pattern
      const windPhase = nx * 2.5 + ny * 0.5;
      const windX = Math.sin(windPhase * Math.PI) * 0.06;
      const windY = Math.sin(windPhase * Math.PI * 0.7 + 1.3) * 0.02;

      // Tiny amount of noise for organic variation
      const noiseX = fbmNoise(nx * 2.0, ny * 2.0, 2, 0.4) * 0.02;
      const noiseY = fbmNoise(nx * 2.0 + 5.5, ny * 2.0, 2, 0.4) * 0.01;

      flowX[i] = (windX + noiseX) * mask[i];
      flowY[i] = (windY + noiseY) * mask[i];
    }
  }

  return { flowX, flowY };
}

// ---------------------------------------------------------------------------
// Flow field post-processing
// ---------------------------------------------------------------------------

/**
 * Blur the X and Y flow channels independently.
 * Smooths harsh transitions between regions and noise artifacts.
 */
function blurFlowField(
  flowX: Float32Array,
  flowY: Float32Array,
  width: number,
  height: number,
  passes: number
): void {
  blurField(flowX, width, height, passes);
  blurField(flowY, width, height, passes);
}

/**
 * Encode flow vectors to an RGB PNG buffer.
 * R = flowX mapped from [-1, 1] to [0, 255]
 * G = flowY mapped from [-1, 1] to [0, 255]
 * B = 128 (neutral, reserved for future use)
 */
async function encodeFlowToPng(
  flowX: Float32Array,
  flowY: Float32Array,
  width: number,
  height: number
): Promise<Buffer> {
  const rgb = Buffer.alloc(width * height * 3);

  for (let i = 0; i < width * height; i++) {
    // Clamp to [-1, 1] then map to [0, 255]
    const fx = Math.max(-1, Math.min(1, flowX[i]));
    const fy = Math.max(-1, Math.min(1, flowY[i]));
    rgb[i * 3 + 0] = Math.round((fx * 0.5 + 0.5) * 255);
    rgb[i * 3 + 1] = Math.round((fy * 0.5 + 0.5) * 255);
    rgb[i * 3 + 2] = 128;
  }

  return sharp(rgb, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Waterfall detection
// ---------------------------------------------------------------------------

/**
 * Determine whether a water region represents a waterfall (strong downward flow).
 * Uses the same heuristic as generate-game.ts scene classification.
 */
function isWaterfallRegion(region: ImageRecipe['regions'][0]): boolean {
  const [, dy] = region.flow_direction;
  return Math.abs(dy) > 0.7 && region.flow_speed > 0.4;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate per-region flow textures with physics-motivated flow patterns.
 *
 * Each animated region gets its own flow PNG, with flow synthesis matched
 * to the animation class (water, sky, fire, etc.). Flow naturally fades
 * to zero at mask boundaries.
 *
 * @param depthData    - Normalized depth values (0.0-1.0), width*height elements
 * @param maskBuffers  - Map of mask name (e.g. "mask_water") to PNG buffer
 * @param width        - Texture width in pixels
 * @param height       - Texture height in pixels
 * @param recipe       - Image analysis recipe with region definitions
 * @returns Map of flow name (e.g. "flow_water") to PNG buffer
 */
export async function generateRegionFlows(
  depthData: Float32Array,
  maskBuffers: Map<string, Buffer>,
  width: number,
  height: number,
  recipe: ImageRecipe
): Promise<Map<string, Buffer>> {
  console.log('[flowmap] Generating per-region flow textures...');
  const regionFlows = new Map<string, Buffer>();

  // Group regions by animation class (same grouping as masks.ts)
  const regionsByClass = new Map<AnimationClass, ImageRecipe['regions']>();
  for (const region of recipe.regions) {
    const cls = region.animation_class;
    if (cls === 'static') continue;
    const existing = regionsByClass.get(cls) || [];
    existing.push(region);
    regionsByClass.set(cls, existing);
  }

  for (const [animClass, regions] of regionsByClass) {
    const maskKey = `mask_${animClass}`;
    const maskBuffer = maskBuffers.get(maskKey);
    if (!maskBuffer) {
      console.log(`  - Skipping ${animClass}: no mask found (${maskKey})`);
      continue;
    }

    console.log(`  - Synthesizing flow for: ${animClass}`);
    const mask = await loadMaskData(maskBuffer, width, height);

    // Use the first region's parameters as representative
    // (multiple regions of same class share the mask anyway)
    const primary = regions[0];
    let result: { flowX: Float32Array; flowY: Float32Array };
    let blurPasses: number;

    switch (animClass) {
      case 'water': {
        // Detect waterfall vs normal water flow
        if (isWaterfallRegion(primary)) {
          console.log('    → Waterfall flow pattern detected');
          result = synthesizeWaterfallFlow(mask, depthData, width, height);
          blurPasses = 2;
        } else {
          result = synthesizeWaterFlow(
            mask, depthData,
            primary.flow_direction, primary.flow_speed,
            width, height
          );
          blurPasses = 3;
        }
        break;
      }

      case 'sky': {
        result = synthesizeSkyFlow(
          mask,
          primary.flow_direction, primary.flow_speed,
          width, height
        );
        blurPasses = 6; // extra smooth for clouds
        break;
      }

      case 'fire': {
        result = synthesizeFireFlow(mask, depthData, width, height);
        blurPasses = 1; // minimal smoothing — fire should be sharp
        break;
      }

      case 'smoke': {
        result = synthesizeSmokeFlow(
          mask,
          primary.flow_direction, primary.flow_speed,
          width, height
        );
        blurPasses = 4; // medium smooth
        break;
      }

      case 'vegetation': {
        result = synthesizeVegetationFlow(mask, width, height);
        blurPasses = 2;
        break;
      }

      default: {
        console.log(`    → Unknown animation class: ${animClass}, skipping`);
        continue;
      }
    }

    // Post-process: smooth the flow field
    blurFlowField(result.flowX, result.flowY, width, height, blurPasses);

    // Encode to PNG
    const png = await encodeFlowToPng(result.flowX, result.flowY, width, height);
    const flowName = `flow_${animClass}`;
    regionFlows.set(flowName, png);
    console.log(`    → ${flowName}: ${(png.length / 1024).toFixed(0)}KB`);
  }

  return regionFlows;
}

/**
 * Generate a combined flow map (backwards-compatible API).
 *
 * Delegates to generateRegionFlows() internally, then composites all
 * per-region flows into a single texture. This preserves the old interface
 * for existing .glyph templates that reference a single "flow" texture.
 *
 * Where regions overlap, the flow with higher magnitude wins (max blend).
 */
export async function generateFlowMap(
  depthData: Float32Array,
  width: number,
  height: number,
  recipe: ImageRecipe,
  maskBuffers?: Map<string, Buffer>
): Promise<Buffer> {
  // If masks are provided, use the full per-region system
  if (maskBuffers && maskBuffers.size > 0) {
    const regionFlows = await generateRegionFlows(
      depthData, maskBuffers, width, height, recipe
    );
    return compositeFlows(regionFlows, width, height);
  }

  // Fallback: generate synthetic masks from recipe bounds and then synthesize.
  // This preserves backwards compatibility when called without masks.
  console.log('[flowmap] No masks provided — generating from recipe bounds');
  const syntheticMasks = await generateSyntheticMasks(
    depthData, width, height, recipe
  );
  const regionFlows = await generateRegionFlows(
    depthData, syntheticMasks, width, height, recipe
  );
  return compositeFlows(regionFlows, width, height);
}

/**
 * Composite multiple per-region flow PNGs into a single combined flow texture.
 * Uses max-magnitude blending: at each pixel, the flow with the strongest
 * magnitude wins. This prevents conflicting flows from canceling out.
 */
async function compositeFlows(
  regionFlows: Map<string, Buffer>,
  width: number,
  height: number
): Promise<Buffer> {
  const combinedX = new Float32Array(width * height);
  const combinedY = new Float32Array(width * height);
  const combinedMag = new Float32Array(width * height);

  for (const [, flowPng] of regionFlows) {
    // Decode the flow PNG back to vectors
    const { data } = await sharp(flowPng)
      .raw()
      .toBuffer({ resolveWithObject: true });

    for (let i = 0; i < width * height; i++) {
      const fx = (data[i * 3 + 0] / 255.0 - 0.5) * 2.0;
      const fy = (data[i * 3 + 1] / 255.0 - 0.5) * 2.0;
      const mag = Math.sqrt(fx * fx + fy * fy);

      // Max-magnitude wins
      if (mag > combinedMag[i]) {
        combinedX[i] = fx;
        combinedY[i] = fy;
        combinedMag[i] = mag;
      }
    }
  }

  return encodeFlowToPng(combinedX, combinedY, width, height);
}

/**
 * Generate synthetic mask buffers from recipe bounding boxes and depth data.
 * This is the fallback path when generateFlowMap() is called without
 * pre-generated masks (backwards compatibility).
 */
async function generateSyntheticMasks(
  depthData: Float32Array,
  width: number,
  height: number,
  recipe: ImageRecipe
): Promise<Map<string, Buffer>> {
  const masks = new Map<string, Buffer>();

  // Group regions by animation class
  const regionsByClass = new Map<AnimationClass, ImageRecipe['regions']>();
  for (const region of recipe.regions) {
    if (region.animation_class === 'static') continue;
    const existing = regionsByClass.get(region.animation_class) || [];
    existing.push(region);
    regionsByClass.set(region.animation_class, existing);
  }

  for (const [animClass, regions] of regionsByClass) {
    const maskData = new Float32Array(width * height);

    for (const region of regions) {
      const { bounds, depth_hint } = region;
      const feather = 0.05;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const nx = x / width;
          const ny = y / height;
          const i = y * width + x;

          // Bounds check with feather
          if (nx < bounds.x - feather || nx > bounds.x + bounds.width + feather) continue;
          if (ny < bounds.y - feather || ny > bounds.y + bounds.height + feather) continue;

          // Edge fade
          const edgeX = Math.min(
            Math.max(0, nx - bounds.x) / feather,
            Math.max(0, bounds.x + bounds.width - nx) / feather,
            1.0
          );
          const edgeY = Math.min(
            Math.max(0, ny - bounds.y) / feather,
            Math.max(0, bounds.y + bounds.height - ny) / feather,
            1.0
          );
          const edgeFade = Math.min(edgeX, edgeY);

          // Depth similarity
          const depthDiff = Math.abs(depthData[i] - depth_hint);
          const depthWeight = Math.max(0.15, 1.0 - depthDiff * 0.8);

          maskData[i] = Math.max(maskData[i], edgeFade * depthWeight);
        }
      }
    }

    // Blur for soft edges
    blurField(maskData, width, height, 4);

    // Encode to grayscale PNG
    const grayscale = Buffer.alloc(width * height);
    for (let i = 0; i < width * height; i++) {
      grayscale[i] = Math.round(Math.max(0, Math.min(255, maskData[i] * 255)));
    }

    const png = await sharp(grayscale, { raw: { width, height, channels: 1 } })
      .png()
      .toBuffer();

    masks.set(`mask_${animClass}`, png);
  }

  return masks;
}
