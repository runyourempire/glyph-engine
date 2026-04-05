/**
 * GAME Gallery
 *
 * Scans the showcase examples directory and serves pre-built
 * visual components with their source code and metadata.
 * Excludes living wallpaper files (require external textures).
 */

import * as fs from 'fs';
import * as path from 'path';

const COMPILER_ROOT = process.env.GAME_COMPILER_ROOT || 'D:/runyourempire/game-engine/game-compiler';
const SHOWCASE_DIR = path.join(COMPILER_ROOT, 'examples', 'showcase');

export interface GalleryComponent {
  name: string;
  description: string;
  source: string;
  category: string;
  preview_html: string;
}

export interface GalleryResult {
  components: GalleryComponent[];
}

/**
 * Patterns that identify living wallpaper files (require external textures/images).
 * These are excluded because they can't compile standalone.
 */
const LIVING_WALLPAPER_PATTERNS = [
  '-living.game',
  'living-landscape.game',
  'living-photo.game',
  'ocean-alive.game',
  'yosemite-alive.game',
  'ocean-video-test.game',
  'video-test.game',
];

/**
 * Categorize a component based on its filename and source content.
 */
function categorize(filename: string, source: string): string {
  const lowerSource = source.toLowerCase();
  const lowerName = filename.toLowerCase();

  if (lowerSource.includes('swarm') || lowerSource.includes('react {') || lowerSource.includes('flow {') || lowerSource.includes('gravity {')) {
    return 'compute';
  }
  if (lowerSource.includes('mouse_x') || lowerSource.includes('mouse_down')) {
    return 'interactive';
  }
  if (lowerName.includes('aurora') || lowerName.includes('stellar') || lowerName.includes('solar') || lowerName.includes('galactic') || lowerName.includes('supernova') || lowerName.includes('cosmic')) {
    return 'cosmic';
  }
  if (lowerName.includes('ocean') || lowerName.includes('coral') || lowerName.includes('abyss') || lowerName.includes('tidal') || lowerName.includes('deep')) {
    return 'oceanic';
  }
  if (lowerName.includes('neural') || lowerName.includes('digital') || lowerName.includes('cyber') || lowerName.includes('quantum') || lowerName.includes('signal') || lowerName.includes('nexus')) {
    return 'digital';
  }
  if (lowerName.includes('volcanic') || lowerName.includes('molten') || lowerName.includes('ember') || lowerName.includes('plasma') || lowerName.includes('fire') || lowerName.includes('lava')) {
    return 'elemental';
  }
  if (lowerName.includes('void') || lowerName.includes('singularity') || lowerName.includes('event-horizon') || lowerName.includes('sacred')) {
    return 'abstract';
  }
  if (lowerName.includes('mycelium') || lowerName.includes('root') || lowerName.includes('dendrite') || lowerName.includes('mitosis') || lowerName.includes('morphogenesis') || lowerName.includes('primordial')) {
    return 'organic';
  }
  return 'procedural';
}

/**
 * Extract a one-line description from the first comment in a .game file.
 */
function extractDescription(source: string): string {
  const firstLine = source.split('\n')[0];
  if (firstLine?.startsWith('//')) {
    // Strip "// " prefix and any trailing period
    return firstLine.replace(/^\/\/\s*/, '').replace(/\.\s*$/, '').trim();
  }
  return 'GAME visual component';
}

/**
 * Extract the cinematic name from source code.
 */
function extractCinematicName(source: string): string {
  const match = source.match(/cinematic\s+"([^"]+)"/);
  return match ? match[1] : 'unknown';
}

/**
 * Generate a standalone HTML preview page for a component.
 */
function generatePreviewHtml(componentName: string, source: string): string {
  const tagName = `game-${componentName}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${componentName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    ${tagName} { display: block; width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <${tagName}></${tagName}>
  <!-- Compile this .game source with: game build input.game -o dist --format html -->
  <!-- Source requires compilation before this HTML will render -->
</body>
</html>`;
}

/**
 * Load all showcase components from the examples directory.
 * Filters out living wallpaper files and non-.game files.
 */
export function loadGallery(category?: string): GalleryResult {
  if (!fs.existsSync(SHOWCASE_DIR)) {
    return {
      components: [{
        name: 'gallery-unavailable',
        description: `Showcase directory not found at ${SHOWCASE_DIR}`,
        source: '',
        category: 'error',
        preview_html: '',
      }],
    };
  }

  const files = fs.readdirSync(SHOWCASE_DIR)
    .filter(f => f.endsWith('.game'))
    .filter(f => !LIVING_WALLPAPER_PATTERNS.some(pattern => f.includes(pattern)))
    // Also exclude files that are clearly asset-dependent (have companion .jpg/.png)
    .filter(f => {
      const base = f.replace('.game', '');
      const hasImage = fs.existsSync(path.join(SHOWCASE_DIR, `${base}.jpg`)) ||
                       fs.existsSync(path.join(SHOWCASE_DIR, `${base}.png`));
      return !hasImage;
    })
    .sort();

  let components: GalleryComponent[] = files.map(file => {
    const source = fs.readFileSync(path.join(SHOWCASE_DIR, file), 'utf-8');
    const cinematicName = extractCinematicName(source);
    const description = extractDescription(source);
    const cat = categorize(file, source);

    return {
      name: cinematicName,
      description,
      source,
      category: cat,
      preview_html: generatePreviewHtml(cinematicName, source),
    };
  });

  // Filter by category if specified
  if (category) {
    const lowerCat = category.toLowerCase();
    components = components.filter(c => c.category === lowerCat);
  }

  return { components };
}

/**
 * Get all available categories with counts.
 */
export function getCategories(): Record<string, number> {
  const gallery = loadGallery();
  const counts: Record<string, number> = {};
  for (const comp of gallery.components) {
    counts[comp.category] = (counts[comp.category] || 0) + 1;
  }
  return counts;
}
