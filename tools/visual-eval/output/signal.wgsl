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
    p_pulse: f32,
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

fn game_mod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
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

    let pulse = u.p_pulse;

    var final_color = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    // ── Layer 1: outer ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var sdf_result = abs(length(p) - 0.380000) - 0.001000;
        let shade_fw = fwidth(sdf_result);
        let shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        var color_result = vec4<f32>(vec3<f32>(0.200000, 0.150000, 0.080000) * shade_alpha, shade_alpha);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 2: ticks ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        { let r_angle = atan2(p.y, p.x);
        let r_sector = 6.28318 / 24.000000;
        let r_a = game_mod(r_angle + r_sector * 0.5, r_sector) - r_sector * 0.5;
        let r_r = length(p);
        p = vec2<f32>(r_r * cos(r_a), r_r * sin(r_a)); }
        var sdf_result = abs(length(p) - 0.380000) - 0.000800;
        let shade_fw = fwidth(sdf_result);
        let shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        var color_result = vec4<f32>(vec3<f32>(0.150000, 0.120000, 0.050000) * shade_alpha, shade_alpha);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 3: mid ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var sdf_result = abs(length(p) - 0.300000) - 0.002000;
        let shade_fw = fwidth(sdf_result);
        let shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        var color_result = vec4<f32>(vec3<f32>(0.300000, 0.240000, 0.120000) * shade_alpha, shade_alpha);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 4: inner ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var sdf_result = abs(length(p) - 0.220000) - 0.003000;
        let shade_fw = fwidth(sdf_result);
        let shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        var color_result = vec4<f32>(vec3<f32>(0.450000, 0.360000, 0.160000) * shade_alpha, shade_alpha);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 5: probe ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        { let ra = time * (time * 0.150000); let rc = cos(ra); let rs = sin(ra);
        p = vec2<f32>(p.x * rc - p.y * rs, p.x * rs + p.y * rc); }
        p = p - vec2<f32>(0.300000, 0.000000);
        var sdf_result = sdf_star(p, 3.000000, 0.015000, 0.008000);
        let shade_fw = fwidth(sdf_result);
        let shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        var color_result = vec4<f32>(vec3<f32>(0.900000, 0.700000, 0.250000) * shade_alpha, shade_alpha);
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.860000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 6: hex ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        { let r_angle = atan2(p.y, p.x);
        let r_sector = 6.28318 / 6.000000;
        let r_a = game_mod(r_angle + r_sector * 0.5, r_sector) - r_sector * 0.5;
        let r_r = length(p);
        p = vec2<f32>(r_r * cos(r_a), r_r * sin(r_a)); }
        var sdf_result = abs(length(p) - 0.150000) - 0.001000;
        let shade_fw = fwidth(sdf_result);
        let shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        var color_result = vec4<f32>(vec3<f32>(0.250000, 0.200000, 0.100000) * shade_alpha, shade_alpha);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 7: center ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p + vec2<f32>(sin(p.y * 2.000000 + time * 0.600000), cos(p.x * 2.000000 + time * 0.600000)) * (0.010000 + (pulse * 0.005000));
        var sdf_result = sdf_circle(p, (0.045000 + (pulse * 0.015000)));
        let shade_fw = fwidth(sdf_result);
        let shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        var color_result = vec4<f32>(vec3<f32>(1.000000, 0.850000, 0.350000) * shade_alpha, shade_alpha);
        let prev_color = textureSample(prev_frame, prev_sampler, input.uv);
        color_result = mix(color_result, prev_color, 0.900000);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 8: dot ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        var sdf_result = sdf_circle(p, 0.008000);
        let shade_fw = fwidth(sdf_result);
        let shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        var color_result = vec4<f32>(vec3<f32>(1.000000, 0.950000, 0.600000) * shade_alpha, shade_alpha);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    final_color = vec4<f32>(aces_tonemap(final_color.rgb), final_color.a);
    final_color = final_color + (dither_noise(input.uv * u.resolution) - 0.5) / 255.0;
    return final_color;
}
