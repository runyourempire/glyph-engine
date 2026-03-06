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
uniform sampler2D u_prev_frame;


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

    // ── Layer 0: glow_core ──
    vec2 p = vec2(uv.x * aspect, uv.y);
    p = p - vec2(audio_bass, 0.000000);
    float sdf_result = sdf_circle(p, 0.100000);
    float glow_pulse = 2.500000 * (0.9 + 0.1 * sin(time * 2.0));
    float glow_result = apply_glow(sdf_result, glow_pulse);

    vec4 color_result = vec4(vec3(glow_result), 1.0);
    color_result = vec4(color_result.rgb * vec3(1.000000, 0.500000, 0.200000), 1.0);
    vec4 prev_color = texture(u_prev_frame, v_uv);
    color_result = mix(color_result, prev_color, 0.970000);
    fragColor = color_result;
}
