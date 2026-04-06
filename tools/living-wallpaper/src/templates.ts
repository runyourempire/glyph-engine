/**
 * Scene Template Library — hand-crafted layer architectures per phenomenon.
 *
 * Each template defines the UNIQUE layer structure for a specific scene type.
 * The code generator selects a template and fills in measured parameters.
 * Templates are the artistic intelligence; parameters are the data.
 */

import type { SceneType, VideoMotionDescriptor, VideoRegionMotion, ImageRecipe } from './types.js';

interface TemplateContext {
  componentName: string;
  baseName: string;
  imageName: string;
  hasWater: boolean;
  hasSky: boolean;
  hasVegetation: boolean;
  hasFire: boolean;
  /** Intensity scale factor (0.8–1.2) */
  s: number;
  /** Wind drift X */
  windX: number;
  /** Wind drift Y */
  windY: number;
  /** Color temp classification */
  colorTemp: string;
  /** Time of day */
  timeOfDay: string;
  /** Per-region video motion data (if available) */
  regionMotion?: Map<string, VideoRegionMotion>;
}

type TemplateGenerator = (ctx: TemplateContext) => string;

/** Get region motion data or defaults */
function getMotion(ctx: TemplateContext, animClass: string): VideoRegionMotion {
  if (ctx.regionMotion) {
    for (const [, motion] of ctx.regionMotion) {
      if (motion.animation_class === animClass) return motion;
    }
  }
  // Defaults when no video data
  return {
    name: animClass,
    animation_class: animClass as any,
    motion_type: 'static',
    flow_direction: [1, 0],
    flow_speed: 0.2,
    flow_turbulence: 0.3,
    dominant_freq_hz: 0.1,
    game_angular_freq: 0.63,
    oscillation_amplitude: 0.02,
    derived_fbm_persistence: 0.55,
    derived_fbm_octaves: 4,
    derived_distort_strength: 0.02,
    mean_color: [0.5, 0.5, 0.5],
    color_shift_amplitude: 0.05,
  };
}

// ════════════════════════════════════════════════════════════════
// TEMPLATE: AURORA BOREALIS
// ════════════════════════════════════════════════════════════════
const auroraTemplate: TemplateGenerator = (ctx) => {
  const { componentName, baseName, imageName, s } = ctx;
  return `// Living World — Aurora Borealis
// Three-layer aurora light, twinkling stars, snow reflection, cold air
// Template: aurora | Intensity: ${s.toFixed(2)}

cinematic "${componentName}" {
  texture "photo" from "${imageName}"
  texture "depth" from "${baseName}-depth.png"
  texture "mask_sky" from "${baseName}-mask_sky.png"
  texture "flow_sky" from "${baseName}-flow_sky.png"

  layer world {
    parallax("photo", depth: "depth", strength: ${(0.025 * s).toFixed(3)}, orbit_speed: 0.08)
  }

  layer sky_base opacity: 0.88 {
    flowmap("photo", "flow_sky", speed: ${(0.04 * s).toFixed(2)}, scale: ${(0.008 * s).toFixed(3)})
    | mask("mask_sky")
  }

  layer aurora_green opacity: ${(0.28 * s).toFixed(2)} blend: add {
    translate(time * ${(0.025 * s).toFixed(3)}, time * 0.004)
    | warp(scale: 0.5, octaves: 5, persistence: 0.70, strength: 0.35)
    | fbm(scale: 0.7, octaves: 5, persistence: 0.60)
    | glow(2.5)
    | tint(0.3, 1.0, 0.5)
    | mask("mask_sky")
  }

  layer aurora_purple opacity: ${(0.22 * s).toFixed(2)} blend: add {
    translate(time * ${(0.018 * s).toFixed(3)}, time * -0.006)
    | warp(scale: 0.4, octaves: 4, persistence: 0.65, strength: 0.28)
    | fbm(scale: 0.55, octaves: 4, persistence: 0.55)
    | glow(3.5)
    | tint(0.65, 0.25, 1.0)
    | mask("mask_sky")
  }

  layer aurora_shimmer opacity: ${(0.16 * s).toFixed(2)} blend: add {
    translate(time * ${(0.04 * s).toFixed(3)}, time * 0.012)
    | distort(scale: 0.8, speed: 0.25, strength: 0.06)
    | warp(scale: 1.2, octaves: 3, strength: 0.22)
    | voronoi(5.0)
    | glow(5.0)
    | tint(0.35, 0.95, 0.55)
    | mask("mask_sky")
  }

  layer stars opacity: ${(0.14 * s).toFixed(2)} blend: add {
    translate(time * 0.001, time * 0.0003)
    | distort(scale: 18.0, speed: 2.5, strength: 0.12)
    | voronoi(35.0)
    | glow(10.0)
    | tint(0.92, 0.95, 1.0)
    | mask("mask_sky")
  }

  layer snow_glow opacity: ${(0.12 * s).toFixed(2)} blend: screen {
    translate(time * 0.01, time * 0.004)
    | warp(scale: 0.35, octaves: 3, persistence: 0.5, strength: 0.12)
    | fbm(scale: 0.3, octaves: 3, persistence: 0.5)
    | glow(2.0)
    | tint(0.25, 0.75, 0.45)
    | mask("depth")
  }

  layer cold_air opacity: ${(0.09 * s).toFixed(2)} blend: screen {
    translate(time * 0.012, sin(time * 0.05) * 0.006)
    | warp(scale: 0.8, octaves: 4, persistence: 0.6, strength: 0.16)
    | fbm(scale: 1.2, octaves: 4, persistence: 0.5)
    | glow(1.0)
    | tint(0.35, 0.45, 0.80)
    | mask("depth", invert: 1)
  }

  layer aurora_pulse opacity: ${(0.10 * s).toFixed(2)} blend: screen {
    translate(time * 0.006, time * 0.002)
    | warp(scale: 0.3, octaves: 2, persistence: 0.5, strength: 0.08)
    | fbm(scale: 0.25, octaves: 3, persistence: 0.5)
    | glow(1.5)
    | tint(0.5, 0.9, 0.65)
  }

  pass soften { blur(0.5) }
  pass frame { vignette(0.28) }
  pass film { film_grain(0.014) }
}
`;
};

