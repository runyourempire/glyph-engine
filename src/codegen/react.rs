//! React block codegen — Gray-Scott reaction-diffusion compute shader.
//!
//! The most visually productive algorithm in generative art. Two chemicals
//! (A and B) diffuse at different rates and react, producing Turing patterns:
//! spots, stripes, labyrinths, mitosis, coral, fingerprints.
//!
//! ```game
//! react {
//!   feed: 0.055
//!   kill: 0.062
//!   seed: center(0.1)
//! }
//! ```
//!
//! Generates:
//! - WGSL compute shader for Gray-Scott simulation on ping-pong textures
//! - `GameReactionField` JS class for GPU dispatch and readback

use crate::ast::{ReactBlock, SeedMode};

/// Generate WGSL compute shader for Gray-Scott reaction-diffusion.
///
/// Two storage textures (A/B concentrations), ping-pong each frame.
/// The Laplacian is a 3x3 convolution with standard weights.
pub fn generate_compute_wgsl(react: &ReactBlock) -> String {
    let mut s = String::with_capacity(4096);
    let workgroup_size = 8; // 8x8 = 64 threads per workgroup

    // Uniforms
    s.push_str("struct RDParams {\n");
    s.push_str("    feed: f32,\n");
    s.push_str("    kill: f32,\n");
    s.push_str("    diffuse_a: f32,\n");
    s.push_str("    diffuse_b: f32,\n");
    s.push_str("    width: u32,\n");
    s.push_str("    height: u32,\n");
    s.push_str("};\n\n");

    // Bindings
    s.push_str("@group(0) @binding(0) var<uniform> params: RDParams;\n");
    s.push_str("@group(0) @binding(1) var<storage, read> field_in: array<vec2<f32>>;\n");
    s.push_str("@group(0) @binding(2) var<storage, read_write> field_out: array<vec2<f32>>;\n\n");

    // Helper: index with wrapping
    s.push_str("fn idx(x: i32, y: i32) -> u32 {\n");
    s.push_str("    let wx = u32((x + i32(params.width)) % i32(params.width));\n");
    s.push_str("    let wy = u32((y + i32(params.height)) % i32(params.height));\n");
    s.push_str("    return wy * params.width + wx;\n");
    s.push_str("}\n\n");

    // Compute entry
    s.push_str(&format!(
        "@compute @workgroup_size({workgroup_size}, {workgroup_size})\n"
    ));
    s.push_str("fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {\n");
    s.push_str("    let x = i32(gid.x);\n");
    s.push_str("    let y = i32(gid.y);\n");
    s.push_str("    if (gid.x >= params.width || gid.y >= params.height) { return; }\n\n");

    // Read current cell
    s.push_str("    let i = idx(x, y);\n");
    s.push_str("    let ab = field_in[i];\n");
    s.push_str("    let a = ab.x;\n");
    s.push_str("    let b = ab.y;\n\n");

    // 3x3 Laplacian (standard weights: center=-1, adjacent=0.2, diagonal=0.05)
    s.push_str("    // Laplacian with standard 3x3 kernel\n");
    s.push_str("    let lap = \n");
    s.push_str("        field_in[idx(x-1, y-1)] * 0.05 +\n");
    s.push_str("        field_in[idx(x,   y-1)] * 0.2  +\n");
    s.push_str("        field_in[idx(x+1, y-1)] * 0.05 +\n");
    s.push_str("        field_in[idx(x-1, y  )] * 0.2  +\n");
    s.push_str("        field_in[idx(x,   y  )] * -1.0 +\n");
    s.push_str("        field_in[idx(x+1, y  )] * 0.2  +\n");
    s.push_str("        field_in[idx(x-1, y+1)] * 0.05 +\n");
    s.push_str("        field_in[idx(x,   y+1)] * 0.2  +\n");
    s.push_str("        field_in[idx(x+1, y+1)] * 0.05;\n\n");

    // Gray-Scott equations — read from uniforms so JS can modulate with time
    s.push_str("    let abb = a * b * b;\n");
    s.push_str(
        "    let new_a = a + (params.diffuse_a * lap.x - abb + params.feed * (1.0 - a));\n",
    );
    s.push_str(
        "    let new_b = b + (params.diffuse_b * lap.y + abb - (params.feed + params.kill) * b);\n\n",
    );

    // Clamp and write
    s.push_str(
        "    field_out[i] = clamp(vec2<f32>(new_a, new_b), vec2<f32>(0.0), vec2<f32>(1.0));\n",
    );
    s.push_str("}\n");

    s
}

