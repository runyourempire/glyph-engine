#!/usr/bin/env node
/**
 * CLI entry point for the FULL photo-to-living-wallpaper pipeline.
 *
 * Orchestrates the complete flow: single photo -> depth estimation ->
 * scene analysis -> region masks -> AI video generation (Wan 2.2) ->
 * .glyph source with video texture -> optional compilation.
 *
 * Usage:
 *   npx tsx src/cli-video-gen.ts <photo.jpg> -o <output_dir> [--compile] [--quality fast|high]
 *
 * Requirements:
 *   - Python 3 with: Pillow, opencv-python, numpy (for generate_video.py)
 *   - ComfyUI at localhost:8188 OR diffusers + torch (for Wan 2.2)
 *   - ffmpeg with libsvtav1 and libx264 (for video encoding)
 *   - ANTHROPIC_API_KEY env var (for scene analysis, optional)
 *   - Rust toolchain (only if --compile is used)
 */

import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import sharp from 'sharp';
import { compileGameFile, type CompileFormat } from './invoke-compiler.js';

/** ESM compatibility */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Path to the Python video generation script (one level up from src/) */
const VIDEO_GEN_SCRIPT = path.resolve(__dirname, '..', 'generate_video.py');

// ================================================================
// ARGUMENT PARSING
// ================================================================

interface CliArgs {
  photoPath: string;
  outputDir: string;
  compile: boolean;
  quality: 'fast' | 'high';
  format: CompileFormat;
  duration: number;
  prompt: string | null;
  skipDepth: boolean;
  skipAnalysis: boolean;
}

function usage(): never {
  console.log(`
GLYPH Living Wallpaper -- Photo-to-Video Pipeline
==================================================

Full pipeline: photo -> depth -> analysis -> masks -> AI video -> .glyph -> compile

Usage:
  npx tsx src/cli-video-gen.ts <photo> -o <output_dir> [options]

Options:
  -o, --output <dir>    Output directory (required)
  --compile             Compile the generated .glyph file after generation
  --quality <level>     Generation quality: fast (30 steps) or high (50 steps)
                        (default: fast)
  --format <format>     Compilation format: html | component | wallpaper | standalone
                        (default: html, only used with --compile)
  --duration <sec>      Video duration: 3, 4, or 5 seconds (default: 3)
  --prompt <text>       Motion prompt for AI video generation
  --skip-depth          Skip depth estimation (re-use existing depth map)
  --skip-analysis       Skip Claude Vision analysis (use default recipe)

Environment:
  ANTHROPIC_API_KEY     Claude API key for intelligent scene analysis
  PYTHON                Python executable (default: python)

Examples:
  npx tsx src/cli-video-gen.ts landscape.jpg -o ./output
  npx tsx src/cli-video-gen.ts beach.png -o ./output --compile --format wallpaper
  npx tsx src/cli-video-gen.ts photo.jpg -o ./output --quality high --duration 5
  npx tsx src/cli-video-gen.ts aurora.jpg -o ./output --prompt "aurora borealis shimmer"

Pipeline steps:
  1. Depth estimation     (Depth Anything V2 Small via Transformers.js)
  2. Scene analysis        (Claude Vision API or fallback recipe)
  3. Region mask generation (depth + bounds-based segmentation)
  4. AI video generation   (Wan 2.2 TI2V via ComfyUI or diffusers)
  5. .glyph source generation (video texture + parallax + atmosphere)
  6. Compilation            (optional, GLYPH compiler via cargo)

Output:
  <name>-depth.png          Depth map (bright=near, dark=far)
  <name>-mask_*.png         Region masks (water, sky, vegetation, etc.)
  <name>-loop.webm          Looping video (AV1)
  <name>-loop.mp4           Looping video (H.264 fallback)
  <name>-living.glyph        GLYPH source code
  <name>-living.js          Compiled web component (if --compile)
`);
  process.exit(1);
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    usage();
  }

  const result: CliArgs = {
    photoPath: args[0],
    outputDir: '',
    compile: false,
    quality: 'fast',
    format: 'html',
    duration: 3,
    prompt: null,
    skipDepth: false,
    skipAnalysis: false,
  };

  let i = 1;
  while (i < args.length) {
    switch (args[i]) {
      case '-o':
      case '--output':
        i++;
        if (!args[i]) {
          console.error('Error: -o/--output requires a directory path');
          process.exit(1);
        }
        result.outputDir = args[i];
        break;
      case '--compile':
        result.compile = true;
        break;
      case '--quality':
        i++;
        if (args[i] !== 'fast' && args[i] !== 'high') {
          console.error('Error: --quality must be "fast" or "high"');
          process.exit(1);
        }
        result.quality = args[i] as 'fast' | 'high';
        break;
      case '--format':
        i++;
        if (!args[i]) {
          console.error('Error: --format requires a value (html | component | wallpaper | standalone)');
          process.exit(1);
        }
        result.format = args[i] as CompileFormat;
        break;
      case '--duration':
        i++;
        if (!args[i]) {
          console.error('Error: --duration requires a value (3, 4, or 5)');
          process.exit(1);
        }
        result.duration = parseInt(args[i], 10);
        if (![3, 4, 5].includes(result.duration)) {
          console.error('Error: --duration must be 3, 4, or 5');
          process.exit(1);
        }
        break;
      case '--prompt':
        i++;
        if (!args[i]) {
          console.error('Error: --prompt requires a text value');
          process.exit(1);
        }
        result.prompt = args[i];
        break;
      case '--skip-depth':
        result.skipDepth = true;
        break;
      case '--skip-analysis':
        result.skipAnalysis = true;
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        usage();
    }
    i++;
  }

  if (!result.outputDir) {
    console.error('Error: -o/--output is required');
    process.exit(1);
  }

  return result;
}

