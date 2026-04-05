#!/usr/bin/env node
/**
 * CLI entry point for the video-to-GAME living wallpaper pipeline.
 *
 * Takes a video file, runs Python-based motion analysis (optical flow, depth,
 * segmentation, FFT), then generates a .game source file using scene-specific
 * templates filled with measured motion parameters.
 *
 * Usage:
 *   npx tsx src/cli-video.ts <video.mp4> [output-dir] [--no-raft] [--compile] [--format html]
 *
 * Requirements:
 *   - Python 3 with: torch, torchvision, opencv-python, numpy, scipy, pillow
 *   - Optional: segment-anything-2, SEA-RAFT (falls back to OpenCV Farneback with --no-raft)
 *   - Rust toolchain (only if --compile is used)
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { buildContextFromVideo, selectTemplate } from './templates.js';
import { compileGameFile, type CompileFormat } from './invoke-compiler.js';
import type { VideoMotionDescriptor } from './types.js';

/** ESM compatibility */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Path to the Python analysis script (one level up from src/) */
const ANALYZE_SCRIPT = path.resolve(__dirname, '..', 'analyze_video.py');

// ════════════════════════════════════════════════════════════════
// ARGUMENT PARSING
// ════════════════════════════════════════════════════════════════

interface CliArgs {
  videoPath: string;
  outputDir: string;
  noRaft: boolean;
  compile: boolean;
  format: CompileFormat;
}

function usage(): never {
  console.log(`
GAME Living Wallpaper — Video Pipeline
========================================

Transforms a video into a region-aware living wallpaper using measured motion data.

Usage:
  npx tsx src/cli-video.ts <video> [output-dir] [options]

Options:
  --no-raft             Use OpenCV Farneback flow instead of SEA-RAFT
  --compile             Compile the generated .game file after generation
  --format <format>     Compilation format: html | component | wallpaper | standalone
                        (default: html, only used with --compile)

Environment:
  PYTHON — Python executable (default: python)

Examples:
  npx tsx src/cli-video.ts waterfall.mp4 ./output
  npx tsx src/cli-video.ts ocean.mp4 ./output --no-raft
  npx tsx src/cli-video.ts aurora.mp4 ./output --compile --format wallpaper

Pipeline:
  1. Python analysis: optical flow, depth, segmentation, FFT frequency extraction
  2. Scene classification and template selection
  3. .game source generation with measured motion parameters
  4. (Optional) GAME compiler invocation

Output:
  <name>.jpg              Representative still frame
  <name>-depth.png        Temporal depth map
  <name>-flow.png         Measured optical flow (RG channels)
  <name>-mask_*.png       Region masks (water, sky, vegetation, etc.)
  <name>-analysis.json    Full motion descriptor
  <name>-living.game      GAME source code
  <name>-living.js        Compiled web component (if --compile)
`);
  process.exit(1);
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    usage();
  }

  const result: CliArgs = {
    videoPath: args[0],
    outputDir: './output',
    noRaft: false,
    compile: false,
    format: 'html',
  };

  let i = 1;

  // Second positional arg is output dir (if it doesn't start with --)
  if (i < args.length && !args[i].startsWith('--')) {
    result.outputDir = args[i];
    i++;
  }

  // Parse flags
  while (i < args.length) {
    switch (args[i]) {
      case '--no-raft':
        result.noRaft = true;
        break;
      case '--compile':
        result.compile = true;
        break;
      case '--format':
        i++;
        if (!args[i]) {
          console.error('Error: --format requires a value (html | component | wallpaper | standalone)');
          process.exit(1);
        }
        result.format = args[i] as CompileFormat;
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        usage();
    }
    i++;
  }

  return result;
}

// ════════════════════════════════════════════════════════════════
// PYTHON ANALYSIS
// ════════════════════════════════════════════════════════════════

/**
 * Run the Python video analysis script as a subprocess.
 *
 * Spawns: python analyze_video.py <video> -o <outputDir> [--no-raft]
 * The script produces texture PNGs and an analysis JSON in the output directory.
 */
async function runPythonAnalysis(
  videoPath: string,
  outputDir: string,
  noRaft: boolean
): Promise<void> {
  const absoluteVideoPath = path.resolve(videoPath);
  const absoluteOutputDir = path.resolve(outputDir);

  // Determine Python executable (respect PYTHON env var)
  const pythonExe = process.env.PYTHON || 'python';

  const args = [ANALYZE_SCRIPT, absoluteVideoPath, '-o', absoluteOutputDir];
  if (noRaft) {
    args.push('--no-raft');
  }

  console.log(`[video] Running: ${pythonExe} ${args.join(' ')}`);

  return new Promise<void>((resolve, reject) => {
    const child = spawn(pythonExe, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      // Stream Python output so user sees progress
      process.stdout.write(chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(chunk);
    });

    child.on('error', (err) => {
      reject(new Error(
        `Failed to spawn Python: ${err.message}\n` +
        `Ensure Python 3 is installed and available as '${pythonExe}'.\n` +
        `Set the PYTHON environment variable to override.`
      ));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(
          `Python analysis exited with code ${code}\n` +
          `stderr: ${stderr}`
        ));
        return;
      }
      resolve();
    });
  });
}