/// Generate JavaScript runtime for reaction-diffusion GPU dispatch.
pub fn generate_compute_runtime_js(react: &ReactBlock, width: u32, height: u32) -> String {
    let mut s = String::with_capacity(4096);

    s.push_str("class GameReactionField {\n");
    s.push_str(&format!(
        "  constructor(device, computeCode) {{ this._w = {width}; this._h = {height}; this._device = device; this._code = computeCode; }}\n\n"
    ));

    s.push_str("  async init() {\n");
    s.push_str("    const device = this._device;\n");
    s.push_str("    const module = device.createShaderModule({ code: this._code });\n");
    s.push_str("    this._pipeline = device.createComputePipeline({\n");
    s.push_str("      layout: 'auto',\n");
    s.push_str("      compute: { module, entryPoint: 'cs_main' },\n");
    s.push_str("    });\n\n");

    // Storage buffers for field (vec2<f32> per cell: A and B concentrations)
    s.push_str("    const cellCount = this._w * this._h;\n");
    s.push_str("    const bufSize = cellCount * 8; // 2 x f32\n");
    s.push_str("    this._bufA = device.createBuffer({ size: bufSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });\n");
    s.push_str("    this._bufB = device.createBuffer({ size: bufSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });\n");
    s.push_str("    this._paramBuf = device.createBuffer({ size: 24, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });\n\n");

    // Initialize field: A=1.0 everywhere, B=0.0 except seed region
    s.push_str("    const init = new Float32Array(cellCount * 2);\n");
    s.push_str("    for (let i = 0; i < cellCount; i++) {\n");
    s.push_str("      init[i * 2] = 1.0;     // chemical A\n");
    s.push_str("      init[i * 2 + 1] = 0.0; // chemical B\n");
    s.push_str("    }\n");

    // Seed based on mode
    match &react.seed {
        SeedMode::Center(radius) => {
            s.push_str(&format!("    // Seed: center blob, radius {radius}\n"));
            s.push_str("    const cx = this._w / 2, cy = this._h / 2;\n");
            s.push_str(&format!(
                "    const r = Math.floor(Math.max(this._w, this._h) * {radius});\n"
            ));
            s.push_str("    for (let dy = -r; dy <= r; dy++) {\n");
            s.push_str("      for (let dx = -r; dx <= r; dx++) {\n");
            s.push_str("        if (dx*dx + dy*dy <= r*r) {\n");
            s.push_str("          const idx = ((cy + dy) * this._w + (cx + dx)) * 2;\n");
            s.push_str("          if (idx >= 0 && idx < init.length - 1) {\n");
            s.push_str("            init[idx + 1] = 1.0;\n");
            s.push_str("          }\n");
            s.push_str("        }\n");
            s.push_str("      }\n");
            s.push_str("    }\n");
        }
        SeedMode::Scatter(count) => {
            s.push_str(&format!("    // Seed: {count} scattered points\n"));
            s.push_str(&format!("    for (let s = 0; s < {count}; s++) {{\n"));
            s.push_str("      const sx = Math.floor(Math.random() * this._w);\n");
            s.push_str("      const sy = Math.floor(Math.random() * this._h);\n");
            s.push_str("      for (let dy = -2; dy <= 2; dy++) {\n");
            s.push_str("        for (let dx = -2; dx <= 2; dx++) {\n");
            s.push_str("          const idx = ((sy + dy) * this._w + (sx + dx)) * 2;\n");
            s.push_str("          if (idx >= 0 && idx < init.length - 1) init[idx + 1] = 1.0;\n");
            s.push_str("        }\n");
            s.push_str("      }\n");
            s.push_str("    }\n");
        }
        SeedMode::Random(density) => {
            s.push_str(&format!("    // Seed: random field, density {density}\n"));
            s.push_str("    for (let i = 0; i < cellCount; i++) {\n");
            s.push_str(&format!(
                "      if (Math.random() < {density}) init[i * 2 + 1] = 1.0;\n"
            ));
            s.push_str("    }\n");
        }
    }

    s.push_str("    device.queue.writeBuffer(this._bufA, 0, init);\n");
    s.push_str("  }\n\n");

    // Dispatch: run N simulation steps per frame
    // Feed/kill modulated with time to prevent equilibrium — patterns breathe forever
    let feed = react.feed;
    let kill = react.kill;
    let da = react.diffuse_a;
    let db = react.diffuse_b;
    s.push_str("  dispatch(steps = 8) {\n");
    s.push_str("    const t = performance.now() * 0.001;\n");
    s.push_str("    const device = this._device;\n");
    s.push_str("    const params = new ArrayBuffer(24);\n");
    s.push_str("    const f = new Float32Array(params);\n");
    s.push_str("    const u = new Uint32Array(params);\n");
    s.push_str(&format!(
        "    f[0] = {} + Math.sin(t * 0.3) * 0.002;\n", feed
    ));
    s.push_str(&format!(
        "    f[1] = {} + Math.cos(t * 0.2) * 0.001;\n", kill
    ));
    s.push_str(&format!("    f[2] = {}; f[3] = {};\n", da, db));
    s.push_str("    u[4] = this._w; u[5] = this._h;\n");
    s.push_str("    device.queue.writeBuffer(this._paramBuf, 0, params);\n\n");

    s.push_str("    const enc = device.createCommandEncoder();\n");
    s.push_str("    for (let step = 0; step < steps; step++) {\n");
    s.push_str("      const bg = device.createBindGroup({\n");
    s.push_str("        layout: this._pipeline.getBindGroupLayout(0),\n");
    s.push_str("        entries: [\n");
    s.push_str("          { binding: 0, resource: { buffer: this._paramBuf } },\n");
    s.push_str("          { binding: 1, resource: { buffer: this._bufA } },\n");
    s.push_str("          { binding: 2, resource: { buffer: this._bufB } },\n");
    s.push_str("        ],\n");
    s.push_str("      });\n");
    s.push_str("      const pass = enc.beginComputePass();\n");
    s.push_str("      pass.setPipeline(this._pipeline);\n");
    s.push_str("      pass.setBindGroup(0, bg);\n");
    s.push_str("      pass.dispatchWorkgroups(Math.ceil(this._w / 8), Math.ceil(this._h / 8));\n");
    s.push_str("      pass.end();\n");
    s.push_str("      [this._bufA, this._bufB] = [this._bufB, this._bufA];\n");
    s.push_str("    }\n");
    s.push_str("    device.queue.submit([enc.finish()]);\n");
    s.push_str("  }\n\n");

    s.push_str("  get fieldBuffer() { return this._bufA; }\n");
    s.push_str("  get width() { return this._w; }\n");
    s.push_str("  get height() { return this._h; }\n");
    s.push_str("}\n");

    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::*;

    fn make_react() -> ReactBlock {
        ReactBlock {
            feed: 0.055,
            kill: 0.062,
            diffuse_a: 1.0,
            diffuse_b: 0.5,
            seed: SeedMode::Center(0.1),
        }
    }

    #[test]
    fn compute_shader_has_workgroup() {
        let wgsl = generate_compute_wgsl(&make_react());
        assert!(wgsl.contains("@compute @workgroup_size(8, 8)"));
        assert!(wgsl.contains("fn cs_main"));
    }

    #[test]
    fn compute_shader_has_laplacian() {
        let wgsl = generate_compute_wgsl(&make_react());
        assert!(wgsl.contains("Laplacian"));
        assert!(wgsl.contains("0.05")); // diagonal weight
        assert!(wgsl.contains("0.2")); // adjacent weight
    }

    #[test]
    fn compute_shader_has_gray_scott() {
        let wgsl = generate_compute_wgsl(&make_react());
        assert!(wgsl.contains("a * b * b")); // reaction term
        assert!(wgsl.contains("params.feed")); // feed from uniform
        assert!(wgsl.contains("params.kill")); // kill from uniform
    }

    #[test]
    fn compute_shader_has_storage_buffers() {
        let wgsl = generate_compute_wgsl(&make_react());
        assert!(wgsl.contains("var<storage, read>"));
        assert!(wgsl.contains("var<storage, read_write>"));
    }

    #[test]
    fn compute_shader_wraps_boundaries() {
        let wgsl = generate_compute_wgsl(&make_react());
        assert!(wgsl.contains("fn idx("));
        assert!(wgsl.contains("% i32(params.width)"));
    }

    #[test]
    fn runtime_js_center_seed() {
        let js = generate_compute_runtime_js(&make_react(), 256, 256);
        assert!(js.contains("class GameReactionField"));
        assert!(js.contains("center blob"));
        assert!(js.contains("dx*dx + dy*dy"));
    }

    #[test]
    fn runtime_js_scatter_seed() {
        let mut r = make_react();
        r.seed = SeedMode::Scatter(50);
        let js = generate_compute_runtime_js(&r, 256, 256);
        assert!(js.contains("scattered points"));
        assert!(js.contains("50"));
    }

    #[test]
    fn runtime_js_random_seed() {
        let mut r = make_react();
        r.seed = SeedMode::Random(0.3);
        let js = generate_compute_runtime_js(&r, 256, 256);
        assert!(js.contains("random field"));
        assert!(js.contains("0.3"));
    }

    #[test]
    fn runtime_js_has_dispatch() {
        let js = generate_compute_runtime_js(&make_react(), 256, 256);
        assert!(js.contains("dispatch(steps"));
        assert!(js.contains("dispatchWorkgroups"));
        assert!(js.contains("ping-pong") || js.contains("bufA, this._bufB"));
    }

    #[test]
    fn runtime_js_has_accessors() {
        let js = generate_compute_runtime_js(&make_react(), 128, 128);
        assert!(js.contains("get fieldBuffer()"));
        assert!(js.contains("get width()"));
        assert!(js.contains("get height()"));
    }

    #[test]
    fn custom_parameters_in_runtime() {
        let r = ReactBlock {
            feed: 0.04,
            kill: 0.065,
            diffuse_a: 0.8,
            diffuse_b: 0.4,
            seed: SeedMode::Center(0.15),
        };
        // Feed/kill now in JS runtime (with time modulation), not WGSL
        let js = generate_compute_runtime_js(&r, 256, 256);
        assert!(js.contains("0.04")); // base feed in JS
        assert!(js.contains("0.065")); // base kill in JS
        // WGSL reads from params uniform
        let wgsl = generate_compute_wgsl(&r);
        assert!(wgsl.contains("params.feed"));
        assert!(wgsl.contains("params.diffuse_a"));
    }
}
