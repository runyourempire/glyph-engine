//! WGSL shader generation from GAME AST.

use crate::ast::*;
use crate::codegen::memory;
use crate::codegen::stages::get_arg;
use crate::codegen::UniformInfo;

/// Generate a WGSL fragment shader for a cinematic.
pub fn generate_fragment(cinematic: &Cinematic, uniforms: &[UniformInfo]) -> String {
    let mut s = String::with_capacity(4096);

    // Uniform struct
    s.push_str("struct Uniforms {\n");
    s.push_str("    time: f32,\n");
    s.push_str("    audio_bass: f32,\n");
    s.push_str("    audio_mid: f32,\n");
    s.push_str("    audio_treble: f32,\n");
    s.push_str("    audio_energy: f32,\n");
    s.push_str("    audio_beat: f32,\n");
    s.push_str("    resolution: vec2<f32>,\n");
    s.push_str("    mouse: vec2<f32>,\n");
    for u in uniforms {
        s.push_str(&format!("    p_{}: f32,\n", u.name));
    }
    s.push_str("};\n\n");
    s.push_str("@group(0) @binding(0) var<uniform> u: Uniforms;\n\n");

    // Memory bindings (Group 1) — only when any layer uses memory
    if memory::any_layer_uses_memory(&cinematic.layers) {
        memory::emit_wgsl_memory_bindings(&mut s);
    }

    // Vertex output struct
    s.push_str("struct VertexOutput {\n");
    s.push_str("    @builtin(position) pos: vec4<f32>,\n");
    s.push_str("    @location(0) uv: vec2<f32>,\n");
    s.push_str("};\n\n");

    // Built-in helper functions
    emit_wgsl_builtins(&mut s, cinematic);

    // Fragment entry
    s.push_str("@fragment\n");
    s.push_str("fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {\n");
    s.push_str("    let uv = input.uv * 2.0 - 1.0;\n");
    s.push_str("    let aspect = u.resolution.x / u.resolution.y;\n");
    s.push_str("    let time = fract(u.time / 120.0) * 120.0;\n\n");

    // Uniform param aliases
    for u in uniforms {
        s.push_str(&format!("    let {} = u.p_{};\n", u.name, u.name));
    }
    if !uniforms.is_empty() {
        s.push('\n');
    }

    let multi_layer = cinematic.layers.len() > 1;
    if multi_layer {
        s.push_str("    var final_color = vec4<f32>(0.0, 0.0, 0.0, 1.0);\n\n");
    }

    for (i, layer) in cinematic.layers.iter().enumerate() {
        emit_wgsl_layer(&mut s, layer, i, multi_layer);
    }

    if multi_layer {
        s.push_str("    return final_color;\n");
    }
    s.push_str("}\n");
    s
}

fn emit_wgsl_builtins(s: &mut String, cinematic: &Cinematic) {
    let needs_circle = cinematic.layers.iter().any(|l| has_stage(l, "circle"));
    let needs_star = cinematic.layers.iter().any(|l| has_stage(l, "star"));
    let needs_box = cinematic.layers.iter().any(|l| has_stage(l, "box") || has_stage(l, "cross"));
    let needs_hex = cinematic.layers.iter().any(|l| has_stage(l, "hex"));
    let needs_fbm = cinematic.layers.iter().any(|l| has_stage(l, "fbm"));
    let needs_warp = cinematic.layers.iter().any(|l| has_stage(l, "warp"));
    let needs_simplex = cinematic.layers.iter().any(|l| has_stage(l, "simplex"));
    let needs_voronoi = cinematic.layers.iter().any(|l| has_stage(l, "voronoi"));
    let needs_palette = cinematic.layers.iter().any(|l| has_stage(l, "palette"));
    let needs_smin = cinematic.layers.iter().any(|l| {
        has_stage(l, "smooth_union")
            || has_stage(l, "smooth_subtract")
            || has_stage(l, "smooth_intersect")
    });
    let needs_repeat = cinematic.layers.iter().any(|l| has_stage(l, "repeat"));
    let needs_radial = cinematic.layers.iter().any(|l| has_stage(l, "radial"));
    let needs_grid = cinematic.layers.iter().any(|l| has_stage(l, "grid"));
    let needs_line = cinematic.layers.iter().any(|l| has_stage(l, "line"));
    let needs_capsule = cinematic.layers.iter().any(|l| has_stage(l, "capsule"));
    let needs_triangle = cinematic.layers.iter().any(|l| has_stage(l, "triangle"));
    let needs_arc_sdf = cinematic.layers.iter().any(|l| has_stage(l, "arc_sdf"));
    let needs_heart = cinematic.layers.iter().any(|l| has_stage(l, "heart"));
    let needs_egg = cinematic.layers.iter().any(|l| has_stage(l, "egg"));

    if needs_circle {
        s.push_str("fn sdf_circle(p: vec2<f32>, radius: f32) -> f32 {\n");
        s.push_str("    return length(p) - radius;\n");
        s.push_str("}\n\n");
    }

    if needs_star {
        emit_wgsl_star(s);
    }

    if needs_box {
        s.push_str("fn sdf_box(p: vec2<f32>, w: f32, h: f32) -> f32 {\n");
        s.push_str("    let d = abs(p) - vec2<f32>(w, h);\n");
        s.push_str("    return length(max(d, vec2<f32>(0.0, 0.0))) + min(max(d.x, d.y), 0.0);\n");
        s.push_str("}\n\n");
    }

    if needs_hex {
        s.push_str("fn sdf_hex(p: vec2<f32>, r: f32) -> f32 {\n");
        s.push_str("    let k = vec3<f32>(-0.866025, 0.5, 0.577350);\n");
        s.push_str("    var q = abs(p);\n");
        s.push_str("    q = q - 2.0 * min(dot(k.xy, q), 0.0) * k.xy;\n");
        s.push_str("    q = q - vec2<f32>(clamp(q.x, -k.z * r, k.z * r), r);\n");
        s.push_str("    return length(q) * sign(q.y);\n");
        s.push_str("}\n\n");
    }

    s.push_str("fn apply_glow(d: f32, intensity: f32) -> f32 {\n");
    s.push_str("    return exp(-max(d, 0.0) * intensity * 8.0);\n");
    s.push_str("}\n\n");

    if needs_fbm || needs_warp || needs_simplex {
        emit_wgsl_fbm(s);
    }

    if needs_voronoi {
        emit_wgsl_voronoi(s);
    }

    if needs_palette {
        emit_wgsl_palette(s);
    }

    // Smooth min for smooth boolean operations
    if needs_smin {
        s.push_str("fn smin(a: f32, b: f32, k: f32) -> f32 {\n");
        s.push_str("    let h = max(k - abs(a - b), 0.0) / k;\n");
        s.push_str("    return min(a, b) - h * h * k * 0.25;\n");
        s.push_str("}\n\n");
    }

    // Floor-based mod for spatial repeat (WGSL % is trunc-based!)
    if needs_repeat || needs_radial || needs_grid {
        s.push_str("fn game_mod(x: f32, y: f32) -> f32 {\n");
        s.push_str("    return x - y * floor(x / y);\n");
        s.push_str("}\n\n");
    }

    // New SDF primitive helpers
    if needs_line || needs_capsule {
        s.push_str("fn sdf_line(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {\n");
        s.push_str("    let pa = p - a;\n");
        s.push_str("    let ba = b - a;\n");
        s.push_str("    let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);\n");
        s.push_str("    return length(pa - ba * h);\n");
        s.push_str("}\n\n");
    }

    if needs_triangle {
        s.push_str("fn sdf_triangle(p: vec2<f32>, sz: f32) -> f32 {\n");
        s.push_str("    let k = sqrt(3.0);\n");
        s.push_str("    var q = vec2<f32>(abs(p.x) - sz, p.y + sz / k);\n");
        s.push_str("    if (q.x + k * q.y > 0.0) { q = vec2<f32>(q.x - k * q.y, -k * q.x - q.y) / 2.0; }\n");
        s.push_str("    q = vec2<f32>(q.x - clamp(q.x, -2.0 * sz, 0.0), q.y);\n");
        s.push_str("    return -length(q) * sign(q.y);\n");
        s.push_str("}\n\n");
    }

    if needs_arc_sdf {
        s.push_str("fn sdf_arc(p: vec2<f32>, ra: f32, angle: f32, rb: f32) -> f32 {\n");
        s.push_str("    let sca = vec2<f32>(sin(angle), cos(angle));\n");
        s.push_str("    var q = vec2<f32>(abs(p.x), p.y);\n");
        s.push_str("    let k = select(length(q), dot(q, sca), sca.y * q.x > sca.x * q.y);\n");
        s.push_str("    return sqrt(dot(q, q) + ra * ra - 2.0 * ra * k) - rb;\n");
        s.push_str("}\n\n");
    }

    if needs_heart {
        s.push_str("fn sdf_heart(p: vec2<f32>, sz: f32) -> f32 {\n");
        s.push_str("    let q = vec2<f32>(abs(p.x), p.y);\n");
        s.push_str("    let b = vec2<f32>(sz * 0.5, sz * 0.8);\n");
        s.push_str("    let r = 0.5 * (b.x + b.y);\n");
        s.push_str("    let d = length(q - vec2<f32>(0.0, r * 0.5)) - r;\n");
        s.push_str("    let a = atan2(q.x, q.y - r * 0.5);\n");
        s.push_str("    let h = sz * (0.5 + 0.3 * cos(a));\n");
        s.push_str("    return length(q - vec2<f32>(0.0, r * 0.5)) - h;\n");
        s.push_str("}\n\n");
    }

    if needs_egg {
        s.push_str("fn sdf_egg(p: vec2<f32>, ra: f32, rb: f32) -> f32 {\n");
        s.push_str("    let q = vec2<f32>(abs(p.x), p.y);\n");
        s.push_str("    let r = ra - rb;\n");
        s.push_str("    let k = select(length(q), length(q + vec2<f32>(0.0, rb)), q.y < 0.0);\n");
        s.push_str("    return k - ra;\n");
        s.push_str("}\n\n");
    }
}

