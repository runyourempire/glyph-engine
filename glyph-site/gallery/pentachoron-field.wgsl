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
    p_unfold: f32,
    p_resonance: f32,
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

fn sdf_star(p: vec2<f32>, n: f32, r: f32, ir: f32) -> f32 {
    let an = 3.14159265 / n;
    let a = atan2(p.y, p.x);
    let period = 2.0 * an;
    let sa = (a + an) - floor((a + an) / period) * period - an;
    let q = length(p) * vec2<f32>(cos(sa), abs(sin(sa)));
    let tip = vec2<f32>(r, 0.0);
    let valley = vec2<f32>(ir * cos(an), ir * sin(an));
    let e = tip - valley;
    let d = q - valley;
    let t = clamp(dot(d, e) / dot(e, e), 0.0, 1.0);
    let closest = valley + e * t;
    let dist = length(q - closest);
    let cross_val = d.x * e.y - d.y * e.x;
    return select(dist, -dist, cross_val > 0.0);
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

fn cosine_palette(t: f32, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, d: vec3<f32>) -> vec3<f32> {
    return a + b * cos(6.28318 * (c * t + d));
}

fn glyph_mod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
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
        vec3f(0.92, 0, 0.1),
        vec3f(-0.02, 0.88, 0.04),
        vec3f(0.12, 0.04, 1.18)
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

    let unfold = u.p_unfold;
    let resonance = u.p_resonance;

    var final_color = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    // ── Layer 1: void_field ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        { let warp_x = fbm2(p * 1.500000 + vec2<f32>(0.0, 1.3), i32(5.000000), 0.500000, 0.100000);
        let warp_y = fbm2(p * 1.500000 + vec2<f32>(1.7, 0.0), i32(5.000000), 0.500000, 0.100000);
        p = p + vec2<f32>(warp_x, warp_y) * 0.100000; }
        var sdf_result = fbm2((p * 2.000000 + vec2<f32>(time * 0.1, time * 0.07)), i32(5.000000), 0.450000, 2.000000);
        let pal_rgb = cosine_palette(sdf_result, vec3<f32>(0.004000, 0.002000, 0.008000), vec3<f32>(0.012000, 0.006000, 0.025000), vec3<f32>(0.150000, 0.080000, 0.300000), vec3<f32>(0.000000, 0.020000, 0.100000));
        var color_result = vec4<f32>(pal_rgb, clamp(dot(pal_rgb, vec3<f32>(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.900000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 2: singularity ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>(((u.mouse.x * 0.060000) - 0.030000), ((u.mouse.y * 0.060000) - 0.030000));
        p = p + vec2<f32>(sin(p.y * 2.000000 + time * 0.400000), cos(p.x * 2.000000 + time * 0.400000)) * (0.012000 + (unfold * 0.006000));
        var sdf_result = sdf_circle(p, (0.035000 + (unfold * 0.015000)));
        let glow_pulse = ((5.000000 + (unfold * 2.500000)) + (u.audio_beat * 1.500000)) * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.830000, 0.750000, 1.000000), color_result.a);
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.920000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 3: inner_rings ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>(((u.mouse.x * 0.080000) - 0.040000), ((u.mouse.y * 0.080000) - 0.040000));
        { let ra = time * (time * 0.080000); let rc = cos(ra); let rs = sin(ra);
        p = vec2<f32>(p.x * rc - p.y * rs, p.x * rs + p.y * rc); }
        p = p + vec2<f32>(sin(p.y * 2.000000 + time * 0.300000), cos(p.x * 2.000000 + time * 0.300000)) * (0.015000 + (resonance * 0.008000));
        var sdf_result = sdf_circle(p, (0.140000 + (unfold * 0.040000)));
        for (var onion_i: i32 = 0; onion_i < i32(5.000000); onion_i = onion_i + 1) { sdf_result = abs(sdf_result) - (0.006000 + (resonance * 0.002000)); }
        let glow_pulse = (1.600000 + (resonance * 0.800000)) * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.550000, 0.400000, 0.900000), color_result.a);
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.880000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 4: outer_rings ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>(((u.mouse.x * 0.050000) - 0.025000), ((u.mouse.y * 0.050000) - 0.025000));
        { let ra = time * (time * (-0.050000)); let rc = cos(ra); let rs = sin(ra);
        p = vec2<f32>(p.x * rc - p.y * rs, p.x * rs + p.y * rc); }
        p = p + vec2<f32>(sin(p.y * 1.800000 + time * 0.250000), cos(p.x * 1.800000 + time * 0.250000)) * 0.010000;
        var sdf_result = sdf_circle(p, (0.280000 + (unfold * 0.060000)));
        for (var onion_i: i32 = 0; onion_i < i32(3.000000); onion_i = onion_i + 1) { sdf_result = abs(sdf_result) - 0.004000; }
        let glow_pulse = (0.900000 + (unfold * 0.400000)) * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.400000, 0.250000, 0.700000), color_result.a);
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.850000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 5: mandala ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>(((u.mouse.x * 0.040000) - 0.020000), ((u.mouse.y * 0.040000) - 0.020000));
        { let r_angle = atan2(p.y, p.x);
        let r_sector = 6.28318 / 5.000000;
        let r_a = glyph_mod(r_angle + r_sector * 0.5, r_sector) - r_sector * 0.5;
        let r_r = length(p);
        p = vec2<f32>(r_r * cos(r_a), r_r * sin(r_a)); }
        { let ra = time * (time * 0.060000); let rc = cos(ra); let rs = sin(ra);
        p = vec2<f32>(p.x * rc - p.y * rs, p.x * rs + p.y * rc); }
        p = p + vec2<f32>(sin(p.y * 2.500000 + time * 0.350000), cos(p.x * 2.500000 + time * 0.350000)) * (0.020000 + (unfold * 0.010000));
        var sdf_result = sdf_star(p, 5.000000, (0.220000 + (resonance * 0.040000)), (0.100000 + (resonance * 0.020000)));
        let glow_pulse = (1.400000 + (resonance * 0.600000)) * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.830000, 0.690000, 0.220000), color_result.a);
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.860000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 6: decagon ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        { let r_angle = atan2(p.y, p.x);
        let r_sector = 6.28318 / 10.000000;
        let r_a = glyph_mod(r_angle + r_sector * 0.5, r_sector) - r_sector * 0.5;
        let r_r = length(p);
        p = vec2<f32>(r_r * cos(r_a), r_r * sin(r_a)); }
        { let ra = time * (time * (-0.040000)); let rc = cos(ra); let rs = sin(ra);
        p = vec2<f32>(p.x * rc - p.y * rs, p.x * rs + p.y * rc); }
        p = p - vec2<f32>((0.180000 + (unfold * 0.030000)), 0.000000);
        var sdf_result = sdf_triangle(p, (0.020000 + (resonance * 0.008000)));
        let glow_pulse = (1.800000 + (u.audio_mid * 0.600000)) * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.830000, 0.690000, 0.220000), color_result.a);
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.830000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 7: field_lines ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>(((u.mouse.x * 0.100000) - 0.050000), ((u.mouse.y * 0.100000) - 0.050000));
        { let warp_x = fbm2(p * 3.000000 + vec2<f32>(0.0, 1.3), i32(5.000000), 0.550000, (0.150000 + (unfold * 0.080000)));
        let warp_y = fbm2(p * 3.000000 + vec2<f32>(1.7, 0.0), i32(5.000000), 0.550000, (0.150000 + (unfold * 0.080000)));
        p = p + vec2<f32>(warp_x, warp_y) * (0.150000 + (unfold * 0.080000)); }
        var sdf_result = fbm2((p * 4.000000 + vec2<f32>(time * 0.1, time * 0.07)), i32(5.000000), 0.500000, 2.000000);
        let pal_rgb = cosine_palette(sdf_result, vec3<f32>(0.002000, 0.001000, 0.005000), vec3<f32>(0.010000, 0.006000, 0.020000), vec3<f32>(0.300000, 0.200000, 0.600000), vec3<f32>(0.050000, 0.100000, 0.250000));
        var color_result = vec4<f32>(pal_rgb, clamp(dot(pal_rgb, vec3<f32>(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.800000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 8: stardust ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        { let warp_x = fbm2(p * 2.500000 + vec2<f32>(0.0, 1.3), i32(3.000000), (0.120000 + (u.audio_treble * 0.060000)), 2.000000);
        let warp_y = fbm2(p * 2.500000 + vec2<f32>(1.7, 0.0), i32(3.000000), (0.120000 + (u.audio_treble * 0.060000)), 2.000000);
        p = p + vec2<f32>(warp_x, warp_y) * (0.120000 + (u.audio_treble * 0.060000)); }
        var sdf_result = voronoi2(p * 35.000000 + vec2<f32>(time * 0.05, time * 0.03));
        let glow_pulse = (14.000000 + (u.audio_energy * 4.000000)) * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.700000, 0.600000, 1.000000), color_result.a);
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.760000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 9: vertex_a ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>((((sin((time * 0.250000)) * ((0.200000 + (unfold * 0.060000)))) + (u.mouse.x * 0.030000)) - 0.015000), (((cos((time * 0.320000)) * ((0.180000 + (unfold * 0.050000)))) + (u.mouse.y * 0.030000)) - 0.015000));
        var sdf_result = sdf_star(p, 5.000000, (0.010000 + (resonance * 0.004000)), 0.004000);
        let glow_pulse = (2.200000 + (resonance * 0.800000)) * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.830000, 0.690000, 0.220000), color_result.a);
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.740000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 10: vertex_b ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p - vec2<f32>((((cos((time * 0.200000)) * ((0.260000 + (unfold * 0.040000)))) + (u.mouse.x * 0.020000)) - 0.010000), (((sin((time * 0.280000)) * ((0.220000 + (unfold * 0.040000)))) + (u.mouse.y * 0.020000)) - 0.010000));
        var sdf_result = sdf_star(p, 5.000000, (0.008000 + (resonance * 0.003000)), 0.003000);
        let glow_pulse = (1.800000 + (resonance * 0.600000)) * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.600000, 0.450000, 1.000000), color_result.a);
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.720000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 11: boundary ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var sdf_result = abs(length(p) - 0.420000) - 0.001000;
        let glow_pulse = (0.300000 + (unfold * 0.150000)) * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.250000, 0.180000, 0.450000), color_result.a);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    final_color = vec4<f32>(apply_color_matrix(final_color.rgb), final_color.a);
    final_color = vec4<f32>(aces_tonemap(final_color.rgb), final_color.a);
    final_color = final_color + (dither_noise(input.uv * u.resolution) - 0.5) / 255.0;
    return final_color;
}
