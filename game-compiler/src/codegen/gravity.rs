//! Gravity block codegen — emits compute shader for N-body particle simulation.
//!
//! Generates WGSL compute shader with storage buffers for positions,
//! velocities, and force calculation workgroups.

use crate::ast::{BinOp, BoundsMode, Expr, GravityBlock};

/// Compile a force-law `Expr` into inline WGSL, treating `dist` as the
/// inter-particle distance and `time` as the simulation clock.
fn force_expr_to_wgsl(expr: &Expr) -> String {
    match expr {
        Expr::Number(n) => format!("{n:.6}"),
        Expr::Ident(name) => match name.as_str() {
            "dist" => "dist".to_string(),
            "time" => "params.time".to_string(),
            _ => name.clone(),
        },
        Expr::BinOp { op, left, right } => {
            let l = force_expr_to_wgsl(left);
            let r = force_expr_to_wgsl(right);
            match op {
                BinOp::Add => format!("({l} + {r})"),
                BinOp::Sub => format!("({l} - {r})"),
                BinOp::Mul => format!("({l} * {r})"),
                BinOp::Div => format!("({l} / {r})"),
                BinOp::Pow => format!("pow({l}, {r})"),
                BinOp::Gt => format!("select(0.0, 1.0, {l} > {r})"),
                BinOp::Lt => format!("select(0.0, 1.0, {l} < {r})"),
            }
        }
        Expr::Neg(inner) => format!("(-{})", force_expr_to_wgsl(inner)),
        Expr::Call { name, args } => {
            let arg_strs: Vec<String> =
                args.iter().map(|a| force_expr_to_wgsl(&a.value)).collect();
            format!("{}({})", name, arg_strs.join(", "))
        }
        Expr::Paren(inner) => format!("({})", force_expr_to_wgsl(inner)),
        // Fallback for unsupported expression types
        _ => "1.0".to_string(),
    }
}

/// Generate a WGSL compute shader for N-body gravity simulation.
pub fn generate_compute_wgsl(gravity: &GravityBlock, _particle_count: u32) -> String {
    let mut s = String::with_capacity(4096);
    let workgroup_size = 64;

    // Storage buffer structs
    s.push_str("struct Particle {\n");
    s.push_str("    pos: vec2<f32>,\n");
    s.push_str("    vel: vec2<f32>,\n");
    s.push_str("};\n\n");

    s.push_str("struct SimParams {\n");
    s.push_str("    dt: f32,\n");
    s.push_str("    damping: f32,\n");
    s.push_str("    count: u32,\n");
    s.push_str("    time: f32,\n");
    s.push_str("};\n\n");

    // Bindings
    s.push_str("@group(0) @binding(0) var<uniform> params: SimParams;\n");
    s.push_str("@group(0) @binding(1) var<storage, read> particles_in: array<Particle>;\n");
    s.push_str("@group(0) @binding(2) var<storage, read_write> particles_out: array<Particle>;\n\n");

    // Compute entry
    s.push_str(&format!(
        "@compute @workgroup_size({workgroup_size})\n"
    ));
    s.push_str("fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {\n");
    s.push_str("    let idx = gid.x;\n");
    s.push_str("    if (idx >= params.count) { return; }\n\n");

    s.push_str("    let self_pos = particles_in[idx].pos;\n");
    s.push_str("    var force = vec2<f32>(0.0, 0.0);\n\n");

    // N-body force accumulation
    s.push_str("    for (var j: u32 = 0u; j < params.count; j = j + 1u) {\n");
    s.push_str("        if (j == idx) { continue; }\n");
    s.push_str("        let other_pos = particles_in[j].pos;\n");
    s.push_str("        let diff = other_pos - self_pos;\n");
    s.push_str("        let dist = max(length(diff), 0.001);\n");
    s.push_str("        let dir = diff / dist;\n");
    // Force law: compiled from AST expression
    let force_wgsl = force_expr_to_wgsl(&gravity.force_law);
    s.push_str(&format!(
        "        force = force + dir * ({force_wgsl});\n"
    ));
    s.push_str("    }\n\n");

    // Velocity integration with damping
    let damping = gravity.damping;
    s.push_str(&format!(
        "    var vel = particles_in[idx].vel * {damping} + force * params.dt;\n"
    ));
    s.push_str("    var pos = self_pos + vel * params.dt;\n\n");

    // Bounds handling
    match gravity.bounds {
        BoundsMode::Reflect => {
            s.push_str("    // Reflect at boundaries [-1, 1]\n");
            s.push_str("    if (pos.x < -1.0) { pos.x = -1.0; vel.x = -vel.x; }\n");
            s.push_str("    if (pos.x > 1.0) { pos.x = 1.0; vel.x = -vel.x; }\n");
            s.push_str("    if (pos.y < -1.0) { pos.y = -1.0; vel.y = -vel.y; }\n");
            s.push_str("    if (pos.y > 1.0) { pos.y = 1.0; vel.y = -vel.y; }\n");
        }
        BoundsMode::Wrap => {
            s.push_str("    // Wrap at boundaries [-1, 1]\n");
            s.push_str("    pos = fract((pos + 1.0) * 0.5) * 2.0 - 1.0;\n");
        }
        BoundsMode::None => {
            s.push_str("    // No boundary enforcement\n");
        }
    }

    s.push_str("\n    particles_out[idx] = Particle(pos, vel);\n");
    s.push_str("}\n");

    s
}

