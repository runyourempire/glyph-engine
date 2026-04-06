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
uniform sampler2D u_tex_photo;
uniform sampler2D u_tex_depth;
uniform sampler2D u_tex_mask_sky;
uniform sampler2D u_tex_mask_water;
uniform sampler2D u_tex_mask_vegetation;

in vec2 v_uv;
out vec4 fragColor;

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

    vec4 final_color = vec4(0.0, 0.0, 0.0, 0.0);

    // ── Layer 0: world ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        vec2 _px_uv = clamp(vec2(p.x / aspect * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5)), 0.0, 1.0);
        vec2 _px_orbit = vec2(sin(time * 0.060000), cos(time * 0.060000 * 0.7)) * 0.018000;
        float _px_depth = texture(u_tex_depth, _px_uv).r;
        vec2 _px_displaced = clamp(_px_uv + _px_orbit * _px_depth, 0.0, 1.0);
        vec4 color_result = texture(u_tex_photo, _px_displaced);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 1: cloud_churn ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p + vec2(sin(p.y * 0.350000 + time * 0.150000), cos(p.x * 0.350000 + time * 0.150000)) * 0.025000;
        vec2 _tex_uv = clamp(vec2(p.x / aspect * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5)), 0.0, 1.0);
        vec4 color_result = texture(u_tex_photo, _tex_uv);
        vec2 _mask_uv = vec2(v_uv.x, 1.0 - v_uv.y);
        float _mask_raw = texture(u_tex_mask_sky, _mask_uv).r;
        float _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4(color_result.rgb * _mask_val, color_result.a * _mask_val);
        float la = color_result.a * 0.880000;
        vec3 lc = color_result.rgb * 0.880000;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 2: storm_roll ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2((time * 0.035000), (time * 0.008000));
        { float warp_x = fbm2(p * 0.500000 + vec2(0.0, 1.3), int(5.000000), 0.700000, 0.350000);
        float warp_y = fbm2(p * 0.500000 + vec2(1.7, 0.0), int(5.000000), 0.700000, 0.350000);
        p = p + vec2(warp_x, warp_y) * 0.350000; }
        float sdf_result = fbm2((p * 0.600000 + vec2(time * 0.1, time * 0.07)), int(5.000000), 0.600000, 2.000000);
        float glow_pulse = 1.000000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.300000, 0.320000, 0.450000), color_result.a);
        vec2 _mask_uv = vec2(v_uv.x, 1.0 - v_uv.y);
        float _mask_raw = texture(u_tex_mask_sky, _mask_uv).r;
        float _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4(color_result.rgb * _mask_val, color_result.a * _mask_val);
        float la = color_result.a * 0.180000;
        vec3 lc = color_result.rgb * 0.180000;
        final_color = vec4(vec3(1.0) - (vec3(1.0) - final_color.rgb) * (vec3(1.0) - lc), max(final_color.a, la));
    }

    // ── Layer 3: lightning ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2((time * 0.001000), (time * 0.001000));
        p = p + vec2(sin(p.y * 0.150000 + time * 8.000000), cos(p.x * 0.150000 + time * 8.000000)) * 0.020000;
        { float warp_x = fbm2(p * 0.300000 + vec2(0.0, 1.3), int(2.000000), 0.500000, 0.050000);
        float warp_y = fbm2(p * 0.300000 + vec2(1.7, 0.0), int(2.000000), 0.500000, 0.050000);
        p = p + vec2(warp_x, warp_y) * 0.050000; }
        float sdf_result = fbm2((p * 0.200000 + vec2(time * 0.1, time * 0.07)), int(2.000000), 0.500000, 2.000000);
        float glow_pulse = 8.000000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.700000, 0.750000, 1.000000), color_result.a);
        vec2 _mask_uv = vec2(v_uv.x, 1.0 - v_uv.y);
        float _mask_raw = texture(u_tex_mask_sky, _mask_uv).r;
        float _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4(color_result.rgb * _mask_val, color_result.a * _mask_val);
        float la = color_result.a * 0.250000;
        vec3 lc = color_result.rgb * 0.250000;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 4: rain ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2((time * 0.150000), (time * 0.800000));
        p = p + vec2(sin(p.y * 25.000000 + time * 6.000000), cos(p.x * 25.000000 + time * 6.000000)) * 0.080000;
        float sdf_result = voronoi2(p * 45.000000 + vec2(time * 0.05, time * 0.03));
        float glow_pulse = 8.000000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.650000, 0.700000, 0.850000), color_result.a);
        float la = color_result.a * 0.090000;
        vec3 lc = color_result.rgb * 0.090000;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 5: rain_fine ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2((time * 0.120000), (time * 0.650000));
        p = p + vec2(sin(p.y * 35.000000 + time * 5.000000), cos(p.x * 35.000000 + time * 5.000000)) * 0.060000;
        float sdf_result = voronoi2(p * 55.000000 + vec2(time * 0.05, time * 0.03));
        float glow_pulse = 10.000000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.550000, 0.600000, 0.780000), color_result.a);
        float la = color_result.a * 0.060000;
        vec3 lc = color_result.rgb * 0.060000;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 6: puddle_ripple ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2((time * 0.004000), (time * 0.003000));
        p = p + vec2(sin(p.y * 8.000000 + time * 4.000000), cos(p.x * 8.000000 + time * 4.000000)) * 0.100000;
        float sdf_result = voronoi2(p * 12.000000 + vec2(time * 0.05, time * 0.03));
        float glow_pulse = 2.500000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.500000, 0.550000, 0.750000), color_result.a);
        vec2 _mask_uv = vec2(v_uv.x, 1.0 - v_uv.y);
        float _mask_raw = texture(u_tex_mask_water, _mask_uv).r;
        float _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4(color_result.rgb * _mask_val, color_result.a * _mask_val);
        float la = color_result.a * 0.120000;
        vec3 lc = color_result.rgb * 0.120000;
        final_color = vec4(vec3(1.0) - (vec3(1.0) - final_color.rgb) * (vec3(1.0) - lc), max(final_color.a, la));
    }

    // ── Layer 7: wind_sway ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p + vec2(sin(p.y * 0.600000 + time * 0.250000), cos(p.x * 0.600000 + time * 0.250000)) * 0.018000;
        vec2 _tex_uv = clamp(vec2(p.x / aspect * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5)), 0.0, 1.0);
        vec4 color_result = texture(u_tex_photo, _tex_uv);
        vec2 _mask_uv = vec2(v_uv.x, 1.0 - v_uv.y);
        float _mask_raw = texture(u_tex_mask_vegetation, _mask_uv).r;
        float _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4(color_result.rgb * _mask_val, color_result.a * _mask_val);
        float la = color_result.a * 0.820000;
        vec3 lc = color_result.rgb * 0.820000;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 8: storm_air ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2((time * 0.025000), (sin((time * 0.080000)) * 0.005000));
        { float warp_x = fbm2(p * 0.700000 + vec2(0.0, 1.3), int(4.000000), 0.600000, 0.180000);
        float warp_y = fbm2(p * 0.700000 + vec2(1.7, 0.0), int(4.000000), 0.600000, 0.180000);
        p = p + vec2(warp_x, warp_y) * 0.180000; }
        float sdf_result = fbm2((p * 1.000000 + vec2(time * 0.1, time * 0.07)), int(4.000000), 0.500000, 2.000000);
        float glow_pulse = 0.800000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.350000, 0.380000, 0.550000), color_result.a);
        vec2 _mask_uv = vec2(v_uv.x, 1.0 - v_uv.y);
        float _mask_raw = texture(u_tex_depth, _mask_uv).r;
        float _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 1.000000);
        color_result = vec4(color_result.rgb * _mask_val, color_result.a * _mask_val);
        float la = color_result.a * 0.100000;
        vec3 lc = color_result.rgb * 0.100000;
        final_color = vec4(vec3(1.0) - (vec3(1.0) - final_color.rgb) * (vec3(1.0) - lc), max(final_color.a, la));
    }

    // ── Layer 9: ground_flash ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2((time * 0.001000), (time * 0.001000));
        p = p + vec2(sin(p.y * 0.200000 + time * 8.000000), cos(p.x * 0.200000 + time * 8.000000)) * 0.030000;
        float sdf_result = fbm2((p * 0.150000 + vec2(time * 0.1, time * 0.07)), int(2.000000), 0.500000, 2.000000);
        float glow_pulse = 6.000000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.550000, 0.580000, 0.800000), color_result.a);
        vec2 _mask_uv = vec2(v_uv.x, 1.0 - v_uv.y);
        float _mask_raw = texture(u_tex_depth, _mask_uv).r;
        float _mask_val = mix(_mask_raw, 1.0 - _mask_raw, 0.0);
        color_result = vec4(color_result.rgb * _mask_val, color_result.a * _mask_val);
        float la = color_result.a * 0.080000;
        vec3 lc = color_result.rgb * 0.080000;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    final_color = vec4(clamp(final_color.rgb, 0.0, 1.0), final_color.a);
    final_color += (dither_noise(v_uv * u_resolution) - 0.5) / 255.0;
    fragColor = final_color;
}
