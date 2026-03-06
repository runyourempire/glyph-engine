//! Stage pipeline state machine for shader codegen.

use crate::ast::{Arg, Expr, FnDef, Stage};
use crate::builtins::{self, ShaderState};
use crate::error::CompileError;

/// Resolve an argument value to a float string for shader emission.
pub fn resolve_arg(arg: &Arg, idx: usize, builtin_name: &str) -> String {
    match &arg.value {
        Expr::Number(v) => format!("{v:.6}"),
        Expr::Ident(name) => name.clone(),
        Expr::DottedIdent { object, field } => format!("{object}_{field}"),
        _ => {
            // Fallback: use builtin default if available
            builtins::lookup(builtin_name)
                .and_then(|b| b.params.get(idx))
                .and_then(|p| p.default)
                .map(|d| format!("{d:.6}"))
                .unwrap_or_else(|| "0.0".into())
        }
    }
}

/// Get an arg value by name or position.
pub fn get_arg(args: &[Arg], name: &str, pos: usize, stage_name: &str) -> String {
    // Try named first
    for arg in args {
        if arg.name.as_deref() == Some(name) {
            return resolve_arg(arg, pos, stage_name);
        }
    }
    // Try positional
    if let Some(arg) = args.get(pos) {
        return resolve_arg(arg, pos, stage_name);
    }
    // Fallback to default
    builtins::lookup(stage_name)
        .and_then(|b| b.params.get(pos))
        .and_then(|p| p.default)
        .map(|d| format!("{d:.6}"))
        .unwrap_or_else(|| "0.0".into())
}

/// Validate a pipeline of stages — returns error if state transitions are invalid.
pub fn validate_pipeline(stages: &[Stage]) -> Result<ShaderState, CompileError> {
    validate_pipeline_with_fns(stages, &[])
}

