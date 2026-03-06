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
uniform float u_p_charcoal;
uniform float u_p_fill_angle;
uniform float u_p_glow_val;
uniform float u_p_gold;

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

    float charcoal = u_p_charcoal;
    float fill_angle = u_p_fill_angle;
    float glow_val = u_p_glow_val;
    float gold = u_p_gold;

    vec4 final_color = vec4(0.0, 0.0, 0.0, 1.0);

    // ── Layer 0: config ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
    // ── Layer 1: track ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = abs(length(p) - 0.350000) - 0.008000;
        float glow_pulse = 0.600000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), 1.0);
        color_result = vec4(color_result.rgb * vec3(charcoal, charcoal, charcoal), 1.0);
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb + lc, 1.0);
    }

    // ── Layer 2: fill ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = abs(length(p) - 0.350000) - 0.025000;
        float arc_theta = atan(p.x, p.y) + 3.14159265359;
        sdf_result = (arc_theta < fill_angle ? sdf_result : 999.0);
        float glow_pulse = glow_val * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), 1.0);
        color_result = vec4(color_result.rgb * vec3(gold, 0.690000, 0.220000), 1.0);
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb + lc, 1.0);
    }

    // ── Layer 3: flash ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = sdf_circle(p, 0.150000);
        float glow_pulse = 1.000000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), 1.0);
        color_result = vec4(color_result.rgb * vec3(1.000000, 0.950000, 0.700000), 1.0);
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb + lc, 1.0);
    }

    fragColor = final_color;
}