fn emit_wgsl_star(s: &mut String) {
    s.push_str("fn sdf_star(p: vec2<f32>, n: f32, r: f32, ir: f32) -> f32 {\n");
    s.push_str("    let an = 3.14159265 / n;\n");
    s.push_str("    let a = atan2(p.y, p.x);\n");
    s.push_str("    let period = 2.0 * an;\n");
    s.push_str("    let sa = (a + an) - floor((a + an) / period) * period - an;\n");
    s.push_str("    let q = length(p) * vec2<f32>(cos(sa), abs(sin(sa)));\n");
    s.push_str("    let tip = vec2<f32>(r, 0.0);\n");
    s.push_str("    let valley = vec2<f32>(ir * cos(an), ir * sin(an));\n");
    s.push_str("    let e = tip - valley;\n");
    s.push_str("    let d = q - valley;\n");
    s.push_str("    let t = clamp(dot(d, e) / dot(e, e), 0.0, 1.0);\n");
    s.push_str("    let closest = valley + e * t;\n");
    s.push_str("    let dist = length(q - closest);\n");
    s.push_str("    let cross_val = d.x * e.y - d.y * e.x;\n");
    s.push_str("    return select(dist, -dist, cross_val > 0.0);\n");
    s.push_str("}\n\n");
}

fn emit_wgsl_fbm(s: &mut String) {
    s.push_str("fn hash2(p: vec2<f32>) -> f32 {\n");
    s.push_str("    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);\n");
    s.push_str("    p3 = p3 + vec3<f32>(dot(p3, p3.yzx + 33.33));\n");
    s.push_str("    return fract((p3.x + p3.y) * p3.z);\n");
    s.push_str("}\n\n");

    s.push_str("fn noise2(p: vec2<f32>) -> f32 {\n");
    s.push_str("    let i = floor(p);\n");
    s.push_str("    let f = fract(p);\n");
    s.push_str("    let u_v = f * f * (3.0 - 2.0 * f);\n");
    s.push_str("    return mix(\n");
    s.push_str("        mix(hash2(i), hash2(i + vec2<f32>(1.0, 0.0)), u_v.x),\n");
    s.push_str(
        "        mix(hash2(i + vec2<f32>(0.0, 1.0)), hash2(i + vec2<f32>(1.0, 1.0)), u_v.x),\n",
    );
    s.push_str("        u_v.y\n");
    s.push_str("    ) * 2.0 - 1.0;\n");
    s.push_str("}\n\n");

    s.push_str("fn fbm2(p: vec2<f32>, octaves: i32, persistence: f32, lacunarity: f32) -> f32 {\n");
    s.push_str("    var value: f32 = 0.0;\n");
    s.push_str("    var amplitude: f32 = 1.0;\n");
    s.push_str("    var frequency: f32 = 1.0;\n");
    s.push_str("    var max_val: f32 = 0.0;\n");
    s.push_str("    for (var i: i32 = 0; i < octaves; i = i + 1) {\n");
    s.push_str("        value = value + noise2(p * frequency) * amplitude;\n");
    s.push_str("        max_val = max_val + amplitude;\n");
    s.push_str("        amplitude = amplitude * persistence;\n");
    s.push_str("        frequency = frequency * lacunarity;\n");
    s.push_str("    }\n");
    s.push_str("    return value / max_val;\n");
    s.push_str("}\n\n");
}