// ════════════════════════════════════════════════════════════════
// TEMPLATE: OCEAN COAST
// ════════════════════════════════════════════════════════════════
const oceanCoastTemplate: TemplateGenerator = (ctx) => {
  const { componentName, baseName, imageName, s } = ctx;
  const water = getMotion(ctx, 'water');
  return `// Living World — Ocean Coast
// Wave approach, foam dissolution, spray mist, deep shimmer
// Template: ocean_coast | Intensity: ${s.toFixed(2)}

cinematic "${componentName}" {
  texture "photo" from "${imageName}"
  texture "depth" from "${baseName}-depth.png"
  texture "flow_water" from "${baseName}-flow_water.png"
  texture "flow_sky" from "${baseName}-flow_sky.png"
  texture "mask_water" from "${baseName}-mask_water.png"
  texture "mask_sky" from "${baseName}-mask_sky.png"

  layer world {
    parallax("photo", depth: "depth", strength: ${(0.020 * s).toFixed(3)}, orbit_speed: 0.06)
  }

  layer wave_flow opacity: 0.92 {
    flowmap("photo", "flow_water", speed: ${(0.18 * s).toFixed(2)}, scale: ${(0.06 * s).toFixed(3)})
    | mask("mask_water")
  }

  layer sky_drift opacity: 0.85 {
    flowmap("photo", "flow_sky", speed: ${(0.06 * s).toFixed(2)}, scale: ${(0.012 * s).toFixed(3)})
    | mask("mask_sky")
  }

  layer foam opacity: ${(0.18 * s).toFixed(2)} blend: add {
    translate(time * ${(0.015 * s).toFixed(3)}, time * ${(0.035 * s).toFixed(3)})
    | warp(scale: 1.8, octaves: 4, persistence: 0.55, strength: 0.30)
    | voronoi(6.0)
    | glow(3.0)
    | tint(0.95, 0.97, 1.0)
    | mask("mask_water")
  }

  layer foam_dissolve opacity: ${(0.12 * s).toFixed(2)} blend: screen {
    translate(time * ${(0.008 * s).toFixed(3)}, time * ${(0.020 * s).toFixed(3)})
    | warp(scale: 0.9, octaves: 3, persistence: 0.50, strength: 0.18)
    | voronoi(4.0)
    | glow(4.5)
    | tint(0.88, 0.92, 1.0)
    | mask("mask_water")
  }

  layer deep_shimmer opacity: ${(0.10 * s).toFixed(2)} blend: screen {
    translate(time * ${(0.025 * s).toFixed(3)}, time * ${(0.012 * s).toFixed(3)})
    | warp(scale: 3.5, octaves: 3, strength: 0.20)
    | voronoi(14.0)
    | glow(2.0)
    | tint(0.3, 0.65, 0.85)
    | mask("mask_water")
  }

  layer spray opacity: ${(0.08 * s).toFixed(2)} blend: screen {
    translate(time * 0.006, sin(time * 0.15) * 0.008)
    | warp(scale: 1.2, octaves: 5, persistence: 0.60, strength: 0.25)
    | fbm(scale: 1.8, octaves: 5, persistence: 0.50)
    | glow(1.0)
    | tint(0.90, 0.93, 1.0)
    | mask("depth")
  }

  layer salt_air opacity: ${(0.07 * s).toFixed(2)} blend: screen {
    translate(time * 0.010, sin(time * 0.06) * 0.004)
    | warp(scale: 0.6, octaves: 4, persistence: 0.55, strength: 0.14)
    | fbm(scale: 0.8, octaves: 4, persistence: 0.50)
    | glow(1.2)
    | tint(0.75, 0.82, 0.95)
    | mask("depth", invert: 1)
  }

  layer tide_pulse opacity: ${(0.06 * s).toFixed(2)} blend: screen {
    translate(sin(time * 0.08) * 0.003, time * 0.002)
    | warp(scale: 0.3, octaves: 2, persistence: 0.5, strength: 0.06)
    | fbm(scale: 0.25, octaves: 3, persistence: 0.5)
    | glow(1.5)
    | tint(0.6, 0.78, 0.95)
  }

  pass soften { blur(0.6) }
  pass frame { vignette(0.25) }
  pass film { film_grain(0.016) }
}
`;
};

// ════════════════════════════════════════════════════════════════
// TEMPLATE: WATERFALL
// ════════════════════════════════════════════════════════════════
const waterfallTemplate: TemplateGenerator = (ctx) => {
  const { componentName, baseName, imageName, s } = ctx;
  return `// Living World — Waterfall
// Powerful cascade, splash turbulence, rising mist, wet rock shimmer
// Template: waterfall | Intensity: ${s.toFixed(2)}

cinematic "${componentName}" {
  texture "photo" from "${imageName}"
  texture "depth" from "${baseName}-depth.png"
  texture "flow_water" from "${baseName}-flow_water.png"
  texture "flow_sky" from "${baseName}-flow_sky.png"
  texture "mask_water" from "${baseName}-mask_water.png"
  texture "mask_sky" from "${baseName}-mask_sky.png"

  layer world {
    parallax("photo", depth: "depth", strength: ${(0.015 * s).toFixed(3)}, orbit_speed: 0.05)
  }

  layer cascade opacity: 0.94 {
    flowmap("photo", "flow_water", speed: ${(0.35 * s).toFixed(2)}, scale: ${(0.10 * s).toFixed(3)})
    | mask("mask_water")
  }

  layer turbulence opacity: ${(0.22 * s).toFixed(2)} blend: add {
    translate(time * 0.008, time * ${(0.065 * s).toFixed(3)})
    | distort(scale: 3.5, speed: ${(3.0 * s).toFixed(1)}, strength: ${(0.08 * s).toFixed(3)})
    | warp(scale: 2.0, octaves: 4, persistence: 0.60, strength: 0.35)
    | voronoi(7.0)
    | glow(2.5)
    | tint(0.92, 0.95, 1.0)
    | mask("mask_water")
  }

  layer splash opacity: ${(0.16 * s).toFixed(2)} blend: add {
    translate(time * 0.012, time * 0.005)
    | distort(scale: 5.0, speed: ${(4.0 * s).toFixed(1)}, strength: ${(0.12 * s).toFixed(3)})
    | voronoi(10.0)
    | glow(3.5)
    | tint(0.88, 0.92, 1.0)
    | mask("mask_water")
  }

  layer mist_rise opacity: ${(0.14 * s).toFixed(2)} blend: screen {
    translate(sin(time * 0.08) * 0.005, time * ${(-0.018 * s).toFixed(4)})
    | warp(scale: 0.7, octaves: 5, persistence: 0.65, strength: 0.28)
    | fbm(scale: 1.0, octaves: 5, persistence: 0.55)
    | glow(1.0)
    | tint(0.88, 0.90, 0.98)
    | mask("depth")
  }

  layer mist_veil opacity: ${(0.08 * s).toFixed(2)} blend: screen {
    translate(time * 0.004, sin(time * 0.05) * 0.003)
    | warp(scale: 0.5, octaves: 4, persistence: 0.55, strength: 0.16)
    | fbm(scale: 0.6, octaves: 4, persistence: 0.50)
    | glow(1.5)
    | tint(0.82, 0.86, 0.95)
    | mask("depth", invert: 1)
  }

  layer wet_rock opacity: ${(0.06 * s).toFixed(2)} blend: screen {
    translate(time * 0.003, time * 0.008)
    | distort(scale: 12.0, speed: 1.5, strength: 0.04)
    | voronoi(22.0)
    | glow(6.0)
    | tint(0.70, 0.75, 0.85)
    | mask("depth")
  }

  layer sky opacity: 0.82 {
    flowmap("photo", "flow_sky", speed: ${(0.04 * s).toFixed(2)}, scale: ${(0.008 * s).toFixed(3)})
    | mask("mask_sky")
  }

  pass soften { blur(0.5) }
  pass frame { vignette(0.30) }
  pass film { film_grain(0.012) }
}
`;
};

