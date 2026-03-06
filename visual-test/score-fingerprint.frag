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
uniform float u_p_relevance;
uniform float u_p_freshness;
uniform float u_p_depth;
uniform float u_p_confidence;

in vec2 v_uv;
out vec4 fragColor;

float sdf_star(vec2 p, float n, float r, float ir){
    float an = 3.14159265 / n;
    float a = atan(p.y, p.x);
    float period = 2.0 * an;
    float sa = mod(a + an, period) - an;
    vec2 q = length(p) * vec2(cos(sa), abs(sin(sa)));
    vec2 tip = vec2(r, 0.0);
    vec2 valley = vec2(ir * cos(an), ir * sin(an));
    vec2 e = tip - valley;
    vec2 d = q - valley;
    float t = clamp(dot(d, e) / dot(e, e), 0.0, 1.0);
    vec2 closest = valley + e * t;
    float dist = length(q - closest);
    float cross_val = d.x * e.y - d.y * e.x;
    return cross_val > 0.0 ? -dist : dist;
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

void main(){
    vec2 uv = v_uv * 2.0 - 1.0;
    float aspect = u_resolution.x / u_resolution.y;
    float time = fract(u_time / 120.0) * 120.0;

    float relevance = u_p_relevance;
    float freshness = u_p_freshness;
    float depth = u_p_depth;
    float confidence = u_p_confidence;

    vec4 final_color = vec4(0.0, 0.0, 0.0, 1.0);

    // ── Layer 0: config ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
    // ── Layer 1: cells ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = voronoi2(p * 5.000000 + vec2(time * 0.05, time * 0.03));
        float glow_pulse = 1.000000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), 1.0);
        color_result = vec4(color_result.rgb * vec3(0.830000, 0.690000, 0.220000), 1.0);
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb + lc, 1.0);
    }

    // ── Layer 2: structure ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        { float r_angle = atan(p.y, p.x);
        float r_sector = 6.28318 / 6.000000;
        float r_a = mod(r_angle + r_sector * 0.5, r_sector) - r_sector * 0.5;
        float r_r = length(p);
        p = vec2(r_r * cos(r_a), r_r * sin(r_a)); }
        float sdf_result = sdf_star(p, 6.000000, 0.300000, 0.120000);
        float glow_pulse = 0.800000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), 1.0);
        color_result = vec4(color_result.rgb * vec3(0.600000, 0.500000, 0.200000), 1.0);
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb + lc, 1.0);
    }

    // ── Layer 3: texture ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = noise2(p * 8.000000 + vec2(time * 0.1, time * 0.07));
        float glow_pulse = 0.600000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), 1.0);
        float grain_noise = fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453);
        color_result = vec4(color_result.rgb + (grain_noise - 0.5) * 0.500000, color_result.a);
        color_result = vec4(color_result.rgb * vec3(0.900000, 0.800000, 0.400000), 1.0);
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * lc, 1.0);
    }

    fragColor = final_color;
}
