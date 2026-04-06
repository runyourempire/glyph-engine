struct Uniforms {
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
    p_drift_x: f32,
    p_drift_y: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

@group(0) @binding(5) var photo_tex: texture_2d<f32>;
@group(0) @binding(6) var photo_samp: sampler;

@group(0) @binding(7) var depth_tex: texture_2d<f32>;
@group(0) @binding(8) var depth_samp: sampler;

@group(0) @binding(9) var flow_tex: texture_2d<f32>;
@group(0) @binding(10) var flow_samp: sampler;

@group(0) @binding(11) var mask_water_tex: texture_2d<f32>;
@group(0) @binding(12) var mask_water_samp: sampler;

@group(0) @binding(13) var mask_sky_tex: texture_2d<f32>;
@group(0) @binding(14) var mask_sky_samp: sampler;

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

fn hash2v(p: vec2<f32>) -> vec2<f32> {
    let p3 = fract(vec3<f32>(p.x, p.y, p.x) * vec3<f32>(0.1031, 0.1030, 0.0973));
    let pp = p3 + vec3<f32>(dot(p3, p3.yzx + 33.33));
    return fract(vec2<f32>((pp.x + pp.y) * pp.z, (pp.x + pp.z) * pp.y));
}

fn voronoi2(p: vec2<f32>) -> f32 {
    let n = floor(p);
    let f = fract(p);
    var md: f32 = 8.0;
    for (var j: i32 = -1; j <= 1; j = j + 1) {
        for (var i: i32 = -1; i <= 1; i = i + 1) {
            let g = vec2<f32>(f32(i), f32(j));
            let o = hash2v(n + g);
            let r = g + o - f;
            let d = dot(r, r);
            md = min(md, d);
        }
    }
    return sqrt(md);
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

    let drift_x = u.p_drift_x;
    let drift_y = u.p_drift_y;

    var final_color = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    // ── Layer 1: world ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        let _px_uv = clamp(vec2<f32>(p.x / aspect * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5)), vec2<f32>(0.0), vec2<f32>(1.0));
        let _px_orbit = vec2<f32>(sin(time * 0.080000), cos(time * 0.080000 * 0.7)) * 0.003000;
        let _px_depth = textureSample(depth_tex, depth_samp, _px_uv).r;
        let _px_displaced = clamp(_px_uv + _px_orbit * _px_depth, vec2<f32>(0.0), vec2<f32>(1.0));
        var color_result = textureSample(photo_tex, photo_samp, _px_displaced);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 2: caustics ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>((time * 0.014000), (time * 0.007000));
        { let warp_x = fbm2(p * 6.000000 + vec2<f32>(0.0, 1.3), i32(2.000000), 0.120000, 2.000000);
        let warp_y = fbm2(p * 6.000000 + vec2<f32>(1.7, 0.0), i32(2.000000), 0.120000, 2.000000);
        p = p + vec2<f32>(warp_x, warp_y) * 0.120000; }
        var sdf_result = voronoi2(p * 12.000000 + vec2<f32>(time * 0.05, time * 0.03));
        let glow_pulse = 1.500000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.500000, 0.700000, 1.000000), color_result.a);
        let _mask_uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
        let _mask_raw = textureSample(mask_water_tex, mask_water_samp, _mask_uv).r;
        let _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4<f32>(color_result.rgb * _mask_val, color_result.a * _mask_val);
        let la = color_result.a * 0.018000;
        let lc = color_result.rgb * 0.018000;
        final_color = vec4<f32>(1.0 - (1.0 - final_color.rgb) * (1.0 - lc), max(final_color.a, la));
    }

    // ── Layer 3: sparkle ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>((time * 0.020000), (time * 0.010000));
        p = p + vec2<f32>(sin(p.y * 15.000000 + time * 0.800000), cos(p.x * 15.000000 + time * 0.800000)) * 0.300000;
        var sdf_result = voronoi2(p * 25.000000 + vec2<f32>(time * 0.05, time * 0.03));
        let glow_pulse = 4.000000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(1.000000, 0.880000, 0.550000), color_result.a);
        let _mask_uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
        let _mask_raw = textureSample(mask_water_tex, mask_water_samp, _mask_uv).r;
        let _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4<f32>(color_result.rgb * _mask_val, color_result.a * _mask_val);
        let la = color_result.a * 0.009000;
        let lc = color_result.rgb * 0.009000;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 4: mist ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>((time * drift_x), (sin((time * 0.040000)) * 0.003000));
        { let warp_x = fbm2(p * 1.200000 + vec2<f32>(0.0, 1.3), i32(4.000000), 0.650000, 0.100000);
        let warp_y = fbm2(p * 1.200000 + vec2<f32>(1.7, 0.0), i32(4.000000), 0.650000, 0.100000);
        p = p + vec2<f32>(warp_x, warp_y) * 0.100000; }
        var sdf_result = fbm2((p * 1.800000 + vec2<f32>(time * 0.1, time * 0.07)), i32(4.000000), 0.550000, 2.000000);
        let glow_pulse = 0.500000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.900000, 0.850000, 0.800000), color_result.a);
        let _mask_uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
        let _mask_raw = textureSample(depth_tex, depth_samp, _mask_uv).r;
        let _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 1.000000);
        color_result = vec4<f32>(color_result.rgb * _mask_val, color_result.a * _mask_val);
        let la = color_result.a * 0.015000;
        let lc = color_result.rgb * 0.015000;
        final_color = vec4<f32>(1.0 - (1.0 - final_color.rgb) * (1.0 - lc), max(final_color.a, la));
    }

    // ── Layer 5: light_pulse ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>((time * 0.004000), (time * 0.001000));
        { let warp_x = fbm2(p * 0.600000 + vec2<f32>(0.0, 1.3), i32(2.000000), 0.500000, 0.060000);
        let warp_y = fbm2(p * 0.600000 + vec2<f32>(1.7, 0.0), i32(2.000000), 0.500000, 0.060000);
        p = p + vec2<f32>(warp_x, warp_y) * 0.060000; }
        var sdf_result = fbm2((p * 0.500000 + vec2<f32>(time * 0.1, time * 0.07)), i32(3.000000), 0.500000, 2.000000);
        let glow_pulse = 0.600000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(1.000000, 0.880000, 0.650000), color_result.a);
        let la = color_result.a * 0.018000;
        let lc = color_result.rgb * 0.018000;
        final_color = vec4<f32>(1.0 - (1.0 - final_color.rgb) * (1.0 - lc), max(final_color.a, la));
    }

    // ── Layer 6: godrays ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>(0.000000, 0.350000);
        p = vec2<f32>(length(p), atan2(p.y, p.x));
        p = p + vec2<f32>(sin(p.y * 0.400000 + time * 0.025000), cos(p.x * 0.400000 + time * 0.025000)) * 0.012000;
        let sdf_result = smoothstep(0.000000, 0.650000, length(p));
        let glow_pulse = 3.000000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(1.000000, 0.880000, 0.550000), color_result.a);
        let la = color_result.a * 0.012000;
        let lc = color_result.rgb * 0.012000;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 7: sky ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p + vec2<f32>(sin(p.y * 0.600000 + time * 0.030000), cos(p.x * 0.600000 + time * 0.030000)) * 0.005000;
        let _tex_uv = clamp(vec2<f32>(p.x / aspect * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5)), vec2<f32>(0.0), vec2<f32>(1.0));
        var color_result = textureSample(photo_tex, photo_samp, _tex_uv);
        let _mask_uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
        let _mask_raw = textureSample(mask_sky_tex, mask_sky_samp, _mask_uv).r;
        let _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4<f32>(color_result.rgb * _mask_val, color_result.a * _mask_val);
        let la = color_result.a * 0.700000;
        let lc = color_result.rgb * 0.700000;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    final_color = vec4<f32>(clamp(final_color.rgb, vec3<f32>(0.0), vec3<f32>(1.0)), final_color.a);
    final_color = final_color + (dither_noise(input.uv * u.resolution) - 0.5) / 255.0;
    return final_color;
}