// ════════════════════════════════════════════════════════════════
// TEMPLATE: FOREST STREAM
// ════════════════════════════════════════════════════════════════
const forestStreamTemplate: TemplateGenerator = (ctx) => {
  const { componentName, baseName, imageName, s } = ctx;
  return `// Living World — Forest Stream
// Gentle creek, dappled sunlight, leaf sway, firefly specks
// Template: forest_stream | Intensity: ${s.toFixed(2)}

cinematic "${componentName}" {
  texture "photo" from "${imageName}"
  texture "depth" from "${baseName}-depth.png"
  texture "flow_water" from "${baseName}-flow_water.png"
  texture "flow_sky" from "${baseName}-flow_sky.png"
  texture "flow_vegetation" from "${baseName}-flow_vegetation.png"
  texture "mask_water" from "${baseName}-mask_water.png"
  texture "mask_sky" from "${baseName}-mask_sky.png"
  texture "mask_vegetation" from "${baseName}-mask_vegetation.png"

  layer world {
    parallax("photo", depth: "depth", strength: ${(0.018 * s).toFixed(3)}, orbit_speed: 0.06)
  }

  layer stream opacity: 0.90 {
    flowmap("photo", "flow_water", speed: ${(0.12 * s).toFixed(2)}, scale: ${(0.04 * s).toFixed(3)})
    | mask("mask_water")
  }

  layer sparkle opacity: ${(0.14 * s).toFixed(2)} blend: add {
    translate(time * ${(0.02 * s).toFixed(3)}, time * ${(0.015 * s).toFixed(3)})
    | distort(scale: 6.0, speed: 1.8, strength: 0.08)
    | voronoi(18.0)
    | glow(5.0)
    | tint(1.0, 0.95, 0.75)
    | mask("mask_water")
  }

  layer caustics opacity: ${(0.10 * s).toFixed(2)} blend: screen {
    translate(time * ${(0.015 * s).toFixed(3)}, time * ${(0.008 * s).toFixed(3)})
    | warp(scale: 3.0, octaves: 3, strength: 0.18)
    | voronoi(10.0)
    | glow(2.0)
    | tint(0.45, 0.70, 0.55)
    | mask("mask_water")
  }

  layer dappled opacity: ${(0.11 * s).toFixed(2)} blend: screen {
    translate(time * 0.003, sin(time * 0.04) * 0.004)
    | distort(scale: 2.0, speed: 0.4, strength: 0.03)
    | warp(scale: 2.5, octaves: 3, strength: 0.20)
    | voronoi(5.0)
    | glow(3.5)
    | tint(0.95, 0.92, 0.65)
    | mask("mask_vegetation")
  }

  layer canopy_sway opacity: 0.85 {
    flowmap("photo", "flow_vegetation", speed: ${(0.03 * s).toFixed(2)}, scale: ${(0.003 * s).toFixed(3)})
    | mask("mask_vegetation")
  }

  layer fireflies opacity: ${(0.07 * s).toFixed(2)} blend: add {
    translate(sin(time * 0.12) * 0.008, time * -0.003)
    | distort(scale: 20.0, speed: 3.0, strength: 0.15)
    | voronoi(40.0)
    | glow(12.0)
    | tint(0.90, 0.95, 0.60)
    | mask("depth")
  }

  layer ground_mist opacity: ${(0.09 * s).toFixed(2)} blend: screen {
    translate(time * 0.005, sin(time * 0.03) * 0.003)
    | warp(scale: 0.8, octaves: 5, persistence: 0.60, strength: 0.18)
    | fbm(scale: 1.4, octaves: 5, persistence: 0.50)
    | glow(0.8)
    | tint(0.78, 0.85, 0.72)
    | mask("depth")
  }

  layer light_shift opacity: ${(0.08 * s).toFixed(2)} blend: screen {
    translate(time * 0.008, time * 0.003)
    | warp(scale: 0.35, octaves: 3, persistence: 0.5, strength: 0.10)
    | fbm(scale: 0.30, octaves: 3, persistence: 0.5)
    | glow(1.5)
    | tint(0.90, 0.88, 0.65)
  }

  layer sky_peek opacity: 0.80 {
    flowmap("photo", "flow_sky", speed: ${(0.04 * s).toFixed(2)}, scale: ${(0.008 * s).toFixed(3)})
    | mask("mask_sky")
  }

  pass soften { blur(0.4) }
  pass frame { vignette(0.32) }
  pass film { film_grain(0.010) }
}
`;
};

// ════════════════════════════════════════════════════════════════
// TEMPLATE: CAMPFIRE
// ════════════════════════════════════════════════════════════════
const campfireTemplate: TemplateGenerator = (ctx) => {
  const { componentName, baseName, imageName, s } = ctx;
  return `// Living World — Campfire
// Dancing flames, floating embers, rising smoke, warm light flicker
// Template: campfire | Intensity: ${s.toFixed(2)}

cinematic "${componentName}" {
  texture "photo" from "${imageName}"
  texture "depth" from "${baseName}-depth.png"
  texture "flow_fire" from "${baseName}-flow_fire.png"
  texture "mask_fire" from "${baseName}-mask_fire.png"
  texture "mask_smoke" from "${baseName}-mask_smoke.png"
  texture "mask_sky" from "${baseName}-mask_sky.png"

  layer world {
    parallax("photo", depth: "depth", strength: ${(0.012 * s).toFixed(3)}, orbit_speed: 0.04)
  }

  layer flame_core opacity: ${(0.30 * s).toFixed(2)} blend: add {
    translate(sin(time * 0.8) * 0.006, time * ${(-0.045 * s).toFixed(4)})
    | distort(scale: 4.0, speed: ${(5.0 * s).toFixed(1)}, strength: ${(0.14 * s).toFixed(3)})
    | warp(scale: 1.5, octaves: 4, persistence: 0.65, strength: 0.40)
    | voronoi(5.0)
    | glow(2.0)
    | tint(1.0, 0.75, 0.15)
    | mask("mask_fire")
  }

  layer flame_outer opacity: ${(0.20 * s).toFixed(2)} blend: add {
    translate(sin(time * 0.5) * 0.008, time * ${(-0.030 * s).toFixed(4)})
    | distort(scale: 2.5, speed: ${(3.5 * s).toFixed(1)}, strength: ${(0.10 * s).toFixed(3)})
    | warp(scale: 1.0, octaves: 5, persistence: 0.60, strength: 0.32)
    | fbm(scale: 0.8, octaves: 4, persistence: 0.55)
    | glow(3.0)
    | tint(1.0, 0.45, 0.08)
    | mask("mask_fire")
  }

  layer flame_tip opacity: ${(0.15 * s).toFixed(2)} blend: add {
    translate(sin(time * 1.2) * 0.004, time * ${(-0.060 * s).toFixed(4)})
    | distort(scale: 6.0, speed: ${(7.0 * s).toFixed(1)}, strength: ${(0.18 * s).toFixed(3)})
    | voronoi(8.0)
    | glow(4.0)
    | tint(1.0, 0.92, 0.55)
    | mask("mask_fire")
  }

  layer embers opacity: ${(0.10 * s).toFixed(2)} blend: add {
    translate(sin(time * 0.3) * 0.012, time * -0.015)
    | distort(scale: 18.0, speed: 2.0, strength: 0.10)
    | voronoi(30.0)
    | glow(10.0)
    | tint(1.0, 0.65, 0.15)
    | mask("mask_smoke")
  }

  layer smoke opacity: ${(0.11 * s).toFixed(2)} blend: screen {
    translate(sin(time * 0.06) * 0.008, time * -0.012)
    | warp(scale: 0.6, octaves: 5, persistence: 0.65, strength: 0.22)
    | fbm(scale: 0.9, octaves: 5, persistence: 0.55)
    | glow(0.8)
    | tint(0.55, 0.50, 0.48)
    | mask("mask_smoke")
  }

  layer heat_shimmer opacity: 0.80 {
    flowmap("photo", "flow_fire", speed: ${(0.50 * s).toFixed(2)}, scale: ${(0.06 * s).toFixed(3)})
    | mask("mask_smoke")
  }

  layer firelight opacity: ${(0.14 * s).toFixed(2)} blend: screen {
    translate(time * 0.002, time * 0.001)
    | distort(scale: 0.8, speed: 3.5, strength: 0.04)
    | warp(scale: 0.4, octaves: 3, persistence: 0.5, strength: 0.08)
    | fbm(scale: 0.3, octaves: 3, persistence: 0.50)
    | glow(2.0)
    | tint(1.0, 0.70, 0.30)
    | mask("depth")
  }

  layer stars opacity: ${(0.12 * s).toFixed(2)} blend: add {
    translate(time * 0.0005, time * 0.0002)
    | distort(scale: 20.0, speed: 2.5, strength: 0.10)
    | voronoi(38.0)
    | glow(11.0)
    | tint(0.90, 0.92, 1.0)
    | mask("mask_sky")
  }

  pass soften { blur(0.4) }
  pass frame { vignette(0.35) }
  pass film { film_grain(0.018) }
}
`;
};

