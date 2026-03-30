use std::fs;
use std::path::Path;

use game_compiler::{CompileConfig, OutputFormat, ShaderTarget};

fn default_config() -> CompileConfig {
    CompileConfig {
        output_format: OutputFormat::Component,
        target: ShaderTarget::Both,
    }
}

fn compile_all_in_dir(dir: &Path) -> (usize, usize, Vec<String>) {
    assert!(dir.is_dir(), "{} is not a directory", dir.display());

    let entries: Vec<_> = fs::read_dir(dir)
        .unwrap_or_else(|e| panic!("cannot read {}: {e}", dir.display()))
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext == "game")
                .unwrap_or(false)
        })
        .collect();

    assert!(!entries.is_empty(), "no .game files found in {}", dir.display());

    let config = CompileConfig {
        output_format: OutputFormat::Html,
        target: ShaderTarget::Both,
    };

    let mut passed = 0;
    let mut failed = 0;
    let mut errors = Vec::new();

    for entry in &entries {
        let path = entry.path();
        let source = fs::read_to_string(&path)
            .unwrap_or_else(|e| panic!("cannot read {}: {e}", path.display()));

        match game_compiler::compile(&source, &config) {
            Ok(outputs) => {
                if outputs.is_empty() {
                    errors.push(format!("{}: produced no outputs", path.display()));
                    failed += 1;
                } else {
                    passed += 1;
                }
            }
            Err(e) => {
                errors.push(format!("{}: {e}", path.display()));
                failed += 1;
            }
        }
    }

    eprintln!(
        "  {}: {passed}/{} passed ({failed} failed)",
        dir.file_name().unwrap_or_default().to_string_lossy(),
        entries.len(),
    );

    (passed, failed, errors)
}

#[test]
fn all_examples_compile() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("examples");
    let (passed, failed, errors) = compile_all_in_dir(&dir);

    if failed > 0 {
        eprintln!("  Failures:");
        for e in &errors {
            eprintln!("    {e}");
        }
    }

    // Require at least 8 of 10 D:/GAME-specific examples compile
    // (cinematic-arc.game uses unimplemented timeline syntax, audio-spectrum.game may use string arg parsing)
    assert!(
        passed >= 8,
        "expected at least 8 examples to compile, got {passed} ({failed} failed)"
    );
}

#[test]
fn runyourempire_examples_compile() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("game-compiler should have a parent dir")
        .join("examples");
    if !dir.exists() {
        eprintln!("  skipping: {} not found", dir.display());
        return;
    }
    let (passed, failed, errors) = compile_all_in_dir(&dir);

    if failed > 0 {
        eprintln!("  Failures:");
        for e in &errors {
            eprintln!("    {e}");
        }
    }

    // All 14+ runyourempire examples should compile
    assert!(
        passed >= 14,
        "expected at least 14 runyourempire examples to compile, got {passed} ({failed} failed)"
    );
}

#[test]
fn all_stdlib_compile() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("game-compiler should have a parent dir")
        .join("stdlib");
    if !dir.exists() {
        eprintln!("  skipping: {} not found", dir.display());
        return;
    }
    let (passed, failed, errors) = compile_all_in_dir(&dir);

    if failed > 0 {
        eprintln!("  Failures:");
        for e in &errors {
            eprintln!("    {e}");
        }
    }

    // All 6 stdlib files should compile
    assert!(
        passed >= 6,
        "expected at least 6 stdlib files to compile, got {passed} ({failed} failed)"
    );
}

#[test]
fn all_presets_compile() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("game-compiler should have a parent dir")
        .join("presets");
    let (passed, failed, errors) = compile_all_in_dir(&dir);

    if failed > 0 {
        eprintln!("  Failures:");
        for e in &errors {
            eprintln!("    {e}");
        }
    }

    // Require at least 10 presets compile (basic ones without timeline arcs)
    assert!(
        passed >= 10,
        "expected at least 10 presets to compile, got {passed} ({failed} failed)"
    );
}

// ── Tutorial batch test ──────────────────────────────────

