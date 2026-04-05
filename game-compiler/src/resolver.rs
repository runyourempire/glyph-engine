//! Module import resolver for GAME programs.
//!
//! Resolves `import` declarations by locating files, parsing them, and merging
//! their defines into the importing program.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::ast::{DefineBlock, Program};
use crate::error::CompileError;
use crate::lexer;
use crate::parser::Parser;

/// Resolve all imports in `program`, merging imported defines into the first
/// cinematic. Drains `program.imports` and recursively resolves transitive
/// imports.
pub fn resolve_imports(
    program: &mut Program,
    base_dir: &Path,
    lib_dirs: &[PathBuf],
) -> Result<(), CompileError> {
    let mut visited = HashSet::new();
    if let Ok(canonical) = base_dir.join("__root__").canonicalize() {
        visited.insert(canonical);
    }
    resolve_recursive(program, base_dir, lib_dirs, &mut visited)
}

const MAX_IMPORT_DEPTH: usize = 32;

fn resolve_recursive(
    program: &mut Program,
    base_dir: &Path,
    lib_dirs: &[PathBuf],
    visited: &mut HashSet<PathBuf>,
) -> Result<(), CompileError> {
    if visited.len() > MAX_IMPORT_DEPTH {
        return Err(CompileError::validation(format!(
            "import chain exceeds maximum depth of {MAX_IMPORT_DEPTH}"
        )));
    }
    let imports = std::mem::take(&mut program.imports);

    for import in imports {
        let file_path = find_file(&import.path, base_dir, lib_dirs)?;
        let canonical = file_path.canonicalize().map_err(|e| {
            CompileError::validation(format!("cannot canonicalize '{}': {e}", file_path.display()))
        })?;

        if !visited.insert(canonical.clone()) {
            return Err(CompileError::validation(format!(
                "circular import detected: '{}'",
                import.path
            )));
        }

        let source = fs::read_to_string(&canonical)?;
        let tokens = lexer::lex(&source)?;
        let mut imported = Parser::new(tokens).parse()?;

        let import_dir = canonical.parent().unwrap_or(base_dir);
        resolve_recursive(&mut imported, import_dir, lib_dirs, visited)?;

        let defines = collect_defines(&imported, &import);
        merge_defines(program, defines, &import)?;
    }

    Ok(())
}

/// Locate a file: try relative to `base_dir`, then each lib dir, with and
/// without `.game` extension.
fn find_file(
    path: &str,
    base_dir: &Path,
    lib_dirs: &[PathBuf],
) -> Result<PathBuf, CompileError> {
    let candidates = std::iter::once(base_dir.to_path_buf())
        .chain(lib_dirs.iter().cloned());

    for dir in candidates {
        let direct = dir.join(path);
        if direct.is_file() {
            return Ok(direct);
        }
        let with_ext = dir.join(format!("{path}.game"));
        if with_ext.is_file() {
            return Ok(with_ext);
        }
    }

    Err(CompileError::validation(format!(
        "import not found: '{path}'"
    )))
}

/// Extract defines from an imported program according to the import style.
fn collect_defines(imported: &Program, import: &crate::ast::Import) -> Vec<DefineBlock> {
    let all_defines: Vec<&DefineBlock> = imported
        .cinematics
        .iter()
        .flat_map(|c| &c.defines)
        .collect();

    if import.exposed.is_empty() {
        // `as` style — prefix every define with alias namespace
        all_defines
            .into_iter()
            .map(|d| DefineBlock {
                name: format!("{}.{}", import.alias, d.name),
                params: d.params.clone(),
                body: d.body.clone(),
            })
            .collect()
    } else if import.exposed.iter().any(|e| e == "ALL") {
        // `expose ALL` — import everything unmodified
        all_defines.into_iter().cloned().collect()
    } else {
        // `expose name1, name2` — pick specific defines
        all_defines
            .into_iter()
            .filter(|d| import.exposed.contains(&d.name))
            .cloned()
            .collect()
    }
}