fn emit_wgsl_voronoi(s: &mut String) {
    s.push_str("fn hash2v(p: vec2<f32>) -> vec2<f32> {\n");
    s.push_str(
        "    let p3 = fract(vec3<f32>(p.x, p.y, p.x) * vec3<f32>(0.1031, 0.1030, 0.0973));\n",
    );
    s.push_str("    let pp = p3 + vec3<f32>(dot(p3, p3.yzx + 33.33));\n");
    s.push_str("    return fract(vec2<f32>((pp.x + pp.y) * pp.z, (pp.x + pp.z) * pp.y));\n");
    s.push_str("}\n\n");

    s.push_str("fn voronoi2(p: vec2<f32>) -> f32 {\n");
    s.push_str("    let n = floor(p);\n");
    s.push_str("    let f = fract(p);\n");
    s.push_str("    var md: f32 = 8.0;\n");
    s.push_str("    for (var j: i32 = -1; j <= 1; j = j + 1) {\n");
    s.push_str("        for (var i: i32 = -1; i <= 1; i = i + 1) {\n");
    s.push_str("            let g = vec2<f32>(f32(i), f32(j));\n");
    s.push_str("            let o = hash2v(n + g);\n");
    s.push_str("            let r = g + o - f;\n");
    s.push_str("            let d = dot(r, r);\n");
    s.push_str("            md = min(md, d);\n");
    s.push_str("        }\n");
    s.push_str("    }\n");
    s.push_str("    return sqrt(md);\n");
    s.push_str("}\n\n");
}

fn emit_wgsl_palette(s: &mut String) {
    s.push_str("fn cosine_palette(t: f32, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, d: vec3<f32>) -> vec3<f32> {\n");
    s.push_str("    return a + b * cos(6.28318 * (c * t + d));\n");
    s.push_str("}\n\n");
}

fn emit_wgsl_layer(s: &mut String, layer: &Layer, idx: usize, multi: bool) {
    let body = match &layer.body {
        LayerBody::Pipeline(stages) => stages,
        _ => return,
    };

    s.push_str(&format!("    // ── Layer {idx}: {} ──\n", layer.name));
    if multi {
        s.push_str("    {\n");
    }
    let indent = if multi { "        " } else { "    " };

    s.push_str(&format!(
        "{indent}var p = vec2<f32>(uv.x * aspect, uv.y);\n"
    ));

    for stage in body {
        emit_wgsl_stage(s, stage, indent);
    }

    // Memory: mix with previous frame if this layer has memory
    if let Some(decay) = layer.memory {
        memory::emit_wgsl_memory_mix(s, decay, indent);
    }

    if multi {
        // Apply opacity if specified
        if let Some(opacity) = layer.opacity {
            s.push_str(&format!(
                "{indent}let lc = color_result.rgb * {opacity:.6};\n"
            ));
        } else {
            s.push_str(&format!("{indent}let lc = color_result.rgb;\n"));
        }
        match layer.blend {
            BlendMode::Add => {
                s.push_str(&format!(
                    "{indent}final_color = vec4<f32>(final_color.rgb + lc, 1.0);\n"
                ));
            }
            BlendMode::Screen => {
                s.push_str(&format!(
                    "{indent}final_color = vec4<f32>(1.0 - (1.0 - final_color.rgb) * (1.0 - lc), 1.0);\n"
                ));
            }
            BlendMode::Multiply => {
                s.push_str(&format!(
                    "{indent}final_color = vec4<f32>(final_color.rgb * lc, 1.0);\n"
                ));
            }
            BlendMode::Overlay => {
                s.push_str(&format!("{indent}{{ let base = final_color.rgb;\n"));
                s.push_str(&format!("{indent}let lo = 2.0 * base * lc;\n"));
                s.push_str(&format!(
                    "{indent}let hi = 1.0 - 2.0 * (1.0 - base) * (1.0 - lc);\n"
                ));
                s.push_str(&format!(
                    "{indent}final_color = vec4<f32>(select(hi, lo, base < vec3<f32>(0.5)), 1.0); }}\n"
                ));
            }
        }
        s.push_str("    }\n\n");
    } else {
        s.push_str(&format!("{indent}return color_result;\n"));
    }
}