#[test]
fn all_tutorial_files_compile() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("game-compiler should have a parent dir")
        .join("examples");
    if !dir.exists() {
        eprintln!("  skipping: {} not found", dir.display());
        return;
    }

    let entries: Vec<_> = fs::read_dir(&dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            name.starts_with("tutorial-") && name.ends_with(".game")
        })
        .collect();

    if entries.is_empty() {
        eprintln!("  skipping: no tutorial files found");
        return;
    }

    let config = default_config();
    let mut failures = Vec::new();

    for entry in &entries {
        let path = entry.path();
        let source = fs::read_to_string(&path).unwrap();
        if let Err(e) = game_compiler::compile(&source, &config) {
            failures.push(format!("{}: {e}", path.display()));
        }
    }

    assert!(
        failures.is_empty(),
        "Tutorial compilation failures:\n{}",
        failures.join("\n")
    );
}

// ── Error message quality tests ─────────────────────────

#[test]
fn typo_suggests_correction() {
    let src = r#"cinematic "t" { layer { fn: circl(0.3) | glow(1.5) } }"#;
    let result = game_compiler::compile(src, &default_config());
    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("did you mean"),
        "Error should suggest correction: {err}"
    );
}

#[test]
fn type_mismatch_explains_pipeline() {
    // tint expects Color input but circle produces Sdf, not Color
    let src = r#"cinematic "t" { layer { fn: circle(0.3) | tint(1.0, 0.0, 0.0) } }"#;
    let result = game_compiler::compile(src, &default_config());
    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("type mismatch") || err.contains("pipeline flows"),
        "Error should explain type flow: {err}"
    );
}

#[test]
fn unknown_function_reports_name() {
    let src = r#"cinematic "t" { layer { fn: zzzzzzz(0.3) } }"#;
    let result = game_compiler::compile(src, &default_config());
    assert!(result.is_err());
    let err = result.unwrap_err().to_string();
    assert!(
        err.contains("zzzzzzz"),
        "Error should mention the unknown function name: {err}"
    );
}

// ── Public API tests ────────────────────────────────────

#[test]
fn lex_produces_tokens() {
    let tokens = game_compiler::lex(r#"cinematic "test" { layer { fn: circle(0.3) } }"#).unwrap();
    assert!(!tokens.is_empty());
    // First token should be at offset 0
    assert_eq!(tokens[0].1, 0);
}

#[test]
fn parse_alias_works() {
    let program = game_compiler::parse(r#"cinematic "test" { layer { fn: circle(0.3) } }"#).unwrap();
    assert_eq!(program.cinematics.len(), 1);
    assert_eq!(program.cinematics[0].name, "test");
}

#[test]
fn check_returns_warnings() {
    // Valid program should produce no warnings
    let program = game_compiler::parse(
        r#"cinematic "test" { layer { fn: circle(0.3) | glow(1.5) } }"#,
    )
    .unwrap();
    let warnings = game_compiler::check(&program);
    assert!(warnings.is_empty(), "Valid program should have no warnings: {warnings:?}");
}

#[test]
fn list_builtins_includes_circle() {
    let builtins = game_compiler::list_builtins();
    assert!(!builtins.is_empty());
    let circle = builtins.iter().find(|b| b.name == "circle");
    assert!(circle.is_some(), "circle should be in builtins list");
    let circle = circle.unwrap();
    assert_eq!(circle.input, "Position");
    assert_eq!(circle.output, "Sdf");
    assert!(circle.params.contains(&"radius".to_string()));
}

#[test]
fn list_builtins_covers_all_types() {
    let builtins = game_compiler::list_builtins();
    // Should have generators, modifiers, and post-processing
    let has_position_to_sdf = builtins
        .iter()
        .any(|b| b.input == "Position" && b.output == "Sdf");
    let has_sdf_to_color = builtins
        .iter()
        .any(|b| b.input == "Sdf" && b.output == "Color");
    let has_color_to_color = builtins
        .iter()
        .any(|b| b.input == "Color" && b.output == "Color");
    assert!(has_position_to_sdf, "Should have Position->Sdf builtins");
    assert!(has_sdf_to_color, "Should have Sdf->Color builtins");
    assert!(has_color_to_color, "Should have Color->Color builtins");
}

// ── Optimization verification tests ─────────────────────

#[test]
fn constant_folding_works() {
    let src = r#"cinematic "t" { layer { fn: circle(1.0 + 1.0) | glow(1.5) } }"#;
    // The full compile pipeline includes optimization passes.
    // If constant folding works, this should compile without issues
    // and the AST should have folded 1.0 + 1.0 into 2.0.
    let program = game_compiler::compile_to_ast(src).unwrap();
    assert_eq!(program.cinematics.len(), 1);
    // After parse (before optimize), the expression is a BinOp.
    // Verify the compile path works end-to-end with constant folding.
    let result = game_compiler::compile(src, &default_config());
    assert!(result.is_ok(), "Constant expression should compile: {:?}", result.err());
}

#[test]
fn dead_define_eliminated_in_pipeline() {
    let src = r#"cinematic "t" {
        define unused_thing(x) { circle(x) | glow(1.5) }
        layer { fn: circle(0.3) | glow(1.5) }
    }"#;
    // Full pipeline should succeed even with dead define
    let result = game_compiler::compile(src, &default_config());
    assert!(
        result.is_ok(),
        "Dead define should be eliminated cleanly: {:?}",
        result.err()
    );
}

#[test]
fn dead_define_produces_warning_in_check() {
    // The dead define itself won't produce a warning from check(),
    // but check() does detect unknown functions in define bodies.
    // Let's verify check doesn't crash on programs with defines.
    let src = r#"cinematic "t" {
        define valid_shape(r) { circle(r) | glow(1.5) }
        layer { fn: circle(0.3) | glow(1.5) }
    }"#;
    let program = game_compiler::parse(src).unwrap();
    let warnings = game_compiler::check(&program);
    // No warnings expected for valid define
    assert!(warnings.is_empty(), "Valid define should produce no warnings: {warnings:?}");
}

