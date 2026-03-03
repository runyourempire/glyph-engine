//! Flow block codegen — curl noise vector field compute shader.
//!
//! Generates divergence-free flow fields from curl noise. Particles advected
//! by the field produce organic, fluid-like, smoke-like motion without
//! full Navier-Stokes simulation.
//!
//! ```game
//! flow {
//!   type: curl
//!   scale: 3.0
//!   speed: 0.5
//!   octaves: 4
//!   strength: 1.0
//! }
//! ```
//!
//! Generates:
//! - WGSL compute shader that writes a vec2 vector field texture
//! - `GameFlowField` JS class for GPU dispatch and particle advection

use crate::ast::{FlowBlock, FlowType};

/// Generate WGSL compute shader for vector field generation.
///
/// Outputs a storage buffer of vec2<f32> vectors — one per texel.
/// Curl noise: compute 3D scalar noise, take the curl for divergence-free vectors.
pub fn generate_compute_wgsl(flow: &FlowBlock) -> String {
    let mut s = String::with_capacity(4096);

    // Params
    s.push_str("struct FlowParams {\n");
    s.push_str("    scale: f32,\n");
    s.push_str("    speed: f32,\n");
    s.push_str("    strength: f32,\n");
    s.push_str("    time: f32,\n");
    s.push_str("    width: u32,\n");
    s.push_str("    height: u32,\n");
    s.push_str("};\n\n");

    // Bindings
    s.push_str("@group(0) @binding(0) var<uniform> params: FlowParams;\n");
    s.push_str("@group(0) @binding(1) var<storage, read_write> field: array<vec2<f32>>;\n\n");

    // Noise functions — simplex-style permutation noise
    s.push_str("// Permutation hash for noise\n");
    s.push_str("fn mod289(x: vec3<f32>) -> vec3<f32> { return x - floor(x / 289.0) * 289.0; }\n");
    s.push_str("fn mod289_4(x: vec4<f32>) -> vec4<f32> { return x - floor(x / 289.0) * 289.0; }\n");
    s.push_str("fn perm(x: vec4<f32>) -> vec4<f32> { return mod289_4((x * 34.0 + 1.0) * x); }\n\n");

    // 3D noise for curl computation
    s.push_str("fn noise3(p: vec3<f32>) -> f32 {\n");
    s.push_str("    let a = floor(p);\n");
    s.push_str("    let d = p - a;\n");
    s.push_str("    let dd = d * d * (3.0 - 2.0 * d);\n");
    s.push_str("    let b = vec4<f32>(a.xy, a.xy + 1.0);\n");
    s.push_str("    let k1 = perm(vec4<f32>(b.xzxz));\n");
    s.push_str("    let k2 = perm(k1 + vec4<f32>(b.yyww));\n");
    s.push_str("    let c = k2 + vec4<f32>(a.z, a.z, a.z, a.z);\n");
    s.push_str("    let k3 = perm(c);\n");
    s.push_str("    let k4 = perm(c + 1.0);\n");
    s.push_str("    let o1 = fract(k3 / 41.0);\n");
    s.push_str("    let o2 = fract(k4 / 41.0);\n");
    s.push_str("    let o3 = o2 * dd.z + o1 * (1.0 - dd.z);\n");
    s.push_str("    let o4 = vec2<f32>(o3.yw * dd.x + o3.xz * (1.0 - dd.x));\n");
    s.push_str("    return o4.y * dd.y + o4.x * (1.0 - dd.y);\n");
    s.push_str("}\n\n");

    // FBM (fractal Brownian motion) for octave layering
    let octaves = flow.octaves;
    s.push_str(&format!("fn fbm(p: vec3<f32>) -> f32 {{\n"));
    s.push_str("    var sum = 0.0;\n");
    s.push_str("    var amp = 0.5;\n");
    s.push_str("    var freq = 1.0;\n");
    s.push_str(&format!("    for (var i = 0u; i < {octaves}u; i++) {{\n"));
    s.push_str("        sum += noise3(p * freq) * amp;\n");
    s.push_str("        freq *= 2.0;\n");
    s.push_str("        amp *= 0.5;\n");
    s.push_str("    }\n");
    s.push_str("    return sum;\n");
    s.push_str("}\n\n");

    // Compute entry — generate vector field
    s.push_str("@compute @workgroup_size(8, 8)\n");
    s.push_str("fn cs_flow(@builtin(global_invocation_id) gid: vec3<u32>) {\n");
    s.push_str("    if (gid.x >= params.width || gid.y >= params.height) { return; }\n\n");

    s.push_str("    let uv = vec2<f32>(f32(gid.x) / f32(params.width), f32(gid.y) / f32(params.height));\n");
    s.push_str("    let p = vec3<f32>(uv * params.scale, params.time * params.speed);\n\n");

    // Generate vector based on flow type
    match flow.flow_type {
        FlowType::Curl => {
            // Curl noise: ∇ × F — take cross-product of noise gradient for divergence-free field
            s.push_str("    // Curl noise: divergence-free flow\n");
            s.push_str("    let eps = 0.01;\n");
            s.push_str("    let dx = fbm(p + vec3<f32>(eps, 0.0, 0.0)) - fbm(p - vec3<f32>(eps, 0.0, 0.0));\n");
            s.push_str("    let dy = fbm(p + vec3<f32>(0.0, eps, 0.0)) - fbm(p - vec3<f32>(0.0, eps, 0.0));\n");
            s.push_str("    let vel = vec2<f32>(-dy, dx) / (2.0 * eps) * params.strength;\n");
        }
        FlowType::Perlin => {
            s.push_str("    // Perlin-based flow (not divergence-free)\n");
            s.push_str("    let angle = fbm(p) * 6.28318;\n");
            s.push_str("    let vel = vec2<f32>(cos(angle), sin(angle)) * params.strength;\n");
        }
        FlowType::Simplex => {
            s.push_str("    // Simplex noise angle field\n");
            s.push_str("    let n1 = fbm(p);\n");
            s.push_str("    let n2 = fbm(p + vec3<f32>(17.3, 31.7, 5.1));\n");
            s.push_str("    let vel = vec2<f32>(n1 - 0.5, n2 - 0.5) * 2.0 * params.strength;\n");
        }
        FlowType::Vortex => {
            s.push_str("    // Vortex field: rotational flow around center\n");
            s.push_str("    let center = vec2<f32>(0.5, 0.5);\n");
            s.push_str("    let diff = uv - center;\n");
            s.push_str("    let dist = max(length(diff), 0.01);\n");
            s.push_str("    let vortex = vec2<f32>(-diff.y, diff.x) / dist;\n");
            s.push_str("    let turbulence = fbm(p) * 0.5;\n");
            s.push_str("    let vel = (vortex + turbulence) * params.strength;\n");
        }
    }

    s.push_str("\n    field[gid.y * params.width + gid.x] = vel;\n");
    s.push_str("}\n");

    s
}