/// Validate a pipeline with user-defined function awareness.
pub fn validate_pipeline_with_fns(
    stages: &[Stage],
    fns: &[FnDef],
) -> Result<ShaderState, CompileError> {
    let mut state = ShaderState::Position;

    for stage in stages {
        // Try builtin first
        if let Some(builtin) = builtins::lookup(&stage.name) {
            if builtin.input != state {
                return Err(CompileError::validation(format!(
                    "stage '{}' expects {:?} input but pipeline is in {:?} state",
                    stage.name, builtin.input, state
                )));
            }
            state = builtin.output;
        }
        // Try user-defined fn
        else if let Some(fn_def) = fns.iter().find(|f| f.name == stage.name) {
            let fn_output = validate_pipeline_with_fns(&fn_def.body, fns)?;
            let fn_input = fn_def
                .body
                .first()
                .and_then(|s| builtins::lookup(&s.name))
                .map(|b| b.input)
                .unwrap_or(ShaderState::Position);

            if fn_input != state {
                return Err(CompileError::validation(format!(
                    "function '{}' expects {:?} input but pipeline is in {:?} state",
                    stage.name, fn_input, state
                )));
            }
            state = fn_output;
        } else {
            return Err(CompileError::validation(format!(
                "unknown stage function: '{}'",
                stage.name
            )));
        }
    }

    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::{Arg, Expr, Stage};

    fn stage(name: &str) -> Stage {
        Stage {
            name: name.into(),
            args: vec![],
        }
    }

    #[test]
    fn valid_pipeline_circle_glow_tint() {
        let stages = vec![stage("circle"), stage("glow"), stage("tint")];
        let result = validate_pipeline(&stages);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ShaderState::Color);
    }

    #[test]
    fn invalid_pipeline_glow_from_position() {
        let stages = vec![stage("glow")];
        let result = validate_pipeline(&stages);
        assert!(result.is_err());
    }

    #[test]
    fn transforms_stay_in_position() {
        let stages = vec![stage("translate"), stage("rotate"), stage("circle")];
        let result = validate_pipeline(&stages);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ShaderState::Sdf);
    }

    #[test]
    fn get_arg_with_default() {
        let args: Vec<Arg> = vec![];
        let val = get_arg(&args, "radius", 0, "circle");
        assert_eq!(val, "0.200000");
    }

    #[test]
    fn get_arg_positional() {
        let args = vec![Arg {
            name: None,
            value: Expr::Number(0.5),
        }];
        let val = get_arg(&args, "radius", 0, "circle");
        assert_eq!(val, "0.500000");
    }

    #[test]
    fn get_arg_named() {
        let args = vec![Arg {
            name: Some("radius".into()),
            value: Expr::Number(0.75),
        }];
        let val = get_arg(&args, "radius", 0, "circle");
        assert_eq!(val, "0.750000");
    }

    #[test]
    fn phase7_warp_voronoi_palette_pipeline() {
        let stages = vec![stage("warp"), stage("voronoi"), stage("palette")];
        let result = validate_pipeline(&stages);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ShaderState::Color);
    }

    #[test]
    fn phase7_distort_radial_fade_glow() {
        let stages = vec![stage("distort"), stage("radial_fade"), stage("glow")];
        let result = validate_pipeline(&stages);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ShaderState::Color);
    }

    #[test]
    fn phase7_polar_simplex_shade() {
        let stages = vec![stage("polar"), stage("simplex"), stage("shade")];
        let result = validate_pipeline(&stages);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ShaderState::Color);
    }

    #[test]
    fn boolean_union_pipeline() {
        let stages = vec![stage("union"), stage("glow"), stage("tint")];
        let result = validate_pipeline(&stages);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ShaderState::Color);
    }

    #[test]
    fn smooth_union_pipeline() {
        let stages = vec![stage("smooth_union"), stage("glow")];
        let result = validate_pipeline(&stages);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ShaderState::Color);
    }

    #[test]
    fn spatial_repeat_circle_pipeline() {
        let stages = vec![stage("repeat"), stage("circle"), stage("glow")];
        let result = validate_pipeline(&stages);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ShaderState::Color);
    }

    #[test]
    fn mirror_radial_pipeline() {
        let stages = vec![stage("mirror"), stage("radial"), stage("circle"), stage("glow")];
        let result = validate_pipeline(&stages);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ShaderState::Color);
    }

    #[test]
    fn shape_modifier_round_pipeline() {
        let stages = vec![stage("box"), stage("round"), stage("glow")];
        let result = validate_pipeline(&stages);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ShaderState::Color);
    }

    #[test]
    fn shape_modifier_shell_pipeline() {
        let stages = vec![stage("circle"), stage("shell"), stage("glow")];
        let result = validate_pipeline(&stages);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ShaderState::Color);
    }

    #[test]
    fn shape_modifier_onion_pipeline() {
        let stages = vec![stage("circle"), stage("onion"), stage("glow")];
        let result = validate_pipeline(&stages);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ShaderState::Color);
    }

    #[test]
    fn new_primitives_pipeline() {
        for prim in [
            "line", "capsule", "triangle", "arc_sdf", "cross", "heart", "egg", "spiral", "grid",
        ] {
            let stages = vec![stage(prim), stage("glow")];
            let result = validate_pipeline(&stages);
            assert!(result.is_ok(), "primitive '{prim}' should produce Sdf");
            assert_eq!(result.unwrap(), ShaderState::Color);
        }
    }

    #[test]
    fn outline_is_color_to_color() {
        let stages = vec![stage("circle"), stage("glow"), stage("outline")];
        let result = validate_pipeline(&stages);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ShaderState::Color);
    }

    // v0.4 — user-defined fn validation

    #[test]
    fn fn_pipeline_validates() {
        let fns = vec![FnDef {
            name: "dot".into(),
            params: vec![],
            body: vec![stage("circle"), stage("glow"), stage("tint")],
        }];
        let stages = vec![stage("dot")];
        let result = validate_pipeline_with_fns(&stages, &fns);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ShaderState::Color);
    }

    #[test]
    fn fn_wrong_input_state_rejected() {
        // fn that expects Position but pipeline already in Sdf state
        let fns = vec![FnDef {
            name: "post".into(),
            params: vec![],
            body: vec![stage("circle"), stage("glow")],
        }];
        // circle produces Sdf, then "post" expects Position input
        let stages = vec![stage("circle"), stage("post")];
        let result = validate_pipeline_with_fns(&stages, &fns);
        assert!(result.is_err());
    }

    #[test]
    fn fn_chained_with_builtins() {
        // fn sdf_shape() { circle() } → pipeline: sdf_shape | glow | tint
        let fns = vec![FnDef {
            name: "sdf_shape".into(),
            params: vec![],
            body: vec![stage("circle")],
        }];
        let stages = vec![stage("sdf_shape"), stage("glow"), stage("tint")];
        let result = validate_pipeline_with_fns(&stages, &fns);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ShaderState::Color);
    }

    #[test]
    fn unknown_fn_rejected() {
        let stages = vec![stage("nonexistent_fn")];
        let result = validate_pipeline_with_fns(&stages, &[]);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("unknown stage function"));
    }

    #[test]
    fn morph_validates_as_sdf() {
        let stages = vec![stage("morph"), stage("glow")];
        let result = validate_pipeline(&stages);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), ShaderState::Color);
    }
}
