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
uniform float u_p_unfold;
uniform float u_p_resonance;
uniform sampler2D u_prev_frame;


in vec2 v_uv;
out vec4 fragColor;

float sdf_circle(vec2 p, float radius){
    return length(p) - radius;
}

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
        vec3(0.92, 0, 0.1),
        vec3(-0.02, 0.88, 0.04),
        vec3(0.12, 0.04, 1.18)
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

    float unfold = u_p_unfold;
    float resonance = u_p_resonance;

    vec4 final_color = vec4(0.0, 0.0, 0.0, 0.0);

    // ── Layer 1: void_field ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        { float warp_x = fbm2(p * 1.500000 + vec2(0.0, 1.3), int(5.000000), 0.500000, 0.100000);
        float warp_y = fbm2(p * 1.500000 + vec2(1.7, 0.0), int(5.000000), 0.500000, 0.100000);
        p = p + vec2(warp_x, warp_y) * 0.100000; }
        float sdf_result = fbm2((p * 2.000000 + vec2(time * 0.1, time * 0.07)), int(5.000000), 0.450000, 2.000000);
        vec3 pal_rgb = cosine_palette(sdf_result, vec3(0.004000, 0.002000, 0.008000), vec3(0.012000, 0.006000, 0.025000), vec3(0.150000, 0.080000, 0.300000), vec3(0.000000, 0.020000, 0.100000));
        vec4 color_result = vec4(pal_rgb, clamp(dot(pal_rgb, vec3(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.900000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 2: singularity ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2(((u_mouse.x * 0.060000) - 0.030000), ((u_mouse.y * 0.060000) - 0.030000));
        p = p + vec2(sin(p.y * 2.000000 + time * 0.400000), cos(p.x * 2.000000 + time * 0.400000)) * (0.012000 + (unfold * 0.006000));
        float sdf_result = sdf_circle(p, (0.035000 + (unfold * 0.015000)));
        float glow_pulse = ((5.000000 + (unfold * 2.500000)) + (audio_beat * 1.500000)) * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.830000, 0.750000, 1.000000), color_result.a);
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.920000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 3: inner_rings ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2(((u_mouse.x * 0.080000) - 0.040000), ((u_mouse.y * 0.080000) - 0.040000));
        { float ra = time * (time * 0.080000); float rc = cos(ra); float rs = sin(ra);
        p = vec2(p.x * rc - p.y * rs, p.x * rs + p.y * rc); }
        p = p + vec2(sin(p.y * 2.000000 + time * 0.300000), cos(p.x * 2.000000 + time * 0.300000)) * (0.015000 + (resonance * 0.008000));
        float sdf_result = sdf_circle(p, (0.140000 + (unfold * 0.040000)));
        for (int onion_i = 0; onion_i < int(5.000000); onion_i++) { sdf_result = abs(sdf_result) - (0.006000 + (resonance * 0.002000)); }
        float glow_pulse = (1.600000 + (resonance * 0.800000)) * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.550000, 0.400000, 0.900000), color_result.a);
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.880000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 4: outer_rings ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2(((u_mouse.x * 0.050000) - 0.025000), ((u_mouse.y * 0.050000) - 0.025000));
        { float ra = time * (time * (-0.050000)); float rc = cos(ra); float rs = sin(ra);
        p = vec2(p.x * rc - p.y * rs, p.x * rs + p.y * rc); }
        p = p + vec2(sin(p.y * 1.800000 + time * 0.250000), cos(p.x * 1.800000 + time * 0.250000)) * 0.010000;
        float sdf_result = sdf_circle(p, (0.280000 + (unfold * 0.060000)));
        for (int onion_i = 0; onion_i < int(3.000000); onion_i++) { sdf_result = abs(sdf_result) - 0.004000; }
        float glow_pulse = (0.900000 + (unfold * 0.400000)) * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.400000, 0.250000, 0.700000), color_result.a);
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.850000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 5: mandala ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2(((u_mouse.x * 0.040000) - 0.020000), ((u_mouse.y * 0.040000) - 0.020000));
        { float r_angle = atan(p.y, p.x);
        float r_sector = 6.28318 / 5.000000;
        float r_a = mod(r_angle + r_sector * 0.5, r_sector) - r_sector * 0.5;
        float r_r = length(p);
        p = vec2(r_r * cos(r_a), r_r * sin(r_a)); }
        { float ra = time * (time * 0.060000); float rc = cos(ra); float rs = sin(ra);
        p = vec2(p.x * rc - p.y * rs, p.x * rs + p.y * rc); }
        p = p + vec2(sin(p.y * 2.500000 + time * 0.350000), cos(p.x * 2.500000 + time * 0.350000)) * (0.020000 + (unfold * 0.010000));
        float sdf_result = sdf_star(p, 5.000000, (0.220000 + (resonance * 0.040000)), (0.100000 + (resonance * 0.020000)));
        float glow_pulse = (1.400000 + (resonance * 0.600000)) * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.830000, 0.690000, 0.220000), color_result.a);
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.860000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 6: decagon ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        { float r_angle = atan(p.y, p.x);
        float r_sector = 6.28318 / 10.000000;
        float r_a = mod(r_angle + r_sector * 0.5, r_sector) - r_sector * 0.5;
        float r_r = length(p);
        p = vec2(r_r * cos(r_a), r_r * sin(r_a)); }
        { float ra = time * (time * (-0.040000)); float rc = cos(ra); float rs = sin(ra);
        p = vec2(p.x * rc - p.y * rs, p.x * rs + p.y * rc); }
        p = p - vec2((0.180000 + (unfold * 0.030000)), 0.000000);
        float sdf_result = sdf_triangle(p, (0.020000 + (resonance * 0.008000)));
        float glow_pulse = (1.800000 + (audio_mid * 0.600000)) * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.830000, 0.690000, 0.220000), color_result.a);
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.830000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 7: field_lines ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2(((u_mouse.x * 0.100000) - 0.050000), ((u_mouse.y * 0.100000) - 0.050000));
        { float warp_x = fbm2(p * 3.000000 + vec2(0.0, 1.3), int(5.000000), 0.550000, (0.150000 + (unfold * 0.080000)));
        float warp_y = fbm2(p * 3.000000 + vec2(1.7, 0.0), int(5.000000), 0.550000, (0.150000 + (unfold * 0.080000)));
        p = p + vec2(warp_x, warp_y) * (0.150000 + (unfold * 0.080000)); }
        float sdf_result = fbm2((p * 4.000000 + vec2(time * 0.1, time * 0.07)), int(5.000000), 0.500000, 2.000000);
        vec3 pal_rgb = cosine_palette(sdf_result, vec3(0.002000, 0.001000, 0.005000), vec3(0.010000, 0.006000, 0.020000), vec3(0.300000, 0.200000, 0.600000), vec3(0.050000, 0.100000, 0.250000));
        vec4 color_result = vec4(pal_rgb, clamp(dot(pal_rgb, vec3(0.299, 0.587, 0.114)) * 2.0, 0.0, 1.0));
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.800000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 8: stardust ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        { float warp_x = fbm2(p * 2.500000 + vec2(0.0, 1.3), int(3.000000), (0.120000 + (audio_treble * 0.060000)), 2.000000);
        float warp_y = fbm2(p * 2.500000 + vec2(1.7, 0.0), int(3.000000), (0.120000 + (audio_treble * 0.060000)), 2.000000);
        p = p + vec2(warp_x, warp_y) * (0.120000 + (audio_treble * 0.060000)); }
        float sdf_result = voronoi2(p * 35.000000 + vec2(time * 0.05, time * 0.03));
        float glow_pulse = (14.000000 + (audio_energy * 4.000000)) * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.700000, 0.600000, 1.000000), color_result.a);
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.760000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 9: vertex_a ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2((((sin((time * 0.250000)) * ((0.200000 + (unfold * 0.060000)))) + (u_mouse.x * 0.030000)) - 0.015000), (((cos((time * 0.320000)) * ((0.180000 + (unfold * 0.050000)))) + (u_mouse.y * 0.030000)) - 0.015000));
        float sdf_result = sdf_star(p, 5.000000, (0.010000 + (resonance * 0.004000)), 0.004000);
        float glow_pulse = (2.200000 + (resonance * 0.800000)) * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.830000, 0.690000, 0.220000), color_result.a);
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.740000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 10: vertex_b ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        p = p - vec2((((cos((time * 0.200000)) * ((0.260000 + (unfold * 0.040000)))) + (u_mouse.x * 0.020000)) - 0.010000), (((sin((time * 0.280000)) * ((0.220000 + (unfold * 0.040000)))) + (u_mouse.y * 0.020000)) - 0.010000));
        float sdf_result = sdf_star(p, 5.000000, (0.008000 + (resonance * 0.003000)), 0.003000);
        float glow_pulse = (1.800000 + (resonance * 0.600000)) * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.600000, 0.450000, 1.000000), color_result.a);
        vec4 prev_color = texture(u_prev_frame, v_uv);
        color_result = mix(color_result, prev_color, 0.720000);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    // ── Layer 11: boundary ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = abs(length(p) - 0.420000) - 0.001000;
        float glow_pulse = (0.300000 + (unfold * 0.150000)) * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), glow_result);
        color_result = vec4(color_result.rgb * vec3(0.250000, 0.180000, 0.450000), color_result.a);
        float la = color_result.a;
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb * (1.0 - la) + lc, final_color.a * (1.0 - la) + la);
    }

    final_color = vec4(apply_color_matrix(final_color.rgb), final_color.a);
    final_color = vec4(aces_tonemap(final_color.rgb), final_color.a);
    final_color += (dither_noise(v_uv * u_resolution) - 0.5) / 255.0;
    fragColor = final_color;
}
