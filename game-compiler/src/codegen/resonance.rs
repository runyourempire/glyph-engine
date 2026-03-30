//! Resonance block codegen — compiles `resonate { source -> target.field * weight }`
//! into JS cross-layer modulation code.
//!
//! Generates a `resonanceUpdate(params, dt)` function that applies source→target
//! bindings each frame. Sources map to named signals (e.g. audio analysis outputs),
//! and targets map to uniform parameters by index.

use crate::ast::ResonateBlock;
use crate::codegen::expr;
use crate::codegen::UniformInfo;

/// Compile a ResonateBlock into a JS resonance update function.
///
/// The generated function signature: `function resonanceUpdate(params, signals, dt)`
/// - `params` — Float32Array of uniform values (indexed by uniform position)
/// - `signals` — object with named signal values (e.g. `{ kick: 0.8, snare: 0.2 }`)
/// - `dt` — delta time in seconds
///
/// Each entry maps `source` signal to `target.field` uniform, scaled by `weight`.
pub fn generate_resonance_js(block: &ResonateBlock, uniforms: &[UniformInfo]) -> String {
    if block.entries.is_empty() {
        return String::new();
    }

    let mut s = String::with_capacity(512);
    s.push_str("// GAME resonance — cross-layer modulation\n");
    s.push_str("function resonanceUpdate(params, signals, dt) {\n");

    // Track which targets we've seen for cycle detection warnings
    let mut targets_seen = Vec::new();

    for entry in &block.entries {
        let target_name = format!("{}_{}", entry.target, entry.field);
        let weight_js = expr::compile_js(&entry.weight);

        // Find uniform index for target.field — look for "target_field" or just "field"
        let idx = uniforms
            .iter()
            .position(|u| u.name == target_name)
            .or_else(|| uniforms.iter().position(|u| u.name == entry.field));

        // Cycle detection: warn if the same target is written multiple times
        if targets_seen.contains(&target_name) {
            s.push_str(&format!(
                "  // WARNING: multiple writes to '{target_name}' — potential resonance cycle\n"
            ));
        }
        targets_seen.push(target_name.clone());

        if let Some(idx) = idx {
            s.push_str(&format!(
                "  params[{idx}] += (signals['{}'] || 0) * ({weight_js}) * dt;\n",
                entry.source
            ));
        } else {
            s.push_str(&format!(
                "  // unmapped resonance target: {}.{} (source: {})\n",
                entry.target, entry.field, entry.source
            ));
        }
    }

    s.push_str("}\n");
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::*;

    #[test]
    fn empty_block_returns_empty() {
        let block = ResonateBlock { entries: vec![] };
        let js = generate_resonance_js(&block, &[]);
        assert!(js.is_empty());
    }

    #[test]
    fn single_binding_generates_resonance_update() {
        let block = ResonateBlock {
            entries: vec![ResonateEntry {
                source: "kick".into(),
                target: "bg".into(),
                field: "scale".into(),
                weight: Expr::Number(0.3),
            }],
        };
        let uniforms = vec![UniformInfo {
            name: "scale".into(),
            default: 1.0,
        }];
        let js = generate_resonance_js(&block, &uniforms);
        assert!(js.contains("function resonanceUpdate"));
        assert!(js.contains("signals['kick']"));
        assert!(js.contains("params[0]"));
        assert!(js.contains("0.3"));
    }

    #[test]
    fn unmapped_target_emits_comment() {
        let block = ResonateBlock {
            entries: vec![ResonateEntry {
                source: "kick".into(),
                target: "bg".into(),
                field: "opacity".into(),
                weight: Expr::Number(0.5),
            }],
        };
        // No uniforms match
        let js = generate_resonance_js(&block, &[]);
        assert!(js.contains("unmapped resonance target"));
        assert!(js.contains("bg.opacity"));
    }

    #[test]
    fn multiple_entries_generates_multiple_lines() {
        let block = ResonateBlock {
            entries: vec![
                ResonateEntry {
                    source: "kick".into(),
                    target: "bg".into(),
                    field: "scale".into(),
                    weight: Expr::Number(0.3),
                },
                ResonateEntry {
                    source: "snare".into(),
                    target: "fg".into(),
                    field: "intensity".into(),
                    weight: Expr::Number(0.7),
                },
            ],
        };
        let uniforms = vec![
            UniformInfo {
                name: "scale".into(),
                default: 1.0,
            },
            UniformInfo {
                name: "intensity".into(),
                default: 0.5,
            },
        ];
        let js = generate_resonance_js(&block, &uniforms);
        assert!(js.contains("signals['kick']"));
        assert!(js.contains("signals['snare']"));
        assert!(js.contains("params[0]"));
        assert!(js.contains("params[1]"));
    }

    #[test]
    fn cycle_detection_warning() {
        let block = ResonateBlock {
            entries: vec![
                ResonateEntry {
                    source: "kick".into(),
                    target: "bg".into(),
                    field: "scale".into(),
                    weight: Expr::Number(0.3),
                },
                ResonateEntry {
                    source: "snare".into(),
                    target: "bg".into(),
                    field: "scale".into(),
                    weight: Expr::Number(0.5),
                },
            ],
        };
        let uniforms = vec![UniformInfo {
            name: "scale".into(),
            default: 1.0,
        }];
        let js = generate_resonance_js(&block, &uniforms);
        assert!(js.contains("potential resonance cycle"));
    }

    #[test]
    fn compound_target_name_lookup() {
        let block = ResonateBlock {
            entries: vec![ResonateEntry {
                source: "kick".into(),
                target: "bg".into(),
                field: "scale".into(),
                weight: Expr::Number(0.3),
            }],
        };
        // Uniform named "bg_scale" matches compound target name
        let uniforms = vec![UniformInfo {
            name: "bg_scale".into(),
            default: 1.0,
        }];
        let js = generate_resonance_js(&block, &uniforms);
        assert!(js.contains("params[0]"));
    }
}