/// Generate JavaScript runtime for flow field GPU dispatch.
pub fn generate_flow_runtime_js(flow: &FlowBlock, width: u32, height: u32) -> String {
    let mut s = String::with_capacity(2048);
    let scale = flow.scale;
    let speed = flow.speed;
    let strength = flow.strength;

    s.push_str("class GameFlowField {\n");
    s.push_str(&format!(
        "  constructor(device, computeCode) {{ this._w = {width}; this._h = {height}; this._device = device; this._code = computeCode; }}\n\n"
    ));

    s.push_str("  async init() {\n");
    s.push_str("    const device = this._device;\n");
    s.push_str("    const module = device.createShaderModule({ code: this._code });\n");
    s.push_str("    this._pipeline = device.createComputePipeline({\n");
    s.push_str("      layout: 'auto',\n");
    s.push_str("      compute: { module, entryPoint: 'cs_flow' },\n");
    s.push_str("    });\n\n");

    // Vector field buffer (vec2<f32> per texel)
    s.push_str("    const bufSize = this._w * this._h * 8;\n");
    s.push_str("    this._fieldBuf = device.createBuffer({ size: bufSize, usage: GPUBufferUsage.STORAGE });\n");
    s.push_str("    this._paramBuf = device.createBuffer({ size: 24, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });\n");
    s.push_str("    this._time = 0;\n");
    s.push_str("  }\n\n");

    // Dispatch
    s.push_str("  dispatch(dt) {\n");
    s.push_str("    this._time += dt;\n");
    s.push_str("    const device = this._device;\n");
    s.push_str("    const p = new ArrayBuffer(24);\n");
    s.push_str("    const f = new Float32Array(p); const u = new Uint32Array(p);\n");
    s.push_str(&format!(
        "    f[0] = {}; f[1] = {}; f[2] = {}; f[3] = this._time;\n",
        scale, speed, strength
    ));
    s.push_str("    u[4] = this._w; u[5] = this._h;\n");
    s.push_str("    device.queue.writeBuffer(this._paramBuf, 0, p);\n\n");

    s.push_str("    const bg = device.createBindGroup({\n");
    s.push_str("      layout: this._pipeline.getBindGroupLayout(0),\n");
    s.push_str("      entries: [\n");
    s.push_str("        { binding: 0, resource: { buffer: this._paramBuf } },\n");
    s.push_str("        { binding: 1, resource: { buffer: this._fieldBuf } },\n");
    s.push_str("      ],\n");
    s.push_str("    });\n");
    s.push_str("    const enc = device.createCommandEncoder();\n");
    s.push_str("    const pass = enc.beginComputePass();\n");
    s.push_str("    pass.setPipeline(this._pipeline);\n");
    s.push_str("    pass.setBindGroup(0, bg);\n");
    s.push_str("    pass.dispatchWorkgroups(Math.ceil(this._w / 8), Math.ceil(this._h / 8));\n");
    s.push_str("    pass.end();\n");
    s.push_str("    device.queue.submit([enc.finish()]);\n");
    s.push_str("  }\n\n");

    // Sample: read vector at UV position (for JS-side particle advection)
    s.push_str("  get fieldBuffer() { return this._fieldBuf; }\n");
    s.push_str("  get width() { return this._w; }\n");
    s.push_str("  get height() { return this._h; }\n");
    s.push_str("}\n");

    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::*;

    fn make_flow() -> FlowBlock {
        FlowBlock {
            flow_type: FlowType::Curl,
            scale: 3.0,
            speed: 0.5,
            octaves: 4,
            strength: 1.0,
            bounds: BoundsMode::Wrap,
        }
    }

    #[test]
    fn curl_flow_has_divergence_free() {
        let wgsl = generate_compute_wgsl(&make_flow());
        assert!(wgsl.contains("divergence-free"));
        assert!(wgsl.contains("fn cs_flow"));
    }

    #[test]
    fn curl_flow_has_noise_functions() {
        let wgsl = generate_compute_wgsl(&make_flow());
        assert!(wgsl.contains("fn noise3("));
        assert!(wgsl.contains("fn fbm("));
    }

    #[test]
    fn curl_flow_uses_cross_derivative() {
        let wgsl = generate_compute_wgsl(&make_flow());
        assert!(wgsl.contains("let dx = fbm("));
        assert!(wgsl.contains("let dy = fbm("));
        assert!(wgsl.contains("vec2<f32>(-dy, dx)"));
    }

    #[test]
    fn perlin_flow_uses_angle() {
        let mut f = make_flow();
        f.flow_type = FlowType::Perlin;
        let wgsl = generate_compute_wgsl(&f);
        assert!(wgsl.contains("not divergence-free"));
        assert!(wgsl.contains("cos(angle)"));
    }

    #[test]
    fn simplex_flow_uses_dual_noise() {
        let mut f = make_flow();
        f.flow_type = FlowType::Simplex;
        let wgsl = generate_compute_wgsl(&f);
        assert!(wgsl.contains("Simplex noise"));
        assert!(wgsl.contains("n1"));
        assert!(wgsl.contains("n2"));
    }

    #[test]
    fn vortex_flow_has_rotational() {
        let mut f = make_flow();
        f.flow_type = FlowType::Vortex;
        let wgsl = generate_compute_wgsl(&f);
        assert!(wgsl.contains("Vortex field"));
        assert!(wgsl.contains("rotational"));
    }

    #[test]
    fn fbm_uses_correct_octaves() {
        let mut f = make_flow();
        f.octaves = 6;
        let wgsl = generate_compute_wgsl(&f);
        assert!(wgsl.contains("6u"));
    }

    #[test]
    fn runtime_js_generates() {
        let js = generate_flow_runtime_js(&make_flow(), 256, 256);
        assert!(js.contains("class GameFlowField"));
        assert!(js.contains("cs_flow"));
    }

    #[test]
    fn runtime_has_dispatch() {
        let js = generate_flow_runtime_js(&make_flow(), 256, 256);
        assert!(js.contains("dispatch(dt)"));
        assert!(js.contains("dispatchWorkgroups"));
    }

    #[test]
    fn runtime_has_accessors() {
        let js = generate_flow_runtime_js(&make_flow(), 512, 512);
        assert!(js.contains("get fieldBuffer()"));
        assert!(js.contains("get width()"));
        assert!(js.contains("get height()"));
    }

    #[test]
    fn runtime_embeds_parameters() {
        let mut f = make_flow();
        f.scale = 5.0;
        f.speed = 0.8;
        f.strength = 2.0;
        let js = generate_flow_runtime_js(&f, 256, 256);
        assert!(js.contains("5"));
        assert!(js.contains("0.8"));
        assert!(js.contains("2"));
    }
}
