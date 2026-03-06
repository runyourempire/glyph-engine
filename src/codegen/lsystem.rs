//! L-system codegen — string rewriting for generative geometry.
//!
//! Expands L-system rules at compile time, then generates line segment data
//! for rendering as SDF capsule unions or as vertex geometry.
//!
//! ```game
//! lsystem {
//!   axiom: "F"
//!   rule F: "FF+[+F-F-F]-[-F+F+F]"
//!   angle: 25deg
//!   iterations: 4
//!   step: 0.02
//! }
//! ```

use crate::ast::LsystemBlock;

/// A line segment generated from turtle graphics interpretation.
#[derive(Debug, Clone)]
pub struct LineSegment {
    pub x0: f64,
    pub y0: f64,
    pub x1: f64,
    pub y1: f64,
    pub depth: u32,
}

/// Expand L-system rules for the given number of iterations.
pub fn expand(block: &LsystemBlock) -> String {
    let mut current = block.axiom.clone();
    for _ in 0..block.iterations {
        let mut next = String::with_capacity(current.len() * 2);
        for ch in current.chars() {
            if let Some(rule) = block.rules.iter().find(|r| r.symbol == ch) {
                next.push_str(&rule.replacement);
            } else {
                next.push(ch);
            }
        }
        current = next;
    }
    current
}

/// Interpret expanded L-system string as turtle graphics → line segments.
pub fn interpret(expanded: &str, angle_deg: f64, step: f64) -> Vec<LineSegment> {
    let angle_rad = angle_deg * std::f64::consts::PI / 180.0;
    let mut segments = Vec::new();
    let mut x = 0.0f64;
    let mut y = 0.0f64;
    let mut dir = std::f64::consts::FRAC_PI_2; // start pointing up
    let mut depth = 0u32;
    let mut stack: Vec<(f64, f64, f64, u32)> = Vec::new();

    for ch in expanded.chars() {
        match ch {
            'F' | 'G' => {
                let nx = x + dir.cos() * step;
                let ny = y + dir.sin() * step;
                segments.push(LineSegment {
                    x0: x,
                    y0: y,
                    x1: nx,
                    y1: ny,
                    depth,
                });
                x = nx;
                y = ny;
            }
            'f' | 'g' => {
                // Move without drawing
                x += dir.cos() * step;
                y += dir.sin() * step;
            }
            '+' => dir += angle_rad,
            '-' => dir -= angle_rad,
            '[' => {
                stack.push((x, y, dir, depth));
                depth += 1;
            }
            ']' => {
                if let Some((sx, sy, sd, sdepth)) = stack.pop() {
                    x = sx;
                    y = sy;
                    dir = sd;
                    depth = sdepth;
                }
            }
            _ => {} // ignore other symbols
        }
    }

    segments
}

/// Generate WGSL fragment shader code for L-system rendering.
///
/// Encodes line segments as SDF capsule unions for GPU rendering.
/// For small segment counts (<500), inline all segments.
/// For larger counts, use storage buffer.
pub fn generate_lsystem_wgsl(block: &LsystemBlock) -> String {
    let expanded = expand(block);
    let segments = interpret(&expanded, block.angle, block.step);
    let n = segments.len();

    let mut s = String::with_capacity(2048);

    s.push_str("// L-system fragment shader\n");
    s.push_str(&format!("// Expanded to {} segments\n\n", n));

    // Capsule SDF helper
    s.push_str("fn sdf_capsule(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {\n");
    s.push_str("    let pa = p - a;\n");
    s.push_str("    let ba = b - a;\n");
    s.push_str("    let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);\n");
    s.push_str("    return length(pa - ba * h) - r;\n");
    s.push_str("}\n\n");

    // Inline all segments as SDF union
    s.push_str("fn lsystem_sdf(p: vec2<f32>) -> f32 {\n");
    s.push_str("    var d = 999.0;\n");
    let max_inline = 500.min(n);
    for seg in segments.iter().take(max_inline) {
        s.push_str(&format!(
            "    d = min(d, sdf_capsule(p, vec2<f32>({:.4}, {:.4}), vec2<f32>({:.4}, {:.4}), 0.001));\n",
            seg.x0, seg.y0, seg.x1, seg.y1
        ));
    }
    s.push_str("    return d;\n");
    s.push_str("}\n");

    s
}

/// Generate JS runtime helper for L-system.
pub fn generate_runtime_js(block: &LsystemBlock) -> String {
    let expanded = expand(block);
    let segments = interpret(&expanded, block.angle, block.step);
    let mut s = String::with_capacity(512);

    s.push_str("class GameLsystem {\n");
    s.push_str(&format!("  constructor() {{\n"));
    s.push_str(&format!("    this.axiom = '{}';\n", block.axiom));
    s.push_str(&format!("    this.iterations = {};\n", block.iterations));
    s.push_str(&format!("    this.segments = {};\n", segments.len()));
    s.push_str(&format!("    this.angle = {};\n", block.angle));
    s.push_str("  }\n");
    s.push_str("}\n");

    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::*;

    fn make_lsystem() -> LsystemBlock {
        LsystemBlock {
            axiom: "F".into(),
            rules: vec![LsystemRule {
                symbol: 'F',
                replacement: "F+F-F-F+F".into(),
            }],
            angle: 90.0,
            iterations: 2,
            step: 0.1,
        }
    }

    #[test]
    fn expand_simple() {
        let block = LsystemBlock {
            axiom: "F".into(),
            rules: vec![LsystemRule {
                symbol: 'F',
                replacement: "FF".into(),
            }],
            angle: 0.0,
            iterations: 3,
            step: 1.0,
        };
        let result = expand(&block);
        assert_eq!(result, "FFFFFFFF"); // 2^3 = 8
    }

    #[test]
    fn expand_with_constants() {
        let block = LsystemBlock {
            axiom: "F+F".into(),
            rules: vec![LsystemRule {
                symbol: 'F',
                replacement: "F-F".into(),
            }],
            angle: 90.0,
            iterations: 1,
            step: 1.0,
        };
        let result = expand(&block);
        assert_eq!(result, "F-F+F-F");
    }

    #[test]
    fn interpret_generates_segments() {
        let block = make_lsystem();
        let expanded = expand(&block);
        let segments = interpret(&expanded, block.angle, block.step);
        assert!(!segments.is_empty(), "should produce segments");
    }

    #[test]
    fn lsystem_wgsl_generates() {
        let block = make_lsystem();
        let wgsl = generate_lsystem_wgsl(&block);
        assert!(wgsl.contains("sdf_capsule"));
        assert!(wgsl.contains("lsystem_sdf"));
    }

    #[test]
    fn lsystem_runtime_js() {
        let block = make_lsystem();
        let js = generate_runtime_js(&block);
        assert!(js.contains("class GameLsystem"));
        assert!(js.contains("iterations"));
    }
}
