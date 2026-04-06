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
uniform float u_p_expand;
uniform sampler2D u_prev_frame;


in vec2 v_uv;
out vec4 fragColor;

float sdf_circle(vec2 p, float radius){
    return length(p) - radius;
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

    float expand = u_p_expand;

    vec4 final_color = vec4(0.0, 0.0, 0.0, 0.0);

    // ── Layer 1: waves ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p + vec2(sin(p.y * 2.000000 + time * 0.500000), cos(p.x * 2.000000 + time * 0.500000)) * 0.015000;
        float sdf_result = sdf_circle(p, (0.080000 + (expand * 0.180000)));
        for (int onion_i = 0; onion_i < int(8.000000); onion_i++) { sdf_result = abs(sdf_result) - 0.003000; }
        float shade_fw = fwidth(sdf_result);
        float shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        vec4 color_result = vec4(vec3(0.600000, 0.500000, 0.200000) * shade_alpha, shade_alpha);
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.880000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 2: waves2 ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p + vec2(sin(p.y * 2.500000 + time * 0.400000), cos(p.x * 2.500000 + time * 0.400000)) * 0.012000;
        float sdf_result = sdf_circle(p, (0.140000 + (expand * 0.120000)));
        for (int onion_i = 0; onion_i < int(6.000000); onion_i++) { sdf_result = abs(sdf_result) - 0.002000; }
        float shade_fw = fwidth(sdf_result);
        float shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        vec4 color_result = vec4(vec3(0.400000, 0.320000, 0.150000) * shade_alpha, shade_alpha);
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.850000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 3: origin ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p + vec2(sin(p.y * 3.000000 + time * 0.800000), cos(p.x * 3.000000 + time * 0.800000)) * 0.008000;
        float sdf_result = sdf_circle(p, 0.020000);
        float shade_fw = fwidth(sdf_result);
        float shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        vec4 color_result = vec4(vec3(1.000000, 0.900000, 0.450000) * shade_alpha, shade_alpha);
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.920000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 4: bound ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = abs(length(p) - 0.440000) - 0.001000;
        float shade_fw = fwidth(sdf_result);
        float shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        vec4 color_result = vec4(vec3(0.200000, 0.150000, 0.080000) * shade_alpha, shade_alpha);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    final_color = vec4(aces_tonemap(final_color.rgb), final_color.a);
    final_color += (dither_noise(v_uv * u_resolution) - 0.5) / 255.0;
    fragColor = final_color;
}
