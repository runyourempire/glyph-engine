#!/usr/bin/env node
// Capture animated GIFs of GAME showcase components.
// Uses NON-HEADLESS Chrome for real WebGPU rendering.
// Usage: node capture-gifs.js

const { chromium } = require('playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, 'output');
const GIFS = path.join(__dirname, '..', '..', 'docs', 'showcase');
const FRAMES = path.join(OUTPUT, 'frames');
const BASE_URL = 'http://localhost:8676';

const COMPONENTS = [
  { tag: 'game-deep-coral', name: 'deep-coral', warmup: 12000 },
  { tag: 'game-labyrinth', name: 'labyrinth', warmup: 12000 },
  { tag: 'game-morphogenesis', name: 'morphogenesis', warmup: 10000 },
  { tag: 'game-mitosis', name: 'mitosis', warmup: 10000 },
  { tag: 'game-event-horizon', name: 'event-horizon', warmup: 12000 },
  { tag: 'game-dendrite', name: 'dendrite', warmup: 8000 },
  { tag: 'game-root-system', name: 'root-system', warmup: 8000 },
  { tag: 'game-discharge', name: 'discharge', warmup: 6000 },
  { tag: 'game-sacred-geometry', name: 'sacred-geometry', warmup: 3000 },
];

const FPS = 12;
const DURATION = 4;
const FRAME_COUNT = FPS * DURATION;
const SIZE = 480;

async function captureComponent(browser, comp) {
  const frameDir = path.join(FRAMES, comp.name);
  fs.mkdirSync(frameDir, { recursive: true });

  console.log(`  ${comp.name} — warming up ${comp.warmup/1000}s...`);
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } });
  await page.goto(`${BASE_URL}/solo-eval.html?tag=${comp.tag}`);
  await page.waitForTimeout(comp.warmup);

  process.stdout.write(`  ${comp.name} — capturing ${FRAME_COUNT} frames `);
  for (let i = 0; i < FRAME_COUNT; i++) {
    await page.screenshot({ path: path.join(frameDir, `f${String(i).padStart(4,'0')}.png`) });
    await page.waitForTimeout(Math.floor(1000 / FPS));
    if (i % 12 === 0) process.stdout.write('.');
  }
  await page.close();
  console.log();

  // Two-pass ffmpeg for best GIF quality
  const gifPath = path.join(GIFS, `${comp.name}.gif`);
  const palPath = path.join(frameDir, 'pal.png');
  execSync(`ffmpeg -y -framerate ${FPS} -i "${frameDir}/f%04d.png" -vf "scale=${SIZE}:${SIZE}:flags=lanczos,palettegen=max_colors=128" "${palPath}"`, {stdio:'pipe'});
  execSync(`ffmpeg -y -framerate ${FPS} -i "${frameDir}/f%04d.png" -i "${palPath}" -lavfi "scale=${SIZE}:${SIZE}:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" "${gifPath}"`, {stdio:'pipe'});

  const sz = (fs.statSync(gifPath).size / 1024).toFixed(0);
  console.log(`  ✓ ${comp.name}.gif (${sz}KB)`);
  fs.rmSync(frameDir, { recursive: true });
}

async function main() {
  console.log('=== GAME GIF Capture (non-headless, real GPU) ===\n');
  fs.mkdirSync(GIFS, { recursive: true });
  fs.mkdirSync(FRAMES, { recursive: true });

  try {
    const res = await fetch(`${BASE_URL}/solo-eval.html`);
    if (!res.ok) throw new Error();
  } catch {
    console.error('ERROR: Start server first: cd tools/visual-eval/output && python -m http.server 8676');
    process.exit(1);
  }

  // NON-HEADLESS: real GPU rendering so WebGPU actually works
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-position=-2000,-2000'], // offscreen so it doesn't bother user
  });

  for (const comp of COMPONENTS) {
    await captureComponent(browser, comp);
  }
  await browser.close();

  console.log('\nAll GIFs saved to docs/showcase/');
}

main().catch(e => { console.error(e); process.exit(1); });