/// Generate JavaScript runtime for GPU compute dispatch.
pub fn generate_compute_runtime_js(particle_count: u32) -> String {
    let mut s = String::with_capacity(2048);

    s.push_str("class GameGravitySim {\n");
    s.push_str(&format!(
        "  constructor(device, computeShaderCode) {{ this._count = {particle_count}; this._device = device; this._code = computeShaderCode; }}\n"
    ));

    s.push_str("\n  async init() {\n");
    s.push_str("    const device = this._device;\n");
    s.push_str("    const module = device.createShaderModule({ code: this._code });\n");
    s.push_str("    this._pipeline = device.createComputePipeline({\n");
    s.push_str("      layout: 'auto',\n");
    s.push_str("      compute: { module, entryPoint: 'cs_main' },\n");
    s.push_str("    });\n\n");

    // Storage buffers
    s.push_str("    const particleSize = 4 * 4; // 2x vec2<f32>\n");
    s.push_str("    const bufSize = this._count * particleSize;\n");
    s.push_str("    this._bufA = device.createBuffer({ size: bufSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });\n");
    s.push_str("    this._bufB = device.createBuffer({ size: bufSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });\n");
    s.push_str("    this._paramBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });\n");
    s.push_str("    this._time = 0;\n\n");

    // Initialize with random positions
    s.push_str("    const init = new Float32Array(this._count * 4);\n");
    s.push_str("    for (let i = 0; i < this._count; i++) {\n");
    s.push_str("      init[i*4] = Math.random() * 2 - 1; init[i*4+1] = Math.random() * 2 - 1;\n");
    s.push_str("      init[i*4+2] = 0; init[i*4+3] = 0;\n");
    s.push_str("    }\n");
    s.push_str("    device.queue.writeBuffer(this._bufA, 0, init);\n");
    s.push_str("  }\n\n");

    s.push_str("  dispatch(dt) {\n");
    s.push_str("    const device = this._device;\n");
    s.push_str("    this._time += dt;\n");
    s.push_str("    const params = new ArrayBuffer(16);\n");
    s.push_str("    const f = new Float32Array(params); const u = new Uint32Array(params);\n");
    s.push_str("    f[0] = dt; f[1] = 0.995; u[2] = this._count; f[3] = this._time;\n");
    s.push_str("    device.queue.writeBuffer(this._paramBuf, 0, params);\n\n");

    s.push_str("    const bg = device.createBindGroup({\n");
    s.push_str("      layout: this._pipeline.getBindGroupLayout(0),\n");
    s.push_str("      entries: [\n");
    s.push_str("        { binding: 0, resource: { buffer: this._paramBuf } },\n");
    s.push_str("        { binding: 1, resource: { buffer: this._bufA } },\n");
    s.push_str("        { binding: 2, resource: { buffer: this._bufB } },\n");
    s.push_str("      ],\n");
    s.push_str("    });\n\n");

    s.push_str("    const enc = device.createCommandEncoder();\n");
    s.push_str("    const pass = enc.beginComputePass();\n");
    s.push_str("    pass.setPipeline(this._pipeline);\n");
    s.push_str("    pass.setBindGroup(0, bg);\n");
    s.push_str(&format!(
        "    pass.dispatchWorkgroups(Math.ceil(this._count / 64));\n"
    ));
    s.push_str("    pass.end();\n");
    s.push_str("    device.queue.submit([enc.finish()]);\n\n");

    s.push_str("    // Ping-pong swap\n");
    s.push_str("    [this._bufA, this._bufB] = [this._bufB, this._bufA];\n");
    s.push_str("  }\n\n");

    s.push_str("  get positionBuffer() { return this._bufA; }\n");
    s.push_str("}\n");

    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::*;

    fn make_gravity() -> GravityBlock {
        GravityBlock {
            force_law: Expr::BinOp {
                op: BinOp::Div,
                left: Box::new(Expr::Number(1.0)),
                right: Box::new(Expr::BinOp {
                    op: BinOp::Mul,
                    left: Box::new(Expr::Ident("dist".into())),
                    right: Box::new(Expr::Ident("dist".into())),
                }),
            },
            damping: 0.995,
            bounds: BoundsMode::Reflect,
        }
    }

    #[test]
    fn compute_shader_has_workgroup() {
        let wgsl = generate_compute_wgsl(&make_gravity(), 200);
        assert!(wgsl.contains("@compute @workgroup_size(64)"));
        assert!(wgsl.contains("fn cs_main"));
    }

    #[test]
    fn compute_shader_has_storage_buffers() {
        let wgsl = generate_compute_wgsl(&make_gravity(), 200);
        assert!(wgsl.contains("var<storage, read>"));
        assert!(wgsl.contains("var<storage, read_write>"));
    }

    #[test]
    fn reflect_bounds_emitted() {
        let wgsl = generate_compute_wgsl(&make_gravity(), 100);
        assert!(wgsl.contains("Reflect at boundaries"));
        assert!(wgsl.contains("vel.x = -vel.x"));
    }

    #[test]
    fn wrap_bounds_emitted() {
        let mut g = make_gravity();
        g.bounds = BoundsMode::Wrap;
        let wgsl = generate_compute_wgsl(&g, 100);
        assert!(wgsl.contains("Wrap at boundaries"));
        assert!(wgsl.contains("fract("));
    }

    #[test]
    fn damping_applied() {
        let g = make_gravity();
        let wgsl = generate_compute_wgsl(&g, 100);
        assert!(wgsl.contains("0.995"));
    }

    #[test]
    fn runtime_js_generates() {
        let js = generate_compute_runtime_js(200);
        assert!(js.contains("class GameGravitySim"));
        assert!(js.contains("createComputePipeline"));
        assert!(js.contains("dispatchWorkgroups"));
    }

    #[test]
    fn force_law_expression_compiled_to_wgsl() {
        let gravity = GravityBlock {
            force_law: Expr::BinOp {
                op: BinOp::Div,
                left: Box::new(Expr::Number(1.0)),
                right: Box::new(Expr::Ident("dist".into())),
            },
            damping: 0.99,
            bounds: BoundsMode::Reflect,
        };
        let wgsl = generate_compute_wgsl(&gravity, 1024);
        assert!(
            wgsl.contains("(1.000000 / dist)"),
            "Force law should be compiled: {}",
            wgsl
        );
    }

    #[test]
    fn force_law_inverse_square_compiled() {
        let wgsl = generate_compute_wgsl(&make_gravity(), 200);
        assert!(
            wgsl.contains("(1.000000 / (dist * dist))"),
            "Inverse square law should be compiled: {}",
            wgsl
        );
    }

    #[test]
    fn force_law_with_sin_compiled() {
        let gravity = GravityBlock {
            force_law: Expr::Call {
                name: "sin".into(),
                args: vec![crate::ast::Arg {
                    name: None,
                    value: Expr::BinOp {
                        op: BinOp::Mul,
                        left: Box::new(Expr::Ident("dist".into())),
                        right: Box::new(Expr::Number(3.14159)),
                    },
                }],
            },
            damping: 0.99,
            bounds: BoundsMode::Reflect,
        };
        let wgsl = generate_compute_wgsl(&gravity, 256);
        assert!(
            wgsl.contains("sin((dist * 3.141590))"),
            "Sin force law should be compiled: {}",
            wgsl
        );
    }

    #[test]
    fn force_law_repulsion_compiled() {
        let gravity = GravityBlock {
            force_law: Expr::Neg(Box::new(Expr::BinOp {
                op: BinOp::Div,
                left: Box::new(Expr::Number(1.0)),
                right: Box::new(Expr::BinOp {
                    op: BinOp::Mul,
                    left: Box::new(Expr::Ident("dist".into())),
                    right: Box::new(Expr::Ident("dist".into())),
                }),
            })),
            damping: 0.99,
            bounds: BoundsMode::Reflect,
        };
        let wgsl = generate_compute_wgsl(&gravity, 256);
        assert!(
            wgsl.contains("(-(1.000000 / (dist * dist)))"),
            "Repulsion should be compiled: {}",
            wgsl
        );
    }

    #[test]
    fn force_law_time_variable_compiled() {
        let gravity = GravityBlock {
            force_law: Expr::BinOp {
                op: BinOp::Mul,
                left: Box::new(Expr::Ident("time".into())),
                right: Box::new(Expr::BinOp {
                    op: BinOp::Div,
                    left: Box::new(Expr::Number(1.0)),
                    right: Box::new(Expr::Ident("dist".into())),
                }),
            },
            damping: 0.99,
            bounds: BoundsMode::Reflect,
        };
        let wgsl = generate_compute_wgsl(&gravity, 256);
        assert!(
            wgsl.contains("params.time"),
            "Time variable should map to params.time: {}",
            wgsl
        );
    }

    #[test]
    fn sim_params_includes_time() {
        let wgsl = generate_compute_wgsl(&make_gravity(), 100);
        assert!(
            wgsl.contains("time: f32"),
            "SimParams should include time field: {}",
            wgsl
        );
    }

    #[test]
    fn runtime_js_tracks_time() {
        let js = generate_compute_runtime_js(100);
        assert!(
            js.contains("this._time"),
            "Runtime should track time: {}",
            js
        );
        assert!(
            js.contains("this._time += dt"),
            "Runtime should accumulate time: {}",
            js
        );
    }
}
