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
    p_refraction: f32,
    p_intensity: f32,
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

fn sdf_triangle(p: vec2<f32>, sz: f32) -> f32 {
    let k = sqrt(3.0);
    var q = vec2<f32>(abs(p.x) - sz, p.y + sz / k);
    if (q.x + k * q.y > 0.0) { q = vec2<f32>(q.x - k * q.y, -k * q.x - q.y) / 2.0; }
    q = vec2<f32>(q.x - clamp(q.x, -2.0 * sz, 0.0), q.y);
    return -length(q) * sign(q.y);
}

fn aces_tonemap(x: vec3<f32>) -> vec3<f32> {
    let a = x * (2.51 * x + 0.03);
    let b = x * (2.43 * x + 0.59) + 0.14;
    return clamp(a / b, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn dither_noise(uv: vec2<f32>) -> f32 {
    return fract(52.9829189 * fract(dot(uv, vec2<f32>(0.06711056, 0.00583715))));
}

fn apply_color_matrix(color: vec3f) -> vec3f {
    let m = mat3x3f(
        vec3f(1.05, 0, 0),
        vec3f(0, 1.05, 0),
        vec3f(0, 0, 1.05)
    );
    return clamp(m * color, vec3f(0.0), vec3f(1.0));
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv * 2.0 - 1.0;
    let aspect = u.aspect_ratio;
    let time = fract(u.time / 120.0) * 120.0;
    let mouse_x = u.mouse.x;
    let mouse_y = u.mouse.y;
    let mouse_down = u.mouse_down;

    let refraction = u.p_refraction;
    let intensity = u.p_intensity;

    var final_color = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    // ── Layer 1: void ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        { let warp_x = fbm2(p * 1.500000 + vec2<f32>(0.0, 1.3), i32(4.000000), 0.100000, 2.000000);
        let warp_y = fbm2(p * 1.500000 + vec2<f32>(1.7, 0.0), i32(4.000000), 0.100000, 2.000000);
        p = p + vec2<f32>(warp_x, warp_y) * 0.100000; }
        var sdf_result = fbm2((p * 2.000000 + vec2<f32>(time * 0.1, time * 0.07)), i32(5.000000), 0.500000, 2.000000);
        let pal_rgb = cosine_palette(sdf_result, vec3<f32>(0.010000, 0.010000, 0.020000), vec3<f32>(0.030000, 0.030000, 0.060000), vec3<f32>(0.080000, 0.060000, 0.120000), vec3<f32>(0.000000, 0.000000, 0.050000));
        var color_result = vec4<f32>(pal_rgb, clamp(dot(pal_rgb, vec3<f32>(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.900000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 2: red_band ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>(((-0.120000) + (refraction * 0.040000)), 0.050000);
        { let warp_x = fbm2(p * 2.000000 + vec2<f32>(0.0, 1.3), i32(4.000000), (0.150000 + (refraction * 0.080000)), 2.000000);
        let warp_y = fbm2(p * 2.000000 + vec2<f32>(1.7, 0.0), i32(4.000000), (0.150000 + (refraction * 0.080000)), 2.000000);
        p = p + vec2<f32>(warp_x, warp_y) * (0.150000 + (refraction * 0.080000)); }
        var sdf_result = noise2(p * 4.000000 + vec2<f32>(time * 0.1, time * 0.07));
        let pal_rgb = cosine_palette(sdf_result, vec3<f32>(0.4, 0.05, 0.05), vec3<f32>(0.4, 0.1, 0.05), vec3<f32>(1.0, 0.5, 0.5), vec3<f32>(0.0, 0.15, 0.3));
        var color_result = vec4<f32>(pal_rgb, clamp(dot(pal_rgb, vec3<f32>(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.880000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 3: amber_band ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>(((-0.060000) + (refraction * 0.020000)), 0.020000);
        { let warp_x = fbm2(p * 2.000000 + vec2<f32>(0.0, 1.3), i32(4.000000), (0.150000 + (refraction * 0.060000)), 2.000000);
        let warp_y = fbm2(p * 2.000000 + vec2<f32>(1.7, 0.0), i32(4.000000), (0.150000 + (refraction * 0.060000)), 2.000000);
        p = p + vec2<f32>(warp_x, warp_y) * (0.150000 + (refraction * 0.060000)); }
        var sdf_result = noise2(p * 4.000000 + vec2<f32>(time * 0.1, time * 0.07));
        let pal_rgb = cosine_palette(sdf_result, vec3<f32>(0.6, 0.2, 0.05), vec3<f32>(0.4, 0.2, 0.1), vec3<f32>(1.0, 0.5, 0.5), vec3<f32>(0.0, 0.15, 0.2));
        var color_result = vec4<f32>(pal_rgb, clamp(dot(pal_rgb, vec3<f32>(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.870000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 4: green_band ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        { let warp_x = fbm2(p * 2.000000 + vec2<f32>(0.0, 1.3), i32(4.000000), (0.150000 + (refraction * 0.050000)), 2.000000);
        let warp_y = fbm2(p * 2.000000 + vec2<f32>(1.7, 0.0), i32(4.000000), (0.150000 + (refraction * 0.050000)), 2.000000);
        p = p + vec2<f32>(warp_x, warp_y) * (0.150000 + (refraction * 0.050000)); }
        var sdf_result = noise2(p * 4.000000 + vec2<f32>(time * 0.1, time * 0.07));
        let pal_rgb = cosine_palette(sdf_result, vec3<f32>(0.2, 0.35, 0.1), vec3<f32>(0.15, 0.25, 0.1), vec3<f32>(0.8, 1.0, 0.5), vec3<f32>(0.0, 0.2, 0.4));
        var color_result = vec4<f32>(pal_rgb, clamp(dot(pal_rgb, vec3<f32>(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.860000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 5: blue_band ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>((0.060000 - (refraction * 0.020000)), (-0.020000));
        { let warp_x = fbm2(p * 2.000000 + vec2<f32>(0.0, 1.3), i32(4.000000), (0.150000 + (refraction * 0.060000)), 2.000000);
        let warp_y = fbm2(p * 2.000000 + vec2<f32>(1.7, 0.0), i32(4.000000), (0.150000 + (refraction * 0.060000)), 2.000000);
        p = p + vec2<f32>(warp_x, warp_y) * (0.150000 + (refraction * 0.060000)); }
        var sdf_result = noise2(p * 4.000000 + vec2<f32>(time * 0.1, time * 0.07));
        let pal_rgb = cosine_palette(sdf_result, vec3<f32>(0.0, 0.3, 0.5), vec3<f32>(0.0, 0.3, 0.5), vec3<f32>(1.0, 1.0, 1.0), vec3<f32>(0.0, 0.1, 0.2));
        var color_result = vec4<f32>(pal_rgb, clamp(dot(pal_rgb, vec3<f32>(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.850000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 6: violet_band ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>((0.120000 - (refraction * 0.040000)), (-0.050000));
        { let warp_x = fbm2(p * 2.000000 + vec2<f32>(0.0, 1.3), i32(4.000000), (0.150000 + (refraction * 0.080000)), 2.000000);
        let warp_y = fbm2(p * 2.000000 + vec2<f32>(1.7, 0.0), i32(4.000000), (0.150000 + (refraction * 0.080000)), 2.000000);
        p = p + vec2<f32>(warp_x, warp_y) * (0.150000 + (refraction * 0.080000)); }
        var sdf_result = noise2(p * 4.000000 + vec2<f32>(time * 0.1, time * 0.07));
        let pal_rgb = cosine_palette(sdf_result, vec3<f32>(0.3, 0.1, 0.5), vec3<f32>(0.3, 0.2, 0.3), vec3<f32>(0.8, 0.5, 1.0), vec3<f32>(0.2, 0.0, 0.3));
        var color_result = vec4<f32>(pal_rgb, clamp(dot(pal_rgb, vec3<f32>(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.840000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 7: source ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p + vec2<f32>(sin(p.y * 1.500000 + time * 0.400000), cos(p.x * 1.500000 + time * 0.400000)) * 0.020000;
        var sdf_result = sdf_circle(p, (0.050000 + (intensity * 0.020000)));
        let glow_pulse = (5.000000 + (intensity * 2.500000)) * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(1.000000, 1.000000, 0.950000), color_result.a);
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.930000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 8: prism ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p + vec2<f32>(sin(p.y * 1.000000 + time * 0.200000), cos(p.x * 1.000000 + time * 0.200000)) * 0.010000;
        var sdf_result = sdf_triangle(p, 0.150000);
        let glow_pulse = 1.000000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.500000, 0.500000, 0.600000), color_result.a);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    final_color = vec4<f32>(apply_color_matrix(final_color.rgb), final_color.a);
    final_color = vec4<f32>(aces_tonemap(final_color.rgb), final_color.a);
    final_color = final_color + (dither_noise(input.uv * u.resolution) - 0.5) / 255.0;
    return final_color;
}
