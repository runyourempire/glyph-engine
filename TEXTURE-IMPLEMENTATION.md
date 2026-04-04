# Texture Sampling Implementation Plan

## Architecture

User textures get their own bind group, AFTER all existing groups:
- Group 0: Uniforms
- Group 1: Memory textures (if memory used)  
- Group N-1: Compute buffer (if compute used)
- **Group N: User textures** (NEW — all textures + samplers in one group)

The user texture group number depends on what other features are active:
- No memory, no compute: Group 1
- Memory only: Group 2
- Memory + compute: Group 3
- Compute only: Group 2

Each texture occupies 2 bindings: texture_2d<f32> + sampler.

## Files to modify

### 1. src/codegen/wgsl.rs — generate_fragment_inner()
- After memory bindings (line ~413), emit user texture bindings
- Calculate the correct group number (same logic as compute_group)
- For each texture: `@group(N) @binding(i*2) var {name}_tex: texture_2d<f32>;`
- For each texture: `@group(N) @binding(i*2+1) var {name}_samp: sampler;`

### 2. src/codegen/wgsl.rs — emit_wgsl_stage()
- Add "sample" case that emits: 
  `var color_result = textureSample({name}_tex, {name}_samp, p * 0.5 + 0.5);`
  (maps -1..1 position space to 0..1 texture space)

### 3. src/codegen/glsl.rs — generate_fragment_inner()
- After memory bindings, emit: `uniform sampler2D u_tex_{name};`

### 4. src/codegen/glsl.rs — emit_glsl_stage()
- Add "sample" case that emits:
  `vec4 color_result = texture(u_tex_{name}, p * 0.5 + 0.5);`

### 5. src/runtime/helpers.rs — webgpu_renderer()
- Add `texture_count: usize` parameter
- Create texture bind group layout with N*2 entries
- Add placeholder 1x1 white textures + samplers at init (before real textures load)
- Add pipeline layout entry for the texture group
- Add setBindGroup() call in render() for the texture group
- Add _rebuildTextureBindGroup() method
- Add setTexture(binding, textureView) method

### 6. src/runtime/component.rs
- Pass shader.textures.len() to webgpu_renderer()
- Fix loadTexture() to call _rebuildTextureBindGroup() instead of TODO
- Fix loadTextureFromData() similarly

### 7. src/codegen/mod.rs
- Pass cinematic.textures to generate_fragment so it can emit bindings

## Key design decisions

1. Placeholder textures: When the component initializes, textures haven't loaded yet.
   The bind group needs VALID textures. Use 1x1 white pixel textures as placeholders.
   When the real texture loads, replace in the bind group and rebuild.

2. UV mapping: GAME's position space is -1..1 centered. Texture UV is 0..1.
   The sample() stage maps: `texture_uv = position * 0.5 + 0.5`
   This means warp/distort stages that modify `p` naturally affect sampling.

3. WebGL2: Textures are just uniform sampler2D — much simpler. But we need
   to bind the loaded texture to the right texture unit.
