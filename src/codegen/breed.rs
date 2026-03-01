//! Breed block codegen — merges parent cinematics with parameter blending
//! and seeded random mutation.

use crate::ast::BreedBlock;

/// Generate JavaScript for breed-based parameter merging.
pub fn generate_breed_js(breed: &BreedBlock) -> String {
    let mut s = String::with_capacity(1024);

    s.push_str("class GameBreedMerger {\n");
    s.push_str(&format!(
        "  constructor() {{ this.name = '{}'; this.parents = [{}]; }}\n",
        breed.name,
        breed.parents.iter().map(|p| format!("'{p}'")).collect::<Vec<_>>().join(", ")
    ));

    s.push_str("\n  merge(parentA, parentB) {\n");
    s.push_str("    const result = {};\n");

    for rule in &breed.inherit_rules {
        match rule.strategy.as_str() {
            "mix" => {
                s.push_str(&format!(
                    "    // inherit {}: mix({})\n", rule.target, rule.weight
                ));
                s.push_str(&format!(
                    "    for (const k of Object.keys(parentA.{} || {{}})) {{\n",
                    rule.target
                ));
                s.push_str(&format!(
                    "      const a = parentA.{}[k] || 0;\n", rule.target
                ));
                s.push_str(&format!(
                    "      const b = parentB.{}[k] || 0;\n", rule.target
                ));
                s.push_str(&format!(
                    "      result[k] = a * {} + b * {};\n",
                    rule.weight, 1.0 - rule.weight
                ));
                s.push_str("    }\n");
            }
            "pick" => {
                s.push_str(&format!(
                    "    // inherit {}: pick({})\n", rule.target, rule.weight
                ));
                s.push_str(&format!(
                    "    for (const k of Object.keys(parentA.{} || {{}})) {{\n",
                    rule.target
                ));
                s.push_str(&format!(
                    "      result[k] = Math.random() < {} ? parentA.{}[k] : parentB.{}[k];\n",
                    rule.weight, rule.target, rule.target
                ));
                s.push_str("    }\n");
            }
            _ => {
                s.push_str(&format!(
                    "    // unknown strategy '{}'\n", rule.strategy
                ));
            }
        }
    }

    for mutation in &breed.mutations {
        s.push_str(&format!(
            "    // mutate {}: +/-{}\n", mutation.target, mutation.range
        ));
        s.push_str(&format!(
            "    if (result['{}'] !== undefined) result['{}'] += (Math.random() * 2 - 1) * {};\n",
            mutation.target, mutation.target, mutation.range
        ));
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
    fn breed_mutation_generates() {
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
    }
}
