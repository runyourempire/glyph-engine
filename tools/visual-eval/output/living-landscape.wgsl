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
};

@group(0) @binding(0) var<uniform> u: Uniforms;

@group(0) @binding(5) var photo_tex: texture_2d<f32>;
@group(0) @binding(6) var photo_samp: sampler;

@group(0) @binding(7) var depth_tex: texture_2d<f32>;
@group(0) @binding(8) var depth_samp: sampler;

@group(0) @binding(9) var flow_water_tex: texture_2d<f32>;
@group(0) @binding(10) var flow_water_samp: sampler;

@group(0) @binding(11) var mask_water_tex: texture_2d<f32>;
@group(0) @binding(12) var mask_water_samp: sampler;

@group(0) @binding(13) var mask_sky_tex: texture_2d<f32>;
@group(0) @binding(14) var mask_sky_samp: sampler;

struct VertexOutput {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

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

    var final_color = vec4<f32>(0.0, 0.0, 0.0, 0.0);

    // ── Layer 0: base ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        let _px_uv = clamp(vec2<f32>(p.x / aspect * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5)), vec2<f32>(0.0), vec2<f32>(1.0));
        let _px_orbit = vec2<f32>(sin(time * 0.150000), cos(time * 0.150000 * 0.7)) * 0.020000;
        let _px_depth = textureSample(depth_tex, depth_samp, _px_uv).r;
        let _px_displaced = clamp(_px_uv + _px_orbit * _px_depth, vec2<f32>(0.0), vec2<f32>(1.0));
        var color_result = textureSample(photo_tex, photo_samp, _px_displaced);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 1: water ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        let _fm_uv = clamp(vec2<f32>(p.x / aspect * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5)), vec2<f32>(0.0), vec2<f32>(1.0));
        let _fm_flow = textureSample(flow_water_tex, flow_water_samp, _fm_uv).rg;
        let _fm_dir = (_fm_flow - vec2<f32>(0.5)) * 2.0 * 0.060000;
        let _fm_phase0 = fract(time * 0.300000);
        let _fm_phase1 = fract(time * 0.300000 + 0.5);
        let _fm_uv0 = clamp(_fm_uv + _fm_dir * _fm_phase0, vec2<f32>(0.0), vec2<f32>(1.0));
        let _fm_uv1 = clamp(_fm_uv + _fm_dir * _fm_phase1, vec2<f32>(0.0), vec2<f32>(1.0));
        let _fm_c0 = textureSample(photo_tex, photo_samp, _fm_uv0);
        let _fm_c1 = textureSample(photo_tex, photo_samp, _fm_uv1);
        let _fm_blend = abs(2.0 * _fm_phase0 - 1.0);
        var color_result = mix(_fm_c0, _fm_c1, _fm_blend);
        let _mask_uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
        let _mask_raw = textureSample(mask_water_tex, mask_water_samp, _mask_uv).r;
        let _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4<f32>(color_result.rgb * _mask_val, color_result.a * _mask_val);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 2: sky ──
    {
        var p = vec2<f32>(uv.x * aspect, uv.y);
        p = p + vec2<f32>(sin(p.y * 0.800000 + time * 0.040000), cos(p.x * 0.800000 + time * 0.040000)) * 0.008000;
        let _tex_uv = clamp(vec2<f32>(p.x / aspect * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5)), vec2<f32>(0.0), vec2<f32>(1.0));
        var color_result = textureSample(photo_tex, photo_samp, _tex_uv);
        let _mask_uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
        let _mask_raw = textureSample(mask_sky_tex, mask_sky_samp, _mask_uv).r;
        let _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4<f32>(color_result.rgb * _mask_val, color_result.a * _mask_val);
        let la = color_result.a;
        let lc = color_result.rgb;
        final_color = vec4<f32>(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    final_color = vec4<f32>(clamp(final_color.rgb, vec3<f32>(0.0), vec3<f32>(1.0)), final_color.a);
    final_color = final_color + (dither_noise(input.uv * u.resolution) - 0.5) / 255.0;
    return final_color;
}