/// Merge collected defines into the first cinematic of the program.
fn merge_defines(
    program: &mut Program,
    defines: Vec<DefineBlock>,
    import: &crate::ast::Import,
) -> Result<(), CompileError> {
    if defines.is_empty() && !import.exposed.is_empty() {
        return Err(CompileError::validation(format!(
            "import '{}': no matching defines found for exposed names {:?}",
            import.path, import.exposed
        )));
    }

    if defines.is_empty() {
        return Ok(());
    }

    if program.cinematics.is_empty() {
        return Err(CompileError::validation(
            "cannot merge imported defines: program has no cinematics",
        ));
    }

    program.cinematics[0].defines.extend(defines);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;
    use std::fs;

    fn make_temp_dir(name: &str) -> PathBuf {
        let dir = temp_dir().join(format!("game_resolver_test_{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn resolve_path_relative() {
        let dir = make_temp_dir("rel");
        fs::write(dir.join("utils.game"), "cinematic \"u\" {}").unwrap();

        let result = find_file("utils.game", &dir, &[]);
        assert!(result.is_ok());
        assert!(result.unwrap().ends_with("utils.game"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_path_with_extension() {
        let dir = make_temp_dir("ext");
        fs::write(dir.join("helpers.game"), "cinematic \"h\" {}").unwrap();

        // Should find "helpers" by appending .game
        let result = find_file("helpers", &dir, &[]);
        assert!(result.is_ok());
        assert!(result.unwrap().ends_with("helpers.game"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_path_in_lib_dir() {
        let base = make_temp_dir("lib_base");
        let lib = make_temp_dir("lib_std");
        fs::write(lib.join("stdlib.game"), "cinematic \"s\" {}").unwrap();

        let result = find_file("stdlib", &base, &[lib.clone()]);
        assert!(result.is_ok());

        let _ = fs::remove_dir_all(&base);
        let _ = fs::remove_dir_all(&lib);
    }

    #[test]
    fn circular_import_detected() {
        let dir = make_temp_dir("circ");
        fs::write(dir.join("a.game"), r#"import "b" as b  cinematic "a" {}"#).unwrap();
        fs::write(dir.join("b.game"), r#"import "a" as a  cinematic "b" {}"#).unwrap();

        let source = fs::read_to_string(dir.join("a.game")).unwrap();
        let tokens = lexer::lex(&source).unwrap();
        let mut program = Parser::new(tokens).parse().unwrap();

        let result = resolve_imports(&mut program, &dir, &[]);
        assert!(result.is_err());
        let msg = format!("{}", result.unwrap_err());
        assert!(msg.contains("circular import"), "expected circular import error, got: {msg}");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn expose_all_merges_defines() {
        use crate::ast::*;

        let dir = make_temp_dir("expose_all");
        fs::write(
            dir.join("lib.game"),
            r#"cinematic "lib" { define glow(intensity) { bloom(intensity) } }"#,
        ).unwrap();

        // Build AST directly since ALL is a keyword token, not an identifier
        let mut program = Program {
            imports: vec![Import {
                path: "lib".into(),
                alias: String::new(),
                exposed: vec!["ALL".into()],
            }],
            cinematics: vec![Cinematic {
                name: "main".into(),
                layers: vec![],
                arcs: vec![],
                resonates: vec![],
                listen: None,
                voice: None,
                score: None,
                gravity: None,
                lenses: vec![],
                react: None,
                defines: vec![],
            }],
            breeds: vec![],
            projects: vec![],
        };

        let result = resolve_imports(&mut program, &dir, &[]);
        assert!(result.is_ok(), "resolve failed: {:?}", result.unwrap_err());
        assert_eq!(program.cinematics[0].defines.len(), 1);
        assert_eq!(program.cinematics[0].defines[0].name, "glow");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn alias_import_prefixes_defines() {
        let dir = make_temp_dir("alias");
        fs::write(
            dir.join("fx.game"),
            r#"cinematic "fx" { define shimmer(rate) { wave(rate) } }"#,
        ).unwrap();

        let source = r#"import "fx" as fx  cinematic "main" {}"#;
        let tokens = lexer::lex(source).unwrap();
        let mut program = Parser::new(tokens).parse().unwrap();

        let result = resolve_imports(&mut program, &dir, &[]);
        assert!(result.is_ok(), "resolve failed: {:?}", result.unwrap_err());
        assert_eq!(program.cinematics[0].defines.len(), 1);
        assert_eq!(program.cinematics[0].defines[0].name, "fx.shimmer");

        let _ = fs::remove_dir_all(&dir);
    }
}
