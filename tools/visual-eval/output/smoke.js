// GAME Component: smoke — auto-generated, do not edit.
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
};

@group(0) @binding(0) var<uniform> u: Uniforms;

@group(1) @binding(0) var<storage, read> compute_field: array<vec2<f32>>;

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
    let cw = 256u; let ch = 256u;
    let x = clamp(u32(uv.x * f32(cw)), 0u, cw - 1u);
    let y = clamp(u32(uv.y * f32(ch)), 0u, ch - 1u);
    return length(compute_field[y * cw + x]);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv * 2.0 - 1.0;
    let aspect = u.aspect_ratio;
    let time = fract(u.time / 120.0) * 120.0;
    let mouse_x = u.mouse.x;
    let mouse_y = u.mouse.y;
    let mouse_down = u.mouse_down;

    // ── Layer 0: bg ──
    var p = vec2<f32>(uv.x * aspect, uv.y);
    var sdf_result = sdf_circle(p, 0.500000);
    let glow_pulse = 1.500000 * (0.9 + 0.1 * sin(time * 2.0));
    let glow_result = apply_glow(sdf_result, glow_pulse);
    var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
    color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.010000, 0.010000, 0.020000), color_result.a);
    // Compute field visualization
    let cv = sample_compute(input.uv);
    let compute_color = vec4<f32>(cv * 1.5, cv * 0.8, cv * 0.3, cv);
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

    // ── Layer 0: bg ──
    vec2 p = vec2(uv.x * aspect, uv.y);
    float sdf_result = sdf_circle(p, 0.500000);
    float glow_pulse = 1.500000 * (0.9 + 0.1 * sin(time * 2.0));
    float glow_result = apply_glow(sdf_result, glow_pulse);

    vec4 color_result = vec4(vec3(glow_result), glow_result);
    color_result = vec4(color_result.rgb * vec3(0.010000, 0.010000, 0.020000), color_result.a);
    color_result = vec4(aces_tonemap(color_result.rgb), color_result.a);
    color_result += (dither_noise(v_uv * u_resolution) - 0.5) / 255.0;
    fragColor = color_result;
}
`;
const UNIFORMS = [];
const COMPLEXITY = {layers:1,fbmOctaves:0,passes:0,memory:false,compute:true,is3d:false,tier:'light'};
const FLOW_WGSL = `struct FlowParams {
    scale: f32,
    speed: f32,
    strength: f32,
    time: f32,
    width: u32,
    height: u32,
};

@group(0) @binding(0) var<uniform> params: FlowParams;
@group(0) @binding(1) var<storage, read_write> field: array<vec2<f32>>;

// Permutation hash for noise
fn mod289(x: vec3<f32>) -> vec3<f32> { return x - floor(x / 289.0) * 289.0; }
fn mod289_4(x: vec4<f32>) -> vec4<f32> { return x - floor(x / 289.0) * 289.0; }
fn perm(x: vec4<f32>) -> vec4<f32> { return mod289_4((x * 34.0 + 1.0) * x); }

fn noise3(p: vec3<f32>) -> f32 {
    let a = floor(p);
    let d = p - a;
    let dd = d * d * (3.0 - 2.0 * d);
    let b = vec4<f32>(a.xy, a.xy + 1.0);
    let k1 = perm(vec4<f32>(b.xzxz));
    let k2 = perm(k1 + vec4<f32>(b.yyww));
    let c = k2 + vec4<f32>(a.z, a.z, a.z, a.z);
    let k3 = perm(c);
    let k4 = perm(c + 1.0);
    let o1 = fract(k3 / 41.0);
    let o2 = fract(k4 / 41.0);
    let o3 = o2 * dd.z + o1 * (1.0 - dd.z);
    let o4 = vec2<f32>(o3.yw * dd.x + o3.xz * (1.0 - dd.x));
    return o4.y * dd.y + o4.x * (1.0 - dd.y);
}

fn fbm(p: vec3<f32>) -> f32 {
    var sum = 0.0;
    var amp = 0.5;
    var freq = 1.0;
    for (var i = 0u; i < 4u; i++) {
        sum += noise3(p * freq) * amp;
        freq *= 2.0;
        amp *= 0.5;
    }
    return sum;
}

