// GLYPH Component: discharge — auto-generated, do not edit.
(function(){
const WGSL_V = `struct VertexOutput {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );
    var out: VertexOutput;
    out.pos = vec4<f32>(positions[vid], 0.0, 1.0);
    out.uv = positions[vid] * 0.5 + 0.5;
    return out;
}
`;
const WGSL_F = `struct Uniforms {
    time: f32,
    audio_bass: f32,
    audio_mid: f32,
    audio_treble: f32,
    audio_energy: f32,
    audio_beat: f32,
    resolution: vec2<f32>,
    mouse: vec2<f32>,
    mouse_down: f32,
    aspect_ratio: f32,
    p_color_r: f32,
    p_color_g: f32,
    p_color_b: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

@group(1) @binding(0) var<storage, read> compute_field: array<f32>;

struct VertexOutput {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

fn sdf_circle(p: vec2<f32>, radius: f32) -> f32 {
    return length(p) - radius;
}

fn apply_glow(d: f32, intensity: f32) -> f32 {
    return exp(-max(d, 0.0) * intensity * 8.0);
}

fn aces_tonemap(x: vec3<f32>) -> vec3<f32> {
    let a = x * (2.51 * x + 0.03);
    let b = x * (2.43 * x + 0.59) + 0.14;
    return clamp(a / b, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn dither_noise(uv: vec2<f32>) -> f32 {
    return fract(52.9829189 * fract(dot(uv, vec2<f32>(0.06711056, 0.00583715))));
}

fn sample_compute(uv: vec2<f32>) -> f32 {
    let cw = 512u; let ch = 512u;
    let x = clamp(u32(uv.x * f32(cw)), 0u, cw - 1u);
    let y = clamp(u32(uv.y * f32(ch)), 0u, ch - 1u);
    return compute_field[y * cw + x];
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv * 2.0 - 1.0;
    let aspect = u.aspect_ratio;
    let time = fract(u.time / 120.0) * 120.0;
    let mouse_x = u.mouse.x;
    let mouse_y = u.mouse.y;
    let mouse_down = u.mouse_down;

    let color_r = u.p_color_r;
    let color_g = u.p_color_g;
    let color_b = u.p_color_b;

    // ── Layer 0: bg ──
    var p = vec2<f32>(uv.x * aspect, uv.y);
    var sdf_result = sdf_circle(p, 0.500000);
    let glow_pulse = 0.400000 * (0.9 + 0.1 * sin(time * 2.0));
    let glow_result = apply_glow(sdf_result, glow_pulse);
    var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
    color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.005000, 0.005000, 0.010000), color_result.a);
    // Compute field visualization
    let cv = sample_compute(input.uv);
    let compute_color = vec4<f32>(cv * color_r, cv * color_g, cv * color_b, cv);
    color_result = color_result + compute_color * (1.0 - color_result.a);

    color_result = vec4<f32>(aces_tonemap(color_result.rgb), color_result.a);
    color_result = color_result + (dither_noise(input.uv * u.resolution) - 0.5) / 255.0;
    return color_result;
}
`;
const GLSL_V = `#version 300 es
precision highp float;
out vec2 v_uv;
void main(){
    vec2 pos[3] = vec2[3](
        vec2(-1.0, -1.0),
        vec2(3.0, -1.0),
        vec2(-1.0, 3.0)
    );
    gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0);
    v_uv = pos[gl_VertexID] * 0.5 + 0.5;
}
`;
const GLSL_F = `#version 300 es
precision highp float;

uniform float u_time;
uniform float u_audio_bass;
uniform float u_audio_mid;
uniform float u_audio_treble;
uniform float u_audio_energy;
uniform float u_audio_beat;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_mouse_down;
uniform float u_aspect_ratio;
uniform float u_p_color_r;
uniform float u_p_color_g;
uniform float u_p_color_b;

in vec2 v_uv;
out vec4 fragColor;

float sdf_circle(vec2 p, float radius){
    return length(p) - radius;
}

float apply_glow(float d, float intensity){
    return exp(-max(d, 0.0) * intensity * 8.0);
}

vec3 aces_tonemap(vec3 x) {
    vec3 a = x * (2.51 * x + 0.03);
    vec3 b = x * (2.43 * x + 0.59) + 0.14;
    return clamp(a / b, 0.0, 1.0);
}

float dither_noise(vec2 uv) {
    return fract(52.9829189 * fract(dot(uv, vec2(0.06711056, 0.00583715))));
}

void main(){
    vec2 uv = v_uv * 2.0 - 1.0;
    float aspect = u_aspect_ratio;
    float time = fract(u_time / 120.0) * 120.0;
    float mouse_x = u_mouse.x;
    float mouse_y = u_mouse.y;
    float mouse_down = u_mouse_down;

    float color_r = u_p_color_r;
    float color_g = u_p_color_g;
    float color_b = u_p_color_b;

    // ── Layer 0: bg ──
    vec2 p = vec2(uv.x * aspect, uv.y);
    float sdf_result = sdf_circle(p, 0.500000);
    float glow_pulse = 0.400000 * (0.9 + 0.1 * sin(time * 2.0));
    float glow_result = apply_glow(sdf_result, glow_pulse);

    vec4 color_result = vec4(vec3(glow_result), glow_result);
    color_result = vec4(color_result.rgb * vec3(0.005000, 0.005000, 0.010000), color_result.a);
    color_result = vec4(aces_tonemap(color_result.rgb), color_result.a);
    color_result += (dither_noise(v_uv * u_resolution) - 0.5) / 255.0;
    fragColor = color_result;
}
`;
const UNIFORMS = [{name:'color_r',default:1.1},{name:'color_g',default:1.2},{name:'color_b',default:1.5}];
const COMPLEXITY = {layers:1,fbmOctaves:0,passes:3,memory:false,compute:true,is3d:false,tier:'medium'};
const PASS_WGSL_0 = `// Post-processing pass: glow

struct Uniforms {
    time: f32,
    audio_bass: f32,
    audio_mid: f32,
    audio_treble: f32,
    audio_energy: f32,
    audio_beat: f32,
    resolution: vec2<f32>,
    mouse: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(3) var pass_tex: texture_2d<f32>;
@group(0) @binding(4) var pass_sampler: sampler;

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
    let pixel = textureSample(pass_tex, pass_sampler, uv);
    var color_result = pixel;

    // blur pass
    var blurred = vec4<f32>(0.0);
    let texel = 1.0 / u.resolution;
    let r = i32(0.500000);
    var count = 0.0;
    for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
            let offset = vec2<f32>(f32(dx), f32(dy)) * texel;
            blurred += textureSample(pass_tex, pass_sampler, uv + offset);
            count += 1.0;
        }
    }
    color_result = blurred / count;
    return color_result;
}
`;
const PASS_WGSL_1 = `// Post-processing pass: split

struct Uniforms {
    time: f32,
    audio_bass: f32,
    audio_mid: f32,
    audio_treble: f32,
    audio_energy: f32,
    audio_beat: f32,
    resolution: vec2<f32>,
    mouse: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(3) var pass_tex: texture_2d<f32>;
@group(0) @binding(4) var pass_sampler: sampler;

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
    let pixel = textureSample(pass_tex, pass_sampler, uv);
    var color_result = pixel;

    // chromatic aberration
    let ca_dir = normalize(uv - 0.5) * 0.003000;
    let ca_r = textureSample(pass_tex, pass_sampler, uv + ca_dir).r;
    let ca_g = color_result.g;
    let ca_b = textureSample(pass_tex, pass_sampler, uv - ca_dir).b;
    color_result = vec4<f32>(ca_r, ca_g, ca_b, color_result.a);
    return color_result;
}
`;
const PASS_WGSL_2 = `// Post-processing pass: frame

struct Uniforms {
    time: f32,
    audio_bass: f32,
    audio_mid: f32,
    audio_treble: f32,
    audio_energy: f32,
    audio_beat: f32,
    resolution: vec2<f32>,
    mouse: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(3) var pass_tex: texture_2d<f32>;
@group(0) @binding(4) var pass_sampler: sampler;

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
    let pixel = textureSample(pass_tex, pass_sampler, uv);
    var color_result = pixel;

    let vign = 1.0 - 0.300000 * length(uv - 0.5);
    color_result = vec4<f32>(color_result.rgb * vign, color_result.a * vign);
    return color_result;
}
`;
const PASS_SHADERS = [PASS_WGSL_0,PASS_WGSL_1,PASS_WGSL_2];
const SWARM_AGENT_WGSL = `struct Agent {
    pos: vec2<f32>,
    angle: f32,
    _pad: f32,
};

struct SwarmParams {
    sensor_angle: f32,
    sensor_dist: f32,
    turn_angle: f32,
    step_size: f32,
    deposit: f32,
    width: u32,
    height: u32,
    count: u32,
    time: f32,
};

@group(0) @binding(0) var<uniform> params: SwarmParams;
@group(0) @binding(1) var<storage, read_write> agents: array<Agent>;
@group(0) @binding(2) var<storage, read_write> trail: array<f32>;

fn hash(seed: u32) -> f32 {
    var x = seed;
    x = x ^ (x >> 16u);
    x = x * 0x45d9f3bu;
    x = x ^ (x >> 16u);
    x = x * 0x45d9f3bu;
    x = x ^ (x >> 16u);
    return f32(x) / 4294967295.0;
}

fn sample_trail(x: f32, y: f32) -> f32 {
    let ix = u32(x + f32(params.width)) % params.width;
    let iy = u32(y + f32(params.height)) % params.height;
    return trail[iy * params.width + ix];
}

@compute @workgroup_size(64)
fn cs_agent(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    if (idx >= params.count) { return; }

    var agent = agents[idx];
    let rng = hash(idx * 1000u + u32(params.time * 1000.0));

    // Sense: forward, left, right
    let sense_l = sample_trail(agent.pos.x + cos(agent.angle + 0.9599310885968813) * 15, agent.pos.y + sin(agent.angle + 0.9599310885968813) * 15);
    let sense_f = sample_trail(agent.pos.x + cos(agent.angle) * 15, agent.pos.y + sin(agent.angle) * 15);
    let sense_r = sample_trail(agent.pos.x + cos(agent.angle - 0.9599310885968813) * 15, agent.pos.y + sin(agent.angle - 0.9599310885968813) * 15);

    // Turn toward strongest pheromone
    if (sense_f >= sense_l && sense_f >= sense_r) {
        // Keep going forward
    } else if (sense_l > sense_r) {
        agent.angle += 0.9599310885968813;
    } else if (sense_r > sense_l) {
        agent.angle -= 0.9599310885968813;
    } else {
        agent.angle += (rng - 0.5) * 0.9599310885968813 * 2.0;
    }

    agent.pos.x += cos(agent.angle) * 2;
    agent.pos.y += sin(agent.angle) * 2;

    // Reflect boundaries
    if (agent.pos.x < 0.0 || agent.pos.x >= f32(params.width)) { agent.angle = 3.14159 - agent.angle; agent.pos.x = clamp(agent.pos.x, 0.0, f32(params.width) - 1.0); }
    if (agent.pos.y < 0.0 || agent.pos.y >= f32(params.height)) { agent.angle = -agent.angle; agent.pos.y = clamp(agent.pos.y, 0.0, f32(params.height) - 1.0); }
    // Deposit pheromone at current position
    let dep_x = u32(agent.pos.x) % params.width;
    let dep_y = u32(agent.pos.y) % params.height;
    trail[dep_y * params.width + dep_x] += 6;

    agents[idx] = agent;
}
`;
const SWARM_TRAIL_WGSL = `struct TrailParams {
    width: u32,
    height: u32,
};

@group(0) @binding(0) var<uniform> params: TrailParams;
@group(0) @binding(1) var<storage, read> trail_in: array<f32>;
@group(0) @binding(2) var<storage, read_write> trail_out: array<f32>;

@compute @workgroup_size(8, 8)
fn cs_diffuse(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= params.width || gid.y >= params.height) { return; }

    // 3x3 box blur
    var sum = 0.0;
    for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
        for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
            let nx = u32((i32(gid.x) + dx + i32(params.width)) % i32(params.width));
            let ny = u32((i32(gid.y) + dy + i32(params.height)) % i32(params.height));
            sum += trail_in[ny * params.width + nx];
        }
    }

    trail_out[gid.y * params.width + gid.x] = (sum / 9.0) * 0.88;
}
`;

class GlyphRenderer {
  constructor(canvas, wgslVertex, wgslFragment, uniformDefs, passShaders, computeType) {
    this.canvas = canvas;
    this.wgslVertex = wgslVertex;
    this.wgslFragment = wgslFragment;
    this.uniformDefs = uniformDefs;
    this.passShaders = passShaders;
    this._computeType = computeType;
    this._computeBuf = null;
    this._computeW = 0;
    this._computeH = 0;
    this.device = null;
    this.pipeline = null;
    this.uniformBuffer = null;
    this.bindGroup = null;
    this.running = false;
    this._paused = false;
    this._fpsLimit = 0;
    this._fpsInterval = 0;
    this._lastFrameTime = 0;
    this._elapsed = 0;
    this._resScale = 1.0;
    this.startTime = performance.now() / 1000;
    this.audioData = { bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 };
    this.mouseX = 0; this.mouseY = 0; this.mouseDown = 0;
    this.userParams = {};
    for (const u of uniformDefs) this.userParams[u.name] = u.default;
    this._onMouseMove = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) / r.width;
      this.mouseY = 1.0 - (e.clientY - r.top) / r.height;
    };
    this._onMouseDown = () => { this.mouseDown = 1; };
    this._onMouseUp = () => { this.mouseDown = 0; };
    this._onTouchStart = (e) => {
      this.mouseDown = 1;
      const r = this.canvas.getBoundingClientRect();
      const t = e.touches[0];
      this.mouseX = (t.clientX - r.left) / r.width;
      this.mouseY = 1.0 - (t.clientY - r.top) / r.height;
    };
    this._onTouchMove = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const t = e.touches[0];
      this.mouseX = (t.clientX - r.left) / r.width;
      this.mouseY = 1.0 - (t.clientY - r.top) / r.height;
    };
    this._onTouchEnd = () => { this.mouseDown = 0; };
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    this.canvas.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('touchstart', this._onTouchStart, {passive: true});
    this.canvas.addEventListener('touchmove', this._onTouchMove, {passive: true});
    this.canvas.addEventListener('touchend', this._onTouchEnd);
  }

  async init() {
    if (!navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return false;
    this.device = await adapter.requestDevice();
    const ctx = this.canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device: this.device, format, alphaMode: 'premultiplied' });
    this.ctx = ctx;
    this.format = format;

    const vMod = this.device.createShaderModule({ code: this.wgslVertex });
    const fMod = this.device.createShaderModule({ code: this.wgslFragment });

    const floatCount = 12 + this.uniformDefs.length;
    const bufSize = Math.ceil(floatCount * 4 / 16) * 16;
    this.uniformBuffer = this.device.createBuffer({
      size: bufSize, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    this.floatCount = floatCount;

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }]
    });
    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }]
    });

    this._computeBGL = this.device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } }]
    });
    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [bindGroupLayout, this._computeBGL]
    });

    this.pipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: vMod, entryPoint: 'vs_main' },
      fragment: { module: fMod, entryPoint: 'fs_main', targets: [{ format, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }] },
      primitive: { topology: 'triangle-list' }
    });

    // Post-processing pass pipelines
    this._passPipelines = [];
    const passBGL = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
      ]
    });
    this._passBGL = passBGL;
    const passPL = this.device.createPipelineLayout({ bindGroupLayouts: [passBGL] });
    for (const code of this.passShaders) {
      const mod = this.device.createShaderModule({ code });
      this._passPipelines.push(this.device.createRenderPipeline({
        layout: passPL,
        vertex: { module: vMod, entryPoint: 'vs_main' },
        fragment: { module: mod, entryPoint: 'fs_main', targets: [{ format, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }] },
        primitive: { topology: 'triangle-list' }
      }));
    }
    this._passSampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this._initPassFBOs();
    return true;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._visible = true;
    this._observer = new IntersectionObserver(([e]) => {
      this._visible = e.isIntersecting;
    }, { threshold: 0 });
    this._observer.observe(this.canvas);
    this._onVisChange = () => {
      if (document.hidden) this._docHidden = true;
      else { this._docHidden = false; this._lastFrameTime = 0; }
    };
    document.addEventListener('visibilitychange', this._onVisChange);
    this._docHidden = document.hidden;
    const loop = () => {
      if (!this.running) return;
      if (this._paused || !this._visible || this._docHidden) {
        requestAnimationFrame(loop); return;
      }
      if (this._fpsLimit > 0) {
        const now = performance.now();
        if (this._lastFrameTime && (now - this._lastFrameTime) < this._fpsInterval) {
          requestAnimationFrame(loop); return;
        }
        this._lastFrameTime = now;
      }
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }

  pause() { this._paused = true; }
  resume() { this._paused = false; this._lastFrameTime = 0; }

  setFPS(fps) {
    this._fpsLimit = fps > 0 ? fps : 0;
    this._fpsInterval = fps > 0 ? 1000 / fps : 0;
    this._lastFrameTime = 0;
  }

  setResolutionScale(scale) {
    this._resScale = Math.max(0.125, Math.min(1.0, scale));
  }

  render() {
    if (this._preRender) this._preRender();
    const t = performance.now() / 1000 - this.startTime;
    this._elapsed = t;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const data = new Float32Array(this.floatCount);
    data[0] = t;
    data[1] = this.audioData.bass;
    data[2] = this.audioData.mid;
    data[3] = this.audioData.treble;
    data[4] = this.audioData.energy;
    data[5] = this.audioData.beat;
    data[6] = w; data[7] = h;
    data[8] = this.mouseX; data[9] = this.mouseY;
    data[10] = this.mouseDown;
    data[11] = w / (h || 1);
    let i = 12;
    for (const u of this.uniformDefs) data[i++] = this.userParams[u.name] ?? u.default;
    this.device.queue.writeBuffer(this.uniformBuffer, 0, data);

    const encoder = this.device.createCommandEncoder();

    // Main pass renders to FBO (input for post-processing)
    const mainPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this._passFBOs[0].createView(),
        loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 }
      }]
    });
    mainPass.setPipeline(this.pipeline);
    mainPass.setBindGroup(0, this.bindGroup);
    if (this._computeBuf) {
      const computeBG = this.device.createBindGroup({
        layout: this._computeBGL,
        entries: [{ binding: 0, resource: { buffer: this._computeBuf } }]
      });
      mainPass.setBindGroup(1, computeBG);
    }
    mainPass.draw(3);
    mainPass.end();

    // Post-processing chain (3 passes)
    for (let p = 0; p < 3; p++) {
      const isLast = (p === 3 - 1);
      const readIdx = p % 2;
      const targetView = isLast
        ? this.ctx.getCurrentTexture().createView()
        : this._passFBOs[(p + 1) % 2].createView();
      const passBindGroup = this.device.createBindGroup({
        layout: this._passBGL,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 3, resource: this._passFBOs[readIdx].createView() },
          { binding: 4, resource: this._passSampler }
        ]
      });
      const pp = encoder.beginRenderPass({
        colorAttachments: [{
          view: targetView,
          loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 }
        }]
      });
      pp.setPipeline(this._passPipelines[p]);
      pp.setBindGroup(0, passBindGroup);
      pp.draw(3);
      pp.end();
    }
    this.device.queue.submit([encoder.finish()]);
  }

  _initPassFBOs() {
    const w = this.canvas.width || 1;
    const h = this.canvas.height || 1;
    const desc = {
      size: { width: w, height: h },
      format: this.format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
    };
    this._passFBOs = [this.device.createTexture(desc), this.device.createTexture(desc)];
  }

  _resizePassFBOs() {
    if (this._passFBOs) {
      this._passFBOs[0].destroy();
      this._passFBOs[1].destroy();
      this._initPassFBOs();
    }
  }

  setComputeBuffer(buf, w, h) {
    this._computeBuf = buf;
    this._computeW = w;
    this._computeH = h;
  }

  setParam(name, value) { this.userParams[name] = value; }
  setAudioData(d) { Object.assign(this.audioData, d); }
  destroy() {
    this.stop();
    this._observer?.disconnect();
    if (this._onVisChange) document.removeEventListener('visibilitychange', this._onVisChange);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('touchstart', this._onTouchStart);
    this.canvas.removeEventListener('touchmove', this._onTouchMove);
    this.canvas.removeEventListener('touchend', this._onTouchEnd);
    this.device?.destroy();
  }
}