// ════════════════════════════════════════════════════════════════
// MAIN PIPELINE
// ════════════════════════════════════════════════════════════════

async function main() {
  const args = parseArgs(process.argv);
  const absoluteVideoPath = path.resolve(args.videoPath);
  const absoluteOutputDir = path.resolve(args.outputDir);

  // Validate input video exists
  if (!fs.existsSync(absoluteVideoPath)) {
    console.error(`Error: Video file not found: ${absoluteVideoPath}`);
    process.exit(1);
  }

  // Derive base name from video filename (e.g., "waterfall" from "waterfall.mp4")
  const baseName = path.basename(args.videoPath, path.extname(args.videoPath));

  console.log('GAME Living Wallpaper — Video Pipeline');
  console.log('======================================');
  console.log(`Input:  ${absoluteVideoPath}`);
  console.log(`Output: ${absoluteOutputDir}`);
  console.log();

  const start = Date.now();

  // Ensure output directory exists
  fs.mkdirSync(absoluteOutputDir, { recursive: true });

  // ── Step 1: Python video analysis ──────────────────────────
  console.log('=== Step 1/3: Video Analysis (Python) ===');
  await runPythonAnalysis(absoluteVideoPath, absoluteOutputDir, args.noRaft);

  // ── Step 2: Read analysis JSON and generate .game source ───
  console.log('\n=== Step 2/3: Generate .game Source ===');

  const analysisPath = path.join(absoluteOutputDir, `${baseName}-analysis.json`);
  if (!fs.existsSync(analysisPath)) {
    console.error(`Error: Analysis JSON not found at ${analysisPath}`);
    console.error('The Python analysis script may have failed to produce output.');
    process.exit(1);
  }

  const analysisRaw = fs.readFileSync(analysisPath, 'utf-8');
  const descriptor: VideoMotionDescriptor = JSON.parse(analysisRaw);

  console.log(`[video] Scene type: ${descriptor.scene_type}`);
  console.log(`[video] Regions: ${descriptor.regions.length}`);
  console.log(`[video] Motion intensity: ${descriptor.ambient_motion_intensity.toFixed(2)}`);
  console.log(`[video] Camera stabilized: ${descriptor.camera_stabilized}`);
  if (descriptor.scene_characteristic) {
    console.log(`[video] Characteristic: ${descriptor.scene_characteristic}`);
  }

  // Build template context from video motion data
  const imageName = `${baseName}.jpg`;
  const context = buildContextFromVideo(descriptor, { imageName, baseName });

  // Select scene-specific template and generate .game source
  const template = selectTemplate(descriptor.scene_type);
  const gameSource = template(context);

  const gamePath = path.join(absoluteOutputDir, `${baseName}-living.game`);
  fs.writeFileSync(gamePath, gameSource);
  console.log(`[video] Saved: ${gamePath}`);

  // ── Step 3 (optional): Compile ─────────────────────────────
  let compiledPath: string | undefined;
  if (args.compile) {
    console.log(`\n=== Step 3/3: Compile (format: ${args.format}) ===`);
    compiledPath = await compileGameFile(gamePath, absoluteOutputDir, args.format);
  }

  // ── Summary ────────────────────────────────────────────────
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log('\n======================================');
  console.log('  Pipeline Complete');
  console.log('======================================');
  console.log(`\nGenerated files in ${absoluteOutputDir}/:`);
  console.log(`  ${baseName}.jpg              (representative still frame)`);
  console.log(`  ${baseName}-depth.png        (temporal depth map)`);
  console.log(`  ${baseName}-flow.png         (measured optical flow)`);

  // List any mask files that were generated
  const outputFiles = fs.readdirSync(absoluteOutputDir);
  const maskFiles = outputFiles.filter(f => f.startsWith(`${baseName}-mask_`) && f.endsWith('.png'));
  for (const mask of maskFiles) {
    console.log(`  ${mask}`);
  }

  console.log(`  ${baseName}-analysis.json    (motion descriptor)`);
  console.log(`  ${baseName}-living.game      (GAME source code)`);

  if (compiledPath) {
    console.log(`  ${path.basename(compiledPath)}    (compiled output)`);
  }

  console.log(`\nTotal time: ${elapsed}s`);

  if (!args.compile) {
    console.log(`\nTo compile:`);
    console.log(`  npx tsx src/cli-video.ts ${args.videoPath} ${args.outputDir} --compile --format wallpaper`);
    console.log(`  # or directly:`);
    console.log(`  cargo run -- build ${gamePath} -o ${absoluteOutputDir} --format html`);
  }
}

main().catch(err => {
  console.error('\nPipeline failed:', err.message || err);
  process.exit(1);
});
