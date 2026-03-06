struct Uniforms {
    time: f32,
    audio_bass: f32,
    audio_mid: f32,
    audio_treble: f32,
    audio_energy: f32,
    audio_beat: f32,
    resolution: vec2<f32>,
    mouse: vec2<f32>,
    p_critical_count: f32,
    p_heat: f32,
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

    let critical_count = u.p_critical_count;
    let heat = u.p_heat;

    var final_color = vec4<f32>(0.0, 0.0, 0.0, 1.0);

    // ── Layer 0: config ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
    // ── Layer 1: bg ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var color_result: vec4<f32>;
        {
            var p_then = p;
            { var p = p_then;
            var sdf_result = sdf_star(p, 5.000000, 0.300000, 0.150000);
            let glow_pulse = 3.000000 * (0.9 + 0.1 * sin(time * 2.0));
            let glow_result = apply_glow(sdf_result, glow_pulse);
            var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
            color_result = vec4<f32>(color_result.rgb * vec3<f32>(1.000000, 0.200000, 0.200000), 1.0);
            var then_color = color_result; }
            { var p = p_then;
            var sdf_result = sdf_circle(p, 0.200000);
            let glow_pulse = 2.000000 * (0.9 + 0.1 * sin(time * 2.0));
            let glow_result = apply_glow(sdf_result, glow_pulse);
            var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
            color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.300000, 0.500000, 0.800000), 1.0);
            var else_color = color_result; }
            color_result = select(else_color, then_color, (critical_count > 0.000000));
        }
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb + lc, 1.0);
    }

    return final_color;
}
