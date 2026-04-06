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
    p_flow_speed: f32,
    p_flow_strength: f32,
    p_bio_intensity: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

@group(1) @binding(0) var prev_frame: texture_2d<f32>;
@group(1) @binding(1) var prev_sampler: sampler;

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

fn cosine_palette(t: f32, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, d: vec3<f32>) -> vec3<f32> {
    return a + b * cos(6.28318 * (c * t + d));
}

fn game_mod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
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

    let flow_speed = u.p_flow_speed;
    let flow_strength = u.p_flow_strength;
    let bio_intensity = u.p_bio_intensity;

    var final_color = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    // ── Layer 1: water ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        { let warp_x = fbm2(p * 1.200000 + vec2<f32>(0.0, 1.3), i32(6.000000), 0.550000, (0.320000 + (u.mouse_down * 0.080000)));
        let warp_y = fbm2(p * 1.200000 + vec2<f32>(1.7, 0.0), i32(6.000000), 0.550000, (0.320000 + (u.mouse_down * 0.080000)));
        p = p + vec2<f32>(warp_x, warp_y) * (0.320000 + (u.mouse_down * 0.080000)); }
        p = p + vec2<f32>(sin(p.y * 2.000000 + time * flow_speed), cos(p.x * 2.000000 + time * flow_speed)) * (flow_strength * 0.400000);
        var sdf_result = fbm2((p * 2.500000 + vec2<f32>(time * 0.1, time * 0.07)), i32(5.000000), 0.500000, 2.000000);
        let pal_rgb = cosine_palette(sdf_result, vec3<f32>(0.150000, 0.200000, 0.350000), vec3<f32>(0.150000, 0.200000, 0.300000), vec3<f32>(1.000000, 0.800000, 0.600000), vec3<f32>(0.550000, 0.600000, 0.700000));
        var color_result = vec4<f32>(pal_rgb, clamp(dot(pal_rgb, vec3<f32>(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.900000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 2: current ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        { let warp_x = fbm2(p * (2.500000 + (u.mouse.x * 0.400000)) + vec2<f32>(0.0, 1.3), i32(5.000000), 0.500000, (0.250000 + (u.mouse_down * 0.060000)));
        let warp_y = fbm2(p * (2.500000 + (u.mouse.x * 0.400000)) + vec2<f32>(1.7, 0.0), i32(5.000000), 0.500000, (0.250000 + (u.mouse_down * 0.060000)));
        p = p + vec2<f32>(warp_x, warp_y) * (0.250000 + (u.mouse_down * 0.060000)); }
        p = p + vec2<f32>(sin(p.y * 3.000000 + time * (flow_speed * 1.400000)), cos(p.x * 3.000000 + time * (flow_speed * 1.400000))) * (flow_strength * 0.500000);
        var sdf_result = fbm2((p * 5.000000 + vec2<f32>(time * 0.1, time * 0.07)), i32(4.000000), 0.450000, 2.000000);
        let pal_rgb = cosine_palette(sdf_result, vec3<f32>(0.100000, 0.180000, 0.300000), vec3<f32>(0.120000, 0.180000, 0.250000), vec3<f32>(1.200000, 0.800000, 0.500000), vec3<f32>(0.600000, 0.650000, 0.750000));
        var color_result = vec4<f32>(pal_rgb, clamp(dot(pal_rgb, vec3<f32>(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.850000);
        let la = color_result.a * 0.500000;
        let lc = color_result.rgb * 0.500000;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 3: organisms ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p + vec2<f32>(sin(p.y * 4.000000 + time * (flow_speed * 0.700000)), cos(p.x * 4.000000 + time * (flow_speed * 0.700000))) * 0.180000;
        { let warp_x = fbm2(p * 2.000000 + vec2<f32>(0.0, 1.3), i32(3.000000), 0.200000, 2.000000);
        let warp_y = fbm2(p * 2.000000 + vec2<f32>(1.7, 0.0), i32(3.000000), 0.200000, 2.000000);
        p = p + vec2<f32>(warp_x, warp_y) * 0.200000; }
        p = vec2<f32>(game_mod(p.x + 0.120000 * 0.5, 0.120000) - 0.120000 * 0.5, game_mod(p.y + 0.120000 * 0.5, 0.120000) - 0.120000 * 0.5);
        var sdf_result = sdf_circle(p, 0.020000);
        let glow_pulse = (2.500000 + (bio_intensity * 1.000000)) * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.200000, 0.600000, 0.900000), color_result.a);
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.820000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 4: trails ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p + vec2<f32>(sin(p.y * 3.000000 + time * (flow_speed * 0.500000)), cos(p.x * 3.000000 + time * (flow_speed * 0.500000))) * 0.120000;
        { let warp_x = fbm2(p * 2.000000 + vec2<f32>(0.0, 1.3), i32(4.000000), 0.500000, 0.220000);
        let warp_y = fbm2(p * 2.000000 + vec2<f32>(1.7, 0.0), i32(4.000000), 0.500000, 0.220000);
        p = p + vec2<f32>(warp_x, warp_y) * 0.220000; }
        var sdf_result = noise2(p * 6.000000 + vec2<f32>(time * 0.1, time * 0.07));
        let glow_pulse = (1.200000 + (bio_intensity * 0.500000)) * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.150000, 0.400000, 0.700000), color_result.a);
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.940000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 5: cursor ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>(((u.mouse.x * 2.000000) - 1.000000), ((u.mouse.y * 2.000000) - 1.000000));
        var sdf_result = sdf_circle(p, (0.030000 + (u.mouse_down * 0.030000)));
        let glow_pulse = (0.500000 + (u.mouse_down * 0.500000)) * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.200000, 0.500000, 0.800000), color_result.a);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    final_color = vec4<f32>(aces_tonemap(final_color.rgb), final_color.a);
    final_color = final_color + (dither_noise(input.uv * u.resolution) - 0.5) / 255.0;
    return final_color;
}