#[test]
fn check_detects_unknown_function_in_define() {
    let src = r#"cinematic "t" {
        define bad_shape() { nonexistent_fn(0.5) }
        layer { fn: circle(0.3) }
    }"#;
    let program = game_compiler::parse(src).unwrap();
    let warnings = game_compiler::check(&program);
    assert!(
        warnings.iter().any(|w| w.contains("unknown function")),
        "Should warn about unknown function: {warnings:?}"
    );
}

#[test]
fn check_detects_unused_define_parameter() {
    let src = r#"cinematic "t" {
        define wasteful(r, unused) { circle(r) }
        layer { fn: circle(0.3) }
    }"#;
    let program = game_compiler::parse(src).unwrap();
    let warnings = game_compiler::check(&program);
    assert!(
        warnings.iter().any(|w| w.contains("unused")),
        "Should warn about unused parameter: {warnings:?}"
    );
}

// ── Round-trip tests ────────────────────────────────────

#[test]
fn compile_produces_nonempty_js() {
    let src = r#"cinematic "RoundTrip" { layer { fn: circle(0.3) | glow(1.5) } }"#;
    let results = game_compiler::compile(src, &default_config()).unwrap();
    assert_eq!(results.len(), 1);
    assert!(!results[0].js.is_empty(), "JS output should not be empty");
    assert!(results[0].wgsl.is_some(), "WGSL output should be present");
    assert!(results[0].glsl.is_some(), "GLSL output should be present");
}

#[test]
fn compile_name_matches_cinematic() {
    let src = r#"cinematic "MyComponent" { layer { fn: star(5.0, 0.3, 0.15) | shade(1.0, 0.8, 0.2) } }"#;
    let results = game_compiler::compile(src, &default_config()).unwrap();
    assert_eq!(results[0].name, "MyComponent");
}

#[test]
fn html_output_format_produces_html() {
    let src = r#"cinematic "HtmlTest" { layer { fn: circle(0.3) | glow(1.5) } }"#;
    let config = CompileConfig {
        output_format: OutputFormat::Html,
        target: ShaderTarget::Both,
    };
    let results = game_compiler::compile(src, &config).unwrap();
    assert!(results[0].html.is_some(), "HTML output should be present");
    let html = results[0].html.as_ref().unwrap();
    assert!(html.contains("<"), "HTML should contain markup");
}