// ════════════════════════════════════════════════════════════════
// TEMPLATE: THUNDERSTORM
// ════════════════════════════════════════════════════════════════
const thunderstormTemplate: TemplateGenerator = (ctx) => {
  const { componentName, baseName, imageName, s } = ctx;
  return `// Living World — Thunderstorm
// Churning clouds, lightning flash, driving rain, wind-bent vegetation
// Template: thunderstorm | Intensity: ${s.toFixed(2)}

cinematic "${componentName}" {
  texture "photo" from "${imageName}"
  texture "depth" from "${baseName}-depth.png"
  texture "flow_sky" from "${baseName}-flow_sky.png"
  texture "flow_vegetation" from "${baseName}-flow_vegetation.png"
  texture "mask_sky" from "${baseName}-mask_sky.png"
  texture "mask_water" from "${baseName}-mask_water.png"
  texture "mask_vegetation" from "${baseName}-mask_vegetation.png"

  layer world {
    parallax("photo", depth: "depth", strength: ${(0.018 * s).toFixed(3)}, orbit_speed: 0.06)
  }

  layer cloud_churn opacity: 0.88 {
    flowmap("photo", "flow_sky", speed: ${(0.12 * s).toFixed(2)}, scale: ${(0.02 * s).toFixed(3)})
    | mask("mask_sky")
  }

  layer storm_roll opacity: ${(0.18 * s).toFixed(2)} blend: screen {
    translate(time * ${(0.035 * s).toFixed(3)}, time * 0.008)
    | warp(scale: 0.5, octaves: 5, persistence: 0.70, strength: 0.35)
    | fbm(scale: 0.6, octaves: 5, persistence: 0.60)
    | glow(1.0)
    | tint(0.30, 0.32, 0.45)
    | mask("mask_sky")
  }

  layer lightning opacity: ${(0.25 * s).toFixed(2)} blend: add {
    translate(time * 0.001, time * 0.001)
    | distort(scale: 0.15, speed: 8.0, strength: 0.02)
    | warp(scale: 0.3, octaves: 2, persistence: 0.5, strength: 0.05)
    | fbm(scale: 0.2, octaves: 2, persistence: 0.5)
    | glow(8.0)
    | tint(0.70, 0.75, 1.0)
    | mask("mask_sky")
  }

  layer rain opacity: ${(0.09 * s).toFixed(2)} blend: add {
    translate(time * ${(0.15 * s).toFixed(2)}, time * ${(0.80 * s).toFixed(2)})
    | distort(scale: 25.0, speed: 6.0, strength: 0.08)
    | voronoi(45.0)
    | glow(8.0)
    | tint(0.65, 0.70, 0.85)
  }

  layer rain_fine opacity: ${(0.06 * s).toFixed(2)} blend: add {
    translate(time * ${(0.12 * s).toFixed(2)}, time * ${(0.65 * s).toFixed(2)})
    | distort(scale: 35.0, speed: 5.0, strength: 0.06)
    | voronoi(55.0)
    | glow(10.0)
    | tint(0.55, 0.60, 0.78)
  }

  layer puddle_ripple opacity: ${(0.12 * s).toFixed(2)} blend: screen {
    translate(time * 0.004, time * 0.003)
    | distort(scale: 8.0, speed: 4.0, strength: 0.10)
    | voronoi(12.0)
    | glow(2.5)
    | tint(0.50, 0.55, 0.75)
    | mask("mask_water")
  }

  layer wind_sway opacity: 0.82 {
    flowmap("photo", "flow_vegetation", speed: ${(0.05 * s).toFixed(2)}, scale: ${(0.005 * s).toFixed(3)})
    | mask("mask_vegetation")
  }

  layer storm_air opacity: ${(0.10 * s).toFixed(2)} blend: screen {
    translate(time * ${(0.025 * s).toFixed(3)}, sin(time * 0.08) * 0.005)
    | warp(scale: 0.7, octaves: 4, persistence: 0.60, strength: 0.18)
    | fbm(scale: 1.0, octaves: 4, persistence: 0.50)
    | glow(0.8)
    | tint(0.35, 0.38, 0.55)
    | mask("depth", invert: 1)
  }

  layer ground_flash opacity: ${(0.08 * s).toFixed(2)} blend: add {
    translate(time * 0.001, time * 0.001)
    | distort(scale: 0.2, speed: 8.0, strength: 0.03)
    | fbm(scale: 0.15, octaves: 2, persistence: 0.5)
    | glow(6.0)
    | tint(0.55, 0.58, 0.80)
    | mask("depth")
  }

  pass soften { blur(0.5) }
  pass frame { vignette(0.35) }
  pass film { film_grain(0.022) }
}
`;
};