fn emit_wgsl_stage(s: &mut String, stage: &Stage, indent: &str) {
    let args = &stage.args;
    match stage.name.as_str() {
        "circle" => {
            let r = get_arg(args, "radius", 0, "circle");
            s.push_str(&format!("{indent}var sdf_result = sdf_circle(p, {r});\n"));
        }
        "ring" => {
            let r = get_arg(args, "radius", 0, "ring");
            let w = get_arg(args, "width", 1, "ring");
            s.push_str(&format!(
                "{indent}var sdf_result = abs(length(p) - {r}) - {w};\n"
            ));
        }
        "star" => {
            let n = get_arg(args, "points", 0, "star");
            let r = get_arg(args, "radius", 1, "star");
            let ir = get_arg(args, "inner", 2, "star");
            s.push_str(&format!(
                "{indent}var sdf_result = sdf_star(p, {n}, {r}, {ir});\n"
            ));
        }
        "box" => {
            let w = get_arg(args, "width", 0, "box");
            let h = get_arg(args, "height", 1, "box");
            s.push_str(&format!("{indent}var sdf_result = sdf_box(p, {w}, {h});\n"));
        }
        "hex" => {
            let r = get_arg(args, "radius", 0, "hex");
            s.push_str(&format!("{indent}var sdf_result = sdf_hex(p, {r});\n"));
        }
        "glow" => {
            let intensity = get_arg(args, "intensity", 0, "glow");
            s.push_str(&format!(
                "{indent}let glow_pulse = {intensity} * (0.9 + 0.1 * sin(time * 2.0));\n"
            ));
            s.push_str(&format!(
                "{indent}let glow_result = apply_glow(sdf_result, glow_pulse);\n"
            ));
            s.push_str(&format!(
                "{indent}var color_result = vec4<f32>(vec3<f32>(glow_result), 1.0);\n"
            ));
        }
        "tint" => {
            let r = get_arg(args, "r", 0, "tint");
            let g = get_arg(args, "g", 1, "tint");
            let b = get_arg(args, "b", 2, "tint");
            s.push_str(&format!("{indent}color_result = vec4<f32>(color_result.rgb * vec3<f32>({r}, {g}, {b}), 1.0);\n"));
        }
        "bloom" => {
            let thresh = get_arg(args, "threshold", 0, "bloom");
            let strength = get_arg(args, "strength", 1, "bloom");
            s.push_str(&format!(
                "{indent}let pp_lum = dot(color_result.rgb, vec3<f32>(0.299, 0.587, 0.114));\n"
            ));
            s.push_str(&format!("{indent}color_result = vec4<f32>(color_result.rgb + max(pp_lum - {thresh}, 0.0) * {strength}, 1.0);\n"));
        }
        "rotate" => {
            let speed = get_arg(args, "speed", 0, "rotate");
            s.push_str(&format!(
                "{indent}{{ let ra = time * {speed}; let rc = cos(ra); let rs = sin(ra);\n"
            ));
            s.push_str(&format!(
                "{indent}p = vec2<f32>(p.x * rc - p.y * rs, p.x * rs + p.y * rc); }}\n"
            ));
        }
        "translate" => {
            let x = get_arg(args, "x", 0, "translate");
            let y = get_arg(args, "y", 1, "translate");
            s.push_str(&format!("{indent}p = p - vec2<f32>({x}, {y});\n"));
        }
        "scale" => {
            let sc = get_arg(args, "s", 0, "scale");
            s.push_str(&format!("{indent}p = p / {sc};\n"));
        }
        "mask_arc" => {
            let angle = get_arg(args, "angle", 0, "mask_arc");
            s.push_str(&format!(
                "{indent}let arc_theta = atan2(p.x, p.y) + 3.14159265359;\n"
            ));
            s.push_str(&format!(
                "{indent}sdf_result = select(999.0, sdf_result, arc_theta < {angle});\n"
            ));
        }
        "shade" => {
            let r = get_arg(args, "r", 0, "shade");
            let g = get_arg(args, "g", 1, "shade");
            let b = get_arg(args, "b", 2, "shade");
            s.push_str(&format!("{indent}var color_result = vec4<f32>(vec3<f32>({r}, {g}, {b}) * (1.0 - clamp(sdf_result, 0.0, 1.0)), 1.0);\n"));
        }
        "emissive" => {
            let intensity = get_arg(args, "intensity", 0, "emissive");
            s.push_str(&format!(
                "{indent}let glow_result = apply_glow(sdf_result, {intensity});\n"
            ));
            s.push_str(&format!(
                "{indent}var color_result = vec4<f32>(vec3<f32>(glow_result), glow_result);\n"
            ));
        }
        "fbm" => {
            let sc = get_arg(args, "scale", 0, "fbm");
            let oct = get_arg(args, "octaves", 1, "fbm");
            let pers = get_arg(args, "persistence", 2, "fbm");
            let lac = get_arg(args, "lacunarity", 3, "fbm");
            s.push_str(&format!(
                "{indent}var sdf_result = fbm2((p * {sc} + vec2<f32>(time * 0.1, time * 0.07)), i32({oct}), {pers}, {lac});\n"
            ));
        }
        "grain" => {
            let amount = get_arg(args, "amount", 0, "grain");
            s.push_str(&format!("{indent}let grain_noise = fract(sin(dot(p, vec2<f32>(12.9898, 78.233)) + time) * 43758.5453);\n"));
            s.push_str(&format!("{indent}color_result = vec4<f32>(color_result.rgb + (grain_noise - 0.5) * {amount}, color_result.a);\n"));
        }
        "simplex" => {
            let sc = get_arg(args, "scale", 0, "simplex");
            s.push_str(&format!(
                "{indent}var sdf_result = noise2(p * {sc} + vec2<f32>(time * 0.1, time * 0.07));\n"
            ));
        }
        "warp" => {
            let sc = get_arg(args, "scale", 0, "warp");
            let oct = get_arg(args, "octaves", 1, "warp");
            let pers = get_arg(args, "persistence", 2, "warp");
            let lac = get_arg(args, "lacunarity", 3, "warp");
            let str_ = get_arg(args, "strength", 4, "warp");
            s.push_str(&format!(
                "{indent}{{ let warp_x = fbm2(p * {sc} + vec2<f32>(0.0, 1.3), i32({oct}), {pers}, {lac});\n"
            ));
            s.push_str(&format!(
                "{indent}let warp_y = fbm2(p * {sc} + vec2<f32>(1.7, 0.0), i32({oct}), {pers}, {lac});\n"
            ));
            s.push_str(&format!(
                "{indent}p = p + vec2<f32>(warp_x, warp_y) * {str_}; }}\n"
            ));
        }
        "distort" => {
            let sc = get_arg(args, "scale", 0, "distort");
            let speed = get_arg(args, "speed", 1, "distort");
            let str_ = get_arg(args, "strength", 2, "distort");
            s.push_str(&format!(
                "{indent}p = p + vec2<f32>(sin(p.y * {sc} + time * {speed}), cos(p.x * {sc} + time * {speed})) * {str_};\n"
            ));
        }
        "polar" => {
            s.push_str(&format!(
                "{indent}p = vec2<f32>(length(p), atan2(p.y, p.x));\n"
            ));
        }
        "voronoi" => {
            let sc = get_arg(args, "scale", 0, "voronoi");
            s.push_str(&format!("{indent}var sdf_result = voronoi2(p * {sc} + vec2<f32>(time * 0.05, time * 0.03));\n"));
        }
        "radial_fade" => {
            let inner = get_arg(args, "inner", 0, "radial_fade");
            let outer = get_arg(args, "outer", 1, "radial_fade");
            s.push_str(&format!(
                "{indent}let sdf_result = smoothstep({inner}, {outer}, length(p));\n"
            ));
        }
        "palette" => {
            let a_r = get_arg(args, "a_r", 0, "palette");
            let a_g = get_arg(args, "a_g", 1, "palette");
            let a_b = get_arg(args, "a_b", 2, "palette");
            let b_r = get_arg(args, "b_r", 3, "palette");
            let b_g = get_arg(args, "b_g", 4, "palette");
            let b_b = get_arg(args, "b_b", 5, "palette");
            let c_r = get_arg(args, "c_r", 6, "palette");
            let c_g = get_arg(args, "c_g", 7, "palette");
            let c_b = get_arg(args, "c_b", 8, "palette");
            let d_r = get_arg(args, "d_r", 9, "palette");
            let d_g = get_arg(args, "d_g", 10, "palette");
            let d_b = get_arg(args, "d_b", 11, "palette");
            s.push_str(&format!(
                "{indent}var color_result = vec4<f32>(cosine_palette(sdf_result, vec3<f32>({a_r}, {a_g}, {a_b}), vec3<f32>({b_r}, {b_g}, {b_b}), vec3<f32>({c_r}, {c_g}, {c_b}), vec3<f32>({d_r}, {d_g}, {d_b})), 1.0);\n"
            ));
        }
        // ── SDF Boolean operations ──────────────────────
        "union" | "subtract" | "intersect" | "xor" => {
            emit_wgsl_bool_op(s, stage, indent);
        }
        "smooth_union" | "smooth_subtract" | "smooth_intersect" => {
            emit_wgsl_smooth_bool_op(s, stage, indent);
        }
        // ── Spatial operations ──────────────────────────
        "repeat" => {
            let sx = get_arg(args, "spacing_x", 0, "repeat");
            let sy = get_arg(args, "spacing_y", 1, "repeat");
            s.push_str(&format!(
                "{indent}p = vec2<f32>(game_mod(p.x + {sx} * 0.5, {sx}) - {sx} * 0.5, game_mod(p.y + {sy} * 0.5, {sy}) - {sy} * 0.5);\n"
            ));
        }
        "mirror" => {
            s.push_str(&format!("{indent}p = vec2<f32>(abs(p.x), p.y);\n"));
        }
        "radial" => {
            let count = get_arg(args, "count", 0, "radial");
            s.push_str(&format!("{indent}{{ let r_angle = atan2(p.y, p.x);\n"));
            s.push_str(&format!(
                "{indent}let r_sector = 6.28318 / {count};\n"
            ));
            s.push_str(&format!(
                "{indent}let r_a = game_mod(r_angle + r_sector * 0.5, r_sector) - r_sector * 0.5;\n"
            ));
            s.push_str(&format!("{indent}let r_r = length(p);\n"));
            s.push_str(&format!(
                "{indent}p = vec2<f32>(r_r * cos(r_a), r_r * sin(r_a)); }}\n"
            ));
        }
        // ── Shape modifiers ─────────────────────────────
        "round" => {
            let r = get_arg(args, "radius", 0, "round");
            s.push_str(&format!("{indent}sdf_result = sdf_result - {r};\n"));
        }
        "shell" => {
            let w = get_arg(args, "width", 0, "shell");
            s.push_str(&format!("{indent}sdf_result = abs(sdf_result) - {w};\n"));
        }
        "onion" => {
            let count = get_arg(args, "count", 0, "onion");
            let w = get_arg(args, "width", 1, "onion");
            s.push_str(&format!(
                "{indent}for (var onion_i: i32 = 0; onion_i < i32({count}); onion_i = onion_i + 1) {{ sdf_result = abs(sdf_result) - {w}; }}\n"
            ));
        }
        "outline" => {
            let w = get_arg(args, "width", 0, "outline");
            // outline is Color->Color: use the sdf approach on the color's luminance
            s.push_str(&format!("{indent}{{ let out_lum = dot(color_result.rgb, vec3<f32>(0.299, 0.587, 0.114));\n"));
            s.push_str(&format!("{indent}let out_edge = abs(out_lum) - {w};\n"));
            s.push_str(&format!("{indent}color_result = vec4<f32>(color_result.rgb * (1.0 - smoothstep(0.0, 0.02, out_edge)), 1.0); }}\n"));
        }
        // ── New SDF primitives ──────────────────────────
        "line" => {
            let x1 = get_arg(args, "x1", 0, "line");
            let y1 = get_arg(args, "y1", 1, "line");
            let x2 = get_arg(args, "x2", 2, "line");
            let y2 = get_arg(args, "y2", 3, "line");
            let w = get_arg(args, "width", 4, "line");
            s.push_str(&format!(
                "{indent}var sdf_result = sdf_line(p, vec2<f32>({x1}, {y1}), vec2<f32>({x2}, {y2})) - {w};\n"
            ));
        }
        "capsule" => {
            let len = get_arg(args, "length", 0, "capsule");
            let r = get_arg(args, "radius", 1, "capsule");
            s.push_str(&format!(
                "{indent}var sdf_result = sdf_line(p, vec2<f32>(-{len} * 0.5, 0.0), vec2<f32>({len} * 0.5, 0.0)) - {r};\n"
            ));
        }
        "triangle" => {
            let sz = get_arg(args, "size", 0, "triangle");
            s.push_str(&format!(
                "{indent}var sdf_result = sdf_triangle(p, {sz});\n"
            ));
        }
        "arc_sdf" => {
            let r = get_arg(args, "radius", 0, "arc_sdf");
            let angle = get_arg(args, "angle", 1, "arc_sdf");
            let w = get_arg(args, "width", 2, "arc_sdf");
            s.push_str(&format!(
                "{indent}var sdf_result = sdf_arc(p, {r}, {angle}, {w});\n"
            ));
        }
        "cross" => {
            let sz = get_arg(args, "size", 0, "cross");
            let aw = get_arg(args, "arm_width", 1, "cross");
            s.push_str(&format!(
                "{indent}var sdf_result = min(sdf_box(p, {sz}, {aw}), sdf_box(p, {aw}, {sz}));\n"
            ));
        }
        "heart" => {
            let sz = get_arg(args, "size", 0, "heart");
            s.push_str(&format!("{indent}var sdf_result = sdf_heart(p, {sz});\n"));
        }
        "egg" => {
            let r = get_arg(args, "radius", 0, "egg");
            let k = get_arg(args, "k", 1, "egg");
            s.push_str(&format!("{indent}var sdf_result = sdf_egg(p, {r}, {k});\n"));
        }
        "spiral" => {
            let turns = get_arg(args, "turns", 0, "spiral");
            let w = get_arg(args, "width", 1, "spiral");
            s.push_str(&format!("{indent}let sp_r = length(p);\n"));
            s.push_str(&format!("{indent}let sp_a = atan2(p.y, p.x);\n"));
            s.push_str(&format!("{indent}let sp_d = sp_r - (sp_a + 3.14159265) / 6.28318 / {turns};\n"));
            s.push_str(&format!("{indent}var sdf_result = abs(sp_d - floor(sp_d + 0.5)) - {w};\n"));
        }
        "grid" => {
            let spacing = get_arg(args, "spacing", 0, "grid");
            let w = get_arg(args, "width", 1, "grid");
            s.push_str(&format!("{indent}let gx = abs(game_mod(p.x + {spacing} * 0.5, {spacing}) - {spacing} * 0.5) - {w};\n"));
            s.push_str(&format!("{indent}let gy = abs(game_mod(p.y + {spacing} * 0.5, {spacing}) - {spacing} * 0.5) - {w};\n"));
            s.push_str(&format!("{indent}var sdf_result = min(gx, gy);\n"));
        }
        _ => {
            s.push_str(&format!("{indent}// Unknown stage: {}\n", stage.name));
        }
    }
}

