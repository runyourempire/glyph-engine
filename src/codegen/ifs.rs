//! IFS (Iterated Function Systems) codegen — fractal generation via affine transforms.
//!
//! Generates WebGPU compute shaders that run the chaos game algorithm:
//! randomly select a weighted transform, apply affine matrix, accumulate
//! into a histogram texture. Fragment shader reads histogram for display.
//!
//! ```game
//! cinematic "fern" {
//!   ifs {
//!     transform leaf:   [0.85, 0.04, -0.04, 0.85, 0.0, 1.6]   weight: 0.85
//!     transform stem:   [0.20, -0.26, 0.23, 0.22, 0.0, 1.6]   weight: 0.07
//!     iterations: 100000
//!   }
//! }
//! ```

use crate::ast::IfsBlock;

/// Generate WGSL compute shader for IFS chaos game.
pub fn generate_compute_wgsl(ifs: &IfsBlock) -> String {
    let mut s = String::with_capacity(2048);

    s.push_str("// IFS Compute Shader — chaos game fractal generation\n\n");

    // Bindings
    s.push_str("struct IfsParams {\n");
    s.push_str("    time: f32,\n");
    s.push_str("    width: f32,\n");
    s.push_str("    height: f32,\n");
    s.push_str("    iterations: u32,\n");
    s.push_str("};\n\n");

    s.push_str("@group(0) @binding(0) var<uniform> params: IfsParams;\n");
    s.push_str("@group(0) @binding(1) var<storage, read_write> histogram: array<atomic<u32>>;\n");
    s.push_str("@group(0) @binding(2) var<storage, read_write> rng_state: array<u32>;\n\n");

    // PCG random function
    s.push_str("fn pcg_hash(state: ptr<function, u32>) -> u32 {\n");
    s.push_str("    let s = *state;\n");
    s.push_str("    *state = s * 747796405u + 2891336453u;\n");
    s.push_str("    let word = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;\n");
    s.push_str("    return (word >> 22u) ^ word;\n");
    s.push_str("}\n\n");

    s.push_str("fn random_f32(state: ptr<function, u32>) -> f32 {\n");
    s.push_str("    return f32(pcg_hash(state)) / 4294967295.0;\n");
    s.push_str("}\n\n");

    // Affine transform application
    s.push_str("fn apply_affine(p: vec2<f32>, m: array<f32, 6>) -> vec2<f32> {\n");
    s.push_str("    return vec2<f32>(\n");
    s.push_str("        m[0] * p.x + m[1] * p.y + m[4],\n");
    s.push_str("        m[2] * p.x + m[3] * p.y + m[5]\n");
    s.push_str("    );\n");
    s.push_str("}\n\n");

    // Transforms as constants
    let n_transforms = ifs.transforms.len();
    for (i, t) in ifs.transforms.iter().enumerate() {
        s.push_str(&format!(
            "const T{i}: array<f32, 6> = array<f32, 6>({:.6}, {:.6}, {:.6}, {:.6}, {:.6}, {:.6});\n",
            t.matrix[0], t.matrix[1], t.matrix[2], t.matrix[3], t.matrix[4], t.matrix[5]
        ));
    }

    // Cumulative weights
    let total_weight: f64 = ifs.transforms.iter().map(|t| t.weight).sum();
    s.push_str(&format!(
        "\nconst WEIGHTS: array<f32, {}> = array<f32, {}>(",
        n_transforms, n_transforms
    ));
    let mut cum = 0.0;
    for (i, t) in ifs.transforms.iter().enumerate() {
        cum += t.weight / total_weight;
        s.push_str(&format!("{:.6}", cum));
        if i < n_transforms - 1 {
            s.push_str(", ");
        }
    }
    s.push_str(");\n\n");

    // Main compute kernel
    let steps_per_dispatch = 256;
    s.push_str(&format!(
        "@compute @workgroup_size(256)\nfn ifs_step(@builtin(global_invocation_id) id: vec3<u32>) {{\n"
    ));
    s.push_str("    var seed = rng_state[id.x];\n");
    s.push_str("    var pos = vec2<f32>(random_f32(&seed) - 0.5, random_f32(&seed) - 0.5);\n\n");

    s.push_str(&format!(
        "    for (var i = 0u; i < {}u; i++) {{\n",
        steps_per_dispatch
    ));
    s.push_str("        let r = random_f32(&seed);\n");

    // Select transform by cumulative weight
    for i in 0..n_transforms {
        if i == 0 {
            s.push_str(&format!(
                "        if (r < WEIGHTS[0]) {{ pos = apply_affine(pos, T0); }}\n"
            ));
        } else if i == n_transforms - 1 {
            s.push_str(&format!(
                "        else {{ pos = apply_affine(pos, T{i}); }}\n"
            ));
        } else {
            s.push_str(&format!(
                "        else if (r < WEIGHTS[{i}]) {{ pos = apply_affine(pos, T{i}); }}\n"
            ));
        }
    }

    // Map to pixel coordinates and accumulate
    s.push_str("\n        // Map to texture coordinates\n");
    s.push_str("        let px = i32((pos.x + 3.0) / 6.0 * params.width);\n");
    s.push_str("        let py = i32((pos.y + 0.5) / 12.0 * params.height);\n");
    s.push_str(
        "        if (px >= 0 && px < i32(params.width) && py >= 0 && py < i32(params.height)) {\n",
    );
    s.push_str("            let idx = u32(py) * u32(params.width) + u32(px);\n");
    s.push_str("            atomicAdd(&histogram[idx], 1u);\n");
    s.push_str("        }\n");
    s.push_str("    }\n\n");

    s.push_str("    rng_state[id.x] = seed;\n");
    s.push_str("}\n");

    s
}

