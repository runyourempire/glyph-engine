/**
 * .game source code generator — Template-based Living World Compositing.
 *
 * Strategy:
 * 1. Classify the scene type from analysis data
 * 2. Select the matching scene template (aurora, ocean, waterfall, etc.)
 * 3. Fill template with measured parameters (from photo or video analysis)
 *
 * Each template encodes scene-specific ARTISTIC knowledge:
 * - Which layers to use and how many
 * - Which blend modes per layer
 * - Physics-correct motion patterns
 * - Correct use of flowmap vs distort vs warp
 *
 * The photo is the world — life comes from the template architecture.
 */

import type { ImageRecipe } from './types.js';
import { selectTemplate, buildContextFromRecipe } from './templates.js';

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
 * Generate .game source code using scene-specific templates.
 */
export function generateGameSource(recipe: ImageRecipe, opts: GenerateOptions): string {
  const { imageName, baseName, hasWater, hasSky, hasVegetation } = opts;

  // Build template context from recipe
  const context = buildContextFromRecipe(recipe, {
    imageName,
    baseName,
    hasWater,
    hasSky,
    hasVegetation,
  });

  // Classify scene type
  const sceneType = classifySceneFromRecipe(recipe);

  // Select and fill template
  const template = selectTemplate(sceneType);
  return template(context);
}

/**
 * Classify scene type from image analysis recipe.
 * Maps the LLM's scene_type string to our template registry.
 */
function classifySceneFromRecipe(recipe: ImageRecipe): string {
  const st = (recipe.scene_type || '').toLowerCase();

  // Direct keyword matching
  if (st.includes('aurora') || st.includes('northern light')) return 'aurora';
  if (st.includes('ocean') || st.includes('coast') || st.includes('beach') || st.includes('shore') || st.includes('sea')) return 'ocean_coast';
  if (st.includes('waterfall') || st.includes('cascade') || st.includes('falls')) return 'waterfall';
  if (st.includes('forest') && (st.includes('stream') || st.includes('creek') || st.includes('river'))) return 'forest_stream';
  if (st.includes('forest') || st.includes('woodland') || st.includes('jungle')) return 'forest_stream';
  if (st.includes('fire') || st.includes('campfire') || st.includes('bonfire')) return 'campfire';
  if (st.includes('storm') || st.includes('thunder') || st.includes('lightning')) return 'thunderstorm';
  if (st.includes('city') || st.includes('urban') || st.includes('neon') || st.includes('street')) return 'city_night';
  if (st.includes('desert') || st.includes('dune') || st.includes('sand') || st.includes('arid')) return 'desert_dunes';

  // Infer from regions if scene_type text is generic
  const hasWater = recipe.has_water ?? recipe.regions.some(r => r.animation_class === 'water');
  const hasFire = recipe.regions.some(r => r.animation_class === 'fire');
  const hasSky = recipe.has_sky ?? recipe.regions.some(r => r.animation_class === 'sky');
  const hasVegetation = recipe.regions.some(r => r.animation_class === 'vegetation');

  if (hasFire) return 'campfire';

  // Check water flow direction for waterfall detection
  if (hasWater) {
    const waterRegion = recipe.regions.find(r => r.animation_class === 'water');
    if (waterRegion) {
      const [dx, dy] = waterRegion.flow_direction;
      // Strong downward flow suggests waterfall
      if (Math.abs(dy) > 0.7 && waterRegion.flow_speed > 0.4) return 'waterfall';
      // Fast flow with vegetation = forest stream
      if (hasVegetation && waterRegion.flow_speed < 0.3) return 'forest_stream';
    }
    // Default water scene: ocean coast
    return 'ocean_coast';
  }

  // Night scenes
  if (recipe.time_of_day === 'night') {
    if (hasSky) return 'aurora';
    return 'city_night';
  }

  // Generic landscape
  return 'generic';
}