// ════════════════════════════════════════════════════════════════
// TEMPLATE: CITY NIGHT
// ════════════════════════════════════════════════════════════════
const cityNightTemplate: TemplateGenerator = (ctx) => {
  const { componentName, baseName, imageName, s } = ctx;
  return `// Living World — City Night
// Neon reflections, window flicker, steam, traffic glow, urban rain
// Template: city_night | Intensity: ${s.toFixed(2)}

cinematic "${componentName}" {
  texture "photo" from "${imageName}"
  texture "depth" from "${baseName}-depth.png"
  texture "flow_water" from "${baseName}-flow_water.png"
  texture "mask_water" from "${baseName}-mask_water.png"
  texture "mask_sky" from "${baseName}-mask_sky.png"

  layer world {
    parallax("photo", depth: "depth", strength: ${(0.015 * s).toFixed(3)}, orbit_speed: 0.04)
  }

  layer reflections opacity: 0.88 {
    flowmap("photo", "flow_water", speed: ${(0.06 * s).toFixed(2)}, scale: ${(0.01 * s).toFixed(3)})
    | mask("mask_water")
  }

  layer neon_shimmer opacity: ${(0.15 * s).toFixed(2)} blend: screen {
    translate(time * 0.008, time * 0.004)
    | distort(scale: 3.0, speed: 1.2, strength: 0.06)
    | warp(scale: 2.5, octaves: 3, strength: 0.18)
    | voronoi(8.0)
    | glow(2.5)
    | tint(0.85, 0.40, 0.95)
    | mask("mask_water")
  }

  layer neon_warm opacity: ${(0.10 * s).toFixed(2)} blend: screen {
    translate(time * 0.006, time * 0.003)
    | distort(scale: 2.5, speed: 0.9, strength: 0.05)
    | warp(scale: 2.0, octaves: 3, strength: 0.15)
    | voronoi(7.0)
    | glow(3.0)
    | tint(1.0, 0.55, 0.20)
    | mask("mask_water")
  }

  layer windows opacity: ${(0.06 * s).toFixed(2)} blend: add {
    translate(time * 0.001, time * 0.001)
    | distort(scale: 15.0, speed: 2.0, strength: 0.08)
    | voronoi(20.0)
    | glow(8.0)
    | tint(1.0, 0.90, 0.65)
    | mask("depth", invert: 1)
  }

  layer steam opacity: ${(0.08 * s).toFixed(2)} blend: screen {
    translate(sin(time * 0.10) * 0.006, time * -0.015)
    | warp(scale: 0.9, octaves: 5, persistence: 0.60, strength: 0.22)
    | fbm(scale: 1.2, octaves: 5, persistence: 0.50)
    | glow(1.0)
    | tint(0.60, 0.58, 0.65)
    | mask("depth")
  }

  layer drizzle opacity: ${(0.05 * s).toFixed(2)} blend: add {
    translate(time * 0.03, time * 0.50)
    | distort(scale: 30.0, speed: 4.0, strength: 0.06)
    | voronoi(50.0)
    | glow(9.0)
    | tint(0.60, 0.65, 0.80)
  }

  layer traffic opacity: ${(0.07 * s).toFixed(2)} blend: add {
    translate(time * 0.020, sin(time * 0.15) * 0.002)
    | warp(scale: 1.5, octaves: 2, strength: 0.08)
    | fbm(scale: 0.5, octaves: 2, persistence: 0.5)
    | glow(4.0)
    | tint(1.0, 0.80, 0.40)
    | mask("depth")
  }

  layer haze opacity: ${(0.08 * s).toFixed(2)} blend: screen {
    translate(time * 0.006, time * 0.002)
    | warp(scale: 0.4, octaves: 3, persistence: 0.5, strength: 0.10)
    | fbm(scale: 0.35, octaves: 3, persistence: 0.50)
    | glow(1.5)
    | tint(0.55, 0.45, 0.65)
    | mask("depth", invert: 1)
  }

  layer sky_glow opacity: ${(0.10 * s).toFixed(2)} blend: screen {
    translate(time * 0.008, time * 0.003)
    | warp(scale: 0.3, octaves: 3, persistence: 0.55, strength: 0.12)
    | fbm(scale: 0.4, octaves: 3, persistence: 0.50)
    | glow(2.0)
    | tint(0.65, 0.45, 0.70)
    | mask("mask_sky")
  }

  pass soften { blur(0.5) }
  pass frame { vignette(0.38) }
  pass film { film_grain(0.020) }
}
`;
};

// ════════════════════════════════════════════════════════════════
// TEMPLATE: DESERT DUNES
// ════════════════════════════════════════════════════════════════
const desertDunesTemplate: TemplateGenerator = (ctx) => {
  const { componentName, baseName, imageName, s } = ctx;
  return `// Living World — Desert Dunes
// Sand drift, heat shimmer, wind patterns, sun haze, vast silence
// Template: desert_dunes | Intensity: ${s.toFixed(2)}

cinematic "${componentName}" {
  texture "photo" from "${imageName}"
  texture "depth" from "${baseName}-depth.png"
  texture "flow_water" from "${baseName}-flow_water.png"
  texture "flow_sky" from "${baseName}-flow_sky.png"
  texture "mask_sky" from "${baseName}-mask_sky.png"

  layer world {
    parallax("photo", depth: "depth", strength: ${(0.020 * s).toFixed(3)}, orbit_speed: 0.05)
  }

  layer sand_drift opacity: ${(0.10 * s).toFixed(2)} blend: screen {
    translate(time * ${(0.018 * s).toFixed(3)}, time * 0.003)
    | warp(scale: 1.5, octaves: 4, persistence: 0.55, strength: 0.15)
    | fbm(scale: 2.0, octaves: 4, persistence: 0.50)
    | glow(0.8)
    | tint(0.92, 0.85, 0.65)
    | mask("depth")
  }

  layer sand_stream opacity: ${(0.07 * s).toFixed(2)} blend: screen {
    translate(time * ${(0.030 * s).toFixed(3)}, time * 0.005)
    | warp(scale: 2.5, octaves: 3, persistence: 0.50, strength: 0.12)
    | fbm(scale: 3.0, octaves: 3, persistence: 0.45)
    | glow(1.2)
    | tint(0.88, 0.78, 0.55)
    | mask("depth")
  }

  layer heat_shimmer opacity: 0.75 {
    flowmap("photo", "flow_water", speed: ${(0.02 * s).toFixed(2)}, scale: ${(0.005 * s).toFixed(3)})
    | mask("depth")
  }

  layer heat_waves opacity: ${(0.06 * s).toFixed(2)} blend: screen {
    translate(time * 0.004, time * -0.010)
    | warp(scale: 3.0, octaves: 3, strength: 0.10)
    | fbm(scale: 4.0, octaves: 3, persistence: 0.45)
    | glow(1.5)
    | tint(1.0, 0.95, 0.80)
    | mask("depth")
  }

  layer sun_haze opacity: ${(0.12 * s).toFixed(2)} blend: screen {
    translate(time * 0.002, time * 0.001)
    | warp(scale: 0.3, octaves: 2, persistence: 0.5, strength: 0.06)
    | fbm(scale: 0.2, octaves: 2, persistence: 0.5)
    | glow(3.0)
    | tint(1.0, 0.88, 0.55)
    | mask("mask_sky")
  }

  layer sky_haze opacity: ${(0.08 * s).toFixed(2)} blend: screen {
    translate(time * 0.010, time * 0.003)
    | warp(scale: 0.5, octaves: 3, persistence: 0.55, strength: 0.10)
    | fbm(scale: 0.6, octaves: 3, persistence: 0.50)
    | glow(1.5)
    | tint(0.85, 0.75, 0.55)
    | mask("mask_sky")
  }

  layer sky_drift opacity: 0.82 {
    flowmap("photo", "flow_sky", speed: ${(0.04 * s).toFixed(2)}, scale: ${(0.008 * s).toFixed(3)})
    | mask("mask_sky")
  }

  layer dust_gust opacity: ${(0.04 * s).toFixed(2)} blend: screen {
    translate(time * ${(0.040 * s).toFixed(3)}, sin(time * 0.04) * 0.008)
    | warp(scale: 0.8, octaves: 5, persistence: 0.65, strength: 0.25)
    | fbm(scale: 1.0, octaves: 5, persistence: 0.55)
    | glow(0.6)
    | tint(0.90, 0.82, 0.60)
    | mask("depth")
  }

  layer light_sweep opacity: ${(0.07 * s).toFixed(2)} blend: screen {
    translate(time * 0.005, time * 0.002)
    | warp(scale: 0.25, octaves: 2, persistence: 0.5, strength: 0.05)
    | fbm(scale: 0.20, octaves: 2, persistence: 0.5)
    | glow(2.0)
    | tint(1.0, 0.92, 0.70)
  }

  pass soften { blur(0.6) }
  pass frame { vignette(0.22) }
  pass film { film_grain(0.014) }
}
`;
};

