/**
 * GAME Compiler Invocation Wrapper
 *
 * Spawns the GAME compiler as a child process to compile .game source files
 * into HTML, web components, wallpaper bundles, or standalone outputs.
 *
 * The compiler binary is built from the parent Rust project at COMPILER_ROOT.
 * This wrapper uses `cargo run --release` so it works in development without
 * a pre-built binary — cargo will skip the build if already up to date.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

/** Root of the GAME compiler Rust project (three levels up from src/) */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const COMPILER_ROOT = path.resolve(__dirname, '../../..');

/** Output format supported by the GAME compiler */
export type CompileFormat = 'html' | 'component' | 'wallpaper' | 'standalone';

/**
 * Compile a .game source file using the GAME compiler.
 *
 * Spawns `cargo run --release -- build <gameFilePath> -o <outputDir> --format <format>`
 * in the compiler root directory.
 *
 * @param gameFilePath - Absolute or relative path to the .game source file
 * @param outputDir    - Directory for compiled output files
 * @param format       - Output format (default: 'html')
 * @returns Path to the generated .js file in the output directory
 * @throws Error if the compiler exits with a non-zero code
 */
export async function compileGameFile(
  gameFilePath: string,
  outputDir: string,
  format: CompileFormat = 'html'
): Promise<string> {
  const absoluteGamePath = path.resolve(gameFilePath);
  const absoluteOutputDir = path.resolve(outputDir);

  // Derive the expected output .js filename from the .game source
  const baseName = path.basename(gameFilePath, '.game');
  const expectedOutput = path.join(absoluteOutputDir, `${baseName}.js`);

  return new Promise<string>((resolve, reject) => {
    const args = [
      'run', '--release', '--',
      'build', absoluteGamePath,
      '-o', absoluteOutputDir,
      '--format', format,
    ];

    console.log(`[compiler] Running: cargo ${args.join(' ')}`);
    console.log(`[compiler] cwd: ${COMPILER_ROOT}`);

    const child = spawn('cargo', args, {
      cwd: COMPILER_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      // Stream compiler output so user sees progress
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      // Cargo prints build progress to stderr — stream it
      process.stderr.write(text);
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn cargo: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(
          `GAME compiler exited with code ${code}\n` +
          `stdout: ${stdout}\n` +
          `stderr: ${stderr}`
        ));
        return;
      }

      console.log(`[compiler] Compiled: ${expectedOutput}`);
      resolve(expectedOutput);
    });
  });
}