/// Emit WGSL code for a sub-expression SDF call (used by boolean ops).
fn emit_wgsl_sub_sdf(s: &mut String, expr: &Expr, var_name: &str, indent: &str) {
    if let Expr::Call { name, args } = expr {
        let sub_args: Vec<crate::ast::Arg> = args.clone();
        match name.as_str() {
            "circle" => {
                let r = get_arg(&sub_args, "radius", 0, "circle");
                s.push_str(&format!("{indent}let {var_name} = sdf_circle(p, {r});\n"));
            }
            "ring" => {
                let r = get_arg(&sub_args, "radius", 0, "ring");
                let w = get_arg(&sub_args, "width", 1, "ring");
                s.push_str(&format!(
                    "{indent}let {var_name} = abs(length(p) - {r}) - {w};\n"
                ));
            }
            "star" => {
                let n = get_arg(&sub_args, "points", 0, "star");
                let r = get_arg(&sub_args, "radius", 1, "star");
                let ir = get_arg(&sub_args, "inner", 2, "star");
                s.push_str(&format!(
                    "{indent}let {var_name} = sdf_star(p, {n}, {r}, {ir});\n"
                ));
            }
            "box" => {
                let w = get_arg(&sub_args, "width", 0, "box");
                let h = get_arg(&sub_args, "height", 1, "box");
                s.push_str(&format!(
                    "{indent}let {var_name} = sdf_box(p, {w}, {h});\n"
                ));
            }
            "hex" => {
                let r = get_arg(&sub_args, "radius", 0, "hex");
                s.push_str(&format!(
                    "{indent}let {var_name} = sdf_hex(p, {r});\n"
                ));
            }
            "line" => {
                let x1 = get_arg(&sub_args, "x1", 0, "line");
                let y1 = get_arg(&sub_args, "y1", 1, "line");
                let x2 = get_arg(&sub_args, "x2", 2, "line");
                let y2 = get_arg(&sub_args, "y2", 3, "line");
                let w = get_arg(&sub_args, "width", 4, "line");
                s.push_str(&format!(
                    "{indent}let {var_name} = sdf_line(p, vec2<f32>({x1}, {y1}), vec2<f32>({x2}, {y2})) - {w};\n"
                ));
            }
            "capsule" => {
                let len = get_arg(&sub_args, "length", 0, "capsule");
                let r = get_arg(&sub_args, "radius", 1, "capsule");
                s.push_str(&format!(
                    "{indent}let {var_name} = sdf_line(p, vec2<f32>(-{len} * 0.5, 0.0), vec2<f32>({len} * 0.5, 0.0)) - {r};\n"
                ));
            }
            "triangle" => {
                let sz = get_arg(&sub_args, "size", 0, "triangle");
                s.push_str(&format!(
                    "{indent}let {var_name} = sdf_triangle(p, {sz});\n"
                ));
            }
            "heart" => {
                let sz = get_arg(&sub_args, "size", 0, "heart");
                s.push_str(&format!(
                    "{indent}let {var_name} = sdf_heart(p, {sz});\n"
                ));
            }
            "egg" => {
                let r = get_arg(&sub_args, "radius", 0, "egg");
                let k = get_arg(&sub_args, "k", 1, "egg");
                s.push_str(&format!(
                    "{indent}let {var_name} = sdf_egg(p, {r}, {k});\n"
                ));
            }
            _ => {
                s.push_str(&format!(
                    "{indent}let {var_name} = length(p) - 0.2; // fallback\n"
                ));
            }
        }
    }
}

