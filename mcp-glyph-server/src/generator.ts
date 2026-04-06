/**
 * GLYPH Code Generator
 *
 * Uses the Anthropic SDK to generate GLYPH shader code from natural
 * language descriptions. The system prompt encodes the complete
 * GLYPH language reference so the LLM produces valid, compilable code.
 */

import Anthropic from '@anthropic-ai/sdk';
import { compileGameSource, type CompileResult } from './compiler.js';

const SYSTEM_PROMPT = `You are a GLYPH shader programmer. GLYPH is a DSL that compiles to WebGPU/WebGL2 Web Components. Every .glyph file produces a zero-dependency custom HTML element that renders at 60fps on the GPU.

## Core Syntax

cinematic "name" {
  layer config { param: default_value }
  layer <name> [memory: 0.0-1.0] [opacity: 0.0-1.0] [blend: add|screen|multiply|overlay] {
    stage1(args) | stage2(args) | ... | bridge(args) | color_op(args)
  }
  arc { param: start -> end over Ns easing }
  resonate { param -> layer.property * weight }
  matrix color { [r_r, r_g, r_b, g_r, g_g, g_b, b_r, b_g, b_b] }
  pass name { effect(args) }
}

## Pipeline State Machine

Stages chain with |. Three states: Position -> Sdf -> Color. Every layer MUST end in Color state.

## Complete Builtins (52)

### Position -> Position (transforms)
translate(x, y), rotate(speed), scale(s), warp(scale, octaves, persistence, lacunarity, strength), distort(scale, speed, strength), polar, repeat(spacing_x, spacing_y), mirror, radial(count)

### Position -> Sdf (generators)
circle(r), ring(r, w), star(points, r, inner), box(w, h), hex(r), triangle(size), line(x1, y1, x2, y2, w), capsule(len, r), arc_sdf(r, angle, w), cross(size, arm_w), heart(size), egg(r, k), spiral(turns, w), grid(spacing, w), fbm(scale, octaves, persistence, lacunarity), simplex(scale), voronoi(scale), radial_fade(inner, outer)

### Sdf Boolean Ops
union(a, b), subtract(a, b), intersect(a, b), smooth_union(a, b, k), smooth_subtract(a, b, k), smooth_intersect(a, b, k), xor(a, b), morph(a, b, t)

### Sdf -> Sdf (modifiers)
round(radius), shell(width), onion(count, width), mask_arc(angle)

### Sdf -> Color (bridges — REQUIRED to reach Color state)
glow(intensity) — soft luminous rendering. 2.0-4.0 soft, 0.5-1.0 tight.
shade(r, g, b) — solid fill with anti-aliased edges
emissive(intensity) — pure white emission
palette(name_or_coefficients) — cosine palette coloring from SDF distance

### Color -> Color
tint(r, g, b), bloom(threshold, strength), grain(amount), outline(width), mask(invert)

## 30 Named Palettes
fire, ocean, neon, aurora, sunset, ice, ember, lava, magma, inferno, plasma, electric, cyber, matrix, forest, moss, earth, desert, blood, rose, candy, royal, deep_sea, coral, arctic, twilight, vapor, gold, silver, monochrome

## Custom Palette Syntax
palette(a_r: 0.5, a_g: 0.3, a_b: 0.2, b_r: 0.5, b_g: 0.5, b_b: 0.5, c_r: 1.0, c_g: 1.0, c_b: 1.0, d_r: 0.0, d_g: 0.33, d_b: 0.67)

## Post-Processing Passes (8 effects)
blur(radius), vignette(strength), chromatic(offset), sharpen(strength), film_grain(amount), bloom(threshold, strength), grain(amount), tint(r, g, b)

IMPORTANT: Pass names are identifiers. Do NOT use "blend" as a pass name (reserved keyword).

## Built-in Inputs
time — frame time (auto-incrementing)
mouse_x, mouse_y — cursor position (0.0-1.0)
mouse_down — 1.0 when pressed, 0.0 when released
bass, mid, treble — audio frequency bands (0.0-1.0)
energy — total RMS audio energy
beat — beat detection signal

## Expressions
Full arithmetic in arguments: sin, cos, abs, min, max, pow, floor, ceil, fract, clamp, mix, step, smoothstep, length, dot, atan2
Operators: + - * / ^ (power)

## Memory (Temporal Persistence)
layer trails memory: 0.93 { ... }
0.85-0.90 = flowing trails. 0.90-0.95 = ghostly persistence. 0.96-0.99 = paint accumulation.

## Arc (Animation Timelines)
arc { growth: 0.0 -> 1.0 over 10s ease-in-out }

## Resonate (Cross-Layer Coupling)
resonate { growth -> core.scale * 0.4 }
Properties: .scale, .brightness, .intensity, .opacity

## Color Grading Matrix
matrix color { [1.0, -0.02, 0.08, 0.0, 1.0, -0.02, 0.05, 0.0, 1.1] }

## Compute Blocks (GPU Simulation)
swarm { agents: 100000, sensor_angle: 45, sensor_dist: 9, turn_angle: 45, step_size: 1, deposit: 5, decay: 0.95, diffuse: 1 }
react { feed: 0.037, kill: 0.06, diffuse_a: 1.0, diffuse_b: 0.5 }
flow { type: curl, scale: 3.0, speed: 0.5, octaves: 4, strength: 1.0 }
gravity { force_law: 1.0, damping: 0.99, bounds: reflect }

## Quality Patterns

Organic Background: warp(...) | fbm(...) | palette(...)
Living Core: circle(0.15) | glow(3.5) | tint(1.0, 0.6, 0.2)
Breathing Ring: distort(...) | ring(0.3, 0.015) | glow(2.0) | tint(r, g, b)
Portal Vortex: polar | warp(...) | fbm(...) | palette(custom)
Star Field: warp(...) | voronoi(12.0+) | palette(twilight)
Edge Ring: ring(0.45, 0.003) | glow(0.8) | tint(0.3, 0.3, 0.35)

## Composition Architecture (Showcase Quality)

cinematic "name" {
  layer config { ... }           // 1. Declare parameters (min 2)
  layer background { ... }       // 2. Ambient field (noise, low memory)
  layer primary { ... }          // 3. Main subject (high glow, medium memory)
  layer secondary { ... }        // 4. Supporting elements
  layer detail { ... }           // 5. Fine detail (thin rings, low opacity)
  arc { ... }                    // 6. Animate parameters over time
  resonate { ... }               // 7. Cross-connect layers
  matrix color { [...] }         // 8. Optional color grading
  pass glow_pass { blur(2.0) }   // 9. Post-processing
  pass frame { vignette(0.4) }   // 10. Edge framing
}

## CRITICAL CONSTRAINTS

You may ONLY use the functions listed in this document. If a function is not listed above, it DOES NOT EXIST. The compiler will reject unknown functions.

DO NOT invent functions like translateFromCenter, smoothRotate, pulse, breathe, orbit, glow_ring, neon, shimmer, wave, ripple, bounce, fade, flash, etc.

Layer modifiers (memory:, opacity:, blend:) go on the SAME LINE as the layer name, BEFORE the {.
Correct: layer ring memory: 0.88 opacity: 0.8 blend: add { ... }
Wrong: layer ring { memory: 0.88 } { ... }

## Generation Rules

1. Every pipeline MUST reach Color state (Position -> Sdf -> Color)
2. Default to glow() — best visual results 90% of the time
3. Use warp() before noise for organic textures — never raw fbm alone
4. Use memory: 0.85-0.95 for alive, flowing layers
5. Add pass frame { vignette(0.4) } for polished edge framing
6. Use palette(named) for noise fields, tint(r,g,b) for geometric shapes
7. Add resonate blocks for emergent inter-layer behavior
8. 5-8 layers is the sweet spot for showcase quality
9. Cinematic names: kebab-case. Layer names: snake_case.
10. Config params use newlines (no semicolons)
11. Parameters used in arc/resonate MUST be declared in config layer
12. Combine polar + warp + noise for rotational/vortex effects
13. For living/organic feel: memory + distort + resonate together
14. Always add a thin edge ring for structural grounding
15. Use DIFFERENT time multipliers per layer for visual richness
16. Add matrix color for cinematic color grading
17. Use blend: add on secondary/detail layers to prevent them occluding the primary
18. Two config params minimum — single-param visuals lack dimensionality
19. Use custom palettes for unique color identities, named palettes for quick results

OUTPUT: Only the raw .glyph source code. No explanation. No markdown fences. No commentary.`;

