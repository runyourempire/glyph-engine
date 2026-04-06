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
uniform float u_p_refraction;
uniform float u_p_intensity;
uniform sampler2D u_prev_frame;


in vec2 v_uv;
out vec4 fragColor;

float sdf_circle(vec2 p, float radius){
    return length(p) - radius;
}

float apply_glow(float d, float intensity){
    return exp(-max(d, 0.0) * intensity * 8.0);
}

float hash2(vec2 p){
    vec3 p3 = fract(vec3(p.x, p.y, p.x) * 0.1031);
    p3 += vec3(dot(p3, p3.yzx + 33.33));
    return fract((p3.x + p3.y) * p3.z);
}

float noise2(vec2 p){
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
        mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x),
        u.y
    ) * 2.0 - 1.0;
}

float fbm2(vec2 p, int octaves, float persistence, float lacunarity){
    float value = 0.0;
    float amplitude = 1.0;
    float frequency = 1.0;
    float max_val = 0.0;
    for (int i = 0; i < octaves; i++) {
        value += noise2(p * frequency) * amplitude;
        max_val += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }
    return value / max_val;
}

vec3 cosine_palette(float t, vec3 a, vec3 b, vec3 c, vec3 d){
    return a + b * cos(6.28318 * (c * t + d));
}

float sdf_triangle(vec2 p, float sz){
    float k = sqrt(3.0);
    vec2 q = vec2(abs(p.x) - sz, p.y + sz / k);
    if (q.x + k * q.y > 0.0) q = vec2(q.x - k * q.y, -k * q.x - q.y) / 2.0;
    q = vec2(q.x - clamp(q.x, -2.0 * sz, 0.0), q.y);
    return -length(q) * sign(q.y);
}

vec3 aces_tonemap(vec3 x) {
    vec3 a = x * (2.51 * x + 0.03);
    vec3 b = x * (2.43 * x + 0.59) + 0.14;
    return clamp(a / b, 0.0, 1.0);
}

float dither_noise(vec2 uv) {
    return fract(52.9829189 * fract(dot(uv, vec2(0.06711056, 0.00583715))));
}

vec3 apply_color_matrix(vec3 color) {
    mat3 m = mat3(
        vec3(1.05, 0, 0),
        vec3(0, 1.05, 0),
        vec3(0, 0, 1.05)
    );
    return clamp(m * color, vec3(0.0), vec3(1.0));
}