/// Emit WGSL code for a boolean SDF operation (union, subtract, intersect, xor).
fn emit_wgsl_bool_op(s: &mut String, stage: &Stage, indent: &str) {
    let args = &stage.args;
    if args.len() < 2 {
        s.push_str(&format!("{indent}var sdf_result = length(p) - 0.2;\n"));
        return;
    }
    emit_wgsl_sub_sdf(s, &args[0].value, "sdf_a", indent);
    emit_wgsl_sub_sdf(s, &args[1].value, "sdf_b", indent);
    let op = match stage.name.as_str() {
        "union" => "min(sdf_a, sdf_b)",
        "subtract" => "max(sdf_a, -sdf_b)",
        "intersect" => "max(sdf_a, sdf_b)",
        "xor" => "max(min(sdf_a, sdf_b), -max(sdf_a, sdf_b))",
        _ => "min(sdf_a, sdf_b)",
    };
    s.push_str(&format!("{indent}var sdf_result = {op};\n"));
}

/// Emit WGSL code for a smooth boolean SDF operation.
fn emit_wgsl_smooth_bool_op(s: &mut String, stage: &Stage, indent: &str) {
    let args = &stage.args;
    if args.len() < 2 {
        s.push_str(&format!("{indent}var sdf_result = length(p) - 0.2;\n"));
        return;
    }
    emit_wgsl_sub_sdf(s, &args[0].value, "sdf_a", indent);
    emit_wgsl_sub_sdf(s, &args[1].value, "sdf_b", indent);
    let k = if args.len() >= 3 {
        get_arg(args, "k", 2, &stage.name)
    } else {
        "0.100000".into()
    };
    let op = match stage.name.as_str() {
        "smooth_union" => format!("smin(sdf_a, sdf_b, {k})"),
        "smooth_subtract" => format!("-smin(-sdf_a, sdf_b, {k})"),
        "smooth_intersect" => format!("-smin(-sdf_a, -sdf_b, {k})"),
        _ => format!("smin(sdf_a, sdf_b, {k})"),
    };
    s.push_str(&format!("{indent}var sdf_result = {op};\n"));
}

fn has_stage(layer: &Layer, name: &str) -> bool {
    match &layer.body {
        LayerBody::Pipeline(stages) => stages.iter().any(|s| {
            if s.name == name {
                return true;
            }
            // Check inside boolean op sub-expression args
            s.args.iter().any(|a| has_stage_in_expr(&a.value, name))
        }),
        _ => false,
    }
}

/// Recursively check if an expression tree references a stage by name.
fn has_stage_in_expr(expr: &Expr, name: &str) -> bool {
    match expr {
        Expr::Call { name: call_name, args } => {
            if call_name == name {
                return true;
            }
            args.iter().any(|a| has_stage_in_expr(&a.value, name))
        }
        _ => false,
    }
}