// ════════════════════════════════════════════════════════════════
// TEMPLATE: SUNSET LANDSCAPE
// ════════════════════════════════════════════════════════════════
const sunsetLandscapeTemplate: TemplateGenerator = (ctx) => {
  const { componentName, baseName, imageName, s } = ctx;
  return `// Living World — Golden Hour Sunset
// Golden rays, cloud shadows, warm haze, dust motes, vegetation sway
// Template: sunset_landscape | Intensity: ${s.toFixed(2)}

cinematic "${componentName}" {
  texture "photo" from "${imageName}"
  texture "depth" from "${baseName}-depth.png"
  texture "flow_sky" from "${baseName}-flow_sky.png"
  texture "flow_vegetation" from "${baseName}-flow_vegetation.png"
  texture "mask_sky" from "${baseName}-mask_sky.png"
  texture "mask_vegetation" from "${baseName}-mask_vegetation.png"

  layer world {
    parallax("photo", depth: "depth", strength: ${(0.022 * s).toFixed(3)}, orbit_speed: 0.06)
  }

  layer cloud_drift opacity: 0.85 {
    flowmap("photo", "flow_sky", speed: ${(0.06 * s).toFixed(2)}, scale: ${(0.010 * s).toFixed(3)})
    | mask("mask_sky")
  }

  layer sun_rays opacity: ${(0.18 * s).toFixed(2)} blend: add {
    translate(0.5, 0.35)
    | polar()
    | distort(scale: 0.4, speed: ${(0.025 * s).toFixed(3)}, strength: 0.012)
    | warp(scale: 0.4, octaves: 3, persistence: 0.55, strength: 0.15)
    | fbm(scale: 0.5, octaves: 3, persistence: 0.50)
    | glow(4.0)
    | tint(1.0, 0.82, 0.35)
    | mask("mask_sky")
  }

  layer warm_haze opacity: ${(0.10 * s).toFixed(2)} blend: screen {
    translate(time * ${(0.008 * s).toFixed(3)}, sin(time * 0.04) * 0.003)
    | warp(scale: 0.6, octaves: 4, persistence: 0.60, strength: 0.18)
    | fbm(scale: 0.8, octaves: 4, persistence: 0.55)
    | glow(1.5)
    | tint(1.0, 0.85, 0.50)
  }

  layer cloud_shadows opacity: ${(0.08 * s).toFixed(2)} blend: multiply {
    translate(time * ${(0.012 * s).toFixed(3)}, time * 0.003)
    | warp(scale: 0.4, octaves: 3, persistence: 0.55, strength: 0.14)
    | fbm(scale: 0.5, octaves: 3, persistence: 0.50)
    | glow(1.0)
    | tint(0.75, 0.68, 0.55)
    | mask("depth")
  }

  layer lens_flare opacity: ${(0.12 * s).toFixed(2)} blend: add {
    translate(0.5, 0.32)
    | radial_fade(inner: 0.0, outer: 0.35)
    | glow(6.0)
    | tint(1.0, 0.90, 0.55)
    | mask("mask_sky")
  }

  layer grass_sway opacity: 0.80 {
    flowmap("photo", "flow_vegetation", speed: ${(0.03 * s).toFixed(2)}, scale: ${(0.003 * s).toFixed(3)})
    | mask("mask_vegetation")
  }

  layer golden_wash opacity: ${(0.05 * s).toFixed(2)} blend: screen {
    translate(time * 0.004, time * 0.002)
    | warp(scale: 0.3, octaves: 2, persistence: 0.5, strength: 0.06)
    | fbm(scale: 0.20, octaves: 2, persistence: 0.5)
    | glow(1.0)
    | tint(1.0, 0.88, 0.45)
  }

  layer dust_motes opacity: ${(0.04 * s).toFixed(2)} blend: screen {
    translate(sin(time * 0.08) * 0.006, time * -0.002)
    | distort(scale: 14.0, speed: 1.8, strength: 0.10)
    | voronoi(28.0)
    | glow(8.0)
    | tint(1.0, 0.92, 0.60)
    | mask("depth")
  }

  layer sky_glow opacity: ${(0.09 * s).toFixed(2)} blend: screen {
    translate(time * 0.005, time * 0.002)
    | warp(scale: 0.35, octaves: 3, persistence: 0.55, strength: 0.10)
    | fbm(scale: 0.4, octaves: 3, persistence: 0.50)
    | glow(2.0)
    | tint(1.0, 0.78, 0.40)
    | mask("mask_sky")
  }

  layer light_pulse opacity: ${(0.06 * s).toFixed(2)} blend: screen {
    translate(time * 0.003, time * 0.001)
    | warp(scale: 0.25, octaves: 2, persistence: 0.5, strength: 0.05)
    | fbm(scale: 0.20, octaves: 2, persistence: 0.5)
    | glow(1.5)
    | tint(1.0, 0.90, 0.65)
  }

  pass soften { blur(0.5) }
  pass frame { vignette(0.25) }
  pass film { film_grain(0.012) }
}
`;
};

