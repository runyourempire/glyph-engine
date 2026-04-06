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
uniform float u_p_shimmer;
uniform float u_p_weave_speed;
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

vec2 hash2v(vec2 p){
    vec3 p3 = fract(vec3(p.x, p.y, p.x) * vec3(0.1031, 0.1030, 0.0973));
    vec3 pp = p3 + vec3(dot(p3, p3.yzx + 33.33));
    return fract(vec2((pp.x + pp.y) * pp.z, (pp.x + pp.z) * pp.y));
}

float voronoi2(vec2 p){
    vec2 n = floor(p);
    vec2 f = fract(p);
    float md = 8.0;
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = hash2v(n + g);
            vec2 r = g + o - f;
            float d = dot(r, r);
            md = min(md, d);
        }
    }
    return sqrt(md);
}

vec3 cosine_palette(float t, vec3 a, vec3 b, vec3 c, vec3 d){
    return a + b * cos(6.28318 * (c * t + d));
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

    float shimmer = u_p_shimmer;
    float weave_speed = u_p_weave_speed;

    vec4 final_color = vec4(0.0, 0.0, 0.0, 0.0);

    // ── Layer 1: silk ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        { float warp_x = fbm2(p * 1.300000 + vec2(0.0, 1.3), int(6.000000), 0.550000, (0.330000 + (u_mouse_down * 0.080000)));
        float warp_y = fbm2(p * 1.300000 + vec2(1.7, 0.0), int(6.000000), 0.550000, (0.330000 + (u_mouse_down * 0.080000)));
        p = p + vec2(warp_x, warp_y) * (0.330000 + (u_mouse_down * 0.080000)); }
        p = p + vec2(sin(p.y * 2.000000 + time * weave_speed), cos(p.x * 2.000000 + time * weave_speed)) * 0.100000;
        float sdf_result = voronoi2(p * 7.000000 + vec2(time * 0.05, time * 0.03));
        vec3 pal_rgb = cosine_palette(sdf_result, vec3(0.350000, 0.300000, 0.450000), vec3(0.250000, 0.200000, 0.300000), vec3(1.000000, 0.800000, 0.500000), vec3(0.600000, 0.650000, 0.750000));
        vec4 color_result = vec4(pal_rgb, clamp(dot(pal_rgb, vec3(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.910000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 2: threads ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        { float warp_x = fbm2(p * (2.500000 + (u_mouse.x * 0.400000)) + vec2(0.0, 1.3), int(5.000000), 0.500000, (0.280000 + (u_mouse_down * 0.060000)));
        float warp_y = fbm2(p * (2.500000 + (u_mouse.x * 0.400000)) + vec2(1.7, 0.0), int(5.000000), 0.500000, (0.280000 + (u_mouse_down * 0.060000)));
        p = p + vec2(warp_x, warp_y) * (0.280000 + (u_mouse_down * 0.060000)); }
        p = p + vec2(sin(p.y * 3.000000 + time * (weave_speed * 1.300000)), cos(p.x * 3.000000 + time * (weave_speed * 1.300000))) * 0.080000;
        float sdf_result = voronoi2(p * 14.000000 + vec2(time * 0.05, time * 0.03));
        vec3 pal_rgb = cosine_palette(sdf_result, vec3(0.300000, 0.280000, 0.420000), vec3(0.220000, 0.180000, 0.280000), vec3(1.500000, 1.000000, 0.600000), vec3(0.550000, 0.600000, 0.720000));
        vec4 color_result = vec4(pal_rgb, clamp(dot(pal_rgb, vec3(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.860000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 3: depth ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        { float warp_x = fbm2(p * (3.000000 + (u_mouse.y * 0.300000)) + vec2(0.0, 1.3), int(5.000000), 0.500000, 0.220000);
        float warp_y = fbm2(p * (3.000000 + (u_mouse.y * 0.300000)) + vec2(1.7, 0.0), int(5.000000), 0.500000, 0.220000);
        p = p + vec2(warp_x, warp_y) * 0.220000; }
        p = p + vec2(sin(p.y * 4.000000 + time * (weave_speed * 1.500000)), cos(p.x * 4.000000 + time * (weave_speed * 1.500000))) * 0.060000;
        float sdf_result = fbm2((p * 5.000000 + vec2(time * 0.1, time * 0.07)), int(4.000000), 0.450000, 2.000000);
        vec3 pal_rgb = cosine_palette(sdf_result, vec3(0.280000, 0.250000, 0.400000), vec3(0.200000, 0.160000, 0.260000), vec3(0.600000, 0.500000, 0.800000), vec3(0.500000, 0.550000, 0.650000));
        vec4 color_result = vec4(pal_rgb, clamp(dot(pal_rgb, vec3(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.840000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 4: stardust ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p + vec2(sin(p.y * 5.000000 + time * (weave_speed * 0.600000)), cos(p.x * 5.000000 + time * (weave_speed * 0.600000))) * 0.180000;
        { float warp_x = fbm2(p * 2.000000 + vec2(0.0, 1.3), int(3.000000), 0.220000, 2.000000);
        float warp_y = fbm2(p * 2.000000 + vec2(1.7, 0.0), int(3.000000), 0.220000, 2.000000);
        p = p + vec2(warp_x, warp_y) * 0.220000; }
        p = vec2(mod(p.x + 0.140000 * 0.5, 0.140000) - 0.140000 * 0.5, mod(p.y + 0.140000 * 0.5, 0.140000) - 0.140000 * 0.5);
        float sdf_result = sdf_circle(p, (0.008000 + (shimmer * 0.004000)));
        float glow_pulse = (2.500000 + (shimmer * 1.000000)) * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.600000, 0.500000, 0.900000), color_result.a);
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.720000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 5: mist ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p + vec2(sin(p.y * 3.000000 + time * (weave_speed * 0.400000)), cos(p.x * 3.000000 + time * (weave_speed * 0.400000))) * 0.100000;
        { float warp_x = fbm2(p * 1.500000 + vec2(0.0, 1.3), int(4.000000), 0.500000, 0.200000);
        float warp_y = fbm2(p * 1.500000 + vec2(1.7, 0.0), int(4.000000), 0.500000, 0.200000);
        p = p + vec2(warp_x, warp_y) * 0.200000; }
        float sdf_result = noise2(p * 5.000000 + vec2(time * 0.1, time * 0.07));
        float glow_pulse = (1.000000 + (shimmer * 0.400000)) * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.400000, 0.350000, 0.600000), color_result.a);
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.940000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 6: flickers ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p + vec2(sin(p.y * 7.000000 + time * (weave_speed * 1.000000)), cos(p.x * 7.000000 + time * (weave_speed * 1.000000))) * 0.250000;
        { float warp_x = fbm2(p * 3.000000 + vec2(0.0, 1.3), int(3.000000), 0.320000, 2.000000);
        float warp_y = fbm2(p * 3.000000 + vec2(1.7, 0.0), int(3.000000), 0.320000, 2.000000);
        p = p + vec2(warp_x, warp_y) * 0.320000; }
        float sdf_result = fbm2((p * 18.000000 + vec2(time * 0.1, time * 0.07)), int(2.000000), 0.500000, 2.000000);
        float glow_pulse = (3.500000 + (shimmer * 1.000000)) * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.700000, 0.600000, 1.000000), color_result.a);
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.660000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 7: ambient ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = smoothstep(0.000000, 0.650000, length(p));
        vec3 pal_rgb = cosine_palette(sdf_result, vec3(0.300000, 0.280000, 0.400000), vec3(0.180000, 0.150000, 0.250000), vec3(0.500000, 0.400000, 0.600000), vec3(0.000000, 0.050000, 0.100000));
        vec4 color_result = vec4(pal_rgb, clamp(dot(pal_rgb, vec3(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    final_color = vec4(aces_tonemap(final_color.rgb), final_color.a);
    final_color += (dither_noise(v_uv * u_resolution) - 0.5) / 255.0;
    fragColor = final_color;
}
