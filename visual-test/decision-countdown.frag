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
uniform float u_p_progress;
uniform float u_p_urgency;

in vec2 v_uv;
out vec4 fragColor;

float apply_glow(float d, float intensity){
    return exp(-max(d, 0.0) * intensity * 8.0);
}

void main(){
    vec2 uv = v_uv * 2.0 - 1.0;
    float aspect = u_resolution.x / u_resolution.y;
    float time = fract(u_time / 120.0) * 120.0;

    float progress = u_p_progress;
    float urgency = u_p_urgency;

    vec4 final_color = vec4(0.0, 0.0, 0.0, 1.0);

    // ── Layer 0: config ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
    // ── Layer 1: bg ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = abs(length(p) - 0.400000) - 0.008000;
        float glow_pulse = 0.400000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), 1.0);
        color_result = vec4(color_result.rgb * vec3(0.250000, 0.250000, 0.250000), 1.0);
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb + lc, 1.0);
    }

    // ── Layer 2: countdown ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        vec4 color_result;
        {
            vec2 p_then = p;
            { vec2 p = p_then;
            float sdf_result = abs(length(p) - 0.400000) - 0.035000;
            float arc_theta = atan(p.x, p.y) + 3.14159265359;
            sdf_result = (arc_theta < progress ? sdf_result : 999.0);
            float glow_pulse = 2.500000 * (0.9 + 0.1 * sin(time * 2.0));
            float glow_result = apply_glow(sdf_result, glow_pulse);

            vec4 color_result = vec4(vec3(glow_result), 1.0);
            color_result = vec4(color_result.rgb * vec3(1.000000, 0.150000, 0.100000), 1.0);
            vec4 then_color = color_result; }
            { vec2 p = p_then;
            float sdf_result = abs(length(p) - 0.400000) - 0.030000;
            float arc_theta = atan(p.x, p.y) + 3.14159265359;
            sdf_result = (arc_theta < progress ? sdf_result : 999.0);
            float glow_pulse = 1.500000 * (0.9 + 0.1 * sin(time * 2.0));
            float glow_result = apply_glow(sdf_result, glow_pulse);

            vec4 color_result = vec4(vec3(glow_result), 1.0);
            color_result = vec4(color_result.rgb * vec3(0.830000, 0.690000, 0.220000), 1.0);
            vec4 else_color = color_result; }
            color_result = (urgency > 0.700000) ? then_color : else_color;
        }
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb + lc, 1.0);
    }

    // ── Layer 3: urgency_pulse ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = abs(length(p) - 0.440000) - 0.005000;
        float glow_pulse = 1.500000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), 1.0);
        color_result = vec4(color_result.rgb * vec3(1.000000, 0.300000, 0.150000), 1.0);
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb + lc, 1.0);
    }

    fragColor = final_color;
}