// ================================================================
// SUBPROCESS RUNNERS
// ================================================================

/**
 * Run a command as a child process, streaming stdout/stderr.
 * Returns a promise that resolves on exit code 0, rejects otherwise.
 */
function runCommand(
  command: string,
  args: string[],
  label: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    console.log(`[${label}] Running: ${command} ${args.join(' ')}`);

    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      process.stdout.write(chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(chunk);
    });

    child.on('error', (err) => {
      reject(new Error(
        `Failed to spawn ${command}: ${err.message}\n` +
        `Ensure ${command} is installed and available in PATH.`
      ));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(
          `${label} exited with code ${code}\n` +
          `stderr: ${stderr.slice(-1000)}`
        ));
        return;
      }
      resolve();
    });
  });
}

/**
 * Run depth estimation using the existing depth.ts module.
 * Imports dynamically to avoid loading heavy ONNX runtime unless needed.
 */
async function runDepthEstimation(
  imagePath: string,
  outputDir: string,
  baseName: string,
): Promise<{ depthPng: Buffer; depthValues: Float32Array; width: number; height: number }> {
  const { estimateDepth } = await import('./depth.js');

  const absoluteImagePath = path.resolve(imagePath);
  const meta = await sharp(absoluteImagePath).metadata();
  const width = meta.width ?? 1920;
  const height = meta.height ?? 1080;

  const result = await estimateDepth(absoluteImagePath, width, height);

  const depthPath = path.join(outputDir, `${baseName}-depth.png`);
  fs.writeFileSync(depthPath, result.png);
  console.log(`[depth] Saved: ${depthPath}`);

  return {
    depthPng: result.png,
    depthValues: result.values,
    width,
    height,
  };
}

/**
 * Run Claude Vision scene analysis.
 * Falls back to a generic recipe if no API key is set.
 */
async function runSceneAnalysis(
  imagePath: string,
  skipAnalysis: boolean,
): Promise<import('./types.js').ImageRecipe> {
  const { analyzeImage } = await import('./analyze.js');

  if (skipAnalysis) {
    return analyzeImage('__skip__');
  }

  return analyzeImage(path.resolve(imagePath));
}

