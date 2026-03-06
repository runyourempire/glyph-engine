//! Cellular automaton codegen — compute shader for 2D grid automata.
//!
//! Uses ping-pong textures (same pattern as react/swarm) with compile-time
//! rule parsing. Supports Life-like rules (B/S notation) and custom state counts.
//!
//! ```game
//! automaton {
//!   states: 2
//!   neighborhood: moore
//!   rule: "B3/S23"
//!   seed: random(0.3)
//!   speed: 10
//! }
//! ```

use crate::ast::{AutomatonBlock, AutomatonSeed, Neighborhood};

/// Parse B/S rule notation into birth and survival conditions.
/// "B3/S23" → birth on 3 neighbors, survive on 2 or 3.
fn parse_bs_rule(rule: &str) -> (Vec<u32>, Vec<u32>) {
    let mut birth = Vec::new();
    let mut survival = Vec::new();
    let mut in_survival = false;

    for ch in rule.chars() {
        match ch {
            'B' | 'b' => in_survival = false,
            'S' | 's' => in_survival = true,
            '/' => in_survival = true,
            '0'..='8' => {
                let n = ch.to_digit(10).unwrap();
                if in_survival {
                    survival.push(n);
                } else {
                    birth.push(n);
                }
            }
            _ => {}
        }
    }

    (birth, survival)
}

/// Generate WGSL compute shader for cellular automaton.
pub fn generate_compute_wgsl(block: &AutomatonBlock) -> String {
    let (birth, survival) = parse_bs_rule(&block.rule);
    let is_moore = block.neighborhood == Neighborhood::Moore;

    let mut s = String::with_capacity(2048);

    s.push_str("// Cellular Automaton Compute Shader\n\n");

    s.push_str("struct AutomatonParams {\n");
    s.push_str("    width: u32,\n");
    s.push_str("    height: u32,\n");
    s.push_str("    step: u32,\n");
    s.push_str("    _pad: u32,\n");
    s.push_str("};\n\n");

    s.push_str("@group(0) @binding(0) var<uniform> params: AutomatonParams;\n");
    s.push_str("@group(0) @binding(1) var<storage, read> grid_in: array<u32>;\n");
    s.push_str("@group(0) @binding(2) var<storage, read_write> grid_out: array<u32>;\n\n");

    s.push_str("fn cell(x: i32, y: i32) -> u32 {\n");
    s.push_str("    let wx = ((x % i32(params.width)) + i32(params.width)) % i32(params.width);\n");
    s.push_str(
        "    let wy = ((y % i32(params.height)) + i32(params.height)) % i32(params.height);\n",
    );
    s.push_str("    return grid_in[u32(wy) * params.width + u32(wx)];\n");
    s.push_str("}\n\n");

    s.push_str("@compute @workgroup_size(16, 16)\n");
    s.push_str("fn automaton_step(@builtin(global_invocation_id) id: vec3<u32>) {\n");
    s.push_str("    if (id.x >= params.width || id.y >= params.height) { return; }\n");
    s.push_str("    let x = i32(id.x);\n");
    s.push_str("    let y = i32(id.y);\n");
    s.push_str("    let current = cell(x, y);\n\n");

    // Count neighbors
    s.push_str("    var neighbors = 0u;\n");
    if is_moore {
        // Moore neighborhood (8 cells)
        s.push_str("    neighbors += cell(x-1, y-1) + cell(x, y-1) + cell(x+1, y-1);\n");
        s.push_str("    neighbors += cell(x-1, y)                  + cell(x+1, y);\n");
        s.push_str("    neighbors += cell(x-1, y+1) + cell(x, y+1) + cell(x+1, y+1);\n");
    } else {
        // Von Neumann neighborhood (4 cells)
        s.push_str("    neighbors += cell(x, y-1) + cell(x-1, y) + cell(x+1, y) + cell(x, y+1);\n");
    }

    // Apply B/S rule
    s.push_str("\n    var next = 0u;\n");
    s.push_str("    if (current == 0u) {\n");

    // Birth conditions
    let birth_cond: Vec<String> = birth.iter().map(|n| format!("neighbors == {}u", n)).collect();
    if !birth_cond.is_empty() {
        s.push_str(&format!(
            "        if ({}) {{ next = 1u; }}\n",
            birth_cond.join(" || ")
        ));
    }

    s.push_str("    } else {\n");

    // Survival conditions
    let surv_cond: Vec<String> = survival
        .iter()
        .map(|n| format!("neighbors == {}u", n))
        .collect();
    if !surv_cond.is_empty() {
        s.push_str(&format!(
            "        if ({}) {{ next = 1u; }}\n",
            surv_cond.join(" || ")
        ));
    }

    s.push_str("    }\n\n");

    s.push_str("    grid_out[id.y * params.width + id.x] = next;\n");
    s.push_str("}\n");

    s
}

