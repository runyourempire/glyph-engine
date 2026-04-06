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
    p_color_r: f32,
    p_color_g: f32,
    p_color_b: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

@group(1) @binding(0) var<storage, read> compute_field: array<vec2<f32>>;

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

fn aces_tonemap(x: vec3<f32>) -> vec3<f32> {
    let a = x * (2.51 * x + 0.03);
    let b = x * (2.43 * x + 0.59) + 0.14;
    return clamp(a / b, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn dither_noise(uv: vec2<f32>) -> f32 {
    return fract(52.9829189 * fract(dot(uv, vec2<f32>(0.06711056, 0.00583715))));
}

fn sample_compute(uv: vec2<f32>) -> f32 {
    let cw = 256u; let ch = 256u;
    let x = clamp(u32(uv.x * f32(cw)), 0u, cw - 1u);
    let y = clamp(u32(uv.y * f32(ch)), 0u, ch - 1u);
    return compute_field[y * cw + x].y;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv * 2.0 - 1.0;
    let aspect = u.aspect_ratio;
    let time = fract(u.time / 120.0) * 120.0;
    let mouse_x = u.mouse.x;
    let mouse_y = u.mouse.y;
    let mouse_down = u.mouse_down;

    let color_r = u.p_color_r;
    let color_g = u.p_color_g;
    let color_b = u.p_color_b;

    // ── Layer 0: bg ──
    var p = vec2<f32>(uv.x * aspect, uv.y);
    var sdf_result = sdf_circle(p, 0.500000);
    let glow_pulse = 1.000000 * (0.9 + 0.1 * sin(time * 2.0));
    let glow_result = apply_glow(sdf_result, glow_pulse);
    var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);
    color_result = vec4<f32>(color_result.rgb * vec3<f32>(0.008000, 0.020000, 0.030000), color_result.a);
    // Compute field visualization
    let cv = sample_compute(input.uv);
    let compute_color = vec4<f32>(cv * color_r, cv * color_g, cv * color_b, cv);
    color_result = color_result + compute_color * (1.0 - color_result.a);

    color_result = vec4<f32>(aces_tonemap(color_result.rgb), color_result.a);
    color_result = color_result + (dither_noise(input.uv * u.resolution) - 0.5) / 255.0;
    return color_result;
}