/**
 * Run region mask generation from depth data and scene recipe.
 */
async function runMaskGeneration(
  depthValues: Float32Array,
  width: number,
  height: number,
  recipe: import('./types.js').ImageRecipe,
  outputDir: string,
  baseName: string,
): Promise<string[]> {
  const { generateMasks } = await import('./masks.js');

  const masks = await generateMasks(depthValues, width, height, recipe);
  const maskNames: string[] = [];

  masks.forEach((maskPng, maskName) => {
    const maskPath = path.join(outputDir, `${baseName}-${maskName}.png`);
    fs.writeFileSync(maskPath, maskPng);
    console.log(`[masks] Saved: ${maskPath}`);
    maskNames.push(maskName);
  });

  return maskNames;
}

/**
 * Run Python AI video generation script.
 */
async function runVideoGeneration(
  photoPath: string,
  outputDir: string,
  duration: number,
  prompt: string | null,
): Promise<void> {
  const pythonExe = process.env.PYTHON || 'python';
  const absolutePhotoPath = path.resolve(photoPath);
  const absoluteOutputDir = path.resolve(outputDir);

  // Verify the Python script exists
  if (!fs.existsSync(VIDEO_GEN_SCRIPT)) {
    throw new Error(
      `Video generation script not found: ${VIDEO_GEN_SCRIPT}\n` +
      `Expected at: tools/living-wallpaper/generate_video.py`
    );
  }

  const args = [
    VIDEO_GEN_SCRIPT,
    absolutePhotoPath,
    '-o', absoluteOutputDir,
    '--duration', String(duration),
  ];

  if (prompt) {
    args.push('--prompt', prompt);
  }

  await runCommand(pythonExe, args, 'video-gen');
}

// ================================================================
// GLYPH SOURCE GENERATION
// ================================================================

/**
 * Generate .glyph source code that uses the AI-generated video texture
 * with parallax depth and atmospheric overlays.
 */
function generateVideoGameSource(
  baseName: string,
  maskNames: string[],
  hasWater: boolean,
  hasSky: boolean,
): string {
  const componentName = `living-${baseName}`;
  const videoFile = `${baseName}-loop.webm`;
  const depthFile = `${baseName}-depth.png`;

  // Determine which mask textures to declare
  const maskDeclarations = maskNames
    .map(name => `  texture "${name}" from "${baseName}-${name}.png"`)
    .join('\n');

  // Build atmospheric layer based on detected scene elements
  let atmosphereLayer = '';
  if (hasSky) {
    atmosphereLayer = `
  // Subtle sky drift - atmospheric haze movement
  layer sky_haze opacity: 0.015 blend: screen {
    translate(time * 0.005, sin(time * 0.03) * 0.002)
    | warp(scale: 0.7, octaves: 3, persistence: 0.55, strength: 0.10)
    | fbm(scale: 0.8, octaves: 3, persistence: 0.45)
    | glow(0.5)
    | tint(0.85, 0.88, 0.95)
    | mask("mask_sky")
  }`;
  }

  let waterLayer = '';
  if (hasWater) {
    waterLayer = `
  // Water surface caustics overlay
  layer water_caustics opacity: 0.012 blend: add {
    translate(time * 0.008, time * 0.003)
    | warp(scale: 1.2, octaves: 4, persistence: 0.50, strength: 0.08)
    | voronoi(18.0)
    | glow(0.4)
    | tint(0.75, 0.85, 1.0)
    | mask("mask_water")
  }`;
  }

  const source = `// Living World -- AI Video + Depth Parallax
// Photo-to-video via Wan 2.2, depth via Depth Anything V2
// Generated by cli-video-gen pipeline

cinematic "${componentName}" {
  texture video "motion" from "${videoFile}"
  texture "depth" from "${depthFile}"
${maskDeclarations ? '\n' + maskDeclarations : ''}

  // Primary world layer: video with depth-based parallax
  layer world {
    parallax("motion", depth: "depth", strength: 0.003, orbit_speed: 0.06)
  }

  // Atmospheric overlay: subtle procedural texture for organic feel
  layer atmosphere opacity: 0.02 blend: screen {
    translate(time * 0.006, sin(time * 0.04) * 0.003)
    | warp(scale: 0.8, octaves: 4, persistence: 0.60, strength: 0.12)
    | fbm(scale: 1.0, octaves: 4, persistence: 0.50)
    | glow(0.6)
    | tint(0.88, 0.90, 0.96)
  }${atmosphereLayer}${waterLayer}

  // Post-processing
  pass frame { vignette(0.18) }
  pass film { film_grain(0.012) }
}
`;

  return source;
}