@compute @workgroup_size(8, 8)
fn cs_flow(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= params.width || gid.y >= params.height) { return; }

    let uv = vec2<f32>(f32(gid.x) / f32(params.width), f32(gid.y) / f32(params.height));
    let p = vec3<f32>(uv * params.scale, params.time * params.speed);

    // Curl noise: divergence-free flow
    let eps = 0.01;
    let dx = fbm(p + vec3<f32>(eps, 0.0, 0.0)) - fbm(p - vec3<f32>(eps, 0.0, 0.0));
    let dy = fbm(p + vec3<f32>(0.0, eps, 0.0)) - fbm(p - vec3<f32>(0.0, eps, 0.0));
    let vel = vec2<f32>(-dy, dx) / (2.0 * eps) * params.strength;

    field[gid.y * params.width + gid.x] = vel;
}
`;

class GameRenderer {
  constructor(canvas, wgslVertex, wgslFragment, uniformDefs, computeType) {
    this.canvas = canvas;
    this.wgslVertex = wgslVertex;
    this.wgslFragment = wgslFragment;
    this.uniformDefs = uniformDefs;
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

    const mainPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.ctx.getCurrentTexture().createView(),
        loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 }
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
    this.device.queue.submit([encoder.finish()]);
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


class GameRendererGL {
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
      console.error('GAME link error:', gl.getProgramInfoLog(this.program));
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
      console.error('GAME shader error:', gl.getShaderInfoLog(s));
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


class GameFlowField {
  constructor(device, computeCode) { this._w = 256; this._h = 256; this._device = device; this._code = computeCode; }

  async init() {
    const device = this._device;
    const module = device.createShaderModule({ code: this._code });
    this._pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module, entryPoint: 'cs_flow' },
    });

    const bufSize = this._w * this._h * 8;
    this._fieldBuf = device.createBuffer({ size: bufSize, usage: GPUBufferUsage.STORAGE });
    this._paramBuf = device.createBuffer({ size: 24, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this._time = 0;
  }

  dispatch(dt) {
    this._time += dt;
    const device = this._device;
    const p = new ArrayBuffer(24);
    const f = new Float32Array(p); const u = new Uint32Array(p);
    f[0] = 3; f[1] = 0.5; f[2] = 1; f[3] = this._time;
    u[4] = this._w; u[5] = this._h;
    device.queue.writeBuffer(this._paramBuf, 0, p);

    const bg = device.createBindGroup({
      layout: this._pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this._paramBuf } },
        { binding: 1, resource: { buffer: this._fieldBuf } },
      ],
    });
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this._pipeline);
    pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(Math.ceil(this._w / 8), Math.ceil(this._h / 8));
    pass.end();
    device.queue.submit([enc.finish()]);
  }

  get fieldBuffer() { return this._fieldBuf; }
  get width() { return this._w; }
  get height() { return this._h; }
}


class Smoke extends HTMLElement {
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
    const gpu = new GameRenderer(this._canvas, WGSL_V, WGSL_F, UNIFORMS, 'flow');
    if (await gpu.init()) {
      this._renderer = gpu;
    } else {
      const gl = new GameRendererGL(this._canvas, GLSL_V, GLSL_F, UNIFORMS);
      if (gl.init()) {
        this._renderer = gl;
      } else {
        console.warn('game-smoke: no WebGPU or WebGL2 support');
        return;
      }
    }
    this._resize();
    if (this._renderer.device) {
      const dev = this._renderer.device;
      if (typeof FLOW_WGSL !== 'undefined') {
        const sim = new GameFlowField(dev, FLOW_WGSL);
        await sim.init();
        this._flowSim = sim;
        this._renderer.setComputeBuffer(sim.fieldBuffer, sim.width, sim.height);
      }
      this._renderer._preRender = () => {
        const dt = 1/60;
        if (this._flowSim) {
          this._flowSim.dispatch(dt);
          this._renderer.setComputeBuffer(this._flowSim.fieldBuffer, this._flowSim.width, this._flowSim.height);
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

  static get observedAttributes() { return UNIFORMS.map(u => u.name); }
  attributeChangedCallback(name, _, val) {
    if (val !== null) this.setParam(name, parseFloat(val));
  }
}

customElements.define('game-smoke', Smoke);
})();