void main(){
    vec2 uv = v_uv * 2.0 - 1.0;
    float aspect = u_aspect_ratio;
    float time = fract(u_time / 120.0) * 120.0;
    float mouse_x = u_mouse.x;
    float mouse_y = u_mouse.y;
    float mouse_down = u_mouse_down;

    float refraction = u_p_refraction;
    float intensity = u_p_intensity;

    vec4 final_color = vec4(0.0, 0.0, 0.0, 0.0);

    // ── Layer 1: void ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        { float warp_x = fbm2(p * 1.500000 + vec2(0.0, 1.3), int(4.000000), 0.100000, 2.000000);
        float warp_y = fbm2(p * 1.500000 + vec2(1.7, 0.0), int(4.000000), 0.100000, 2.000000);
        p = p + vec2(warp_x, warp_y) * 0.100000; }
        float sdf_result = fbm2((p * 2.000000 + vec2(time * 0.1, time * 0.07)), int(5.000000), 0.500000, 2.000000);
        vec3 pal_rgb = cosine_palette(sdf_result, vec3(0.010000, 0.010000, 0.020000), vec3(0.030000, 0.030000, 0.060000), vec3(0.080000, 0.060000, 0.120000), vec3(0.000000, 0.000000, 0.050000));
        vec4 color_result = vec4(pal_rgb, clamp(dot(pal_rgb, vec3(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.900000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 2: red_band ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2(((-0.120000) + (refraction * 0.040000)), 0.050000);
        { float warp_x = fbm2(p * 2.000000 + vec2(0.0, 1.3), int(4.000000), (0.150000 + (refraction * 0.080000)), 2.000000);
        float warp_y = fbm2(p * 2.000000 + vec2(1.7, 0.0), int(4.000000), (0.150000 + (refraction * 0.080000)), 2.000000);
        p = p + vec2(warp_x, warp_y) * (0.150000 + (refraction * 0.080000)); }
        float sdf_result = noise2(p * 4.000000 + vec2(time * 0.1, time * 0.07));
        vec3 pal_rgb = cosine_palette(sdf_result, vec3(0.4, 0.05, 0.05), vec3(0.4, 0.1, 0.05), vec3(1.0, 0.5, 0.5), vec3(0.0, 0.15, 0.3));
        vec4 color_result = vec4(pal_rgb, clamp(dot(pal_rgb, vec3(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.880000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 3: amber_band ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2(((-0.060000) + (refraction * 0.020000)), 0.020000);
        { float warp_x = fbm2(p * 2.000000 + vec2(0.0, 1.3), int(4.000000), (0.150000 + (refraction * 0.060000)), 2.000000);
        float warp_y = fbm2(p * 2.000000 + vec2(1.7, 0.0), int(4.000000), (0.150000 + (refraction * 0.060000)), 2.000000);
        p = p + vec2(warp_x, warp_y) * (0.150000 + (refraction * 0.060000)); }
        float sdf_result = noise2(p * 4.000000 + vec2(time * 0.1, time * 0.07));
        vec3 pal_rgb = cosine_palette(sdf_result, vec3(0.6, 0.2, 0.05), vec3(0.4, 0.2, 0.1), vec3(1.0, 0.5, 0.5), vec3(0.0, 0.15, 0.2));
        vec4 color_result = vec4(pal_rgb, clamp(dot(pal_rgb, vec3(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.870000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 4: green_band ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        { float warp_x = fbm2(p * 2.000000 + vec2(0.0, 1.3), int(4.000000), (0.150000 + (refraction * 0.050000)), 2.000000);
        float warp_y = fbm2(p * 2.000000 + vec2(1.7, 0.0), int(4.000000), (0.150000 + (refraction * 0.050000)), 2.000000);
        p = p + vec2(warp_x, warp_y) * (0.150000 + (refraction * 0.050000)); }
        float sdf_result = noise2(p * 4.000000 + vec2(time * 0.1, time * 0.07));
        vec3 pal_rgb = cosine_palette(sdf_result, vec3(0.2, 0.35, 0.1), vec3(0.15, 0.25, 0.1), vec3(0.8, 1.0, 0.5), vec3(0.0, 0.2, 0.4));
        vec4 color_result = vec4(pal_rgb, clamp(dot(pal_rgb, vec3(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.860000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 5: blue_band ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2((0.060000 - (refraction * 0.020000)), (-0.020000));
        { float warp_x = fbm2(p * 2.000000 + vec2(0.0, 1.3), int(4.000000), (0.150000 + (refraction * 0.060000)), 2.000000);
        float warp_y = fbm2(p * 2.000000 + vec2(1.7, 0.0), int(4.000000), (0.150000 + (refraction * 0.060000)), 2.000000);
        p = p + vec2(warp_x, warp_y) * (0.150000 + (refraction * 0.060000)); }
        float sdf_result = noise2(p * 4.000000 + vec2(time * 0.1, time * 0.07));
        vec3 pal_rgb = cosine_palette(sdf_result, vec3(0.0, 0.3, 0.5), vec3(0.0, 0.3, 0.5), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.1, 0.2));
        vec4 color_result = vec4(pal_rgb, clamp(dot(pal_rgb, vec3(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.850000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 6: violet_band ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2((0.120000 - (refraction * 0.040000)), (-0.050000));
        { float warp_x = fbm2(p * 2.000000 + vec2(0.0, 1.3), int(4.000000), (0.150000 + (refraction * 0.080000)), 2.000000);
        float warp_y = fbm2(p * 2.000000 + vec2(1.7, 0.0), int(4.000000), (0.150000 + (refraction * 0.080000)), 2.000000);
        p = p + vec2(warp_x, warp_y) * (0.150000 + (refraction * 0.080000)); }
        float sdf_result = noise2(p * 4.000000 + vec2(time * 0.1, time * 0.07));
        vec3 pal_rgb = cosine_palette(sdf_result, vec3(0.3, 0.1, 0.5), vec3(0.3, 0.2, 0.3), vec3(0.8, 0.5, 1.0), vec3(0.2, 0.0, 0.3));
        vec4 color_result = vec4(pal_rgb, clamp(dot(pal_rgb, vec3(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.840000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 7: source ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p + vec2(sin(p.y * 1.500000 + time * 0.400000), cos(p.x * 1.500000 + time * 0.400000)) * 0.020000;
        float sdf_result = sdf_circle(p, (0.050000 + (intensity * 0.020000)));
        float glow_pulse = (5.000000 + (intensity * 2.500000)) * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(1.000000, 1.000000, 0.950000), color_result.a);
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.930000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 8: prism ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p + vec2(sin(p.y * 1.000000 + time * 0.200000), cos(p.x * 1.000000 + time * 0.200000)) * 0.010000;
        float sdf_result = sdf_triangle(p, 0.150000);
        float glow_pulse = 1.000000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.500000, 0.500000, 0.600000), color_result.a);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    final_color = vec4(apply_color_matrix(final_color.rgb), final_color.a);
    final_color = vec4(aces_tonemap(final_color.rgb), final_color.a);
    final_color += (dither_noise(v_uv * u_resolution) - 0.5) / 255.0;
    fragColor = final_color;
}