// ================================================================
// MAIN PIPELINE
// ================================================================

async function main() {
  const args = parseArgs(process.argv);
  const absolutePhotoPath = path.resolve(args.photoPath);
  const absoluteOutputDir = path.resolve(args.outputDir);

  // Validate input photo exists
  if (!fs.existsSync(absolutePhotoPath)) {
    console.error(`Error: Photo not found: ${absolutePhotoPath}`);
    process.exit(1);
  }

  // Derive base name from photo filename
  const baseName = path.basename(args.photoPath, path.extname(args.photoPath));

  console.log('GLYPH Living Wallpaper -- Photo-to-Video Pipeline');
  console.log('=================================================');
  console.log(`Input:   ${absolutePhotoPath}`);
  console.log(`Output:  ${absoluteOutputDir}`);
  console.log(`Quality: ${args.quality}`);
  console.log(`Duration: ${args.duration}s`);
  if (args.prompt) {
    console.log(`Prompt:  ${args.prompt}`);
  }
  console.log();

  const pipelineStart = Date.now();

  // Ensure output directory exists
  fs.mkdirSync(absoluteOutputDir, { recursive: true });

  // Copy source photo to output
  const sourceExt = path.extname(args.photoPath);
  const sourceOutPath = path.join(absoluteOutputDir, `${baseName}${sourceExt}`);
  if (!fs.existsSync(sourceOutPath)) {
    fs.copyFileSync(absolutePhotoPath, sourceOutPath);
  }

  // Track what scene elements are present
  let hasWater = false;
  let hasSky = false;
  let maskNames: string[] = [];

  // ── Step 1: Depth Estimation ───────────────────────────────
  const stepCount = args.compile ? 6 : 5;
  let step = 1;

  let depthValues: Float32Array | null = null;
  let imgWidth = 0;
  let imgHeight = 0;

  const depthPath = path.join(absoluteOutputDir, `${baseName}-depth.png`);

  if (args.skipDepth && fs.existsSync(depthPath)) {
    console.log(`=== Step ${step}/${stepCount}: Depth Estimation (cached) ===`);
    console.log(`[depth] Using existing depth map: ${depthPath}`);

    // Load existing depth for mask generation
    const meta = await sharp(absolutePhotoPath).metadata();
    imgWidth = meta.width ?? 1920;
    imgHeight = meta.height ?? 1080;

    const depthRaw = await sharp(depthPath)
      .resize(imgWidth, imgHeight, { fit: 'fill' })
      .raw()
      .toBuffer();

    depthValues = new Float32Array(imgWidth * imgHeight);
    for (let i = 0; i < depthRaw.length; i++) {
      depthValues[i] = depthRaw[i] / 255.0;
    }
  } else {
    console.log(`=== Step ${step}/${stepCount}: Depth Estimation ===`);
    const depthResult = await runDepthEstimation(absolutePhotoPath, absoluteOutputDir, baseName);
    depthValues = depthResult.depthValues;
    imgWidth = depthResult.width;
    imgHeight = depthResult.height;
  }
  step++;

  // ── Step 2: Scene Analysis ─────────────────────────────────
  console.log(`\n=== Step ${step}/${stepCount}: Scene Analysis ===`);
  const recipe = await runSceneAnalysis(absolutePhotoPath, args.skipAnalysis);
  console.log(`[analyze] Scene: ${recipe.scene_type}`);
  console.log(`[analyze] Regions: ${recipe.regions.length}`);

  hasWater = recipe.has_water ?? recipe.regions.some(r => r.animation_class === 'water');
  hasSky = recipe.has_sky ?? recipe.regions.some(r => r.animation_class === 'sky');
  step++;

  // ── Step 3: Region Masks ───────────────────────────────────
  console.log(`\n=== Step ${step}/${stepCount}: Region Mask Generation ===`);
  maskNames = await runMaskGeneration(
    depthValues, imgWidth, imgHeight, recipe, absoluteOutputDir, baseName,
  );
  step++;

  // ── Step 4: AI Video Generation ────────────────────────────
  console.log(`\n=== Step ${step}/${stepCount}: AI Video Generation ===`);
  const videoStart = Date.now();
  await runVideoGeneration(
    absolutePhotoPath,
    absoluteOutputDir,
    args.duration,
    args.prompt,
  );
  const videoElapsed = ((Date.now() - videoStart) / 1000).toFixed(1);
  console.log(`[video-gen] Video generation time: ${videoElapsed}s`);
  step++;

  // ── Step 5: Generate .glyph Source ──────────────────────────
  console.log(`\n=== Step ${step}/${stepCount}: Generate .glyph Source ===`);
  const glyphSource = generateVideoGameSource(baseName, maskNames, hasWater, hasSky);

  const glyphPath = path.join(absoluteOutputDir, `${baseName}-living.glyph`);
  fs.writeFileSync(glyphPath, glyphSource);
  console.log(`[game] Saved: ${glyphPath}`);
  step++;

  // ── Step 6 (optional): Compile ─────────────────────────────
  let compiledPath: string | undefined;
  if (args.compile) {
    console.log(`\n=== Step ${step}/${stepCount}: Compile (format: ${args.format}) ===`);
    compiledPath = await compileGameFile(glyphPath, absoluteOutputDir, args.format);
  }

  // ── Summary ────────────────────────────────────────────────
  const totalElapsed = ((Date.now() - pipelineStart) / 1000).toFixed(1);

  console.log('\n=================================================');
  console.log('  Photo-to-Video Pipeline Complete');
  console.log('=================================================');
  console.log(`\nGenerated files in ${absoluteOutputDir}/:`);
  console.log(`  ${baseName}${sourceExt}            (source photo)`);
  console.log(`  ${baseName}-depth.png        (depth map)`);

  for (const mask of maskNames) {
    console.log(`  ${baseName}-${mask}.png`);
  }

  // Check which video outputs exist
  const webmPath = path.join(absoluteOutputDir, `${baseName}-loop.webm`);
  const mp4Path = path.join(absoluteOutputDir, `${baseName}-loop.mp4`);

  if (fs.existsSync(webmPath)) {
    const webmSize = fs.statSync(webmPath).size;
    console.log(`  ${baseName}-loop.webm          (AV1, ${(webmSize / 1024).toFixed(0)} KB)`);
  }
  if (fs.existsSync(mp4Path)) {
    const mp4Size = fs.statSync(mp4Path).size;
    console.log(`  ${baseName}-loop.mp4           (H.264, ${(mp4Size / 1024).toFixed(0)} KB)`);
  }

  console.log(`  ${baseName}-living.glyph      (GLYPH source code)`);

  if (compiledPath) {
    console.log(`  ${path.basename(compiledPath)}    (compiled output)`);
  }

  console.log(`\nTotal time: ${totalElapsed}s`);

  if (!args.compile) {
    console.log(`\nTo compile:`);
    console.log(`  npx tsx src/cli-video-gen.ts ${args.photoPath} -o ${args.outputDir} --compile --format wallpaper`);
    console.log(`  # or directly:`);
    console.log(`  cargo run -- build ${glyphPath} -o ${absoluteOutputDir} --format html`);
  }
}

main().catch(err => {
  console.error('\nPipeline failed:', err.message || err);
  process.exit(1);
});
