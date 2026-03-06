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
uniform float u_p_ring_r;
uniform float u_p_glow_str;
uniform float u_p_gold;
uniform float u_p_inner_r;
uniform float u_p_inner_glow;
uniform float u_p_flash_str;
uniform float u_p_white;

in vec2 v_uv;
out vec4 fragColor;

float sdf_circle(vec2 p, float radius){
    return length(p) - radius;
}

float apply_glow(float d, float intensity){
    return exp(-max(d, 0.0) * intensity * 8.0);
}

void main(){
    vec2 uv = v_uv * 2.0 - 1.0;
    float aspect = u_resolution.x / u_resolution.y;
    float time = fract(u_time / 120.0) * 120.0;

    float ring_r = u_p_ring_r;
    float glow_str = u_p_glow_str;
    float gold = u_p_gold;
    float inner_r = u_p_inner_r;
    float inner_glow = u_p_inner_glow;
    float flash_str = u_p_flash_str;
    float white = u_p_white;

    vec4 final_color = vec4(0.0, 0.0, 0.0, 1.0);

    // ── Layer 0: config ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
    // ── Layer 1: ring_outer ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = abs(length(p) - ring_r) - 0.020000;
        float glow_pulse = glow_str * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), 1.0);
        color_result = vec4(color_result.rgb * vec3(gold, 0.690000, 0.220000), 1.0);
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb + lc, 1.0);
    }

    // ── Layer 2: ring_inner ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = abs(length(p) - inner_r) - 0.015000;
        float glow_pulse = inner_glow * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), 1.0);
        color_result = vec4(color_result.rgb * vec3(gold, 0.690000, 0.220000), 1.0);
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb + lc, 1.0);
    }

    // ── Layer 3: center_flash ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = sdf_circle(p, 0.080000);
        float glow_pulse = flash_str * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), 1.0);
        color_result = vec4(color_result.rgb * vec3(white, white, white), 1.0);
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb + lc, 1.0);
    }

    // ── Layer 4: spray ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        { float r_angle = atan(p.y, p.x);
        float r_sector = 6.28318 / 8.000000;
        float r_a = mod(r_angle + r_sector * 0.5, r_sector) - r_sector * 0.5;
        float r_r = length(p);
        p = vec2(r_r * cos(r_a), r_r * sin(r_a)); }
        float sdf_result = abs(length(p) - ring_r) - 0.005000;
        float glow_pulse = 3.000000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), 1.0);
        color_result = vec4(color_result.rgb * vec3(1.000000, 0.850000, 0.400000), 1.0);
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb + lc, 1.0);
    }

    fragColor = final_color;
}
