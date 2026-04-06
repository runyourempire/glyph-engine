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
uniform float u_p_pulse;
uniform sampler2D u_prev_frame;


in vec2 v_uv;
out vec4 fragColor;

float sdf_circle(vec2 p, float radius){
    return length(p) - radius;
}

float sdf_star(vec2 p, float n, float r, float ir){
    float an = 3.14159265 / n;
    float a = atan(p.y, p.x);
    float period = 2.0 * an;
    float sa = mod(a + an, period) - an;
    vec2 q = length(p) * vec2(cos(sa), abs(sin(sa)));
    vec2 tip = vec2(r, 0.0);
    vec2 valley = vec2(ir * cos(an), ir * sin(an));
    vec2 e = tip - valley;
    vec2 d = q - valley;
    float t = clamp(dot(d, e) / dot(e, e), 0.0, 1.0);
    vec2 closest = valley + e * t;
    float dist = length(q - closest);
    float cross_val = d.x * e.y - d.y * e.x;
    return cross_val > 0.0 ? -dist : dist;
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

    float pulse = u_p_pulse;

    vec4 final_color = vec4(0.0, 0.0, 0.0, 0.0);

    // ── Layer 1: outer ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = abs(length(p) - 0.380000) - 0.001000;
        float shade_fw = fwidth(sdf_result);
        float shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        vec4 color_result = vec4(vec3(0.200000, 0.150000, 0.080000) * shade_alpha, shade_alpha);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 2: ticks ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        { float r_angle = atan(p.y, p.x);
        float r_sector = 6.28318 / 24.000000;
        float r_a = mod(r_angle + r_sector * 0.5, r_sector) - r_sector * 0.5;
        float r_r = length(p);
        p = vec2(r_r * cos(r_a), r_r * sin(r_a)); }
        float sdf_result = abs(length(p) - 0.380000) - 0.000800;
        float shade_fw = fwidth(sdf_result);
        float shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        vec4 color_result = vec4(vec3(0.150000, 0.120000, 0.050000) * shade_alpha, shade_alpha);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 3: mid ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = abs(length(p) - 0.300000) - 0.002000;
        float shade_fw = fwidth(sdf_result);
        float shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        vec4 color_result = vec4(vec3(0.300000, 0.240000, 0.120000) * shade_alpha, shade_alpha);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 4: inner ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = abs(length(p) - 0.220000) - 0.003000;
        float shade_fw = fwidth(sdf_result);
        float shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        vec4 color_result = vec4(vec3(0.450000, 0.360000, 0.160000) * shade_alpha, shade_alpha);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 5: probe ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        { float ra = time * (time * 0.150000); float rc = cos(ra); float rs = sin(ra);
        p = vec2(p.x * rc - p.y * rs, p.x * rs + p.y * rc); }
        p = p - vec2(0.300000, 0.000000);
        float sdf_result = sdf_star(p, 3.000000, 0.015000, 0.008000);
        float shade_fw = fwidth(sdf_result);
        float shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        vec4 color_result = vec4(vec3(0.900000, 0.700000, 0.250000) * shade_alpha, shade_alpha);
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.860000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 6: hex ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        { float r_angle = atan(p.y, p.x);
        float r_sector = 6.28318 / 6.000000;
        float r_a = mod(r_angle + r_sector * 0.5, r_sector) - r_sector * 0.5;
        float r_r = length(p);
        p = vec2(r_r * cos(r_a), r_r * sin(r_a)); }
        float sdf_result = abs(length(p) - 0.150000) - 0.001000;
        float shade_fw = fwidth(sdf_result);
        float shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        vec4 color_result = vec4(vec3(0.250000, 0.200000, 0.100000) * shade_alpha, shade_alpha);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 7: center ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p + vec2(sin(p.y * 2.000000 + time * 0.600000), cos(p.x * 2.000000 + time * 0.600000)) * (0.010000 + (pulse * 0.005000));
        float sdf_result = sdf_circle(p, (0.045000 + (pulse * 0.015000)));
        float shade_fw = fwidth(sdf_result);
        float shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        vec4 color_result = vec4(vec3(1.000000, 0.850000, 0.350000) * shade_alpha, shade_alpha);
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.900000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 8: dot ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = sdf_circle(p, 0.008000);
        float shade_fw = fwidth(sdf_result);
        float shade_alpha = 1.0 - smoothstep(-shade_fw, shade_fw, sdf_result);
        vec4 color_result = vec4(vec3(1.000000, 0.950000, 0.600000) * shade_alpha, shade_alpha);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    final_color = vec4(aces_tonemap(final_color.rgb), final_color.a);
    final_color += (dither_noise(v_uv * u_resolution) - 0.5) / 255.0;
    fragColor = final_color;
}
