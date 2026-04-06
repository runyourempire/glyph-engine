#version 300 es
precision highp float;

uniform float u_time;
uniform float u_audio_bass;
uniform float u_audio_mid;
uniform float u_audio_treble;
uniform float u_audio_energy;
uniform float u_audio_beat;
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_mouse_down;
uniform float u_aspect_ratio;
uniform sampler2D u_tex_photo;
uniform sampler2D u_tex_depth;
uniform sampler2D u_tex_flow_water;
uniform sampler2D u_tex_mask_water;
uniform sampler2D u_tex_mask_sky;

in vec2 v_uv;
out vec4 fragColor;

float apply_glow(float d, float intensity){
    return exp(-max(d, 0.0) * intensity * 8.0);
}

vec3 aces_tonemap(vec3 x) {
    vec3 a = x * (2.51 * x + 0.03);
    vec3 b = x * (2.43 * x + 0.59) + 0.14;
    return clamp(a / b, 0.0, 1.0);
}

float dither_noise(vec2 uv) {
    return fract(52.9829189 * fract(dot(uv, vec2(0.06711056, 0.00583715))));
}

void main(){
    vec2 uv = v_uv * 2.0 - 1.0;
    float aspect = u_aspect_ratio;
    float time = fract(u_time / 120.0) * 120.0;
    float mouse_x = u_mouse.x;
    float mouse_y = u_mouse.y;
    float mouse_down = u_mouse_down;

    vec4 final_color = vec4(0.0, 0.0, 0.0, 0.0);

    // ── Layer 0: base ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        vec2 _px_uv = clamp(vec2(p.x / aspect * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5)), 0.0, 1.0);
        vec2 _px_orbit = vec2(sin(time * 0.150000), cos(time * 0.150000 * 0.7)) * 0.020000;
        float _px_depth = texture(u_tex_depth, _px_uv).r;
        vec2 _px_displaced = clamp(_px_uv + _px_orbit * _px_depth, 0.0, 1.0);
        vec4 color_result = texture(u_tex_photo, _px_displaced);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 1: water ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        vec2 _fm_uv = clamp(vec2(p.x / aspect * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5)), 0.0, 1.0);
        vec2 _fm_flow = texture(u_tex_flow_water, _fm_uv).rg;
        vec2 _fm_dir = (_fm_flow - vec2(0.5)) * 2.0 * 0.060000;
        float _fm_phase0 = fract(time * 0.300000);
        float _fm_phase1 = fract(time * 0.300000 + 0.5);
        vec2 _fm_uv0 = clamp(_fm_uv + _fm_dir * _fm_phase0, 0.0, 1.0);
        vec2 _fm_uv1 = clamp(_fm_uv + _fm_dir * _fm_phase1, 0.0, 1.0);
        vec4 _fm_c0 = texture(u_tex_photo, _fm_uv0);
        vec4 _fm_c1 = texture(u_tex_photo, _fm_uv1);
        float _fm_blend = abs(2.0 * _fm_phase0 - 1.0);
        vec4 color_result = mix(_fm_c0, _fm_c1, _fm_blend);
        vec2 _mask_uv = vec2(v_uv.x, 1.0 - v_uv.y);
        float _mask_raw = texture(u_tex_mask_water, _mask_uv).r;
        float _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4(color_result.rgb * _mask_val, color_result.a * _mask_val);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 2: sky ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p + vec2(sin(p.y * 0.800000 + time * 0.040000), cos(p.x * 0.800000 + time * 0.040000)) * 0.008000;
        vec2 _tex_uv = clamp(vec2(p.x / aspect * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5)), 0.0, 1.0);
        vec4 color_result = texture(u_tex_photo, _tex_uv);
        vec2 _mask_uv = vec2(v_uv.x, 1.0 - v_uv.y);
        float _mask_raw = texture(u_tex_mask_sky, _mask_uv).r;
        float _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4(color_result.rgb * _mask_val, color_result.a * _mask_val);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    final_color = vec4(clamp(final_color.rgb, 0.0, 1.0), final_color.a);
    final_color += (dither_noise(v_uv * u_resolution) - 0.5) / 255.0;
    fragColor = final_color;
}
