struct Uniforms {
    time: f32,
    audio_bass: f32,
    audio_mid: f32,
    audio_treble: f32,
    audio_energy: f32,
    audio_beat: f32,
    resolution: vec2<f32>,
    mouse: vec2<f32>,
    p_progress: f32,
    p_urgency: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexOutput {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

fn apply_glow(d: f32, intensity: f32) -> f32 {
    return exp(-max(d, 0.0) * intensity * 8.0);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv * 2.0 - 1.0;
    let aspect = u.resolution.x / u.resolution.y;
    let time = fract(u.time / 120.0) * 120.0;

    let progress = u.p_progress;
    let urgency = u.p_urgency;

    var final_color = vec4<f32>(0.0, 0.0, 0.0, 1.0);

    // ── Layer 0: config ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
    // ── Layer 1: bg ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var sdf_result = abs(length(p) - 0.400000) - 0.008000;
        let glow_pulse = 0.400000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.250000, 0.250000, 0.250000), 1.0);
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb + lc, 1.0);
    }

    // ── Layer 2: countdown ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var color_result: vec4<f32>;
        {
            var p_then = p;
            { var p = p_then;
            var sdf_result = abs(length(p) - 0.400000) - 0.035000;
            let arc_theta = atan2(p.x, p.y) + 3.14159265359;
            sdf_result = select(999.0, sdf_result, arc_theta < progress);
            let glow_pulse = 2.500000 * (0.9 + 0.1 * sin(time * 2.0));
            let glow_result = apply_glow(sdf_result, glow_pulse);
            var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
            color_result = vec4<f32>(color_result.rgb * vec3<f32>(1.000000, 0.150000, 0.100000), 1.0);
            var then_color = color_result; }
            { var p = p_then;
            var sdf_result = abs(length(p) - 0.400000) - 0.030000;
            let arc_theta = atan2(p.x, p.y) + 3.14159265359;
            sdf_result = select(999.0, sdf_result, arc_theta < progress);
            let glow_pulse = 1.500000 * (0.9 + 0.1 * sin(time * 2.0));
            let glow_result = apply_glow(sdf_result, glow_pulse);
            var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
            color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.830000, 0.690000, 0.220000), 1.0);
            var else_color = color_result; }
            color_result = select(else_color, then_color, (urgency > 0.700000));
        }
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb + lc, 1.0);
    }

    // ── Layer 3: urgency_pulse ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var sdf_result = abs(length(p) - 0.440000) - 0.005000;
        let glow_pulse = 1.500000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(1.000000, 0.300000, 0.150000), 1.0);
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb + lc, 1.0);
    }

    return final_color;
}
