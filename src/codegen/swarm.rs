//! Swarm block codegen — Physarum polycephalum stigmergy compute shader.
//!
//! Millions of agents move through a chemical trail field, sensing, depositing,
//! and following pheromone gradients. Produces self-organizing network topology:
//! veins, roots, neural networks, river deltas, mycelium.
//!
//! ```game
//! swarm {
//!   agents: 500000
//!   sensor_angle: 45
//!   sensor_dist: 9.0
//!   turn_angle: 45
//!   deposit: 5.0
//!   decay: 0.95
//! }
//! ```
//!
//! Generates:
//! - Two WGSL compute shaders: agent update + trail diffuse/decay
//! - `GameSwarmSim` JS class for GPU dispatch

use crate::ast::{BoundsMode, SwarmBlock};

/// Generate WGSL compute shader for Physarum agent update.
///
/// Each agent: sense 3 directions → turn toward strongest → step → deposit.
pub fn generate_agent_wgsl(swarm: &SwarmBlock) -> String {
    let mut s = String::with_capacity(4096);

    // Structs
    s.push_str("struct Agent {\n");
    s.push_str("    pos: vec2<f32>,\n");
    s.push_str("    angle: f32,\n");
    s.push_str("    _pad: f32,\n");
    s.push_str("};\n\n");

    s.push_str("struct SwarmParams {\n");
    s.push_str("    sensor_angle: f32,\n");
    s.push_str("    sensor_dist: f32,\n");
    s.push_str("    turn_angle: f32,\n");
    s.push_str("    step_size: f32,\n");
    s.push_str("    deposit: f32,\n");
    s.push_str("    width: u32,\n");
    s.push_str("    height: u32,\n");
    s.push_str("    count: u32,\n");
    s.push_str("    time: f32,\n");
    s.push_str("};\n\n");

    // Bindings
    s.push_str("@group(0) @binding(0) var<uniform> params: SwarmParams;\n");
    s.push_str("@group(0) @binding(1) var<storage, read_write> agents: array<Agent>;\n");
    s.push_str("@group(0) @binding(2) var<storage, read_write> trail: array<f32>;\n\n");

    // Hash for pseudo-random (deterministic per-agent per-frame)
    s.push_str("fn hash(seed: u32) -> f32 {\n");
    s.push_str("    var x = seed;\n");
    s.push_str("    x = x ^ (x >> 16u);\n");
    s.push_str("    x = x * 0x45d9f3bu;\n");
    s.push_str("    x = x ^ (x >> 16u);\n");
    s.push_str("    x = x * 0x45d9f3bu;\n");
    s.push_str("    x = x ^ (x >> 16u);\n");
    s.push_str("    return f32(x) / 4294967295.0;\n");
    s.push_str("}\n\n");

    // Trail sampling (wrapping)
    s.push_str("fn sample_trail(x: f32, y: f32) -> f32 {\n");
    s.push_str("    let ix = u32(x + f32(params.width)) % params.width;\n");
    s.push_str("    let iy = u32(y + f32(params.height)) % params.height;\n");
    s.push_str("    return trail[iy * params.width + ix];\n");
    s.push_str("}\n\n");

    // Agent update kernel
    let sa = swarm.sensor_angle.to_radians();
    let ta = swarm.turn_angle.to_radians();
    let sd = swarm.sensor_dist;
    let step = swarm.step_size;
    let deposit = swarm.deposit;

    s.push_str("@compute @workgroup_size(64)\n");
    s.push_str("fn cs_agent(@builtin(global_invocation_id) gid: vec3<u32>) {\n");
    s.push_str("    let idx = gid.x;\n");
    s.push_str("    if (idx >= params.count) { return; }\n\n");

    s.push_str("    var agent = agents[idx];\n");
    s.push_str("    let rng = hash(idx * 1000u + u32(params.time * 1000.0));\n\n");

    // Sense three directions
    s.push_str("    // Sense: forward, left, right\n");
    s.push_str(&format!(
        "    let sense_l = sample_trail(agent.pos.x + cos(agent.angle + {sa}) * {sd}, agent.pos.y + sin(agent.angle + {sa}) * {sd});\n"
    ));
    s.push_str(&format!(
        "    let sense_f = sample_trail(agent.pos.x + cos(agent.angle) * {sd}, agent.pos.y + sin(agent.angle) * {sd});\n"
    ));
    s.push_str(&format!(
        "    let sense_r = sample_trail(agent.pos.x + cos(agent.angle - {sa}) * {sd}, agent.pos.y + sin(agent.angle - {sa}) * {sd});\n\n"
    ));

    // Turn toward strongest signal
    s.push_str("    // Turn toward strongest pheromone\n");
    s.push_str("    if (sense_f >= sense_l && sense_f >= sense_r) {\n");
    s.push_str("        // Keep going forward\n");
    s.push_str("    } else if (sense_l > sense_r) {\n");
    s.push_str(&format!("        agent.angle += {ta};\n"));
    s.push_str("    } else if (sense_r > sense_l) {\n");
    s.push_str(&format!("        agent.angle -= {ta};\n"));
    s.push_str("    } else {\n");
    s.push_str(&format!(
        "        agent.angle += (rng - 0.5) * {ta} * 2.0;\n"
    ));
    s.push_str("    }\n\n");

    // Step forward
    s.push_str(&format!("    agent.pos.x += cos(agent.angle) * {step};\n"));
    s.push_str(&format!(
        "    agent.pos.y += sin(agent.angle) * {step};\n\n"
    ));

    // Bounds
    match swarm.bounds {
        BoundsMode::Wrap => {
            s.push_str("    // Wrap boundaries\n");
            s.push_str(
                "    agent.pos.x = (agent.pos.x + f32(params.width)) % f32(params.width);\n",
            );
            s.push_str(
                "    agent.pos.y = (agent.pos.y + f32(params.height)) % f32(params.height);\n",
            );
        }
        BoundsMode::Reflect => {
            s.push_str("    // Reflect boundaries\n");
            s.push_str(
                "    if (agent.pos.x < 0.0 || agent.pos.x >= f32(params.width)) { agent.angle = 3.14159 - agent.angle; agent.pos.x = clamp(agent.pos.x, 0.0, f32(params.width) - 1.0); }\n",
            );
            s.push_str(
                "    if (agent.pos.y < 0.0 || agent.pos.y >= f32(params.height)) { agent.angle = -agent.angle; agent.pos.y = clamp(agent.pos.y, 0.0, f32(params.height) - 1.0); }\n",
            );
        }
        BoundsMode::None => {
            s.push_str("    // No boundary enforcement\n");
        }
    }

    // Deposit pheromone
    s.push_str("    // Deposit pheromone at current position\n");
    s.push_str("    let dep_x = u32(agent.pos.x) % params.width;\n");
    s.push_str("    let dep_y = u32(agent.pos.y) % params.height;\n");
    s.push_str(&format!(
        "    trail[dep_y * params.width + dep_x] += {deposit};\n\n"
    ));

    s.push_str("    agents[idx] = agent;\n");
    s.push_str("}\n");

    s
}