/// Generate JS runtime class for IFS fractal rendering.
pub fn generate_runtime_js(ifs: &IfsBlock, width: u32, height: u32) -> String {
    let mut s = String::with_capacity(1024);

    s.push_str("class GameIfsFractal {\n");
    s.push_str(&format!("  constructor() {{\n"));
    s.push_str(&format!("    this.width = {};\n", width));
    s.push_str(&format!("    this.height = {};\n", height));
    s.push_str(&format!("    this.iterations = {};\n", ifs.iterations));
    s.push_str(&format!(
        "    this.transforms = {};\n",
        ifs.transforms.len()
    ));
    s.push_str("  }\n");
    s.push_str("}\n");

    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::*;

    fn make_ifs() -> IfsBlock {
        IfsBlock {
            transforms: vec![
                IfsTransform {
                    name: "leaf".into(),
                    matrix: [0.85, 0.04, -0.04, 0.85, 0.0, 1.6],
                    weight: 0.85,
                },
                IfsTransform {
                    name: "stem".into(),
                    matrix: [0.2, -0.26, 0.23, 0.22, 0.0, 1.6],
                    weight: 0.07,
                },
            ],
            iterations: 100000,
            color_mode: IfsColorMode::Transform,
        }
    }

    #[test]
    fn ifs_compute_shader_generates() {
        let ifs = make_ifs();
        let wgsl = generate_compute_wgsl(&ifs);
        assert!(wgsl.contains("@compute"));
        assert!(wgsl.contains("ifs_step"));
        assert!(wgsl.contains("atomicAdd"));
        assert!(wgsl.contains("apply_affine"));
    }

    #[test]
    fn ifs_contains_transforms() {
        let ifs = make_ifs();
        let wgsl = generate_compute_wgsl(&ifs);
        assert!(wgsl.contains("T0:"));
        assert!(wgsl.contains("T1:"));
        assert!(wgsl.contains("WEIGHTS:"));
    }

    #[test]
    fn ifs_runtime_js_generates() {
        let ifs = make_ifs();
        let js = generate_runtime_js(&ifs, 512, 512);
        assert!(js.contains("class GameIfsFractal"));
        assert!(js.contains("100000"));
    }
}