class GlyphRendererGL {
  constructor(canvas, glslVertex, glslFragment, uniformDefs) {
    this.canvas = canvas;
    this.glslVertex = glslVertex;
    this.glslFragment = glslFragment;
    this.uniformDefs = uniformDefs;
    this.gl = null;
    this.program = null;
    this.running = false;
    this._paused = false;
    this._fpsLimit = 0;
    this._fpsInterval = 0;
    this._lastFrameTime = 0;
    this._elapsed = 0;
    this._resScale = 1.0;
    this.startTime = performance.now() / 1000;
    this.audioData = { bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 };
    this.mouseX = 0; this.mouseY = 0; this.mouseDown = 0;
    this.userParams = {};
    for (const u of uniformDefs) this.userParams[u.name] = u.default;
    this._onMouseMove = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - r.left) / r.width;
      this.mouseY = 1.0 - (e.clientY - r.top) / r.height;
    };
    this._onMouseDown = () => { this.mouseDown = 1; };
    this._onMouseUp = () => { this.mouseDown = 0; };
    this._onTouchStart = (e) => {
      this.mouseDown = 1;
      const r = this.canvas.getBoundingClientRect();
      const t = e.touches[0];
      this.mouseX = (t.clientX - r.left) / r.width;
      this.mouseY = 1.0 - (t.clientY - r.top) / r.height;
    };
    this._onTouchMove = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const t = e.touches[0];
      this.mouseX = (t.clientX - r.left) / r.width;
      this.mouseY = 1.0 - (t.clientY - r.top) / r.height;
    };
    this._onTouchEnd = () => { this.mouseDown = 0; };
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    this.canvas.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('touchstart', this._onTouchStart, {passive: true});
    this.canvas.addEventListener('touchmove', this._onTouchMove, {passive: true});
    this.canvas.addEventListener('touchend', this._onTouchEnd);
  }

  init() {
    const gl = this.canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true });
    if (!gl) return false;
    this.gl = gl;

    const vs = this._compile(gl.VERTEX_SHADER, this.glslVertex);
    const fs = this._compile(gl.FRAGMENT_SHADER, this.glslFragment);
    if (!vs || !fs) return false;

    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('GLYPH link error:', gl.getProgramInfoLog(this.program));
      return false;
    }
    gl.useProgram(this.program);

    this.locs = {
      time: gl.getUniformLocation(this.program, 'u_time'),
      bass: gl.getUniformLocation(this.program, 'u_audio_bass'),
      mid: gl.getUniformLocation(this.program, 'u_audio_mid'),
      treble: gl.getUniformLocation(this.program, 'u_audio_treble'),
      energy: gl.getUniformLocation(this.program, 'u_audio_energy'),
      beat: gl.getUniformLocation(this.program, 'u_audio_beat'),
      resolution: gl.getUniformLocation(this.program, 'u_resolution'),
      mouse: gl.getUniformLocation(this.program, 'u_mouse'),
      mouse_down: gl.getUniformLocation(this.program, 'u_mouse_down'),
      aspect_ratio: gl.getUniformLocation(this.program, 'u_aspect_ratio'),
    };
    this.paramLocs = {};
    for (const u of this.uniformDefs) {
      this.paramLocs[u.name] = gl.getUniformLocation(this.program, 'u_p_' + u.name);
    }
    return true;
  }

  _compile(type, src) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('GLYPH shader error:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._visible = true;
    this._observer = new IntersectionObserver(([e]) => {
      this._visible = e.isIntersecting;
    }, { threshold: 0 });
    this._observer.observe(this.canvas);
    this._onVisChange = () => {
      if (document.hidden) this._docHidden = true;
      else { this._docHidden = false; this._lastFrameTime = 0; }
    };
    document.addEventListener('visibilitychange', this._onVisChange);
    this._docHidden = document.hidden;
    const loop = () => {
      if (!this.running) return;
      if (this._paused || !this._visible || this._docHidden) {
        requestAnimationFrame(loop); return;
      }
      if (this._fpsLimit > 0) {
        const now = performance.now();
        if (this._lastFrameTime && (now - this._lastFrameTime) < this._fpsInterval) {
          requestAnimationFrame(loop); return;
        }
        this._lastFrameTime = now;
      }
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }

  pause() { this._paused = true; }
  resume() { this._paused = false; this._lastFrameTime = 0; }

  setFPS(fps) {
    this._fpsLimit = fps > 0 ? fps : 0;
    this._fpsInterval = fps > 0 ? 1000 / fps : 0;
    this._lastFrameTime = 0;
  }

  setResolutionScale(scale) {
    this._resScale = Math.max(0.125, Math.min(1.0, scale));
  }

  render() {
    const gl = this.gl;
    const t = performance.now() / 1000 - this.startTime;
    this._elapsed = t;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.program);

    gl.uniform1f(this.locs.time, t);
    gl.uniform1f(this.locs.bass, this.audioData.bass);
    gl.uniform1f(this.locs.mid, this.audioData.mid);
    gl.uniform1f(this.locs.treble, this.audioData.treble);
    gl.uniform1f(this.locs.energy, this.audioData.energy);
    gl.uniform1f(this.locs.beat, this.audioData.beat);
    gl.uniform2f(this.locs.resolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.locs.mouse, this.mouseX, this.mouseY);
    gl.uniform1f(this.locs.mouse_down, this.mouseDown);
    gl.uniform1f(this.locs.aspect_ratio, this.canvas.width / (this.canvas.height || 1));
    for (const u of this.uniformDefs) {
      gl.uniform1f(this.paramLocs[u.name], this.userParams[u.name] ?? u.default);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  setParam(name, value) { this.userParams[name] = value; }
  setAudioData(d) { Object.assign(this.audioData, d); }
  destroy() {
    this.stop();
    this._observer?.disconnect();
    if (this._onVisChange) document.removeEventListener('visibilitychange', this._onVisChange);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('touchstart', this._onTouchStart);
    this.canvas.removeEventListener('touchmove', this._onTouchMove);
    this.canvas.removeEventListener('touchend', this._onTouchEnd);
  }
}


class GameSwarmSim {
  constructor(device, agentCode, trailCode) { this._count = 60000; this._w = 512; this._h = 512; this._device = device; this._agentCode = agentCode; this._trailCode = trailCode; }

  async init() {
    const device = this._device;
    const agentModule = device.createShaderModule({ code: this._agentCode });
    this._agentPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: agentModule, entryPoint: 'cs_agent' },
    });

    const trailModule = device.createShaderModule({ code: this._trailCode });
    this._trailPipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: trailModule, entryPoint: 'cs_diffuse' },
    });

    const agentSize = 16; // vec2 + f32 + pad
    this._agentBuf = device.createBuffer({ size: this._count * agentSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    const trailSize = this._w * this._h * 4;
    this._trailA = device.createBuffer({ size: trailSize, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this._trailB = device.createBuffer({ size: trailSize, usage: GPUBufferUsage.STORAGE });
    this._paramBuf = device.createBuffer({ size: 36, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this._trailParamBuf = device.createBuffer({ size: 8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const initAgents = new Float32Array(this._count * 4);
    for (let i = 0; i < this._count; i++) {
      initAgents[i*4] = Math.random() * this._w;
      initAgents[i*4+1] = Math.random() * this._h;
      initAgents[i*4+2] = Math.random() * Math.PI * 2;
      initAgents[i*4+3] = 0;
    }
    device.queue.writeBuffer(this._agentBuf, 0, initAgents);

    const tp = new Uint32Array([this._w, this._h]);
    device.queue.writeBuffer(this._trailParamBuf, 0, tp);
    this._time = 0;
  }

  dispatch(dt) {
    this._time += dt;
    const device = this._device;

    const p = new ArrayBuffer(36);
    const f = new Float32Array(p); const u = new Uint32Array(p);
    f[0] = 0.9599310885968813; f[1] = 15; f[2] = 0.9599310885968813; f[3] = 2; f[4] = 6;
    u[5] = this._w; u[6] = this._h; u[7] = this._count;
    f[8] = this._time;
    device.queue.writeBuffer(this._paramBuf, 0, p);

    const enc = device.createCommandEncoder();

    const agentBG = device.createBindGroup({
      layout: this._agentPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this._paramBuf } },
        { binding: 1, resource: { buffer: this._agentBuf } },
        { binding: 2, resource: { buffer: this._trailA } },
      ],
    });
    const ap = enc.beginComputePass();
    ap.setPipeline(this._agentPipeline);
    ap.setBindGroup(0, agentBG);
    ap.dispatchWorkgroups(Math.ceil(this._count / 64));
    ap.end();

    const trailBG = device.createBindGroup({
      layout: this._trailPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this._trailParamBuf } },
        { binding: 1, resource: { buffer: this._trailA } },
        { binding: 2, resource: { buffer: this._trailB } },
      ],
    });
    const tp = enc.beginComputePass();
    tp.setPipeline(this._trailPipeline);
    tp.setBindGroup(0, trailBG);
    tp.dispatchWorkgroups(Math.ceil(this._w / 8), Math.ceil(this._h / 8));
    tp.end();

    device.queue.submit([enc.finish()]);
    [this._trailA, this._trailB] = [this._trailB, this._trailA];
  }

  get trailBuffer() { return this._trailA; }
  get agentBuffer() { return this._agentBuf; }
  get agentCount() { return 60000; }
}


