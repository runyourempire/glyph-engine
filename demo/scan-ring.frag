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

in vec2 v_uv;
out vec4 fragColor;

float apply_glow(float d, float intensity){
    return exp(-max(d, 0.0) * intensity * 8.0);
}

void main(){
    vec2 uv = v_uv * 2.0 - 1.0;
    float aspect = u_resolution.x / u_resolution.y;
    float time = fract(u_time / 120.0) * 120.0;

    // ── Layer 0: sweep ──
    vec2 p = vec2(uv.x * aspect, uv.y);
    { float ra = time * 3.000000; float rc = cos(ra); float rs = sin(ra);
    p = vec2(p.x * rc - p.y * rs, p.x * rs + p.y * rc); }
    float sdf_result = abs(length(p) - 0.250000) - 0.030000;
    float arc_theta = atan(p.x, p.y) + 3.14159265359;
    sdf_result = (arc_theta < 4.000000 ? sdf_result : 999.0);
    float glow_pulse = 2.500000 * (0.9 + 0.1 * sin(time * 2.0));
    float glow_result = apply_glow(sdf_result, glow_pulse);

    vec4 color_result = vec4(vec3(glow_result), 1.0);
    color_result = vec4(color_result.rgb * vec3(0.830000, 0.690000, 0.220000), 1.0);
    fragColor = color_result;
}