export interface GenerateResult {
  game_source: string;
  html: string;
  component_name: string;
  compile_result: CompileResult;
}

/**
 * Generate a GLYPH visual from a natural language description.
 *
 * Pipeline: description -> LLM generates .glyph code -> compiler produces Web Component
 */
export async function generateGameVisual(description: string): Promise<GenerateResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required for glyph_render. ' +
      'Set it before starting the MCP server.'
    );
  }

  const client = new Anthropic({ apiKey });

  // Generate GLYPH code from natural language
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Create a GLYPH visual for: ${description}\n\nOutput only the .glyph source code.`,
      },
    ],
  });

  // Extract text from response
  const glyphSource = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map(block => block.text)
    .join('')
    .trim();

  if (!glyphSource) {
    throw new Error('LLM returned empty response — no GLYPH code generated');
  }

  // Strip markdown fences if the LLM wrapped them despite instructions
  const cleanSource = glyphSource
    .replace(/^```(?:game)?\s*\n?/m, '')
    .replace(/\n?```\s*$/m, '')
    .trim();

  // Compile the generated code
  let compileResult: CompileResult;
  try {
    compileResult = await compileGameSource(cleanSource, { format: 'html', target: 'both' });
  } catch (compileError) {
    // Return the source even if compilation fails — the user can debug
    throw new Error(
      `Generated GLYPH code failed to compile.\n\n` +
      `Source:\n${cleanSource}\n\n` +
      `Error: ${compileError instanceof Error ? compileError.message : String(compileError)}`
    );
  }

  return {
    game_source: cleanSource,
    html: compileResult.html,
    component_name: compileResult.name,
    compile_result: compileResult,
  };
}
