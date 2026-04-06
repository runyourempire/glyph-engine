// GAME Component: living-desert-dunes — auto-generated, do not edit.
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

@group(0) @binding(5) var photo_tex: texture_2d<f32>;
@group(0) @binding(6) var photo_samp: sampler;

@group(0) @binding(7) var depth_tex: texture_2d<f32>;
@group(0) @binding(8) var depth_samp: sampler;

@group(0) @binding(9) var mask_sky_tex: texture_2d<f32>;
@group(0) @binding(10) var mask_sky_samp: sampler;

struct VertexOutput {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

fn apply_glow(d: f32, intensity: f32) -> f32 {
    return exp(-max(d, 0.0) * intensity * 8.0);
}

fn hash2(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
    p3 = p3 + vec3<f32>(dot(p3, p3.yzx + 33.33));
    return fract((p3.x + p3.y) * p3.z);
}

fn noise2(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let u_v = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash2(i), hash2(i + vec2<f32>(1.0, 0.0)), u_v.x),
        mix(hash2(i + vec2<f32>(0.0, 1.0)), hash2(i + vec2<f32>(1.0, 1.0)), u_v.x),
        u_v.y
    ) * 2.0 - 1.0;
}

fn fbm2(p: vec2<f32>, octaves: i32, persistence: f32, lacunarity: f32) -> f32 {
    var value: f32 = 0.0;
    var amplitude: f32 = 1.0;
    var frequency: f32 = 1.0;
    var max_val: f32 = 0.0;
    for (var i: i32 = 0; i < octaves; i = i + 1) {
        value = value + noise2(p * frequency) * amplitude;
        max_val = max_val + amplitude;
        amplitude = amplitude * persistence;
        frequency = frequency * lacunarity;
    }
    return value / max_val;
}

