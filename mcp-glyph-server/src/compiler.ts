/**
 * GLYPH Compiler Wrapper
 *
 * Spawns the GLYPH compiler CLI to compile .glyph source code into
 * Web Component JS + standalone HTML. Handles temp file lifecycle
 * and error propagation.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Path to the GLYPH compiler Cargo project root
const COMPILER_ROOT = process.env.GLYPH_COMPILER_ROOT || 'D:/runyourempire/glyph-engine/glyph-compiler';

// Path to the pre-built release binary (faster than cargo run)
const COMPILER_BINARY = path.join(COMPILER_ROOT, 'target', 'release', 'game.exe');

export interface CompileResult {
  name: string;
  js: string;
  html: string;
  size_kb: number;
}

export interface CompileOptions {
  target?: 'webgpu' | 'webgl2' | 'both';
  format?: 'component' | 'html' | 'standalone';
}

/**
 * Determine whether to use the pre-built binary or cargo run.
 * Pre-built binary is ~100x faster startup.
 */
function getCompilerCommand(): { cmd: string; args: string[] } {
  if (fs.existsSync(COMPILER_BINARY)) {
    return { cmd: COMPILER_BINARY, args: [] };
  }
  // Fallback to cargo run --release
  return { cmd: 'cargo', args: ['run', '--release', '--'] };
}

/**
 * Compile raw GLYPH source code into a Web Component.
 *
 * Flow: write source to temp file -> invoke compiler -> read outputs -> clean up
 */
export async function compileGameSource(
  source: string,
  options: CompileOptions = {}
): Promise<CompileResult> {
  const target = options.target || 'both';
  const format = options.format || 'html';

  // Create isolated temp directory
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glyph-mcp-'));
  const srcFile = path.join(tmpDir, 'input.glyph');
  const outDir = path.join(tmpDir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(srcFile, source, 'utf-8');

  try {
    // Run the compiler
    await runCompiler(srcFile, outDir, target, format);

    // Read generated outputs
    const files = fs.readdirSync(outDir);
    const jsFile = files.find(f => f.endsWith('.js'));
    const htmlFile = files.find(f => f.endsWith('.html'));

    let jsContent = '';
    let htmlContent = '';
    let componentName = 'unknown';

    if (jsFile) {
      jsContent = fs.readFileSync(path.join(outDir, jsFile), 'utf-8');
      // Extract component name from filename (e.g., "glyph-input.js" -> "glyph-input")
      componentName = jsFile.replace('.js', '');
    }

    if (htmlFile) {
      htmlContent = fs.readFileSync(path.join(outDir, htmlFile), 'utf-8');
    } else if (jsContent) {
      // Generate minimal HTML wrapper if compiler didn't produce one
      htmlContent = generateHtmlWrapper(componentName, jsContent);
    }

    const sizeKb = Math.round((Buffer.byteLength(jsContent, 'utf-8') / 1024) * 100) / 100;

    return {
      name: componentName,
      js: jsContent,
      html: htmlContent,
      size_kb: sizeKb,
    };
  } finally {
    // Clean up temp files
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }
}

/**
 * Invoke the GLYPH compiler as a child process.
 */
function runCompiler(
  srcFile: string,
  outDir: string,
  target: string,
  format: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { cmd, args: baseArgs } = getCompilerCommand();
    const args = [
      ...baseArgs,
      'build',
      srcFile,
      '-o', outDir,
      '--format', format,
      '--target', target,
    ];

    const proc = spawn(cmd, args, {
      cwd: COMPILER_ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        // Extract meaningful error from stderr, filtering cargo noise
        const errorLines = stderr
          .split('\n')
          .filter(line =>
            !line.startsWith('warning:') &&
            !line.startsWith('   Compiling') &&
            !line.startsWith('    Finished') &&
            !line.startsWith('     Running') &&
            !line.startsWith('  -->') &&
            line.trim().length > 0
          )
          .join('\n')
          .trim();

        reject(new Error(
          `GLYPH compilation failed (exit ${code}):\n${errorLines || stderr || stdout || 'Unknown error'}`
        ));
      }
    });

    proc.on('error', (err: Error) => {
      reject(new Error(`Failed to spawn compiler: ${err.message}`));
    });

    // 30 second timeout for compilation
    setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Compilation timed out after 30 seconds'));
    }, 30_000);
  });
}

/**
 * Validate GLYPH source without generating output.
 * Returns null if valid, error string if invalid.
 */
export async function validateGameSource(source: string): Promise<string | null> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'glyph-validate-'));
  const srcFile = path.join(tmpDir, 'input.glyph');
  fs.writeFileSync(srcFile, source, 'utf-8');

  try {
    const { cmd, args: baseArgs } = getCompilerCommand();
    const args = [...baseArgs, 'validate', srcFile];

    return await new Promise((resolve) => {
      const proc = spawn(cmd, args, {
        cwd: COMPILER_ROOT,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        resolve(code === 0 ? null : stderr.trim() || 'Validation failed');
      });

      proc.on('error', (err: Error) => {
        resolve(`Validation error: ${err.message}`);
      });

      setTimeout(() => {
        proc.kill('SIGTERM');
        resolve('Validation timed out');
      }, 15_000);
    });
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  }
}

/**
 * Generate a standalone HTML page wrapping a compiled GLYPH component.
 */
function generateHtmlWrapper(componentName: string, jsContent: string): string {
  const tagName = componentName.startsWith('glyph-') ? componentName : `glyph-${componentName}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tagName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    ${tagName} { display: block; width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <${tagName}></${tagName}>
  <script type="module">
${jsContent}
  </script>
</body>
</html>`;
}