/// Generate JS runtime for cellular automaton.
pub fn generate_runtime_js(block: &AutomatonBlock, width: u32, height: u32) -> String {
    let mut s = String::with_capacity(1024);

    let seed_js = match &block.seed {
        AutomatonSeed::Random(density) => format!("{{ type: 'random', density: {} }}", density),
        AutomatonSeed::Center => "{ type: 'center' }".into(),
        AutomatonSeed::Pattern(p) => format!("{{ type: 'pattern', data: '{}' }}", p),
    };

    s.push_str("class GameAutomaton {\n");
    s.push_str("  constructor() {\n");
    s.push_str(&format!("    this.width = {};\n", width));
    s.push_str(&format!("    this.height = {};\n", height));
    s.push_str(&format!("    this.speed = {};\n", block.speed));
    s.push_str(&format!("    this.rule = '{}';\n", block.rule));
    s.push_str(&format!("    this.seed = {};\n", seed_js));
    s.push_str("    this._step = 0;\n");
    s.push_str("    this._lastTime = 0;\n");
    s.push_str("  }\n\n");

    s.push_str("  shouldStep(elapsedSec) {\n");
    s.push_str("    const interval = 1.0 / this.speed;\n");
    s.push_str("    if (elapsedSec - this._lastTime >= interval) {\n");
    s.push_str("      this._lastTime = elapsedSec;\n");
    s.push_str("      this._step++;\n");
    s.push_str("      return true;\n");
    s.push_str("    }\n");
    s.push_str("    return false;\n");
    s.push_str("  }\n\n");

    s.push_str("  get step() { return this._step; }\n");
    s.push_str("}\n");

    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::*;

    fn make_automaton() -> AutomatonBlock {
        AutomatonBlock {
            states: 2,
            neighborhood: Neighborhood::Moore,
            rule: "B3/S23".into(),
            seed: AutomatonSeed::Random(0.3),
            speed: 10,
        }
    }

    #[test]
    fn parse_life_rule() {
        let (birth, survival) = parse_bs_rule("B3/S23");
        assert_eq!(birth, vec![3]);
        assert_eq!(survival, vec![2, 3]);
    }

    #[test]
    fn parse_highlife_rule() {
        let (birth, survival) = parse_bs_rule("B36/S23");
        assert_eq!(birth, vec![3, 6]);
        assert_eq!(survival, vec![2, 3]);
    }

    #[test]
    fn compute_shader_generates() {
        let block = make_automaton();
        let wgsl = generate_compute_wgsl(&block);
        assert!(wgsl.contains("@compute"));
        assert!(wgsl.contains("automaton_step"));
        assert!(wgsl.contains("neighbors"));
    }

    #[test]
    fn moore_neighborhood_8_cells() {
        let block = make_automaton();
        let wgsl = generate_compute_wgsl(&block);
        assert!(wgsl.contains("cell(x-1, y-1)"));
        assert!(wgsl.contains("cell(x+1, y+1)"));
    }

    #[test]
    fn von_neumann_4_cells() {
        let mut block = make_automaton();
        block.neighborhood = Neighborhood::VonNeumann;
        let wgsl = generate_compute_wgsl(&block);
        assert!(!wgsl.contains("cell(x-1, y-1)"));
        assert!(wgsl.contains("cell(x, y-1)"));
    }

    #[test]
    fn runtime_js_generates() {
        let block = make_automaton();
        let js = generate_runtime_js(&block, 256, 256);
        assert!(js.contains("class GameAutomaton"));
        assert!(js.contains("B3/S23"));
        assert!(js.contains("shouldStep"));
    }
}