fn aces_tonemap(x: vec3<f32>) -> vec3<f32> {
    let a = x * (2.51 * x + 0.03);
    let b = x * (2.43 * x + 0.59) + 0.14;
    return clamp(a / b, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn dither_noise(uv: vec2<f32>) -> f32 {
    return fract(52.9829189 * fract(dot(uv, vec2<f32>(0.06711056, 0.00583715))));
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv * 2.0 - 1.0;
    let aspect = u.aspect_ratio;
    let time = fract(u.time / 120.0) * 120.0;
    let mouse_x = u.mouse.x;
    let mouse_y = u.mouse.y;
    let mouse_down = u.mouse_down;

    var final_color = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    // ── Layer 0: world ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        let _px_uv = clamp(vec2<f32>(p.x / aspect * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5)), vec2<f32>(0.0), vec2<f32>(1.0));
        let _px_orbit = vec2<f32>(sin(time * 0.050000), cos(time * 0.050000 * 0.7)) * 0.020000;
        let _px_depth = textureSample(depth_tex, depth_samp, _px_uv).r;
        let _px_displaced = clamp(_px_uv + _px_orbit * _px_depth, vec2<f32>(0.0), vec2<f32>(1.0));
        var color_result = textureSample(photo_tex, photo_samp, _px_displaced);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 1: sand_drift ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>((time * 0.018000), (time * 0.003000));
        { let warp_x = fbm2(p * 1.500000 + vec2<f32>(0.0, 1.3), i32(4.000000), 0.550000, 0.150000);
        let warp_y = fbm2(p * 1.500000 + vec2<f32>(1.7, 0.0), i32(4.000000), 0.550000, 0.150000);
        p = p + vec2<f32>(warp_x, warp_y) * 0.150000; }
        var sdf_result = fbm2((p * 2.000000 + vec2<f32>(time * 0.1, time * 0.07)), i32(4.000000), 0.500000, 2.000000);
        let glow_pulse = 0.800000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.920000, 0.850000, 0.650000), color_result.a);
        let _mask_uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
        let _mask_raw = textureSample(depth_tex, depth_samp, _mask_uv).r;
        let _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4<f32>(color_result.rgb * _mask_val, color_result.a * _mask_val);
        let la = color_result.a * 0.100000;
        let lc = color_result.rgb * 0.100000;
        final_color = vec4<f32>(1.0 - (1.0 - final_color.rgb) * (1.0 - lc), max(final_color.a, la));
    }

    // ── Layer 2: sand_stream ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>((time * 0.030000), (time * 0.005000));
        { let warp_x = fbm2(p * 2.500000 + vec2<f32>(0.0, 1.3), i32(3.000000), 0.500000, 0.120000);
        let warp_y = fbm2(p * 2.500000 + vec2<f32>(1.7, 0.0), i32(3.000000), 0.500000, 0.120000);
        p = p + vec2<f32>(warp_x, warp_y) * 0.120000; }
        var sdf_result = fbm2((p * 3.000000 + vec2<f32>(time * 0.1, time * 0.07)), i32(3.000000), 0.450000, 2.000000);
        let glow_pulse = 1.200000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.880000, 0.780000, 0.550000), color_result.a);
        let _mask_uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
        let _mask_raw = textureSample(depth_tex, depth_samp, _mask_uv).r;
        let _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4<f32>(color_result.rgb * _mask_val, color_result.a * _mask_val);
        let la = color_result.a * 0.070000;
        let lc = color_result.rgb * 0.070000;
        final_color = vec4<f32>(1.0 - (1.0 - final_color.rgb) * (1.0 - lc), max(final_color.a, la));
    }

    // ── Layer 3: heat_shimmer ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p + vec2<f32>(sin(p.y * 0.800000 + time * 0.350000), cos(p.x * 0.800000 + time * 0.350000)) * 0.008000;
        let _tex_uv = clamp(vec2<f32>(p.x / aspect * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5)), vec2<f32>(0.0), vec2<f32>(1.0));
        var color_result = textureSample(photo_tex, photo_samp, _tex_uv);
        let _mask_uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
        let _mask_raw = textureSample(depth_tex, depth_samp, _mask_uv).r;
        let _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4<f32>(color_result.rgb * _mask_val, color_result.a * _mask_val);
        let la = color_result.a * 0.750000;
        let lc = color_result.rgb * 0.750000;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 4: heat_waves ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>((time * 0.004000), (time * (-0.010000)));
        { let warp_x = fbm2(p * 3.000000 + vec2<f32>(0.0, 1.3), i32(3.000000), 0.100000, 2.000000);
        let warp_y = fbm2(p * 3.000000 + vec2<f32>(1.7, 0.0), i32(3.000000), 0.100000, 2.000000);
        p = p + vec2<f32>(warp_x, warp_y) * 0.100000; }
        var sdf_result = fbm2((p * 4.000000 + vec2<f32>(time * 0.1, time * 0.07)), i32(3.000000), 0.450000, 2.000000);
        let glow_pulse = 1.500000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(1.000000, 0.950000, 0.800000), color_result.a);
        let _mask_uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
        let _mask_raw = textureSample(depth_tex, depth_samp, _mask_uv).r;
        let _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4<f32>(color_result.rgb * _mask_val, color_result.a * _mask_val);
        let la = color_result.a * 0.060000;
        let lc = color_result.rgb * 0.060000;
        final_color = vec4<f32>(1.0 - (1.0 - final_color.rgb) * (1.0 - lc), max(final_color.a, la));
    }

    // ── Layer 5: sun_haze ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>((time * 0.002000), (time * 0.001000));
        { let warp_x = fbm2(p * 0.300000 + vec2<f32>(0.0, 1.3), i32(2.000000), 0.500000, 0.060000);
        let warp_y = fbm2(p * 0.300000 + vec2<f32>(1.7, 0.0), i32(2.000000), 0.500000, 0.060000);
        p = p + vec2<f32>(warp_x, warp_y) * 0.060000; }
        var sdf_result = fbm2((p * 0.200000 + vec2<f32>(time * 0.1, time * 0.07)), i32(2.000000), 0.500000, 2.000000);
        let glow_pulse = 3.000000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(1.000000, 0.880000, 0.550000), color_result.a);
        let _mask_uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
        let _mask_raw = textureSample(mask_sky_tex, mask_sky_samp, _mask_uv).r;
        let _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4<f32>(color_result.rgb * _mask_val, color_result.a * _mask_val);
        let la = color_result.a * 0.120000;
        let lc = color_result.rgb * 0.120000;
        final_color = vec4<f32>(1.0 - (1.0 - final_color.rgb) * (1.0 - lc), max(final_color.a, la));
    }

    // ── Layer 6: sky_haze ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>((time * 0.010000), (time * 0.003000));
        { let warp_x = fbm2(p * 0.500000 + vec2<f32>(0.0, 1.3), i32(3.000000), 0.550000, 0.100000);
        let warp_y = fbm2(p * 0.500000 + vec2<f32>(1.7, 0.0), i32(3.000000), 0.550000, 0.100000);
        p = p + vec2<f32>(warp_x, warp_y) * 0.100000; }
        var sdf_result = fbm2((p * 0.600000 + vec2<f32>(time * 0.1, time * 0.07)), i32(3.000000), 0.500000, 2.000000);
        let glow_pulse = 1.500000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.850000, 0.750000, 0.550000), color_result.a);
        let _mask_uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
        let _mask_raw = textureSample(mask_sky_tex, mask_sky_samp, _mask_uv).r;
        let _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4<f32>(color_result.rgb * _mask_val, color_result.a * _mask_val);
        let la = color_result.a * 0.080000;
        let lc = color_result.rgb * 0.080000;
        final_color = vec4<f32>(1.0 - (1.0 - final_color.rgb) * (1.0 - lc), max(final_color.a, la));
    }

    // ── Layer 7: sky_drift ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p + vec2<f32>(sin(p.y * 0.200000 + time * 0.025000), cos(p.x * 0.200000 + time * 0.025000)) * 0.008000;
        let _tex_uv = clamp(vec2<f32>(p.x / aspect * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5)), vec2<f32>(0.0), vec2<f32>(1.0));
        var color_result = textureSample(photo_tex, photo_samp, _tex_uv);
        let _mask_uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
        let _mask_raw = textureSample(mask_sky_tex, mask_sky_samp, _mask_uv).r;
        let _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4<f32>(color_result.rgb * _mask_val, color_result.a * _mask_val);
        let la = color_result.a * 0.820000;
        let lc = color_result.rgb * 0.820000;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 8: dust_gust ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>((time * 0.040000), (sin((time * 0.040000)) * 0.008000));
        { let warp_x = fbm2(p * 0.800000 + vec2<f32>(0.0, 1.3), i32(5.000000), 0.650000, 0.250000);
        let warp_y = fbm2(p * 0.800000 + vec2<f32>(1.7, 0.0), i32(5.000000), 0.650000, 0.250000);
        p = p + vec2<f32>(warp_x, warp_y) * 0.250000; }
        var sdf_result = fbm2((p * 1.000000 + vec2<f32>(time * 0.1, time * 0.07)), i32(5.000000), 0.550000, 2.000000);
        let glow_pulse = 0.600000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.900000, 0.820000, 0.600000), color_result.a);
        let _mask_uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
        let _mask_raw = textureSample(depth_tex, depth_samp, _mask_uv).r;
        let _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4<f32>(color_result.rgb * _mask_val, color_result.a * _mask_val);
        let la = color_result.a * 0.040000;
        let lc = color_result.rgb * 0.040000;
        final_color = vec4<f32>(1.0 - (1.0 - final_color.rgb) * (1.0 - lc), max(final_color.a, la));
    }

    // ── Layer 9: light_sweep ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>((time * 0.005000), (time * 0.002000));
        { let warp_x = fbm2(p * 0.250000 + vec2<f32>(0.0, 1.3), i32(2.000000), 0.500000, 0.050000);
        let warp_y = fbm2(p * 0.250000 + vec2<f32>(1.7, 0.0), i32(2.000000), 0.500000, 0.050000);
        p = p + vec2<f32>(warp_x, warp_y) * 0.050000; }
        var sdf_result = fbm2((p * 0.200000 + vec2<f32>(time * 0.1, time * 0.07)), i32(2.000000), 0.500000, 2.000000);
        let glow_pulse = 2.000000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(1.000000, 0.920000, 0.700000), color_result.a);
        let la = color_result.a * 0.070000;
        let lc = color_result.rgb * 0.070000;
        final_color = vec4<f32>(1.0 - (1.0 - final_color.rgb) * (1.0 - lc), max(final_color.a, la));
    }

    final_color = vec4<f32>(clamp(final_color.rgb, vec3<f32>(0.0), vec3<f32>(1.0)), final_color.a);
    final_color = final_color + (dither_noise(input.uv * u.resolution) - 0.5) / 255.0;
    return final_color;
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
uniform sampler2D u_tex_photo;
uniform sampler2D u_tex_depth;
uniform sampler2D u_tex_mask_sky;

