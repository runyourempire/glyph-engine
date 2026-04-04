/**
 * .game source code generator — Living World Compositing approach.
 *
 * Hybrid strategy:
 * - Water & sky regions: DISTORT the actual photo pixels (visible flow/drift)
 * - Atmospheric overlays: procedural noise ON TOP (mist, light, god rays)
 * The photo is the world — life comes from selective distortion + atmosphere.
 */

import type { ImageRecipe } from './types.js';

interface GenerateOptions {
  imageName: string;
  outputDir: string;
  maskNames: string[];
  hasWater: boolean;
  hasSky: boolean;
  hasVegetation: boolean;
  baseName: string;
}

/**
 * Generate .game source code using Living World Compositing.
 */
export function generateGameSource(recipe: ImageRecipe, opts: GenerateOptions): string {
  const { imageName, baseName, hasWater, hasSky, hasVegetation } = opts;
  const componentName = `living-${baseName}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase();

  // Derive scene parameters from recipe
  const windX = recipe.global_wind_direction[0] * 0.025;
  const windY = recipe.global_wind_direction[1] * 0.005;
  const sunPos = recipe.sun_position ?? estimateSunPosition(recipe);
  const colorTemp = recipe.color_temp ?? 'neutral';
  const timeOfDay = recipe.time_of_day ?? 'day';
  const intensity = recipe.ambient_motion_intensity ?? 0.3;

  // Color tints based on time of day / color temperature
  const mistTint = getMistTint(colorTemp, timeOfDay);
  const lightTint = getLightTint(colorTemp, timeOfDay);
  const rayTint = getRayTint(colorTemp, timeOfDay);

  // Scale factor: intensity 0.3 = normal, 0.5 = dramatic
  const s = 0.7 + intensity; // range ~0.8 to 1.2

  const lines: string[] = [];
  lines.push(`// Living World — AI-generated atmospheric compositing`);
  lines.push(`// Scene: ${recipe.scene_type}`);
  lines.push(`// Hybrid: real pixel motion (water/sky) + procedural atmosphere`);
  lines.push('');
  lines.push(`cinematic "${componentName}" {`);

  // Texture declarations
  lines.push(`  texture "photo" from "${imageName}"`);
  lines.push(`  texture "depth" from "${baseName}-depth.png"`);
  if (hasWater) {
    lines.push(`  texture "flow" from "${baseName}-flow.png"`);
    lines.push(`  texture "mask_water" from "${baseName}-mask_water.png"`);
  }
  if (hasSky) {
    lines.push(`  texture "mask_sky" from "${baseName}-mask_sky.png"`);
  }

  lines.push('');

  // Config
  lines.push('  layer config {');
  lines.push(`    drift_x: ${windX.toFixed(5)}`);
  lines.push(`    drift_y: ${windY.toFixed(5)}`);
  lines.push('  }');
  lines.push('');

  // ═══ LAYER 1: THE WORLD — photo with depth parallax ═══
  lines.push('  // The world — photo with gentle depth parallax');
  lines.push('  layer world {');
  lines.push(`    parallax("photo", depth: "depth", strength: ${(0.035 * s).toFixed(3)}, orbit_speed: 0.18)`);
  lines.push('  }');

  // ═══ LAYER 2: WATER FLOW (distort actual photo pixels) ═══
  if (hasWater) {
    const waterRegion = recipe.regions.find(r => r.animation_class === 'water');
    const flowSpeed = waterRegion?.flow_speed ?? 0.3;
    lines.push('');
    lines.push('  // Water flow — distort actual photo pixels in the river');
    lines.push(`  layer water_flow opacity: 0.95 {`);
    lines.push(`    distort(scale: 2.0, speed: ${(1.5 + flowSpeed).toFixed(1)}, strength: ${(0.08 * s).toFixed(3)})`);
    lines.push('    | sample("photo")');
    lines.push('    | mask("mask_water")');
    lines.push('  }');

    // Water caustics — light shimmer overlay
    lines.push('');
    lines.push('  // Water caustics — voronoi shimmer composited as light');
    lines.push(`  layer caustics opacity: ${(0.30 * s).toFixed(2)} blend: screen {`);
    lines.push(`    translate(time * ${(0.08 * s).toFixed(3)}, time * ${(0.04 * s).toFixed(3)})`);
    lines.push(`    | warp(scale: 4.5, octaves: 3, strength: ${(0.22 * s).toFixed(2)})`);
    lines.push('    | voronoi(10.0)');
    lines.push('    | glow(2.5)');
    lines.push('    | tint(0.5, 0.75, 1.0)');
    lines.push('    | mask("mask_water")');
    lines.push('  }');

    // Water sparkle
    lines.push('');
    lines.push('  // Water sparkle — golden light catching the surface');
    lines.push(`  layer sparkle opacity: ${(0.15 * s).toFixed(2)} blend: add {`);
    lines.push(`    translate(time * ${(0.10 * s).toFixed(3)}, time * ${(0.05 * s).toFixed(3)})`);
    lines.push(`    | distort(scale: 8.0, speed: 2.0, strength: 0.5)`);
    lines.push('    | voronoi(18.0)');
    lines.push('    | glow(4.0)');
    lines.push(`    | tint(${rayTint})`);
    lines.push('    | mask("mask_water")');
    lines.push('  }');
  }

  // ═══ LAYER 3: SKY DRIFT (distort actual photo pixels) ═══
  if (hasSky) {
    lines.push('');
    lines.push('  // Sky drift — actual cloud movement');
    lines.push('  layer sky_drift opacity: 0.88 {');
    lines.push(`    distort(scale: 0.3, speed: ${(0.12 * s).toFixed(2)}, strength: ${(0.03 * s).toFixed(3)})`);
    lines.push('    | sample("photo")');
    lines.push('    | mask("mask_sky")');
    lines.push('  }');
  }

  // ═══ LAYER 4: ATMOSPHERIC MIST (always) ═══
  lines.push('');
  lines.push('  // Atmospheric mist — drifting valley fog');
  lines.push(`  layer mist opacity: ${(0.20 * s).toFixed(2)} blend: screen {`);
  lines.push(`    translate(time * drift_x, sin(time * 0.08) * ${(0.015 * s).toFixed(3)})`);
  lines.push(`    | warp(scale: 0.8, octaves: 5, persistence: 0.65, strength: ${(0.22 * s).toFixed(2)})`);
  lines.push('    | fbm(scale: 1.2, octaves: 5, persistence: 0.55)');
  lines.push('    | glow(1.2)');
  lines.push(`    | tint(${mistTint})`);
  if (hasSky) {
    lines.push('    | mask("depth", invert: 1)');
  }
  lines.push('  }');

  // ═══ LAYER 5: LIGHT VARIATION (always) ═══
  lines.push('');
  lines.push('  // Light sweep — cloud shadow modulation');
  lines.push(`  layer light_pulse opacity: ${(0.18 * s).toFixed(2)} blend: screen {`);
  lines.push(`    translate(time * ${(0.015 * s).toFixed(3)}, time * ${(0.004 * s).toFixed(3)})`);
  lines.push(`    | warp(scale: 0.4, octaves: 3, persistence: 0.5, strength: ${(0.14 * s).toFixed(2)})`);
  lines.push('    | fbm(scale: 0.35, octaves: 4, persistence: 0.5)');
  lines.push('    | glow(1.5)');
  lines.push(`    | tint(${lightTint})`);
  lines.push('  }');

  // ═══ LAYER 6: GOD RAYS (when sun visible) ═══
  const showRays = sunPos !== null || timeOfDay === 'golden_hour' || timeOfDay === 'dawn' || timeOfDay === 'dusk';
  if (showRays) {
    const sx = sunPos ? sunPos[0].toFixed(2) : '0.0';
    const sy = sunPos ? sunPos[1].toFixed(2) : '0.35';
    lines.push('');
    lines.push('  // God rays — light shafts from brightest point');
    lines.push(`  layer godrays opacity: ${(0.25 * s).toFixed(2)} blend: add {`);
    lines.push(`    translate(${sx}, ${sy})`);
    lines.push('    | polar()');
    lines.push(`    | distort(scale: 0.25, speed: ${(0.08 * s).toFixed(2)}, strength: ${(0.04 * s).toFixed(3)})`);
    lines.push('    | radial_fade(inner: 0.0, outer: 0.50)');
    lines.push('    | glow(5.0)');
    lines.push(`    | tint(${rayTint})`);
    lines.push('  }');
  }

  // ═══ POST-PROCESSING ═══
  lines.push('');
  lines.push('  // Cinematic post-processing');
  lines.push('  pass soften { blur(0.7) }');
  lines.push('  pass frame { vignette(0.22) }');
  lines.push('  pass film { film_grain(0.018) }');

  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

/** Estimate sun position from region analysis when not explicitly provided */
function estimateSunPosition(recipe: ImageRecipe): [number, number] | null {
  const skyRegion = recipe.regions.find(r => r.animation_class === 'sky');
  if (!skyRegion) return null;
  return [
    skyRegion.bounds.x + skyRegion.bounds.width * 0.5 - 0.5,
    (skyRegion.bounds.y + skyRegion.bounds.height * 0.3) * 2.0 - 1.0,
  ];
}

/** Mist color tint based on scene lighting */
function getMistTint(colorTemp: string, timeOfDay: string): string {
  if (timeOfDay === 'golden_hour' || timeOfDay === 'dawn') return '0.92, 0.88, 0.82';
  if (timeOfDay === 'dusk') return '0.75, 0.7, 0.85';
  if (timeOfDay === 'night') return '0.5, 0.55, 0.7';
  if (colorTemp === 'warm') return '0.85, 0.82, 0.78';
  if (colorTemp === 'cool') return '0.75, 0.82, 0.95';
  return '0.8, 0.85, 0.95';
}

/** Light variation tint */
function getLightTint(colorTemp: string, timeOfDay: string): string {
  if (timeOfDay === 'golden_hour' || timeOfDay === 'dawn') return '1.0, 0.88, 0.65';
  if (timeOfDay === 'dusk') return '0.9, 0.75, 0.85';
  if (timeOfDay === 'night') return '0.6, 0.65, 0.85';
  if (colorTemp === 'warm') return '1.0, 0.9, 0.7';
  return '0.95, 0.9, 0.8';
}

/** God ray / sparkle tint */
function getRayTint(colorTemp: string, timeOfDay: string): string {
  if (timeOfDay === 'golden_hour' || timeOfDay === 'dawn') return '1.0, 0.88, 0.55';
  if (timeOfDay === 'dusk') return '1.0, 0.75, 0.6';
  if (timeOfDay === 'night') return '0.7, 0.75, 1.0';
  if (colorTemp === 'warm') return '1.0, 0.92, 0.78';
  return '1.0, 0.95, 0.85';
}
