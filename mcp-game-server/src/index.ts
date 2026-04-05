#!/usr/bin/env node

/**
 * GAME MCP Server
 *
 * Exposes the GAME compiler to AI agents via the Model Context Protocol.
 * Four tools:
 *   game_compile  — compile raw .game source to Web Component JS + HTML
 *   game_render   — generate GAME code from natural language, compile, return result
 *   game_gallery  — browse pre-built showcase components with source
 *   game_builtins — list all available builtin functions with signatures
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { compileGameSource } from './compiler.js';
import { generateGameVisual } from './generator.js';
import { loadGallery, getCategories } from './gallery.js';

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: 'game_compile',
    description:
      'Compile raw GAME source code into a GPU-rendered Web Component. ' +
      'Returns the compiled JavaScript, a standalone HTML page, component name, and bundle size. ' +
      'GAME is a DSL that compiles to WebGPU/WebGL2 shaders packaged as zero-dependency custom HTML elements.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        source: {
          type: 'string',
          description:
            'Raw GAME source code (the contents of a .game file). ' +
            'Must be a valid cinematic block with layers that end in Color state.',
        },
        target: {
          type: 'string',
          enum: ['webgpu', 'webgl2', 'both'],
          description:
            'Shader compilation target. "both" (default) produces a component that auto-detects GPU support.',
        },
      },
      required: ['source'],
    },
  },
  {
    name: 'game_render',
    description:
      'Generate a GPU-rendered visual from a natural language description. ' +
      'Uses Claude Sonnet to write GAME shader code, then compiles it into a working Web Component. ' +
      'Returns the generated .game source, compiled HTML page, and component name. ' +
      'Requires ANTHROPIC_API_KEY environment variable.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        description: {
          type: 'string',
          description:
            'Natural language description of the visual to create. Be specific about colors, ' +
            'movement, mood, and composition. Examples: "a breathing nebula with gold and violet " + ' +
            '"cosmic dust", "cyberpunk rain on dark glass with neon reflections", ' +
            '"bioluminescent jellyfish pulsing in deep ocean darkness".',
        },
      },
      required: ['description'],
    },
  },
  {
    name: 'game_gallery',
    description:
      'Browse pre-built showcase GAME components with their source code and descriptions. ' +
      'Returns procedural/generative visuals (aurora, nebula, void engine, etc). ' +
      'Each component includes compilable .game source code you can modify or learn from.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description:
            'Filter by category. Available: cosmic, oceanic, digital, elemental, abstract, organic, ' +
            'compute, interactive, procedural. Omit to return all components.',
        },
      },
    },
  },
  {
    name: 'game_builtins',
    description:
      'List all available GAME builtin functions with their signatures, input/output states, ' +
      'and descriptions. Essential reference for writing valid GAME code — every stage must ' +
      'follow the Position -> Sdf -> Color state machine.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
];

// ---------------------------------------------------------------------------
// Builtin Registry (static data extracted from compiler)
// ---------------------------------------------------------------------------

interface BuiltinInfo {
  name: string;
  signature: string;
  input_state: string;
  output_state: string;
  description: string;
}

const BUILTINS: BuiltinInfo[] = [
  // Position -> Position (transforms)
  { name: 'translate', signature: 'translate(x, y)', input_state: 'Position', output_state: 'Position', description: 'Move the coordinate origin by (x, y)' },
  { name: 'rotate', signature: 'rotate(speed)', input_state: 'Position', output_state: 'Position', description: 'Continuous rotation at given speed' },
  { name: 'scale', signature: 'scale(s)', input_state: 'Position', output_state: 'Position', description: 'Zoom coordinates by factor s' },
  { name: 'warp', signature: 'warp(scale, octaves, persistence, lacunarity, strength)', input_state: 'Position', output_state: 'Position', description: 'Organic domain warping using fractal noise. THE key to organic visuals.' },
  { name: 'distort', signature: 'distort(scale, speed, strength)', input_state: 'Position', output_state: 'Position', description: 'Animated noise-based distortion' },
  { name: 'polar', signature: 'polar()', input_state: 'Position', output_state: 'Position', description: 'Convert Cartesian to polar coordinates (creates radial/rotational effects)' },
  { name: 'repeat', signature: 'repeat(spacing_x, spacing_y)', input_state: 'Position', output_state: 'Position', description: 'Infinite tiling of the coordinate space' },
  { name: 'mirror', signature: 'mirror()', input_state: 'Position', output_state: 'Position', description: 'Mirror coordinates across the Y axis' },
  { name: 'radial', signature: 'radial(count)', input_state: 'Position', output_state: 'Position', description: 'Radial symmetry with given number of copies' },

  // Position -> Sdf (generators)
  { name: 'circle', signature: 'circle(radius=0.2)', input_state: 'Position', output_state: 'Sdf', description: 'Circle SDF with given radius' },
  { name: 'ring', signature: 'ring(radius=0.3, width=0.02)', input_state: 'Position', output_state: 'Sdf', description: 'Ring (annulus) with radius and line width' },
  { name: 'star', signature: 'star(points=5, radius=0.3, inner=0.15)', input_state: 'Position', output_state: 'Sdf', description: 'Star polygon with configurable point count and inner radius' },
  { name: 'box', signature: 'box(width=0.3, height=0.2)', input_state: 'Position', output_state: 'Sdf', description: 'Rectangle SDF' },
  { name: 'hex', signature: 'hex(radius=0.3)', input_state: 'Position', output_state: 'Sdf', description: 'Regular hexagon SDF' },
  { name: 'triangle', signature: 'triangle(size=0.3)', input_state: 'Position', output_state: 'Sdf', description: 'Equilateral triangle SDF' },
  { name: 'line', signature: 'line(x1, y1, x2, y2, width=0.01)', input_state: 'Position', output_state: 'Sdf', description: 'Line segment between two points' },
  { name: 'capsule', signature: 'capsule(length=0.3, radius=0.05)', input_state: 'Position', output_state: 'Sdf', description: 'Capsule (stadium) shape' },
  { name: 'arc_sdf', signature: 'arc_sdf(radius=0.3, angle=1.5, width=0.02)', input_state: 'Position', output_state: 'Sdf', description: 'Arc segment of a circle' },
  { name: 'cross', signature: 'cross(size=0.3, arm_width=0.08)', input_state: 'Position', output_state: 'Sdf', description: 'Cross/plus shape' },
  { name: 'heart', signature: 'heart(size=0.3)', input_state: 'Position', output_state: 'Sdf', description: 'Heart shape SDF' },
  { name: 'egg', signature: 'egg(radius=0.2, k=0.1)', input_state: 'Position', output_state: 'Sdf', description: 'Egg/ovoid shape' },
  { name: 'spiral', signature: 'spiral(turns=3, width=0.02)', input_state: 'Position', output_state: 'Sdf', description: 'Archimedean spiral' },
  { name: 'grid', signature: 'grid(spacing=0.2, width=0.005)', input_state: 'Position', output_state: 'Sdf', description: 'Regular grid lines' },
  { name: 'fbm', signature: 'fbm(scale=1, octaves=4, persistence=0.5, lacunarity=2)', input_state: 'Position', output_state: 'Sdf', description: 'Fractal Brownian Motion noise field. Best preceded by warp() for organic look.' },
  { name: 'simplex', signature: 'simplex(scale=1)', input_state: 'Position', output_state: 'Sdf', description: 'Simplex noise field' },
  { name: 'voronoi', signature: 'voronoi(scale=5)', input_state: 'Position', output_state: 'Sdf', description: 'Voronoi cell pattern (cellular noise)' },
  { name: 'radial_fade', signature: 'radial_fade(inner=0, outer=1)', input_state: 'Position', output_state: 'Sdf', description: 'Radial gradient from inner to outer radius' },

  // Sdf boolean ops
  { name: 'union', signature: 'union(a, b)', input_state: 'Sdf', output_state: 'Sdf', description: 'Boolean union of two SDFs' },
  { name: 'subtract', signature: 'subtract(a, b)', input_state: 'Sdf', output_state: 'Sdf', description: 'Boolean subtraction (a minus b)' },
  { name: 'intersect', signature: 'intersect(a, b)', input_state: 'Sdf', output_state: 'Sdf', description: 'Boolean intersection of two SDFs' },
  { name: 'smooth_union', signature: 'smooth_union(a, b, k)', input_state: 'Sdf', output_state: 'Sdf', description: 'Smooth boolean union with blending factor k' },
  { name: 'smooth_subtract', signature: 'smooth_subtract(a, b, k)', input_state: 'Sdf', output_state: 'Sdf', description: 'Smooth subtraction with blending factor k' },
  { name: 'smooth_intersect', signature: 'smooth_intersect(a, b, k)', input_state: 'Sdf', output_state: 'Sdf', description: 'Smooth intersection with blending factor k' },
  { name: 'xor', signature: 'xor(a, b)', input_state: 'Sdf', output_state: 'Sdf', description: 'Exclusive-or of two SDFs' },
  { name: 'morph', signature: 'morph(a, b, t)', input_state: 'Sdf', output_state: 'Sdf', description: 'Morph between two SDFs by factor t (0-1)' },

  // Sdf -> Sdf (modifiers)
  { name: 'round', signature: 'round(radius=0.02)', input_state: 'Sdf', output_state: 'Sdf', description: 'Round the edges of an SDF' },
  { name: 'shell', signature: 'shell(width=0.02)', input_state: 'Sdf', output_state: 'Sdf', description: 'Convert filled SDF to hollow shell' },
  { name: 'onion', signature: 'onion(count=3, width=0.02)', input_state: 'Sdf', output_state: 'Sdf', description: 'Concentric shell rings from an SDF' },
  { name: 'mask_arc', signature: 'mask_arc(angle)', input_state: 'Sdf', output_state: 'Sdf', description: 'Mask SDF to an angular arc' },

  // Sdf -> Color (bridges)
  { name: 'glow', signature: 'glow(intensity=1.5)', input_state: 'Sdf', output_state: 'Color', description: 'Soft luminous rendering. 2.0-4.0 = soft glow, 0.5-1.0 = tight defined edges. THE primary renderer.' },
  { name: 'shade', signature: 'shade(r=1, g=1, b=1)', input_state: 'Sdf', output_state: 'Color', description: 'Solid fill with anti-aliased edges. Use for true darkness (0,0,0) or flat color.' },
  { name: 'emissive', signature: 'emissive(intensity=1)', input_state: 'Sdf', output_state: 'Color', description: 'Pure white emission at given intensity' },
  { name: 'palette', signature: 'palette(name | a_r, a_g, a_b, b_r, b_g, b_b, c_r, c_g, c_b, d_r, d_g, d_b)', input_state: 'Sdf', output_state: 'Color', description: 'Cosine palette coloring from SDF distance. 30 named palettes available or custom ABCD coefficients.' },

  // Color -> Color
  { name: 'tint', signature: 'tint(r, g, b)', input_state: 'Color', output_state: 'Color', description: 'Multiply color by RGB values. Use after glow() for colored shapes.' },
  { name: 'bloom', signature: 'bloom(threshold=0.3, strength=2)', input_state: 'Color', output_state: 'Color', description: 'HDR bloom effect' },
  { name: 'grain', signature: 'grain(amount=0.1)', input_state: 'Color', output_state: 'Color', description: 'Film grain noise overlay' },
  { name: 'outline', signature: 'outline(width=0.01)', input_state: 'Color', output_state: 'Color', description: 'Edge outline around shapes' },
  { name: 'mask', signature: 'mask(invert=0)', input_state: 'Color', output_state: 'Color', description: 'Mask using a texture' },

  // Texture sampling (Position -> Color)
  { name: 'sample', signature: 'sample("texture_name")', input_state: 'Position', output_state: 'Color', description: 'Sample an external texture at current UV coordinates' },
  { name: 'flowmap', signature: 'flowmap("source", flow: "flow_tex", speed, scale)', input_state: 'Position', output_state: 'Color', description: 'Two-phase seamless flowmap animation from texture' },
  { name: 'parallax', signature: 'parallax("source", depth: "depth_tex", strength, orbit_speed)', input_state: 'Position', output_state: 'Color', description: 'Depth-driven parallax with orbital motion from texture' },
];

// ---------------------------------------------------------------------------
// Server Setup
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: 'game-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ---------------------------------------------------------------------------
// Tool Handlers
// ---------------------------------------------------------------------------

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'game_compile':
        return await handleCompile(args);
      case 'game_render':
        return await handleRender(args);
      case 'game_gallery':
        return handleGallery(args);
      case 'game_builtins':
        return handleBuiltins();
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Tool Implementations
// ---------------------------------------------------------------------------

async function handleCompile(args: Record<string, unknown> | undefined) {
  const source = args?.source;
  if (typeof source !== 'string' || !source.trim()) {
    return {
      content: [{ type: 'text', text: 'Error: "source" parameter is required and must be non-empty GAME source code.' }],
      isError: true,
    };
  }

  const target = (args?.target as string) || 'both';
  if (!['webgpu', 'webgl2', 'both'].includes(target)) {
    return {
      content: [{ type: 'text', text: `Error: Invalid target "${target}". Must be webgpu, webgl2, or both.` }],
      isError: true,
    };
  }

  const result = await compileGameSource(source, { target: target as 'webgpu' | 'webgl2' | 'both' });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            name: result.name,
            size_kb: result.size_kb,
            html: result.html,
            js: result.js,
          },
          null,
          2
        ),
      },
    ],
  };
}

async function handleRender(args: Record<string, unknown> | undefined) {
  const description = args?.description;
  if (typeof description !== 'string' || !description.trim()) {
    return {
      content: [{ type: 'text', text: 'Error: "description" parameter is required. Describe the visual you want to create.' }],
      isError: true,
    };
  }

  const result = await generateGameVisual(description);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            component_name: result.component_name,
            game_source: result.game_source,
            html: result.html,
          },
          null,
          2
        ),
      },
    ],
  };
}

function handleGallery(args: Record<string, unknown> | undefined) {
  const category = args?.category as string | undefined;
  const gallery = loadGallery(category);
  const categories = getCategories();

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            total: gallery.components.length,
            categories,
            components: gallery.components.map(c => ({
              name: c.name,
              description: c.description,
              category: c.category,
              source: c.source,
              preview_html: c.preview_html,
            })),
          },
          null,
          2
        ),
      },
    ],
  };
}

function handleBuiltins() {
  // Group builtins by category
  const grouped: Record<string, BuiltinInfo[]> = {};
  for (const b of BUILTINS) {
    const key = `${b.input_state} -> ${b.output_state}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(b);
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            total: BUILTINS.length,
            state_machine: 'Position -> Sdf -> Color (every layer must end in Color)',
            palettes: [
              'fire', 'ocean', 'neon', 'aurora', 'sunset', 'ice', 'ember', 'lava',
              'magma', 'inferno', 'plasma', 'electric', 'cyber', 'matrix', 'forest',
              'moss', 'earth', 'desert', 'blood', 'rose', 'candy', 'royal', 'deep_sea',
              'coral', 'arctic', 'twilight', 'vapor', 'gold', 'silver', 'monochrome',
            ],
            post_processing: [
              'blur(radius)', 'vignette(strength)', 'chromatic(offset)',
              'sharpen(strength)', 'film_grain(amount)', 'bloom(threshold, strength)',
              'grain(amount)', 'tint(r, g, b)',
            ],
            builtins: BUILTINS,
            grouped,
          },
          null,
          2
        ),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP JSON-RPC)
  process.stderr.write('GAME MCP Server running on stdio\n');
}

main().catch((error) => {
  process.stderr.write(`Fatal error: ${error}\n`);
  process.exit(1);
});