in vec2 v_uv;
out vec4 fragColor;

float apply_glow(float d, float intensity){
    return exp(-max(d, 0.0) * intensity * 8.0);
}

float hash2(vec2 p){
    vec3 p3 = fract(vec3(p.x, p.y, p.x) * 0.1031);
    p3 += vec3(dot(p3, p3.yzx + 33.33));
    return fract((p3.x + p3.y) * p3.z);
}

float noise2(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
        mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
        u.y
    ) * 2.0 - 1.0;
}

float fbm2(vec2 p, int octaves, float persistence, float lacunarity){
    float value = 0.0;
    float amplitude = 1.0;
    float frequency = 1.0;
    float max_val = 0.0;
    for (int i = 0; i < octaves; i++) {
        value += noise2(p * frequency) * amplitude;
        max_val += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }
    return value / max_val;
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

    vec4 final_color = vec4(0.0, 0.0, 0.0, 0.0);

    // ── Layer 0: world ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        vec2 _px_uv = clamp(vec2(p.x / aspect * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5)), 0.0, 1.0);
        vec2 _px_orbit = vec2(sin(time * 0.050000), cos(time * 0.050000 * 0.7)) * 0.020000;
        float _px_depth = texture(u_tex_depth, _px_uv).r;
        vec2 _px_displaced = clamp(_px_uv + _px_orbit * _px_depth, 0.0, 1.0);
        vec4 color_result = texture(u_tex_photo, _px_displaced);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 1: sand_drift ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2((time * 0.018000), (time * 0.003000));
        { float warp_x = fbm2(p * 1.500000 + vec2(0.0, 1.3), int(4.000000), 0.550000, 0.150000);
        float warp_y = fbm2(p * 1.500000 + vec2(1.7, 0.0), int(4.000000), 0.550000, 0.150000);
        p = p + vec2(warp_x, warp_y) * 0.150000; }
        float sdf_result = fbm2((p * 2.000000 + vec2(time * 0.1, time * 0.07)), int(4.000000), 0.500000, 2.000000);
        float glow_pulse = 0.800000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.920000, 0.850000, 0.650000), color_result.a);
        vec2 _mask_uv = vec2(v_uv.x, 1.0 - v_uv.y);
        float _mask_raw = texture(u_tex_depth, _mask_uv).r;
        float _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4(color_result.rgb * _mask_val, color_result.a * _mask_val);
        float la = color_result.a * 0.100000;
        vec3 lc = color_result.rgb * 0.100000;
        final_color = vec4(vec3(1.0) - (vec3(1.0) - final_color.rgb) * (vec3(1.0) - lc), max(final_color.a, la));
    }

    // ── Layer 2: sand_stream ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2((time * 0.030000), (time * 0.005000));
        { float warp_x = fbm2(p * 2.500000 + vec2(0.0, 1.3), int(3.000000), 0.500000, 0.120000);
        float warp_y = fbm2(p * 2.500000 + vec2(1.7, 0.0), int(3.000000), 0.500000, 0.120000);
        p = p + vec2(warp_x, warp_y) * 0.120000; }
        float sdf_result = fbm2((p * 3.000000 + vec2(time * 0.1, time * 0.07)), int(3.000000), 0.450000, 2.000000);
        float glow_pulse = 1.200000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.880000, 0.780000, 0.550000), color_result.a);
        vec2 _mask_uv = vec2(v_uv.x, 1.0 - v_uv.y);
        float _mask_raw = texture(u_tex_depth, _mask_uv).r;
        float _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4(color_result.rgb * _mask_val, color_result.a * _mask_val);
        float la = color_result.a * 0.070000;
        vec3 lc = color_result.rgb * 0.070000;
        final_color = vec4(vec3(1.0) - (vec3(1.0) - final_color.rgb) * (vec3(1.0) - lc), max(final_color.a, la));
    }

    // ── Layer 3: heat_shimmer ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p + vec2(sin(p.y * 0.800000 + time * 0.350000), cos(p.x * 0.800000 + time * 0.350000)) * 0.008000;
        vec2 _tex_uv = clamp(vec2(p.x / aspect * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5)), 0.0, 1.0);
        vec4 color_result = texture(u_tex_photo, _tex_uv);
        vec2 _mask_uv = vec2(v_uv.x, 1.0 - v_uv.y);
        float _mask_raw = texture(u_tex_depth, _mask_uv).r;
        float _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4(color_result.rgb * _mask_val, color_result.a * _mask_val);
        float la = color_result.a * 0.750000;
        vec3 lc = color_result.rgb * 0.750000;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 4: heat_waves ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2((time * 0.004000), (time * (-0.010000)));
        { float warp_x = fbm2(p * 3.000000 + vec2(0.0, 1.3), int(3.000000), 0.100000, 2.000000);
        float warp_y = fbm2(p * 3.000000 + vec2(1.7, 0.0), int(3.000000), 0.100000, 2.000000);
        p = p + vec2(warp_x, warp_y) * 0.100000; }
        float sdf_result = fbm2((p * 4.000000 + vec2(time * 0.1, time * 0.07)), int(3.000000), 0.450000, 2.000000);
        float glow_pulse = 1.500000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(1.000000, 0.950000, 0.800000), color_result.a);
        vec2 _mask_uv = vec2(v_uv.x, 1.0 - v_uv.y);
        float _mask_raw = texture(u_tex_depth, _mask_uv).r;
        float _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4(color_result.rgb * _mask_val, color_result.a * _mask_val);
        float la = color_result.a * 0.060000;
        vec3 lc = color_result.rgb * 0.060000;
        final_color = vec4(vec3(1.0) - (vec3(1.0) - final_color.rgb) * (vec3(1.0) - lc), max(final_color.a, la));
    }

    // ── Layer 5: sun_haze ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2((time * 0.002000), (time * 0.001000));
        { float warp_x = fbm2(p * 0.300000 + vec2(0.0, 1.3), int(2.000000), 0.500000, 0.060000);
        float warp_y = fbm2(p * 0.300000 + vec2(1.7, 0.0), int(2.000000), 0.500000, 0.060000);
        p = p + vec2(warp_x, warp_y) * 0.060000; }
        float sdf_result = fbm2((p * 0.200000 + vec2(time * 0.1, time * 0.07)), int(2.000000), 0.500000, 2.000000);
        float glow_pulse = 3.000000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(1.000000, 0.880000, 0.550000), color_result.a);
        vec2 _mask_uv = vec2(v_uv.x, 1.0 - v_uv.y);
        float _mask_raw = texture(u_tex_mask_sky, _mask_uv).r;
        float _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4(color_result.rgb * _mask_val, color_result.a * _mask_val);
        float la = color_result.a * 0.120000;
        vec3 lc = color_result.rgb * 0.120000;
        final_color = vec4(vec3(1.0) - (vec3(1.0) - final_color.rgb) * (vec3(1.0) - lc), max(final_color.a, la));
    }

    // ── Layer 6: sky_haze ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2((time * 0.010000), (time * 0.003000));
        { float warp_x = fbm2(p * 0.500000 + vec2(0.0, 1.3), int(3.000000), 0.550000, 0.100000);
        float warp_y = fbm2(p * 0.500000 + vec2(1.7, 0.0), int(3.000000), 0.550000, 0.100000);
        p = p + vec2(warp_x, warp_y) * 0.100000; }
        float sdf_result = fbm2((p * 0.600000 + vec2(time * 0.1, time * 0.07)), int(3.000000), 0.500000, 2.000000);
        float glow_pulse = 1.500000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.850000, 0.750000, 0.550000), color_result.a);
        vec2 _mask_uv = vec2(v_uv.x, 1.0 - v_uv.y);
        float _mask_raw = texture(u_tex_mask_sky, _mask_uv).r;
        float _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4(color_result.rgb * _mask_val, color_result.a * _mask_val);
        float la = color_result.a * 0.080000;
        vec3 lc = color_result.rgb * 0.080000;
        final_color = vec4(vec3(1.0) - (vec3(1.0) - final_color.rgb) * (vec3(1.0) - lc), max(final_color.a, la));
    }

    // ── Layer 7: sky_drift ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p + vec2(sin(p.y * 0.200000 + time * 0.025000), cos(p.x * 0.200000 + time * 0.025000)) * 0.008000;
        vec2 _tex_uv = clamp(vec2(p.x / aspect * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5)), 0.0, 1.0);
        vec4 color_result = texture(u_tex_photo, _tex_uv);
        vec2 _mask_uv = vec2(v_uv.x, 1.0 - v_uv.y);
        float _mask_raw = texture(u_tex_mask_sky, _mask_uv).r;
        float _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4(color_result.rgb * _mask_val, color_result.a * _mask_val);
        float la = color_result.a * 0.820000;
        vec3 lc = color_result.rgb * 0.820000;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 8: dust_gust ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2((time * 0.040000), (sin((time * 0.040000)) * 0.008000));
        { float warp_x = fbm2(p * 0.800000 + vec2(0.0, 1.3), int(5.000000), 0.650000, 0.250000);
        float warp_y = fbm2(p * 0.800000 + vec2(1.7, 0.0), int(5.000000), 0.650000, 0.250000);
        p = p + vec2(warp_x, warp_y) * 0.250000; }
        float sdf_result = fbm2((p * 1.000000 + vec2(time * 0.1, time * 0.07)), int(5.000000), 0.550000, 2.000000);
        float glow_pulse = 0.600000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.900000, 0.820000, 0.600000), color_result.a);
        vec2 _mask_uv = vec2(v_uv.x, 1.0 - v_uv.y);
        float _mask_raw = texture(u_tex_depth, _mask_uv).r;
        float _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4(color_result.rgb * _mask_val, color_result.a * _mask_val);
        float la = color_result.a * 0.040000;
        vec3 lc = color_result.rgb * 0.040000;
        final_color = vec4(vec3(1.0) - (vec3(1.0) - final_color.rgb) * (vec3(1.0) - lc), max(final_color.a, la));
    }

    // ── Layer 9: light_sweep ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2((time * 0.005000), (time * 0.002000));
        { float warp_x = fbm2(p * 0.250000 + vec2(0.0, 1.3), int(2.000000), 0.500000, 0.050000);
        float warp_y = fbm2(p * 0.250000 + vec2(1.7, 0.0), int(2.000000), 0.500000, 0.050000);
        p = p + vec2(warp_x, warp_y) * 0.050000; }
        float sdf_result = fbm2((p * 0.200000 + vec2(time * 0.1, time * 0.07)), int(2.000000), 0.500000, 2.000000);
        float glow_pulse = 2.000000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(1.000000, 0.920000, 0.700000), color_result.a);
        float la = color_result.a * 0.070000;
        vec3 lc = color_result.rgb * 0.070000;
        final_color = vec4(vec3(1.0) - (vec3(1.0) - final_color.rgb) * (vec3(1.0) - lc), max(final_color.a, la));
    }

    final_color = vec4(clamp(final_color.rgb, 0.0, 1.0), final_color.a);
    final_color += (dither_noise(v_uv * u_resolution) - 0.5) / 255.0;
    fragColor = final_color;
}
`;
const UNIFORMS = [];
const COMPLEXITY = {layers:10,fbmOctaves:44,passes:3,memory:false,compute:false,is3d:false,tier:'extreme'};
const TEX_INDEX = {'photo': 0, 'depth': 1, 'mask_sky': 2};
const PASS_WGSL_0 = `// Post-processing pass: soften

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
    let r = i32(0.600000);
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
const PASS_WGSL_1 = `// Post-processing pass: frame

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

    let vign = 1.0 - 0.220000 * length(uv - 0.5);
    color_result = vec4<f32>(color_result.rgb * vign, color_result.a * vign);
    return color_result;
}
`;
const PASS_WGSL_2 = `// Post-processing pass: film

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

    // film grain
    let grain_seed = uv * u.resolution + vec2<f32>(u.time * 1000.0, 0.0);
    let grain_val = (fract(sin(dot(grain_seed, vec2<f32>(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.014000;
    color_result = vec4<f32>(color_result.rgb + grain_val, color_result.a);
    return color_result;
}
`;
const PASS_SHADERS = [PASS_WGSL_0,PASS_WGSL_1,PASS_WGSL_2];

