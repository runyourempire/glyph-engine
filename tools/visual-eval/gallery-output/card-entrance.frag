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
uniform float u_p_reveal;

in vec2 v_uv;
out vec4 fragColor;

float sdf_box(vec2 p, float w, float h){
    vec2 d = abs(p) - vec2(w, h);
    return length(max(d, vec2(0.0))) + min(max(d.x, d.y), 0.0);
}

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

    float reveal = u_p_reveal;

    vec4 final_color = vec4(0.0, 0.0, 0.0, 0.0);

    // ── Layer 1: glow_edge ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = sdf_box(p, 0.350000, 0.220000);
        sdf_result = abs(sdf_result) - 0.008000;
        float glow_pulse = 2.000000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(1.000000, 1.000000, 1.000000), color_result.a);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 2: fill ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = smoothstep(0.000000, 0.500000, length(p));
        float glow_pulse = 0.600000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.900000, 0.900000, 1.000000), color_result.a);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    final_color = vec4(aces_tonemap(final_color.rgb), final_color.a);
    final_color += (dither_noise(v_uv * u_resolution) - 0.5) / 255.0;
    fragColor = final_color;
}
