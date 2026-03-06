struct Uniforms {
    time: f32,
    audio_bass: f32,
    audio_mid: f32,
    audio_treble: f32,
    audio_energy: f32,
    audio_beat: f32,
    resolution: vec2<f32>,
    mouse: vec2<f32>,
    p_ring_r: f32,
    p_glow_str: f32,
    p_gold: f32,
    p_inner_r: f32,
    p_inner_glow: f32,
    p_flash_str: f32,
    p_white: f32,
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

fn game_mod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv * 2.0 - 1.0;
    let aspect = u.resolution.x / u.resolution.y;
    let time = fract(u.time / 120.0) * 120.0;

    let ring_r = u.p_ring_r;
    let glow_str = u.p_glow_str;
    let gold = u.p_gold;
    let inner_r = u.p_inner_r;
    let inner_glow = u.p_inner_glow;
    let flash_str = u.p_flash_str;
    let white = u.p_white;

    var final_color = vec4<f32>(0.0, 0.0, 0.0, 1.0);

    // ── Layer 0: config ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
    // ── Layer 1: ring_outer ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var sdf_result = abs(length(p) - ring_r) - 0.020000;
        let glow_pulse = glow_str * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(gold, 0.690000, 0.220000), 1.0);
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb + lc, 1.0);
    }

    // ── Layer 2: ring_inner ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var sdf_result = abs(length(p) - inner_r) - 0.015000;
        let glow_pulse = inner_glow * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(gold, 0.690000, 0.220000), 1.0);
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb + lc, 1.0);
    }

    // ── Layer 3: center_flash ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var sdf_result = sdf_circle(p, 0.080000);
        let glow_pulse = flash_str * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(white, white, white), 1.0);
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb + lc, 1.0);
    }

    // ── Layer 4: spray ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        { let r_angle = atan2(p.y, p.x);
        let r_sector = 6.28318 / 8.000000;
        let r_a = game_mod(r_angle + r_sector * 0.5, r_sector) - r_sector * 0.5;
        let r_r = length(p);
        p = vec2<f32>(r_r * cos(r_a), r_r * sin(r_a)); }
        var sdf_result = abs(length(p) - ring_r) - 0.005000;
        let glow_pulse = 3.000000 * (0.9 + 0.1 * sin(time * 2.0));
        let glow_result = apply_glow(sdf_result, glow_pulse);
        var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);
        color_result = vec4<f32>(color_result.rgb * vec3<f32>(1.000000, 0.850000, 0.400000), 1.0);
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb + lc, 1.0);
    }

    return final_color;
}