/// Generate WGSL compute shader for trail diffuse + decay.
///
/// 3x3 box blur followed by decay multiplication.
pub fn generate_trail_wgsl(swarm: &SwarmBlock) -> String {
    let mut s = String::with_capacity(2048);
    let decay = swarm.decay;

    s.push_str("struct TrailParams {\n");
    s.push_str("    width: u32,\n");
    s.push_str("    height: u32,\n");
    s.push_str("};\n\n");

    s.push_str("@group(0) @binding(0) var<uniform> params: TrailParams;\n");
    s.push_str("@group(0) @binding(1) var<storage, read> trail_in: array<f32>;\n");
    s.push_str("@group(0) @binding(2) var<storage, read_write> trail_out: array<f32>;\n\n");

    s.push_str("@compute @workgroup_size(8, 8)\n");
    s.push_str("fn cs_diffuse(@builtin(global_invocation_id) gid: vec3<u32>) {\n");
    s.push_str("    if (gid.x >= params.width || gid.y >= params.height) { return; }\n\n");

    s.push_str("    // 3x3 box blur\n");
    s.push_str("    var sum = 0.0;\n");
    s.push_str("    for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {\n");
    s.push_str("        for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {\n");
    s.push_str(
        "            let nx = u32((i32(gid.x) + dx + i32(params.width)) % i32(params.width));\n",
    );
    s.push_str(
        "            let ny = u32((i32(gid.y) + dy + i32(params.height)) % i32(params.height));\n",
    );
    s.push_str("            sum += trail_in[ny * params.width + nx];\n");
    s.push_str("        }\n");
    s.push_str("    }\n\n");

    s.push_str(&format!(
        "    trail_out[gid.y * params.width + gid.x] = (sum / 9.0) * {decay};\n"
    ));
    s.push_str("}\n");

    s
}