// ════════════════════════════════════════════════════════════════
// TEMPLATE: MOUNTAIN LAKE
// ════════════════════════════════════════════════════════════════
const mountainLakeTemplate: TemplateGenerator = (ctx) => {
  const { componentName, baseName, imageName, s } = ctx;
  return `// Living World — Mountain Lake
// Still water, rippling reflections, creeping mist, distant haze
// Template: mountain_lake | Intensity: ${s.toFixed(2)}

cinematic "${componentName}" {
  texture "photo" from "${imageName}"
  texture "depth" from "${baseName}-depth.png"
  texture "flow_water" from "${baseName}-flow_water.png"
  texture "flow_sky" from "${baseName}-flow_sky.png"
  texture "flow_vegetation" from "${baseName}-flow_vegetation.png"
  texture "mask_sky" from "${baseName}-mask_sky.png"
  texture "mask_water" from "${baseName}-mask_water.png"
  texture "mask_vegetation" from "${baseName}-mask_vegetation.png"

  layer world {
    parallax("photo", depth: "depth", strength: ${(0.020 * s).toFixed(3)}, orbit_speed: 0.05)
  }

  layer lake_ripple opacity: 0.82 {
    flowmap("photo", "flow_water", speed: ${(0.06 * s).toFixed(2)}, scale: ${(0.008 * s).toFixed(3)})
    | mask("mask_water")
  }

  layer sky_drift opacity: 0.86 {
    flowmap("photo", "flow_sky", speed: ${(0.05 * s).toFixed(2)}, scale: ${(0.010 * s).toFixed(3)})
    | mask("mask_sky")
  }

  layer reflection_shimmer opacity: ${(0.10 * s).toFixed(2)} blend: screen {
    translate(time * ${(0.008 * s).toFixed(3)}, time * 0.004)
    | distort(scale: 2.5, speed: 0.8, strength: 0.05)
    | warp(scale: 2.0, octaves: 3, strength: 0.16)
    | voronoi(7.0)
    | glow(3.0)
    | tint(0.85, 0.90, 1.0)
    | mask("mask_water")
  }

  layer water_mist opacity: ${(0.09 * s).toFixed(2)} blend: screen {
    translate(time * ${(0.006 * s).toFixed(3)}, sin(time * 0.03) * 0.003)
    | warp(scale: 0.7, octaves: 5, persistence: 0.62, strength: 0.20)
    | fbm(scale: 1.0, octaves: 5, persistence: 0.52)
    | glow(0.8)
    | tint(0.82, 0.86, 0.95)
    | mask("mask_water")
  }

  layer mountain_haze opacity: ${(0.07 * s).toFixed(2)} blend: screen {
    translate(time * 0.004, time * 0.002)
    | warp(scale: 0.3, octaves: 3, persistence: 0.55, strength: 0.10)
    | fbm(scale: 0.35, octaves: 3, persistence: 0.50)
    | glow(1.5)
    | tint(0.75, 0.80, 0.92)
    | mask("depth", invert: 1)
  }

  layer water_sparkle opacity: ${(0.05 * s).toFixed(2)} blend: screen {
    translate(time * ${(0.012 * s).toFixed(3)}, time * 0.006)
    | distort(scale: 10.0, speed: 1.5, strength: 0.08)
    | voronoi(22.0)
    | glow(8.0)
    | tint(0.92, 0.95, 1.0)
    | mask("mask_water")
  }

  layer tree_sway opacity: 0.83 {
    flowmap("photo", "flow_vegetation", speed: ${(0.03 * s).toFixed(2)}, scale: ${(0.003 * s).toFixed(3)})
    | mask("mask_vegetation")
  }

  layer cloud_reflect opacity: ${(0.06 * s).toFixed(2)} blend: multiply {
    translate(time * 0.005, time * 0.002)
    | distort(scale: 0.30, speed: 0.06, strength: 0.008)
    | warp(scale: 0.4, octaves: 3, persistence: 0.55, strength: 0.12)
    | fbm(scale: 0.5, octaves: 3, persistence: 0.50)
    | glow(1.0)
    | tint(0.70, 0.74, 0.85)
    | mask("mask_water")
  }

  layer sky_glow opacity: ${(0.06 * s).toFixed(2)} blend: screen {
    translate(time * 0.003, time * 0.001)
    | warp(scale: 0.25, octaves: 2, persistence: 0.5, strength: 0.06)
    | fbm(scale: 0.20, octaves: 2, persistence: 0.5)
    | glow(1.5)
    | tint(0.80, 0.85, 0.95)
    | mask("mask_sky")
  }

  layer depth_mist opacity: ${(0.08 * s).toFixed(2)} blend: screen {
    translate(time * 0.005, sin(time * 0.04) * 0.003)
    | warp(scale: 0.5, octaves: 4, persistence: 0.58, strength: 0.14)
    | fbm(scale: 0.7, octaves: 4, persistence: 0.50)
    | glow(1.0)
    | tint(0.78, 0.82, 0.92)
  }

  pass soften { blur(0.5) }
  pass frame { vignette(0.26) }
  pass film { film_grain(0.012) }
}
`;
};

// ════════════════════════════════════════════════════════════════
// GENERIC LANDSCAPE FALLBACK
// ════════════════════════════════════════════════════════════════
const genericLandscapeTemplate: TemplateGenerator = (ctx) => {
  const { componentName, baseName, imageName, s, hasWater, hasSky } = ctx;
  const lines: string[] = [];
  lines.push(`// Living World — Landscape`);
  lines.push(`// Atmospheric compositing with depth-aware effects`);
  lines.push(`// Template: generic | Intensity: ${s.toFixed(2)}`);
  lines.push('');
  lines.push(`cinematic "${componentName}" {`);
  lines.push(`  texture "photo" from "${imageName}"`);
  lines.push(`  texture "depth" from "${baseName}-depth.png"`);
  if (hasWater) {
    lines.push(`  texture "flow_water" from "${baseName}-flow_water.png"`);
    lines.push(`  texture "mask_water" from "${baseName}-mask_water.png"`);
  }
  if (hasSky) {
    lines.push(`  texture "flow_sky" from "${baseName}-flow_sky.png"`);
    lines.push(`  texture "mask_sky" from "${baseName}-mask_sky.png"`);
  }
  lines.push('');
  lines.push(`  layer world {`);
  lines.push(`    parallax("photo", depth: "depth", strength: ${(0.025 * s).toFixed(3)}, orbit_speed: 0.08)`);
  lines.push('  }');

  if (hasWater) {
    lines.push('');
    lines.push(`  layer water_flow opacity: 0.92 {`);
    lines.push(`    flowmap("photo", "flow_water", speed: ${(0.18 * s).toFixed(2)}, scale: ${(0.05 * s).toFixed(3)})`);
    lines.push(`    | mask("mask_water")`);
    lines.push('  }');
    lines.push('');
    lines.push(`  layer caustics opacity: ${(0.12 * s).toFixed(2)} blend: screen {`);
    lines.push(`    translate(time * ${(0.02 * s).toFixed(3)}, time * ${(0.01 * s).toFixed(3)})`);
    lines.push(`    | warp(scale: 4.0, octaves: 3, strength: 0.22)`);
    lines.push(`    | voronoi(10.0)`);
    lines.push(`    | glow(2.5)`);
    lines.push(`    | tint(0.5, 0.75, 1.0)`);
    lines.push(`    | mask("mask_water")`);
    lines.push('  }');
  }

  if (hasSky) {
    lines.push('');
    lines.push(`  layer sky_drift opacity: 0.85 {`);
    lines.push(`    flowmap("photo", "flow_sky", speed: ${(0.06 * s).toFixed(2)}, scale: ${(0.010 * s).toFixed(3)})`);
    lines.push(`    | mask("mask_sky")`);
    lines.push('  }');
  }

  lines.push('');
  lines.push(`  layer mist opacity: ${(0.10 * s).toFixed(2)} blend: screen {`);
  lines.push(`    translate(time * ${(0.008 * s).toFixed(3)}, sin(time * 0.06) * 0.004)`);
  lines.push(`    | warp(scale: 0.8, octaves: 5, persistence: 0.60, strength: 0.20)`);
  lines.push(`    | fbm(scale: 1.2, octaves: 5, persistence: 0.50)`);
  lines.push(`    | glow(1.0)`);
  lines.push(`    | tint(0.85, 0.88, 0.95)`);
  if (hasSky) lines.push(`    | mask("depth", invert: 1)`);
  lines.push('  }');

  lines.push('');
  lines.push(`  layer light_sweep opacity: ${(0.09 * s).toFixed(2)} blend: screen {`);
  lines.push(`    translate(time * ${(0.010 * s).toFixed(3)}, time * ${(0.003 * s).toFixed(3)})`);
  lines.push(`    | warp(scale: 0.35, octaves: 3, persistence: 0.5, strength: 0.12)`);
  lines.push(`    | fbm(scale: 0.30, octaves: 3, persistence: 0.5)`);
  lines.push(`    | glow(1.5)`);
  lines.push(`    | tint(0.95, 0.90, 0.78)`);
  lines.push('  }');

  lines.push('');
  lines.push('  pass soften { blur(0.5) }');
  lines.push('  pass frame { vignette(0.25) }');
  lines.push('  pass film { film_grain(0.015) }');
  lines.push('}');
  lines.push('');
  return lines.join('\n');
};

