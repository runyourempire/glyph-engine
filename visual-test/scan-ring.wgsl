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

fn sdf_circle(p: vec2<f32>, radius: f32) -> f32 {
    return length(p) - radius;
}

fn apply_glow(d: f32, intensity: f32) -> f32 {
    return exp(-max(d, 0.0) * intensity * 8.0);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv * 2.0 - 1.0;
    let aspect = u.resolution.x / u.resolution.y;
    let time = fract(u.time / 120.0) * 120.0;

    var final_color = vec4<f32>(0.0, 0.0, 0.0, 1.0);

    // ── Layer 0: track ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var sdf_result = abs(length(p) - 0.250000) - 0.008000;
        let glow_pulse = 0.500000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.300000, 0.250000, 0.100000), 1.0);
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb + lc, 1.0);
    }

    // ── Layer 1: sweep ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        { let ra = time * 3.000000; let rc = cos(ra); let rs = sin(ra);
        p = vec2<f32>(p.x * rc - p.y * rs, p.x * rs + p.y * rc); }
        var sdf_result = abs(length(p) - 0.250000) - 0.030000;
        let arc_theta = atan2(p.x, p.y) + 3.14159265359;
        sdf_result = select(999.0, sdf_result, arc_theta < 4.000000);
        let glow_pulse = 2.500000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.830000, 0.690000, 0.220000), 1.0);
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb + lc, 1.0);
    }

    // ── Layer 2: head ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        { let ra = time * 3.000000; let rc = cos(ra); let rs = sin(ra);
        p = vec2<f32>(p.x * rc - p.y * rs, p.x * rs + p.y * rc); }
        p = p - vec2<f32>(0.250000, 0.000000);
        var sdf_result = sdf_circle(p, 0.020000);
        let glow_pulse = 3.000000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(1.000000, 0.900000, 0.500000), 1.0);
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb + lc, 1.0);
    }

    return final_color;
}
