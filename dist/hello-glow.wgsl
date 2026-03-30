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

    // ── Layer 0: main ──
    var p = vec2<f32>(uv.x * aspect, uv.y);
    let sdf_result = sdf_circle(p, 0.300000);
    let glow_result = apply_glow(sdf_result, 2.000000);
    var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
    color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.831000, 0.686000, 0.216000), 1.0);
    return color_result;
}