/// Generate JavaScript runtime for Physarum swarm GPU dispatch.
pub fn generate_swarm_runtime_js(swarm: &SwarmBlock, width: u32, height: u32) -> String {
    let mut s = String::with_capacity(4096);
    let agents = swarm.agents;

    s.push_str("class GameSwarmSim {\n");
    s.push_str(&format!(
        "  constructor(device, agentCode, trailCode) {{ this._count = {agents}; this._w = {width}; this._h = {height}; this._device = device; this._agentCode = agentCode; this._trailCode = trailCode; }}\n\n"
    ));

    s.push_str("  async init() {\n");
    s.push_str("    const device = this._device;\n");

    // Agent pipeline
    s.push_str("    const agentModule = device.createShaderModule({ code: this._agentCode });\n");
    s.push_str("    this._agentPipeline = device.createComputePipeline({\n");
    s.push_str("      layout: 'auto',\n");
    s.push_str("      compute: { module: agentModule, entryPoint: 'cs_agent' },\n");
    s.push_str("    });\n\n");

    // Trail pipeline
    s.push_str("    const trailModule = device.createShaderModule({ code: this._trailCode });\n");
    s.push_str("    this._trailPipeline = device.createComputePipeline({\n");
    s.push_str("      layout: 'auto',\n");
    s.push_str("      compute: { module: trailModule, entryPoint: 'cs_diffuse' },\n");
    s.push_str("    });\n\n");

    // Buffers
    s.push_str("    const agentSize = 16; // vec2 + f32 + pad\n");
    s.push_str("    this._agentBuf = device.createBuffer({ size: this._count * agentSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });\n");
    s.push_str("    const trailSize = this._w * this._h * 4;\n");
    s.push_str("    this._trailA = device.createBuffer({ size: trailSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });\n");
    s.push_str("    this._trailB = device.createBuffer({ size: trailSize, usage: GPUBufferUsage.STORAGE });\n");
    s.push_str("    this._paramBuf = device.createBuffer({ size: 36, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });\n");
    s.push_str("    this._trailParamBuf = device.createBuffer({ size: 8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });\n\n");

    // Initialize agents with random positions and angles
    s.push_str("    const initAgents = new Float32Array(this._count * 4);\n");
    s.push_str("    for (let i = 0; i < this._count; i++) {\n");
    s.push_str("      initAgents[i*4] = Math.random() * this._w;\n");
    s.push_str("      initAgents[i*4+1] = Math.random() * this._h;\n");
    s.push_str("      initAgents[i*4+2] = Math.random() * Math.PI * 2;\n");
    s.push_str("      initAgents[i*4+3] = 0;\n");
    s.push_str("    }\n");
    s.push_str("    device.queue.writeBuffer(this._agentBuf, 0, initAgents);\n\n");

    // Trail params (static)
    s.push_str("    const tp = new Uint32Array([this._w, this._h]);\n");
    s.push_str("    device.queue.writeBuffer(this._trailParamBuf, 0, tp);\n");
    s.push_str("    this._time = 0;\n");
    s.push_str("  }\n\n");

    // Dispatch
    let sa = swarm.sensor_angle.to_radians();
    let sd = swarm.sensor_dist;
    let ta = swarm.turn_angle.to_radians();
    let step = swarm.step_size;
    let deposit = swarm.deposit;
    s.push_str("  dispatch(dt) {\n");
    s.push_str("    this._time += dt;\n");
    s.push_str("    const device = this._device;\n\n");

    // Write agent params
    s.push_str("    const p = new ArrayBuffer(36);\n");
    s.push_str("    const f = new Float32Array(p); const u = new Uint32Array(p);\n");
    s.push_str(&format!(
        "    f[0] = {}; f[1] = {}; f[2] = {}; f[3] = {}; f[4] = {};\n",
        sa, sd, ta, step, deposit
    ));
    s.push_str("    u[5] = this._w; u[6] = this._h; u[7] = this._count;\n");
    s.push_str("    f[8] = this._time;\n");
    s.push_str("    device.queue.writeBuffer(this._paramBuf, 0, p);\n\n");

    s.push_str("    const enc = device.createCommandEncoder();\n\n");

    // Agent pass
    s.push_str("    const agentBG = device.createBindGroup({\n");
    s.push_str("      layout: this._agentPipeline.getBindGroupLayout(0),\n");
    s.push_str("      entries: [\n");
    s.push_str("        { binding: 0, resource: { buffer: this._paramBuf } },\n");
    s.push_str("        { binding: 1, resource: { buffer: this._agentBuf } },\n");
    s.push_str("        { binding: 2, resource: { buffer: this._trailA } },\n");
    s.push_str("      ],\n");
    s.push_str("    });\n");
    s.push_str("    const ap = enc.beginComputePass();\n");
    s.push_str("    ap.setPipeline(this._agentPipeline);\n");
    s.push_str("    ap.setBindGroup(0, agentBG);\n");
    s.push_str("    ap.dispatchWorkgroups(Math.ceil(this._count / 64));\n");
    s.push_str("    ap.end();\n\n");

    // Trail diffuse pass
    s.push_str("    const trailBG = device.createBindGroup({\n");
    s.push_str("      layout: this._trailPipeline.getBindGroupLayout(0),\n");
    s.push_str("      entries: [\n");
    s.push_str("        { binding: 0, resource: { buffer: this._trailParamBuf } },\n");
    s.push_str("        { binding: 1, resource: { buffer: this._trailA } },\n");
    s.push_str("        { binding: 2, resource: { buffer: this._trailB } },\n");
    s.push_str("      ],\n");
    s.push_str("    });\n");
    s.push_str("    const tp = enc.beginComputePass();\n");
    s.push_str("    tp.setPipeline(this._trailPipeline);\n");
    s.push_str("    tp.setBindGroup(0, trailBG);\n");
    s.push_str("    tp.dispatchWorkgroups(Math.ceil(this._w / 8), Math.ceil(this._h / 8));\n");
    s.push_str("    tp.end();\n\n");

    s.push_str("    device.queue.submit([enc.finish()]);\n");
    s.push_str("    [this._trailA, this._trailB] = [this._trailB, this._trailA];\n");
    s.push_str("  }\n\n");

    s.push_str("  get trailBuffer() { return this._trailA; }\n");
    s.push_str("  get agentBuffer() { return this._agentBuf; }\n");
    s.push_str(&format!("  get agentCount() {{ return {}; }}\n", agents));
    s.push_str("}\n");

    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::*;

    fn make_swarm() -> SwarmBlock {
        SwarmBlock {
            agents: 100000,
            sensor_angle: 45.0,
            sensor_dist: 9.0,
            turn_angle: 45.0,
            step_size: 1.0,
            deposit: 5.0,
            decay: 0.95,
            diffuse: 1,
            bounds: BoundsMode::Wrap,
        }
    }

    #[test]
    fn agent_shader_has_sensing() {
        let wgsl = generate_agent_wgsl(&make_swarm());
        assert!(wgsl.contains("fn cs_agent"));
        assert!(wgsl.contains("sense_l"));
        assert!(wgsl.contains("sense_f"));
        assert!(wgsl.contains("sense_r"));
    }

    #[test]
    fn agent_shader_has_turning() {
        let wgsl = generate_agent_wgsl(&make_swarm());
        assert!(wgsl.contains("Turn toward"));
        assert!(wgsl.contains("agent.angle"));
    }

    #[test]
    fn agent_shader_has_deposit() {
        let wgsl = generate_agent_wgsl(&make_swarm());
        assert!(wgsl.contains("Deposit pheromone"));
        assert!(wgsl.contains("trail[dep_y"));
    }

    #[test]
    fn agent_shader_wraps() {
        let wgsl = generate_agent_wgsl(&make_swarm());
        assert!(wgsl.contains("Wrap boundaries"));
    }

    #[test]
    fn agent_shader_reflects() {
        let mut sw = make_swarm();
        sw.bounds = BoundsMode::Reflect;
        let wgsl = generate_agent_wgsl(&sw);
        assert!(wgsl.contains("Reflect boundaries"));
    }

    #[test]
    fn trail_shader_has_blur_and_decay() {
        let wgsl = generate_trail_wgsl(&make_swarm());
        assert!(wgsl.contains("fn cs_diffuse"));
        assert!(wgsl.contains("box blur"));
        assert!(wgsl.contains("sum / 9.0"));
        assert!(wgsl.contains("0.95")); // decay rate
    }

    #[test]
    fn runtime_js_generates() {
        let js = generate_swarm_runtime_js(&make_swarm(), 512, 512);
        assert!(js.contains("class GameSwarmSim"));
        assert!(js.contains("cs_agent"));
        assert!(js.contains("cs_diffuse"));
        assert!(js.contains("100000")); // agent count
    }

    #[test]
    fn runtime_has_dual_pipelines() {
        let js = generate_swarm_runtime_js(&make_swarm(), 256, 256);
        assert!(js.contains("agentPipeline"));
        assert!(js.contains("trailPipeline"));
    }

    #[test]
    fn runtime_has_accessors() {
        let js = generate_swarm_runtime_js(&make_swarm(), 256, 256);
        assert!(js.contains("get trailBuffer()"));
        assert!(js.contains("get agentBuffer()"));
        assert!(js.contains("get agentCount()"));
    }

    #[test]
    fn hash_function_deterministic() {
        let wgsl = generate_agent_wgsl(&make_swarm());
        assert!(wgsl.contains("fn hash(seed: u32)"));
        assert!(wgsl.contains("0x45d9f3bu"));
    }
}
