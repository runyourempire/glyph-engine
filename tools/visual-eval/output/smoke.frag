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

    // ── Layer 0: bg ──
    vec2 p = vec2(uv.x * aspect, uv.y);
    float sdf_result = sdf_circle(p, 0.500000);
    float glow_pulse = 1.500000 * (0.9 + 0.1 * sin(time * 2.0));
    float glow_result = apply_glow(sdf_result, glow_pulse);

    vec4 color_result = vec4(vec3(glow_result), glow_result);
    color_result = vec4(color_result.rgb * vec3(0.010000, 0.010000, 0.020000), color_result.a);
    color_result = vec4(aces_tonemap(color_result.rgb), color_result.a);
    color_result += (dither_noise(v_uv * u_resolution) - 0.5) / 255.0;
    fragColor = color_result;
}
