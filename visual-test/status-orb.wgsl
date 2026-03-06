struct Uniforms {
    time: f32,
    audio_bass: f32,
    audio_mid: f32,
    audio_treble: f32,
    audio_energy: f32,
    audio_beat: f32,
    resolution: vec2<f32>,
    mouse: vec2<f32>,
    p_intensity: f32,
    p_green: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

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

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv * 2.0 - 1.0;
    let aspect = u.resolution.x / u.resolution.y;
    let time = fract(u.time / 120.0) * 120.0;

    let intensity = u.p_intensity;
    let green = u.p_green;

    var final_color = vec4<f32>(0.0, 0.0, 0.0, 1.0);

    // ── Layer 0: config ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
    // ── Layer 1: field ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var sdf_result = noise2(p * 4.000000 + vec2<f32>(time * 0.1, time * 0.07));
        let glow_pulse = 0.600000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.100000, 0.150000, 0.050000), 1.0);
        let lc = color_result.rgb;
        final_color = vec4<f32>(1.0 - (1.0 - final_color.rgb) * (1.0 - lc), 1.0);
    }

    // ── Layer 2: orb ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var color_result: vec4<f32>;
        {
            var p_then = p;
            { var p = p_then;
            var sdf_result = sdf_circle(p, 0.200000);
            let glow_pulse = intensity * (0.9 + 0.1 * sin(time * 2.0));
            let glow_result = apply_glow(sdf_result, glow_pulse);
            var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
            color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.200000, 1.000000, 0.400000), 1.0);
            var then_color = color_result; }
            { var p = p_then;
            var sdf_result = sdf_circle(p, 0.180000);
            let glow_pulse = intensity * (0.9 + 0.1 * sin(time * 2.0));
            let glow_result = apply_glow(sdf_result, glow_pulse);
            var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
            color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.900000, 0.500000, 0.100000), 1.0);
            var else_color = color_result; }
            color_result = select(else_color, then_color, (green > 0.500000));
        }
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb + lc, 1.0);
    }

    // ── Layer 3: halo ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var sdf_result = abs(length(p) - 0.280000) - 0.006000;
        let glow_pulse = 1.200000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(green, 0.800000, green), 1.0);
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb + lc, 1.0);
    }

    return final_color;
}