class Discharge extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._renderer = null;
    this._resizeObserver = null;
    this._pendingParams = {};
  }

  connectedCallback() {
    const style = document.createElement('style');
    style.textContent = ':host{display:block;width:100%;height:100%;position:relative}canvas{width:100%;height:100%;display:block}';
    const canvas = document.createElement('canvas');
    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(canvas);
    this._canvas = canvas;
    this._initRenderer();
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(this);
  }

  disconnectedCallback() {
    this._renderer?.destroy();
    this._renderer = null;
    this._resizeObserver?.disconnect();
  }

  async _initRenderer() {
    const gpu = new GlyphRenderer(this._canvas, WGSL_V, WGSL_F, UNIFORMS, PASS_SHADERS, 'swarm');
    if (await gpu.init()) {
      this._renderer = gpu;
    } else {
      const gl = new GlyphRendererGL(this._canvas, GLSL_V, GLSL_F, UNIFORMS);
      if (gl.init()) {
        this._renderer = gl;
      } else {
        console.warn('glyph-discharge: no WebGPU or WebGL2 support');
        return;
      }
    }
    this._resize();
    if (this._renderer.device) {
      const dev = this._renderer.device;
      if (typeof SWARM_AGENT_WGSL !== 'undefined') {
        const sim = new GameSwarmSim(dev, SWARM_AGENT_WGSL, SWARM_TRAIL_WGSL);
        await sim.init();
        this._swarmSim = sim;
        this._renderer.setComputeBuffer(sim.trailBuffer, sim._w, sim._h);
      }
      this._renderer._preRender = () => {
        const dt = 1/60;
        if (this._swarmSim) {
          this._swarmSim.dispatch(dt);
          this._renderer.setComputeBuffer(this._swarmSim.trailBuffer, this._swarmSim._w, this._swarmSim._h);
        }
      };
    }
    for (const [k, v] of Object.entries(this._pendingParams)) {
      this._renderer.setParam(k, v);
    }
    this._renderer.start();
  }

  _resize() {
    const rect = this.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const scale = this._renderer?._resScale || 1.0;
    this._canvas.width = Math.round(rect.width * dpr * scale);
    this._canvas.height = Math.round(rect.height * dpr * scale);
    if (this._renderer?._resizeMemory) this._renderer._resizeMemory();
    if (this._renderer?._resizePassFBOs) this._renderer._resizePassFBOs();
  }

  setParam(name, value) {
    this._pendingParams[name] = value;
    this._renderer?.setParam(name, value);
  }
  setAudioData(data) { this._renderer?.setAudioData(data); }
  setAudioSource(bridge) { bridge?.subscribe(d => this._renderer?.setAudioData(d)); }

  pause() { this._renderer?.pause(); }
  resume() { this._renderer?.resume(); }

  setFPS(fps) { this._renderer?.setFPS(fps); }

  setResolutionScale(scale) {
    this._renderer?.setResolutionScale(scale);
    this._resize();
  }

  fullscreen() {
    if (this.requestFullscreen) this.requestFullscreen();
    else if (this.webkitRequestFullscreen) this.webkitRequestFullscreen();
  }

  get complexity() { return COMPLEXITY; }

  getFrame() {
    if (!this._canvas) return null;
    const w = this._canvas.width, h = this._canvas.height;
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext('2d');
    ctx.drawImage(this._canvas, 0, 0);
    return ctx.getImageData(0, 0, w, h);
  }

  getFrameDataURL(type) {
    if (!this._canvas) return null;
    return this._canvas.toDataURL(type || 'image/png');
  }

  // Property accessors for each uniform
  get color_r() { return this._renderer?.userParams['color_r'] ?? this._pendingParams['color_r'] ?? 1.1; }
  set color_r(v) { this.setParam('color_r', v); }
  get color_g() { return this._renderer?.userParams['color_g'] ?? this._pendingParams['color_g'] ?? 1.2; }
  set color_g(v) { this.setParam('color_g', v); }
  get color_b() { return this._renderer?.userParams['color_b'] ?? this._pendingParams['color_b'] ?? 1.5; }
  set color_b(v) { this.setParam('color_b', v); }

  static get observedAttributes() { return UNIFORMS.map(u => u.name); }
  attributeChangedCallback(name, _, val) {
    if (val !== null) this.setParam(name, parseFloat(val));
  }
}

customElements.define('glyph-discharge', Discharge);
})();