// ════════════════════════════════════════════════════════════════
// TEMPLATE REGISTRY
// ════════════════════════════════════════════════════════════════
const TEMPLATES: Record<string, TemplateGenerator> = {
  aurora: auroraTemplate,
  ocean_coast: oceanCoastTemplate,
  waterfall: waterfallTemplate,
  forest_stream: forestStreamTemplate,
  campfire: campfireTemplate,
  thunderstorm: thunderstormTemplate,
  city_night: cityNightTemplate,
  desert_dunes: desertDunesTemplate,
  sunset_landscape: sunsetLandscapeTemplate,
  mountain_lake: mountainLakeTemplate,
  generic: genericLandscapeTemplate,
};

/**
 * Select the appropriate template for a scene type.
 * Falls back to generic if no specific template exists.
 */
export function selectTemplate(sceneType: string): TemplateGenerator {
  // Normalize scene type
  const normalized = sceneType.toLowerCase().replace(/[\s-]+/g, '_');

  // Direct match
  if (TEMPLATES[normalized]) return TEMPLATES[normalized];

  // Fuzzy match by keyword
  if (normalized.includes('aurora') || normalized.includes('northern_light')) return TEMPLATES.aurora;
  if (normalized.includes('ocean') || normalized.includes('coast') || normalized.includes('beach') || normalized.includes('shore')) return TEMPLATES.ocean_coast;
  if (normalized.includes('waterfall') || normalized.includes('cascade') || normalized.includes('falls')) return TEMPLATES.waterfall;
  if (normalized.includes('forest') || normalized.includes('stream') || normalized.includes('creek') || normalized.includes('woodland')) return TEMPLATES.forest_stream;
  if (normalized.includes('fire') || normalized.includes('campfire') || normalized.includes('bonfire') || normalized.includes('flame')) return TEMPLATES.campfire;
  if (normalized.includes('storm') || normalized.includes('thunder') || normalized.includes('lightning') || normalized.includes('rain')) return TEMPLATES.thunderstorm;
  if (normalized.includes('city') || normalized.includes('urban') || normalized.includes('night') || normalized.includes('neon')) return TEMPLATES.city_night;
  if (normalized.includes('desert') || normalized.includes('dune') || normalized.includes('sand') || normalized.includes('arid')) return TEMPLATES.desert_dunes;
  if (normalized.includes('sunset') || normalized.includes('golden_hour') || normalized.includes('sunrise') || normalized.includes('dawn')) return TEMPLATES.sunset_landscape;
  if (normalized.includes('mountain') && normalized.includes('lake') || normalized.includes('alpine_lake') || normalized.includes('mirror_lake')) return TEMPLATES.mountain_lake;

  return TEMPLATES.generic;
}

/**
 * Build template context from an ImageRecipe (photo pipeline).
 */
export function buildContextFromRecipe(recipe: ImageRecipe, opts: {
  imageName: string;
  baseName: string;
  hasWater: boolean;
  hasSky: boolean;
  hasVegetation: boolean;
}): TemplateContext {
  const intensity = recipe.ambient_motion_intensity ?? 0.3;
  const windX = recipe.global_wind_direction[0] * 0.025;
  const windY = recipe.global_wind_direction[1] * 0.005;

  return {
    componentName: `living-${opts.baseName}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
    baseName: opts.baseName,
    imageName: opts.imageName,
    hasWater: opts.hasWater,
    hasSky: opts.hasSky,
    hasVegetation: opts.hasVegetation,
    hasFire: false,
    s: 0.7 + intensity,
    windX,
    windY,
    colorTemp: recipe.color_temp ?? 'neutral',
    timeOfDay: recipe.time_of_day ?? 'day',
  };
}

/**
 * Build template context from a VideoMotionDescriptor.
 */
export function buildContextFromVideo(descriptor: VideoMotionDescriptor, opts: {
  imageName: string;
  baseName: string;
}): TemplateContext {
  const regionMotion = new Map<string, VideoRegionMotion>();
  for (const region of descriptor.regions) {
    regionMotion.set(region.name, region);
  }

  return {
    componentName: `living-${opts.baseName}`.replace(/[^a-z0-9-]/gi, '-').toLowerCase(),
    baseName: opts.baseName,
    imageName: opts.imageName,
    hasWater: descriptor.has_water ?? false,
    hasSky: descriptor.has_sky ?? false,
    hasVegetation: descriptor.has_vegetation ?? false,
    hasFire: descriptor.has_fire ?? false,
    s: 0.7 + descriptor.ambient_motion_intensity,
    windX: descriptor.global_wind_direction[0] * 0.025,
    windY: descriptor.global_wind_direction[1] * 0.005,
    colorTemp: descriptor.color_temp ?? 'neutral',
    timeOfDay: descriptor.time_of_day ?? 'day',
    regionMotion,
  };
}

/**
 * Generate .glyph source code using scene-specific template.
 */
export function generateFromTemplate(sceneType: string, context: TemplateContext): string {
  const template = selectTemplate(sceneType);
  return template(context);
}