class GameRenderer {
  constructor(canvas, wgslVertex, wgslFragment, uniformDefs, passShaders, textureCount) {
    this.canvas = canvas;
    this.wgslVertex = wgslVertex;
    this.wgslFragment = wgslFragment;
    this.uniformDefs = uniformDefs;
    this.passShaders = passShaders;
    this._texCount = textureCount;
    this._userTextures = [];
    this._userSamplers = [];
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

    this._texSampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
    for (let t = 0; t < this._texCount; t++) {
      const ph = this.device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
      this.device.queue.writeTexture({ texture: ph }, new Uint8Array([255,255,255,255]), { bytesPerRow: 4 }, [1, 1]);
      this._userTextures.push(ph);
      this._userSamplers.push(this._texSampler);
    }
    const bglEntries = [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }];
    for (let t = 0; t < this._texCount; t++) {
      bglEntries.push({ binding: t * 2 + 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } });
      bglEntries.push({ binding: t * 2 + 6, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } });
    }
    const bindGroupLayout = this.device.createBindGroupLayout({ entries: bglEntries });
    this._mainBGL = bindGroupLayout;
    this._rebuildBindGroup();

    const pipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

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

  _rebuildBindGroup() {
    const entries = [{ binding: 0, resource: { buffer: this.uniformBuffer } }];
    for (let t = 0; t < this._texCount; t++) {
      entries.push({ binding: t * 2 + 5, resource: this._userTextures[t].createView() });
      entries.push({ binding: t * 2 + 6, resource: this._userSamplers[t] });
    }
    this.bindGroup = this.device.createBindGroup({ layout: this._mainBGL, entries });
  }

  setUserTexture(index, gpuTexture) {
    if (index < 0 || index >= this._texCount) return;
    const old = this._userTextures[index];
    if (old && old.width === 1 && old.height === 1) old.destroy();
    this._userTextures[index] = gpuTexture;
    this._rebuildBindGroup();
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
    this._texLocs = {};
    this._texImages = {};
    this._texLocs['photo'] = gl.getUniformLocation(this.program, 'u_tex_photo');
    this._texLocs['depth'] = gl.getUniformLocation(this.program, 'u_tex_depth');
    this._texLocs['mask_sky'] = gl.getUniformLocation(this.program, 'u_tex_mask_sky');
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

    gl.activeTexture(gl.TEXTURE0 + 2);
    if (this._texImages['photo']) gl.bindTexture(gl.TEXTURE_2D, this._texImages['photo']);
    gl.uniform1i(this._texLocs['photo'], 2);
    gl.activeTexture(gl.TEXTURE0 + 3);
    if (this._texImages['depth']) gl.bindTexture(gl.TEXTURE_2D, this._texImages['depth']);
    gl.uniform1i(this._texLocs['depth'], 3);
    gl.activeTexture(gl.TEXTURE0 + 4);
    if (this._texImages['mask_sky']) gl.bindTexture(gl.TEXTURE_2D, this._texImages['mask_sky']);
    gl.uniform1i(this._texLocs['mask_sky'], 4);
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

  setUserTextureGL(name, glTexture) {
    this._texImages[name] = glTexture;
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


class LivingDesertDunes extends HTMLElement {
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
    const gpu = new GameRenderer(this._canvas, WGSL_V, WGSL_F, UNIFORMS, PASS_SHADERS, 3);
    if (await gpu.init()) {
      this._renderer = gpu;
    } else {
      const gl = new GameRendererGL(this._canvas, GLSL_V, GLSL_F, UNIFORMS);
      if (gl.init()) {
        this._renderer = gl;
      } else {
        console.warn('game-living-desert-dunes: no WebGPU or WebGL2 support');
        return;
      }
    }
    this._resize();
    for (const [k, v] of Object.entries(this._pendingParams)) {
      this._renderer.setParam(k, v);
    }
    this.loadTexture('photo', 'desert-dunes.jpg').catch(e => console.warn('texture load failed:', e));
    this.loadTexture('depth', 'desert-dunes-depth.png').catch(e => console.warn('texture load failed:', e));
    this.loadTexture('mask_sky', 'desert-dunes-mask_sky.png').catch(e => console.warn('texture load failed:', e));
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

  async loadTexture(name, url) {
    if (!this._renderer?.device) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await img.decode();
    const bitmap = await createImageBitmap(img);
    const tex = this._renderer.device.createTexture({
      size: [bitmap.width, bitmap.height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this._renderer.device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture: tex },
      [bitmap.width, bitmap.height]
    );
    this._textures = this._textures || {};
    this._textures[name] = tex;
    // Wire texture into GPU bind group
    if (typeof TEX_INDEX !== 'undefined' && name in TEX_INDEX) {
      if (this._renderer.setUserTexture) this._renderer.setUserTexture(TEX_INDEX[name], tex);
      else if (this._renderer.setUserTextureGL) {
        // WebGL2: create GL texture from bitmap
        const gl = this._renderer.gl;
        const glTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, glTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        this._renderer.setUserTextureGL(name, glTex);
      }
    }
  }

  async loadTextureFromData(name, imageData) {
    if (!this._renderer?.device) return;
    const bitmap = await createImageBitmap(imageData);
    const tex = this._renderer.device.createTexture({
      size: [bitmap.width, bitmap.height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this._renderer.device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture: tex },
      [bitmap.width, bitmap.height]
    );
    this._textures = this._textures || {};
    this._textures[name] = tex;
    if (typeof TEX_INDEX !== 'undefined' && name in TEX_INDEX) {
      if (this._renderer.setUserTexture) this._renderer.setUserTexture(TEX_INDEX[name], tex);
    }
  }

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

customElements.define('game-living-desert-dunes', LivingDesertDunes);
})();
