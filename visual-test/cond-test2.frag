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
uniform float u_p_critical_count;
uniform float u_p_heat;

in vec2 v_uv;
out vec4 fragColor;

float apply_glow(float d, float intensity){
    return exp(-max(d, 0.0) * intensity * 8.0);
}

void main(){
    vec2 uv = v_uv * 2.0 - 1.0;
    float aspect = u_resolution.x / u_resolution.y;
    float time = fract(u_time / 120.0) * 120.0;

    float critical_count = u_p_critical_count;
    float heat = u_p_heat;

    vec4 final_color = vec4(0.0, 0.0, 0.0, 1.0);

    // ── Layer 0: config ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
    // ── Layer 1: bg ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        vec4 color_result;
        {
            vec2 p_then = p;
            { vec2 p = p_then;
            float sdf_result = sdf_star(p, 5.000000, 0.300000, 0.150000);
            float glow_pulse = 3.000000 * (0.9 + 0.1 * sin(time * 2.0));
            float glow_result = apply_glow(sdf_result, glow_pulse);

            vec4 color_result = vec4(vec3(glow_result), 1.0);
            color_result = vec4(color_result.rgb * vec3(1.000000, 0.200000, 0.200000), 1.0);
            vec4 then_color = color_result; }
            { vec2 p = p_then;
            float sdf_result = sdf_circle(p, 0.200000);
            float glow_pulse = 2.000000 * (0.9 + 0.1 * sin(time * 2.0));
            float glow_result = apply_glow(sdf_result, glow_pulse);

            vec4 color_result = vec4(vec3(glow_result), 1.0);
            color_result = vec4(color_result.rgb * vec3(0.300000, 0.500000, 0.800000), 1.0);
            vec4 else_color = color_result; }
            color_result = (critical_count > 0.000000) ? then_color : else_color;
        }
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb + lc, 1.0);
    }

    fragColor = final_color;
}
