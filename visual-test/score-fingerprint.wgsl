struct Uniforms {
    time: f32,
    audio_bass: f32,
    audio_mid: f32,
    audio_treble: f32,
    audio_energy: f32,
    audio_beat: f32,
    resolution: vec2<f32>,
    mouse: vec2<f32>,
    p_relevance: f32,
    p_freshness: f32,
    p_depth: f32,
    p_confidence: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexOutput {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

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

fn game_mod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv * 2.0 - 1.0;
    let aspect = u.resolution.x / u.resolution.y;
    let time = fract(u.time / 120.0) * 120.0;

    let relevance = u.p_relevance;
    let freshness = u.p_freshness;
    let depth = u.p_depth;
    let confidence = u.p_confidence;

    var final_color = vec4<f32>(0.0, 0.0, 0.0, 1.0);

    // ── Layer 0: config ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
    // ── Layer 1: cells ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var sdf_result = voronoi2(p * 5.000000 + vec2<f32>(time * 0.05, time * 0.03));
        let glow_pulse = 1.000000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.830000, 0.690000, 0.220000), 1.0);
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb + lc, 1.0);
    }

    // ── Layer 2: structure ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        { let r_angle = atan2(p.y, p.x);
        let r_sector = 6.28318 / 6.000000;
        let r_a = game_mod(r_angle + r_sector * 0.5, r_sector) - r_sector * 0.5;
        let r_r = length(p);
        p = vec2<f32>(r_r * cos(r_a), r_r * sin(r_a)); }
        var sdf_result = sdf_star(p, 6.000000, 0.300000, 0.120000);
        let glow_pulse = 0.800000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.600000, 0.500000, 0.200000), 1.0);
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb + lc, 1.0);
    }

    // ── Layer 3: texture ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var sdf_result = noise2(p * 8.000000 + vec2<f32>(time * 0.1, time * 0.07));
        let glow_pulse = 0.600000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
        let grain_noise = fract(sin(dot(p, vec2<f32>(12.9898, 78.233)) + time) * 43758.5453);
        color_result = vec4<f32>(color_result.rgb + (grain_noise - 0.5) * 0.500000, color_result.a);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.900000, 0.800000, 0.400000), 1.0);
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * lc, 1.0);
    }

    return final_color;
}
