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

fn cosine_palette(t: f32, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, d: vec3<f32>) -> vec3<f32> {
    return a + b * cos(6.28318 * (c * t + d));
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv * 2.0 - 1.0;
    let aspect = u.resolution.x / u.resolution.y;
    let time = fract(u.time / 120.0) * 120.0;

    var final_color = vec4<f32>(0.0, 0.0, 0.0, 1.0);

    // ── Layer 0: gradient ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        let sdf_result = smoothstep(0.000000, 1.000000, length(p));
        var color_result = vec4<f32>(cosine_palette(sdf_result, vec3<f32>(0.200000, 0.100000, 0.300000), vec3<f32>(0.300000, 0.200000, 0.400000), vec3<f32>(0.800000, 0.500000, 0.300000), vec3<f32>(0.700000, 0.200000, 0.000000)), 1.0);
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb + lc, 1.0);
    }

    // ── Layer 1: star ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var sdf_result = sdf_star(p, 5.000000, 0.050000, 0.020000);
        let glow_pulse = 3.000000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.800000, 0.600000, 0.900000), 1.0);
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb + lc, 1.0);
    }

    return final_color;
}
