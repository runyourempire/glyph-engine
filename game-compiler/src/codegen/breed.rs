//! Breed block codegen — merges parent cinematics with parameter blending
//! and seeded random mutation.

use crate::ast::BreedBlock;

/// Generate JavaScript for breed-based parameter merging.
///
/// The generated class includes:
/// - Gaussian (Box-Muller) mutation instead of uniform random
/// - Tournament selection (size 3) for parent picking
/// - Two-point crossover for the `pick` strategy
/// - Post-mutation clamping to [0, 1]
pub fn generate_breed_js(breed: &BreedBlock) -> String {
    let mut s = String::with_capacity(2048);

    s.push_str("class GameBreedMerger {\n");
    s.push_str(&format!(
        "  constructor() {{ this.name = '{}'; this.parents = [{}]; }}\n",
        breed.name,
        breed
            .parents
            .iter()
            .map(|p| format!("'{p}'"))
            .collect::<Vec<_>>()
            .join(", ")
    ));

    // ── Gaussian random (Box-Muller transform) ──────────
    s.push_str("\n  _gaussRandom() {\n");
    s.push_str("    let u = 0, v = 0;\n");
    s.push_str("    while (u === 0) u = Math.random();\n");
    s.push_str("    while (v === 0) v = Math.random();\n");
    s.push_str(
        "    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);\n",
    );
    s.push_str("  }\n");

    // ── Tournament selection (size 3) ───────────────────
    s.push_str("\n  _selectParent(candidates) {\n");
    s.push_str("    const size = Math.min(3, candidates.length);\n");
    s.push_str(
        "    let best = candidates[Math.floor(Math.random() * candidates.length)];\n",
    );
    s.push_str("    for (let i = 1; i < size; i++) {\n");
    s.push_str(
        "      const challenger = candidates[Math.floor(Math.random() * candidates.length)];\n",
    );
    s.push_str(
        "      if (this._fitness(challenger) > this._fitness(best)) { best = challenger; }\n",
    );
    s.push_str("    }\n");
    s.push_str("    return best;\n");
    s.push_str("  }\n");

    // ── Default fitness: diversity from midpoint ────────
    s.push_str("\n  _fitness(individual) {\n");
    s.push_str("    let score = 0;\n");
    s.push_str("    const keys = Object.keys(individual);\n");
    s.push_str("    for (const k of keys) { score += Math.abs(individual[k] - 0.5); }\n");
    s.push_str("    return score / keys.length;\n");
    s.push_str("  }\n");

    // ── Two-point crossover ─────────────────────────────
    s.push_str("\n  _crossover(parentA, parentB) {\n");
    s.push_str("    const keys = Object.keys(parentA);\n");
    s.push_str("    const result = {};\n");
    s.push_str("    const point1 = Math.floor(Math.random() * keys.length);\n");
    s.push_str(
        "    const point2 = point1 + Math.floor(Math.random() * (keys.length - point1));\n",
    );
    s.push_str("    for (let i = 0; i < keys.length; i++) {\n");
    s.push_str("      const k = keys[i];\n");
    s.push_str(
        "      result[k] = (i >= point1 && i < point2) ? parentB[k] : parentA[k];\n",
    );
    s.push_str("    }\n");
    s.push_str("    return result;\n");
    s.push_str("  }\n");

    // ── merge() ─────────────────────────────────────────
    s.push_str("\n  merge(parentA, parentB) {\n");
    s.push_str("    const result = {};\n");

    for rule in &breed.inherit_rules {
        match rule.strategy.as_str() {
            "mix" => {
                s.push_str(&format!(
                    "    // inherit {}: mix({})\n",
                    rule.target, rule.weight
                ));
                s.push_str(&format!(
                    "    for (const k of Object.keys(parentA.{} || {{}})) {{\n",
                    rule.target
                ));
                s.push_str(&format!(
                    "      const a = parentA.{}[k] || 0;\n",
                    rule.target
                ));
                s.push_str(&format!(
                    "      const b = parentB.{}[k] || 0;\n",
                    rule.target
                ));
                s.push_str(&format!(
                    "      result[k] = a * {} + b * {};\n",
                    rule.weight,
                    1.0 - rule.weight
                ));
                s.push_str("    }\n");
            }
            "pick" => {
                // Two-point crossover instead of per-key coin flip
                s.push_str(&format!(
                    "    // inherit {}: pick({}) — two-point crossover\n",
                    rule.target, rule.weight
                ));
                s.push_str(&format!(
                    "    {{\n      const aObj = parentA.{t} || {{}};\n      const bObj = parentB.{t} || {{}};\n      const crossed = this._crossover(aObj, bObj);\n      for (const k of Object.keys(crossed)) {{ result[k] = crossed[k]; }}\n    }}\n",
                    t = rule.target
                ));
            }
            _ => {
                s.push_str(&format!(
                    "    // unknown strategy '{}'\n",
                    rule.strategy
                ));
            }
        }
    }

    // Gaussian mutation with 3-sigma scaling
    for mutation in &breed.mutations {
        s.push_str(&format!(
            "    // mutate {}: +/-{} (Gaussian, 3-sigma)\n",
            mutation.target, mutation.range
        ));
        s.push_str(&format!(
            "    if (result['{}'] !== undefined) result['{}'] += this._gaussRandom() * {} * 0.33;\n",
            mutation.target, mutation.target, mutation.range
        ));
    }

    // Clamp all values to [0, 1] after mutation
    if !breed.mutations.is_empty() {
        s.push_str("    // clamp mutated values to [0, 1]\n");
        s.push_str("    for (const k of Object.keys(result)) {\n");
        s.push_str("      if (typeof result[k] === 'number') {\n");
        s.push_str("        result[k] = Math.max(0, Math.min(1, result[k]));\n");
        s.push_str("      }\n");
        s.push_str("    }\n");
    }

    s.push_str("    return result;\n");
    s.push_str("  }\n");
    s.push_str("}\n");

    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::*;

    #[test]
    fn breed_mix_generates() {
        let breed = BreedBlock {
            name: "child".into(),
            parents: vec!["fire".into(), "ice".into()],
            inherit_rules: vec![InheritRule {
                target: "layers".into(),
                strategy: "mix".into(),
                weight: 0.6,
            }],
            mutations: vec![],
        };
        let js = generate_breed_js(&breed);
        assert!(js.contains("class GameBreedMerger"));
        assert!(js.contains("'fire'"));
        assert!(js.contains("'ice'"));
        assert!(js.contains("0.6"));
    }

    #[test]
    fn breed_mutation_uses_gaussian() {
        let breed = BreedBlock {
            name: "child".into(),
            parents: vec!["a".into(), "b".into()],
            inherit_rules: vec![],
            mutations: vec![Mutation {
                target: "scale".into(),
                range: 0.3,
            }],
        };
        let js = generate_breed_js(&breed);
        assert!(js.contains("mutate scale"));
        assert!(js.contains("0.3"));
        // Should use Gaussian, not uniform
        assert!(
            js.contains("_gaussRandom()"),
            "Mutation should use Gaussian random: {}",
            js
        );
        assert!(
            !js.contains("Math.random() * 2 - 1"),
            "Should NOT use uniform random for mutation: {}",
            js
        );
        // Should have 3-sigma scaling
        assert!(
            js.contains("* 0.33"),
            "Should scale by 0.33 for 3-sigma: {}",
            js
        );
    }

    #[test]
    fn breed_has_gauss_random_helper() {
        let breed = BreedBlock {
            name: "child".into(),
            parents: vec!["a".into(), "b".into()],
            inherit_rules: vec![],
            mutations: vec![],
        };
        let js = generate_breed_js(&breed);
        assert!(
            js.contains("_gaussRandom()"),
            "Should emit Box-Muller helper: {}",
            js
        );
        assert!(
            js.contains("Math.sqrt(-2.0 * Math.log(u))"),
            "Box-Muller transform should use sqrt(-2 ln u): {}",
            js
        );
    }

    #[test]
    fn breed_has_tournament_selection() {
        let breed = BreedBlock {
            name: "child".into(),
            parents: vec!["a".into(), "b".into()],
            inherit_rules: vec![],
            mutations: vec![],
        };
        let js = generate_breed_js(&breed);
        assert!(
            js.contains("_selectParent(candidates)"),
            "Should emit tournament selection: {}",
            js
        );
        assert!(
            js.contains("Math.min(3, candidates.length)"),
            "Tournament size should be 3: {}",
            js
        );
    }

    #[test]
    fn breed_has_fitness_function() {
        let breed = BreedBlock {
            name: "child".into(),
            parents: vec!["a".into(), "b".into()],
            inherit_rules: vec![],
            mutations: vec![],
        };
        let js = generate_breed_js(&breed);
        assert!(
            js.contains("_fitness(individual)"),
            "Should emit fitness function: {}",
            js
        );
        assert!(
            js.contains("Math.abs(individual[k] - 0.5)"),
            "Fitness should measure distance from midpoint: {}",
            js
        );
    }

    #[test]
    fn breed_pick_uses_crossover() {
        let breed = BreedBlock {
            name: "child".into(),
            parents: vec!["fire".into(), "ice".into()],
            inherit_rules: vec![InheritRule {
                target: "params".into(),
                strategy: "pick".into(),
                weight: 0.5,
            }],
            mutations: vec![],
        };
        let js = generate_breed_js(&breed);
        assert!(
            js.contains("two-point crossover"),
            "Pick should use two-point crossover: {}",
            js
        );
        assert!(
            js.contains("this._crossover("),
            "Pick should call _crossover: {}",
            js
        );
    }

    #[test]
    fn breed_has_crossover_method() {
        let breed = BreedBlock {
            name: "child".into(),
            parents: vec!["a".into(), "b".into()],
            inherit_rules: vec![],
            mutations: vec![],
        };
        let js = generate_breed_js(&breed);
        assert!(
            js.contains("_crossover(parentA, parentB)"),
            "Should emit crossover method: {}",
            js
        );
        assert!(
            js.contains("point1") && js.contains("point2"),
            "Crossover should use two points: {}",
            js
        );
    }

    #[test]
    fn breed_mutation_clamps_values() {
        let breed = BreedBlock {
            name: "child".into(),
            parents: vec!["a".into(), "b".into()],
            inherit_rules: vec![],
            mutations: vec![Mutation {
                target: "scale".into(),
                range: 0.3,
            }],
        };
        let js = generate_breed_js(&breed);
        assert!(
            js.contains("Math.max(0, Math.min(1, result[k]))"),
            "Should clamp values to [0, 1]: {}",
            js
        );
    }

    #[test]
    fn breed_no_clamp_without_mutations() {
        let breed = BreedBlock {
            name: "child".into(),
            parents: vec!["a".into(), "b".into()],
            inherit_rules: vec![InheritRule {
                target: "layers".into(),
                strategy: "mix".into(),
                weight: 0.5,
            }],
            mutations: vec![],
        };
        let js = generate_breed_js(&breed);
        assert!(
            !js.contains("Math.max(0, Math.min(1,"),
            "Should not clamp when no mutations exist: {}",
            js
        );
    }
}