/// Generate the standard WGSL vertex shader.
pub fn vertex_shader() -> &'static str {
    r#"struct VertexOutput {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );
    var out: VertexOutput;
    out.pos = vec4<f32>(positions[vid], 0.0, 1.0);
    out.uv = positions[vid] * 0.5 + 0.5;
    return out;
}
"#
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_cinematic(stages: Vec<Stage>) -> Cinematic {
        Cinematic {
            name: "test".into(),
            layers: vec![Layer {
                name: "main".into(),
                opts: vec![],
                memory: None,
                opacity: None,
                cast: None,
                blend: BlendMode::Add,
                body: LayerBody::Pipeline(stages),
            }],
            arcs: vec![],
            resonates: vec![],
            listen: None,
            voice: None,
            score: None,
            gravity: None,
            react: None,
            swarm: None,
            flow: None,
        }
    }

    #[test]
    fn basic_wgsl_output() {
        let cin = make_cinematic(vec![
            Stage {
                name: "circle".into(),
                args: vec![Arg {
                    name: None,
                    value: Expr::Number(0.2),
                }],
            },
            Stage {
                name: "glow".into(),
                args: vec![Arg {
                    name: None,
                    value: Expr::Number(1.5),
                }],
            },
            Stage {
                name: "tint".into(),
                args: vec![
                    Arg {
                        name: None,
                        value: Expr::Number(0.831),
                    },
                    Arg {
                        name: None,
                        value: Expr::Number(0.686),
                    },
                    Arg {
                        name: None,
                        value: Expr::Number(0.216),
                    },
                ],
            },
        ]);
        let output = generate_fragment(&cin, &[]);
        assert!(output.contains("fn fs_main"));
        assert!(output.contains("sdf_circle"));
        assert!(output.contains("apply_glow"));
        assert!(output.contains("color_result.rgb * vec3<f32>"));
        assert!(output.contains("return color_result"));
    }

    #[test]
    fn wgsl_vertex_shader_valid() {
        let vs = vertex_shader();
        assert!(vs.contains("fn vs_main"));
        assert!(vs.contains("@vertex"));
    }

    #[test]
    fn wgsl_warp_voronoi_palette_pipeline() {
        let cin = make_cinematic(vec![
            Stage {
                name: "warp".into(),
                args: vec![],
            },
            Stage {
                name: "voronoi".into(),
                args: vec![],
            },
            Stage {
                name: "palette".into(),
                args: vec![],
            },
        ]);
        let output = generate_fragment(&cin, &[]);
        assert!(output.contains("fn voronoi2"), "voronoi helper emitted");
        assert!(
            output.contains("fn cosine_palette"),
            "palette helper emitted"
        );
        assert!(output.contains("fn fbm2"), "fbm helper emitted for warp");
        assert!(output.contains("warp_x"), "warp displacement x");
        assert!(output.contains("voronoi2(p *"), "voronoi stage call");
        assert!(
            output.contains("cosine_palette(sdf_result"),
            "palette stage call"
        );
    }

    #[test]
    fn wgsl_distort_radial_fade_glow() {
        let cin = make_cinematic(vec![
            Stage {
                name: "distort".into(),
                args: vec![],
            },
            Stage {
                name: "radial_fade".into(),
                args: vec![],
            },
            Stage {
                name: "glow".into(),
                args: vec![],
            },
        ]);
        let output = generate_fragment(&cin, &[]);
        assert!(output.contains("sin(p.y *"), "distort sin displacement");
        assert!(output.contains("cos(p.x *"), "distort cos displacement");
        assert!(output.contains("smoothstep("), "radial_fade smoothstep");
    }

    #[test]
    fn wgsl_polar_simplex() {
        let cin = make_cinematic(vec![
            Stage {
                name: "polar".into(),
                args: vec![],
            },
            Stage {
                name: "simplex".into(),
                args: vec![],
            },
            Stage {
                name: "glow".into(),
                args: vec![],
            },
        ]);
        let output = generate_fragment(&cin, &[]);
        assert!(output.contains("atan2(p.y, p.x)"), "polar transform");
        assert!(output.contains("noise2(p *"), "simplex noise");
        assert!(output.contains("fn noise2"), "noise2 helper emitted");
    }

    fn make_multi_layer(layers: Vec<Layer>) -> Cinematic {
        Cinematic {
            name: "test".into(),
            layers,
            arcs: vec![],
            resonates: vec![],
            listen: None,
            voice: None,
            score: None,
            gravity: None,
            react: None,
            swarm: None,
            flow: None,
        }
    }

    #[test]
    fn wgsl_screen_blend_emits_formula() {
        let cin = make_multi_layer(vec![
            Layer {
                name: "bg".into(),
                opts: vec![],
                memory: None,
                opacity: None,
                cast: None,
                blend: BlendMode::Add,
                body: LayerBody::Pipeline(vec![Stage {
                    name: "circle".into(),
                    args: vec![],
                }]),
            },
            Layer {
                name: "fx".into(),
                opts: vec![],
                memory: None,
                opacity: None,
                cast: None,
                blend: BlendMode::Screen,
                body: LayerBody::Pipeline(vec![Stage {
                    name: "circle".into(),
                    args: vec![],
                }]),
            },
        ]);
        let output = generate_fragment(&cin, &[]);
        assert!(
            output.contains("1.0 - (1.0 - "),
            "screen blend formula: {output}"
        );
    }

    #[test]
    fn wgsl_multiply_blend_emits_formula() {
        let cin = make_multi_layer(vec![
            Layer {
                name: "bg".into(),
                opts: vec![],
                memory: None,
                opacity: None,
                cast: None,
                blend: BlendMode::Add,
                body: LayerBody::Pipeline(vec![Stage {
                    name: "circle".into(),
                    args: vec![],
                }]),
            },
            Layer {
                name: "fx".into(),
                opts: vec![],
                memory: None,
                opacity: None,
                cast: None,
                blend: BlendMode::Multiply,
                body: LayerBody::Pipeline(vec![Stage {
                    name: "circle".into(),
                    args: vec![],
                }]),
            },
        ]);
        let output = generate_fragment(&cin, &[]);
        assert!(
            output.contains("final_color.rgb * lc"),
            "multiply blend formula: {output}"
        );
    }

    #[test]
    fn wgsl_overlay_blend_emits_select() {
        let cin = make_multi_layer(vec![
            Layer {
                name: "bg".into(),
                opts: vec![],
                memory: None,
                opacity: None,
                cast: None,
                blend: BlendMode::Add,
                body: LayerBody::Pipeline(vec![Stage {
                    name: "circle".into(),
                    args: vec![],
                }]),
            },
            Layer {
                name: "fx".into(),
                opts: vec![],
                memory: None,
                opacity: None,
                cast: None,
                blend: BlendMode::Overlay,
                body: LayerBody::Pipeline(vec![Stage {
                    name: "circle".into(),
                    args: vec![],
                }]),
            },
        ]);
        let output = generate_fragment(&cin, &[]);
        assert!(
            output.contains("select("),
            "overlay blend uses select: {output}"
        );
    }

    #[test]
    fn wgsl_union_emits_min() {
        let cin = make_cinematic(vec![
            Stage {
                name: "union".into(),
                args: vec![
                    Arg {
                        name: None,
                        value: Expr::Call {
                            name: "circle".into(),
                            args: vec![Arg {
                                name: None,
                                value: Expr::Number(0.3),
                            }],
                        },
                    },
                    Arg {
                        name: None,
                        value: Expr::Call {
                            name: "box".into(),
                            args: vec![
                                Arg {
                                    name: None,
                                    value: Expr::Number(0.2),
                                },
                                Arg {
                                    name: None,
                                    value: Expr::Number(0.4),
                                },
                            ],
                        },
                    },
                ],
            },
            Stage {
                name: "glow".into(),
                args: vec![],
            },
        ]);
        let output = generate_fragment(&cin, &[]);
        assert!(output.contains("sdf_circle"), "emits circle sub-sdf");
        assert!(output.contains("sdf_box"), "emits box sub-sdf");
        assert!(output.contains("min(sdf_a, sdf_b)"), "union = min");
    }

    #[test]
    fn wgsl_smooth_union_emits_smin() {
        let cin = make_cinematic(vec![
            Stage {
                name: "smooth_union".into(),
                args: vec![
                    Arg {
                        name: None,
                        value: Expr::Call {
                            name: "circle".into(),
                            args: vec![Arg {
                                name: None,
                                value: Expr::Number(0.3),
                            }],
                        },
                    },
                    Arg {
                        name: None,
                        value: Expr::Call {
                            name: "box".into(),
                            args: vec![
                                Arg {
                                    name: None,
                                    value: Expr::Number(0.2),
                                },
                                Arg {
                                    name: None,
                                    value: Expr::Number(0.4),
                                },
                            ],
                        },
                    },
                    Arg {
                        name: None,
                        value: Expr::Number(0.1),
                    },
                ],
            },
            Stage {
                name: "glow".into(),
                args: vec![],
            },
        ]);
        let output = generate_fragment(&cin, &[]);
        assert!(output.contains("fn smin("), "smin helper emitted");
        assert!(output.contains("smin(sdf_a, sdf_b,"), "smooth union uses smin");
    }

    #[test]
    fn wgsl_repeat_emits_game_mod() {
        let cin = make_cinematic(vec![
            Stage {
                name: "repeat".into(),
                args: vec![
                    Arg {
                        name: None,
                        value: Expr::Number(0.5),
                    },
                    Arg {
                        name: None,
                        value: Expr::Number(0.5),
                    },
                ],
            },
            Stage {
                name: "circle".into(),
                args: vec![],
            },
            Stage {
                name: "glow".into(),
                args: vec![],
            },
        ]);
        let output = generate_fragment(&cin, &[]);
        assert!(output.contains("fn game_mod("), "game_mod helper emitted");
        assert!(output.contains("game_mod(p.x"), "repeat uses game_mod");
    }

    #[test]
    fn wgsl_mirror_emits_abs() {
        let cin = make_cinematic(vec![
            Stage {
                name: "mirror".into(),
                args: vec![],
            },
            Stage {
                name: "circle".into(),
                args: vec![],
            },
            Stage {
                name: "glow".into(),
                args: vec![],
            },
        ]);
        let output = generate_fragment(&cin, &[]);
        assert!(output.contains("abs(p.x)"), "mirror uses abs(p.x)");
    }

    #[test]
    fn wgsl_round_shell_onion() {
        let cin = make_cinematic(vec![
            Stage {
                name: "circle".into(),
                args: vec![],
            },
            Stage {
                name: "round".into(),
                args: vec![Arg {
                    name: None,
                    value: Expr::Number(0.02),
                }],
            },
            Stage {
                name: "glow".into(),
                args: vec![],
            },
        ]);
        let output = generate_fragment(&cin, &[]);
        assert!(output.contains("sdf_result = sdf_result -"), "round subtracts radius");

        let cin2 = make_cinematic(vec![
            Stage {
                name: "circle".into(),
                args: vec![],
            },
            Stage {
                name: "shell".into(),
                args: vec![],
            },
            Stage {
                name: "glow".into(),
                args: vec![],
            },
        ]);
        let output2 = generate_fragment(&cin2, &[]);
        assert!(output2.contains("abs(sdf_result)"), "shell uses abs");

        let cin3 = make_cinematic(vec![
            Stage {
                name: "circle".into(),
                args: vec![],
            },
            Stage {
                name: "onion".into(),
                args: vec![],
            },
            Stage {
                name: "glow".into(),
                args: vec![],
            },
        ]);
        let output3 = generate_fragment(&cin3, &[]);
        assert!(output3.contains("for (var onion_i"), "onion uses loop");
    }

    #[test]
    fn wgsl_new_primitives_emit_helpers() {
        let cin = make_cinematic(vec![
            Stage {
                name: "line".into(),
                args: vec![],
            },
            Stage {
                name: "glow".into(),
                args: vec![],
            },
        ]);
        let output = generate_fragment(&cin, &[]);
        assert!(output.contains("fn sdf_line("), "sdf_line helper emitted");
        assert!(output.contains("sdf_line(p,"), "line stage uses sdf_line");

        let cin2 = make_cinematic(vec![
            Stage {
                name: "triangle".into(),
                args: vec![],
            },
            Stage {
                name: "glow".into(),
                args: vec![],
            },
        ]);
        let output2 = generate_fragment(&cin2, &[]);
        assert!(output2.contains("fn sdf_triangle("), "triangle helper emitted");

        let cin3 = make_cinematic(vec![
            Stage {
                name: "heart".into(),
                args: vec![],
            },
            Stage {
                name: "glow".into(),
                args: vec![],
            },
        ]);
        let output3 = generate_fragment(&cin3, &[]);
        assert!(output3.contains("fn sdf_heart("), "heart helper emitted");

        let cin4 = make_cinematic(vec![
            Stage {
                name: "grid".into(),
                args: vec![],
            },
            Stage {
                name: "glow".into(),
                args: vec![],
            },
        ]);
        let output4 = generate_fragment(&cin4, &[]);
        assert!(output4.contains("game_mod(p.x"), "grid uses game_mod");
    }

    #[test]
    fn wgsl_subtract_emits_max_neg() {
        let cin = make_cinematic(vec![
            Stage {
                name: "subtract".into(),
                args: vec![
                    Arg {
                        name: None,
                        value: Expr::Call {
                            name: "circle".into(),
                            args: vec![Arg {
                                name: None,
                                value: Expr::Number(0.4),
                            }],
                        },
                    },
                    Arg {
                        name: None,
                        value: Expr::Call {
                            name: "circle".into(),
                            args: vec![Arg {
                                name: None,
                                value: Expr::Number(0.2),
                            }],
                        },
                    },
                ],
            },
            Stage {
                name: "glow".into(),
                args: vec![],
            },
        ]);
        let output = generate_fragment(&cin, &[]);
        assert!(output.contains("max(sdf_a, -sdf_b)"), "subtract = max(a, -b)");
    }
}
