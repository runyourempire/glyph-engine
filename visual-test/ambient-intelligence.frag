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
uniform float u_p_pulse;
uniform float u_p_heat;
uniform float u_p_burst;
uniform float u_p_morph;
uniform float u_p_error_val;
uniform float u_p_staleness;
uniform float u_p_opacity_val;
uniform float u_p_signal_intensity;
uniform float u_p_color_shift;
uniform float u_p_critical_count;
uniform float u_p_metabolism;

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

void main(){
    vec2 uv = v_uv * 2.0 - 1.0;
    float aspect = u_resolution.x / u_resolution.y;
    float time = fract(u_time / 120.0) * 120.0;

    float pulse = u_p_pulse;
    float heat = u_p_heat;
    float burst = u_p_burst;
    float morph = u_p_morph;
    float error_val = u_p_error_val;
    float staleness = u_p_staleness;
    float opacity_val = u_p_opacity_val;
    float signal_intensity = u_p_signal_intensity;
    float color_shift = u_p_color_shift;
    float critical_count = u_p_critical_count;
    float metabolism = u_p_metabolism;

    vec4 final_color = vec4(0.0, 0.0, 0.0, 1.0);

    // ── Layer 0: config ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
    // ── Layer 1: deep_field ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        { float warp_x = fbm2(p * 2.000000 + vec2(0.0, 1.3), int(3.000000), 0.500000, 2.000000);
        float warp_y = fbm2(p * 2.000000 + vec2(1.7, 0.0), int(3.000000), 0.500000, 2.000000);
        p = p + vec2(warp_x, warp_y) * 0.200000; }
        float sdf_result = fbm2((p * 2.000000 + vec2(time * 0.1, time * 0.07)), int(3.000000), 0.500000, 2.000000);
        float glow_pulse = 1.000000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), 1.0);
        color_result = vec4(color_result.rgb * vec3(0.150000, 0.080000, 0.020000), 1.0);
        vec3 lc = color_result.rgb;
        final_color = vec4(vec3(1.0) - (vec3(1.0) - final_color.rgb) * (vec3(1.0) - lc), 1.0);
    }

    // ── Layer 2: core ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        vec4 color_result;
        {
            vec2 p_then = p;
            { vec2 p = p_then;
            float sdf_result = sdf_star(p, 5.000000, 0.280000, 0.120000);
            float glow_pulse = 3.000000 * (0.9 + 0.1 * sin(time * 2.0));
            float glow_result = apply_glow(sdf_result, glow_pulse);

            vec4 color_result = vec4(vec3(glow_result), 1.0);
            color_result = vec4(color_result.rgb * vec3(1.000000, 0.150000, 0.100000), 1.0);
            vec4 then_color = color_result; }
            { vec2 p = p_then;
            float sdf_result = sdf_circle(p, 0.250000);
            float glow_pulse = 2.000000 * (0.9 + 0.1 * sin(time * 2.0));
            float glow_result = apply_glow(sdf_result, glow_pulse);

            vec4 color_result = vec4(vec3(glow_result), 1.0);
            color_result = vec4(color_result.rgb * vec3(0.550000, 0.280000, 0.060000), 1.0);
            vec4 else_color = color_result; }
            color_result = (critical_count > 0.000000) ? then_color : else_color;
        }
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb + lc, 1.0);
    }

    // ── Layer 3: noise_halo ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = fbm2((p * 3.000000 + vec2(time * 0.1, time * 0.07)), int(4.000000), 0.500000, 2.000000);
        float glow_pulse = 1.200000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), 1.0);
        color_result = vec4(color_result.rgb * vec3(1.000000, 0.820000, 0.300000), 1.0);
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb + lc, 1.0);
    }

    // ── Layer 4: sentinel_ring ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = abs(length(p) - 0.380000) - 0.015000;
        float glow_pulse = 1.500000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), 1.0);
        color_result = vec4(color_result.rgb * vec3(0.830000, 0.690000, 0.220000), 1.0);
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb + lc, 1.0);
    }

    // ── Layer 5: pulse_ring ──
    {
        vec2 p = vec2(uv.x * aspect, uv.y);
        float sdf_result = abs(length(p) - 0.320000) - 0.008000;
        float glow_pulse = 2.000000 * (0.9 + 0.1 * sin(time * 2.0));
        float glow_result = apply_glow(sdf_result, glow_pulse);

        vec4 color_result = vec4(vec3(glow_result), 1.0);
        color_result = vec4(color_result.rgb * vec3(0.900000, 0.750000, 0.300000), 1.0);
        vec3 lc = color_result.rgb;
        final_color = vec4(final_color.rgb + lc, 1.0);
    }

    fragColor = final_color;
}
