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
    p_expand: f32,
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

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv * 2.0 - 1.0;
    let aspect = u.aspect_ratio;
    let time = fract(u.time / 120.0) * 120.0;
    let mouse_x = u.mouse.x;
    let mouse_y = u.mouse.y;
    let mouse_down = u.mouse_down;

    let expand = u.p_expand;

    var final_color = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    // ── Layer 1: waves ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p + vec2<f32>(sin(p.y * 2.000000 + time * 0.500000), cos(p.x * 2.000000 + time * 0.500000)) * 0.015000;
        var sdf_result = sdf_circle(p, (0.080000 + (expand * 0.180000)));
        for (var onion_i: i32 = 0; onion_i < i32(8.000000); onion_i = onion_i + 1) { sdf_result = abs(sdf_result) - 0.003000; }
        let shade_fw = fwidth(sdf_result);
        let shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        var color_result = vec4<f32>(vec3<f32>(0.600000, 0.500000, 0.200000) * shade_alpha, shade_alpha);
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.880000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 2: waves2 ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p + vec2<f32>(sin(p.y * 2.500000 + time * 0.400000), cos(p.x * 2.500000 + time * 0.400000)) * 0.012000;
        var sdf_result = sdf_circle(p, (0.140000 + (expand * 0.120000)));
        for (var onion_i: i32 = 0; onion_i < i32(6.000000); onion_i = onion_i + 1) { sdf_result = abs(sdf_result) - 0.002000; }
        let shade_fw = fwidth(sdf_result);
        let shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        var color_result = vec4<f32>(vec3<f32>(0.400000, 0.320000, 0.150000) * shade_alpha, shade_alpha);
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.850000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 3: origin ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p + vec2<f32>(sin(p.y * 3.000000 + time * 0.800000), cos(p.x * 3.000000 + time * 0.800000)) * 0.008000;
        var sdf_result = sdf_circle(p, 0.020000);
        let shade_fw = fwidth(sdf_result);
        let shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        var color_result = vec4<f32>(vec3<f32>(1.000000, 0.900000, 0.450000) * shade_alpha, shade_alpha);
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.920000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 4: bound ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var sdf_result = abs(length(p) - 0.440000) - 0.001000;
        let shade_fw = fwidth(sdf_result);
        let shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        var color_result = vec4<f32>(vec3<f32>(0.200000, 0.150000, 0.080000) * shade_alpha, shade_alpha);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    final_color = vec4<f32>(aces_tonemap(final_color.rgb), final_color.a);
    final_color = final_color + (dither_noise(input.uv * u.resolution) - 0.5) / 255.0;
    return final_color;
}
