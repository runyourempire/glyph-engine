//! Project block codegen — emits vertex shader variants for projection mapping.
//!
//! Supports Flat (default), Dome (fisheye), Cube (6-face), and Led (strip sampling).

use crate::ast::ProjectMode;

/// Generate a WGSL vertex shader for the given projection mode.
pub fn generate_vertex_wgsl(mode: &ProjectMode) -> String {
    match mode {
        ProjectMode::Flat => flat_vertex_wgsl().to_string(),
        ProjectMode::Dome => dome_vertex_wgsl(),
        ProjectMode::Cube => cube_vertex_wgsl(),
        ProjectMode::Led => led_vertex_wgsl(),
    }
}

fn flat_vertex_wgsl() -> &'static str {
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

fn dome_vertex_wgsl() -> String {
    let mut s = String::new();
    s.push_str("struct VertexOutput {\n");
    s.push_str("    @builtin(position) pos: vec4<f32>,\n");
    s.push_str("    @location(0) uv: vec2<f32>,\n");
    s.push_str("};\n\n");

    s.push_str("struct DomeParams {\n");
    s.push_str("    fov_deg: f32,\n");
    s.push_str("    segments: u32,\n");
    s.push_str("};\n\n");

    s.push_str("@group(1) @binding(0) var<uniform> dome: DomeParams;\n\n");

    s.push_str("@vertex\n");
    s.push_str("fn vs_main(@builtin(vertex_index) vid: u32) -> VertexOutput {\n");
    s.push_str("    var positions = array<vec2<f32>, 3>(\n");
    s.push_str("        vec2<f32>(-1.0, -1.0),\n");
    s.push_str("        vec2<f32>(3.0, -1.0),\n");
    s.push_str("        vec2<f32>(-1.0, 3.0),\n");
    s.push_str("    );\n");
    s.push_str("    var out: VertexOutput;\n");
    s.push_str("    let p = positions[vid];\n");
    s.push_str("    out.pos = vec4<f32>(p, 0.0, 1.0);\n");
    // Equirectangular fisheye UV mapping
    s.push_str("    let uv = p * 0.5 + 0.5;\n");
    s.push_str("    let center = uv - 0.5;\n");
    s.push_str("    let r = length(center) * 2.0;\n");
    s.push_str("    let theta = atan2(center.y, center.x);\n");
    s.push_str("    let fov_rad = dome.fov_deg * 3.14159265359 / 180.0;\n");
    s.push_str("    let phi = r * fov_rad * 0.5;\n");
    s.push_str("    out.uv = vec2<f32>(sin(phi) * cos(theta) * 0.5 + 0.5, sin(phi) * sin(theta) * 0.5 + 0.5);\n");
    s.push_str("    return out;\n");
    s.push_str("}\n");
    s
}

fn cube_vertex_wgsl() -> String {
    let mut s = String::new();
    s.push_str("struct VertexOutput {\n");
    s.push_str("    @builtin(position) pos: vec4<f32>,\n");
    s.push_str("    @location(0) uv: vec2<f32>,\n");
    s.push_str("    @location(1) face: f32,\n");
    s.push_str("};\n\n");

    s.push_str("struct CubeParams {\n");
    s.push_str("    face_index: u32,\n");
    s.push_str("};\n\n");

    s.push_str("@group(1) @binding(0) var<uniform> cube: CubeParams;\n\n");

    s.push_str("@vertex\n");
    s.push_str("fn vs_main(@builtin(vertex_index) vid: u32) -> VertexOutput {\n");
    s.push_str("    var positions = array<vec2<f32>, 3>(\n");
    s.push_str("        vec2<f32>(-1.0, -1.0),\n");
    s.push_str("        vec2<f32>(3.0, -1.0),\n");
    s.push_str("        vec2<f32>(-1.0, 3.0),\n");
    s.push_str("    );\n");
    s.push_str("    var out: VertexOutput;\n");
    s.push_str("    out.pos = vec4<f32>(positions[vid], 0.0, 1.0);\n");
    s.push_str("    out.uv = positions[vid] * 0.5 + 0.5;\n");
    s.push_str("    out.face = f32(cube.face_index);\n");
    s.push_str("    return out;\n");
    s.push_str("}\n");
    s
}

fn led_vertex_wgsl() -> String {
    let mut s = String::new();
    s.push_str("struct VertexOutput {\n");
    s.push_str("    @builtin(position) pos: vec4<f32>,\n");
    s.push_str("    @location(0) uv: vec2<f32>,\n");
    s.push_str("};\n\n");

    s.push_str("struct LedParams {\n");
    s.push_str("    count: u32,\n");
    s.push_str("    aspect: f32,\n");
    s.push_str("};\n\n");

    s.push_str("@group(1) @binding(0) var<uniform> led: LedParams;\n\n");

    s.push_str("@vertex\n");
    s.push_str("fn vs_main(@builtin(vertex_index) vid: u32) -> VertexOutput {\n");
    s.push_str("    // LED strip: sample along a horizontal line\n");
    s.push_str("    let led_idx = vid / 6u;\n");
    s.push_str("    let sub_idx = vid % 6u;\n");
    s.push_str("    let t = f32(led_idx) / f32(led.count);\n");
    s.push_str("    let w = 1.0 / f32(led.count);\n");
    s.push_str("    let x = t * 2.0 - 1.0;\n");
    s.push_str("    let quad_x = array<f32, 6>(x, x + w*2.0, x, x + w*2.0, x, x + w*2.0);\n");
    s.push_str("    let quad_y = array<f32, 6>(-1.0, -1.0, 1.0, 1.0, -1.0, 1.0);\n");
    s.push_str("    var out: VertexOutput;\n");
    s.push_str("    out.pos = vec4<f32>(quad_x[sub_idx], quad_y[sub_idx], 0.0, 1.0);\n");
    s.push_str("    out.uv = vec2<f32>(t, 0.5);\n");
    s.push_str("    return out;\n");
    s.push_str("}\n");
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flat_is_standard_fullscreen_tri() {
        let wgsl = generate_vertex_wgsl(&ProjectMode::Flat);
        assert!(wgsl.contains("fn vs_main"));
        assert!(wgsl.contains("vertex_index"));
    }

    #[test]
    fn dome_has_fisheye_mapping() {
        let wgsl = generate_vertex_wgsl(&ProjectMode::Dome);
        assert!(wgsl.contains("fov_deg"));
        assert!(wgsl.contains("atan2"));
        assert!(wgsl.contains("sin(phi)"));
    }

    #[test]
    fn cube_has_face_index() {
        let wgsl = generate_vertex_wgsl(&ProjectMode::Cube);
        assert!(wgsl.contains("face_index"));
        assert!(wgsl.contains("face: f32"));
    }

    #[test]
    fn led_has_strip_sampling() {
        let wgsl = generate_vertex_wgsl(&ProjectMode::Led);
        assert!(wgsl.contains("led_idx"));
        assert!(wgsl.contains("count"));
    }
}
