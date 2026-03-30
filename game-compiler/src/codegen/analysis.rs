//! Cinematic analysis: define expansion and signal detection.
//!
//! This module provides:
//! - `expand_defines`: macro expansion for `define` blocks in layer pipelines
//! - `cinematic_uses_audio` / `cinematic_uses_mouse`: signal detection across
//!   an entire cinematic (params, layer bodies, lenses, react blocks)

use std::collections::HashMap;

use crate::ast::*;
use crate::codegen::expr;
use crate::error::CompileError;

/// Maximum depth for nested define expansion (prevents infinite recursion).
const MAX_DEFINE_DEPTH: usize = 16;

/// Expand all define calls in layer pipelines.
///
/// Scans each layer's `Pipeline` body for stage names that match a `define` block.
/// When found, replaces the call with the define's body stages, substituting
/// formal parameters with the actual arguments provided at the call site.
///
/// Repeats up to `MAX_DEFINE_DEPTH` passes to handle nested defines.
pub fn expand_defines(cinematic: &mut Cinematic) -> Result<(), CompileError> {
    // Build lookup: define name -> DefineBlock
    let defines: HashMap<String, DefineBlock> = cinematic
        .defines
        .iter()
        .map(|d| (d.name.clone(), d.clone()))
        .collect();

    if defines.is_empty() {
        return Ok(());
    }

    for layer in &mut cinematic.layers {
        if let LayerBody::Pipeline(ref mut stages) = layer.body {
            for depth in 0..MAX_DEFINE_DEPTH {
                let mut expanded = false;
                let mut new_stages = Vec::with_capacity(stages.len());

                for stage in stages.iter() {
                    if let Some(def) = defines.get(&stage.name) {
                        // Substitute formal params with actual args
                        let substituted = substitute_define(def, &stage.args);
                        new_stages.extend(substituted);
                        expanded = true;
                    } else {
                        new_stages.push(stage.clone());
                    }
                }

                *stages = new_stages;

                if !expanded {
                    break;
                }

                if depth == MAX_DEFINE_DEPTH - 1 {
                    return Err(CompileError::codegen(format!(
                        "define expansion exceeded max depth ({MAX_DEFINE_DEPTH}) \
                         in layer '{}' — possible recursive define",
                        layer.name
                    )));
                }
            }
        }
    }

    Ok(())
}

/// Substitute formal parameters in a define body with actual arguments.
///
/// For each stage in the define body, replaces `Expr::Ident` values that match
/// a formal parameter name with the corresponding argument expression.
fn substitute_define(def: &DefineBlock, actual_args: &[Arg]) -> Vec<Stage> {
    // Map formal param name -> actual expression
    let mut param_map: HashMap<&str, &Expr> = HashMap::new();
    for (i, formal) in def.params.iter().enumerate() {
        // Try named args first, then positional
        let actual = actual_args
            .iter()
            .find(|a| a.name.as_deref() == Some(formal.as_str()))
            .or_else(|| actual_args.get(i));
        if let Some(arg) = actual {
            param_map.insert(formal.as_str(), &arg.value);
        }
    }

    def.body
        .iter()
        .map(|stage| Stage {
            name: stage.name.clone(),
            args: stage
                .args
                .iter()
                .map(|arg| Arg {
                    name: arg.name.clone(),
                    value: substitute_expr(&arg.value, &param_map),
                })
                .collect(),
        })
        .collect()
}

/// Recursively substitute identifiers in an expression using the parameter map.
fn substitute_expr(expr: &Expr, param_map: &HashMap<&str, &Expr>) -> Expr {
    match expr {
        Expr::Ident(name) => {
            if let Some(replacement) = param_map.get(name.as_str()) {
                (*replacement).clone()
            } else {
                expr.clone()
            }
        }
        Expr::Paren(inner) => {
            Expr::Paren(Box::new(substitute_expr(inner, param_map)))
        }
        Expr::Neg(inner) => {
            Expr::Neg(Box::new(substitute_expr(inner, param_map)))
        }
        Expr::BinOp { op, left, right } => Expr::BinOp {
            op: op.clone(),
            left: Box::new(substitute_expr(left, param_map)),
            right: Box::new(substitute_expr(right, param_map)),
        },
        Expr::Call { name, args } => Expr::Call {
            name: name.clone(),
            args: args
                .iter()
                .map(|a| Arg {
                    name: a.name.clone(),
                    value: substitute_expr(&a.value, param_map),
                })
                .collect(),
        },
        Expr::Array(elems) => {
            Expr::Array(elems.iter().map(|e| substitute_expr(e, param_map)).collect())
        }
        Expr::Ternary {
            condition,
            if_true,
            if_false,
        } => Expr::Ternary {
            condition: Box::new(substitute_expr(condition, param_map)),
            if_true: Box::new(substitute_expr(if_true, param_map)),
            if_false: Box::new(substitute_expr(if_false, param_map)),
        },
        // Literals pass through unchanged
        _ => expr.clone(),
    }
}

/// Check if a cinematic uses audio signals anywhere.
///
/// Scans layer params, layer pipeline stage args, layer opts, lens properties,
/// lens post-processing stages, and react signal/action expressions.
pub fn cinematic_uses_audio(cinematic: &Cinematic) -> bool {
    // Check layer bodies and opts
    for layer in &cinematic.layers {
        for opt in &layer.opts {
            if param_uses_audio(opt) {
                return true;
            }
        }
        match &layer.body {
            LayerBody::Params(params) => {
                for param in params {
                    if param_uses_audio(param) {
                        return true;
                    }
                }
            }
            LayerBody::Pipeline(stages) => {
                for stage in stages {
                    for arg in &stage.args {
                        if expr::uses_audio(&arg.value) {
                            return true;
                        }
                    }
                }
            }
        }
    }

    // Check lenses
    for lens in &cinematic.lenses {
        for prop in &lens.properties {
            if param_uses_audio(prop) {
                return true;
            }
        }
        for stage in &lens.post {
            for arg in &stage.args {
                if expr::uses_audio(&arg.value) {
                    return true;
                }
            }
        }
    }

    // Check react block
    if let Some(ref react) = cinematic.react {
        for reaction in &react.reactions {
            if expr::uses_audio(&reaction.signal) || expr::uses_audio(&reaction.action) {
                return true;
            }
        }
    }

    // Check listen block presence (if listen exists, audio is used)
    if cinematic.listen.is_some() {
        return true;
    }

    false
}

/// Check if a cinematic uses mouse input anywhere.
///
/// Same scan scope as `cinematic_uses_audio` but checks for `mouse.*` references.
pub fn cinematic_uses_mouse(cinematic: &Cinematic) -> bool {
    // Check layer bodies and opts
    for layer in &cinematic.layers {
        for opt in &layer.opts {
            if param_uses_mouse(opt) {
                return true;
            }
        }
        match &layer.body {
            LayerBody::Params(params) => {
                for param in params {
                    if param_uses_mouse(param) {
                        return true;
                    }
                }
            }
            LayerBody::Pipeline(stages) => {
                for stage in stages {
                    for arg in &stage.args {
                        if expr::uses_mouse(&arg.value) {
                            return true;
                        }
                    }
                }
            }
        }
    }

    // Check lenses
    for lens in &cinematic.lenses {
        for prop in &lens.properties {
            if param_uses_mouse(prop) {
                return true;
            }
        }
        for stage in &lens.post {
            for arg in &stage.args {
                if expr::uses_mouse(&arg.value) {
                    return true;
                }
            }
        }
    }

    // Check react block
    if let Some(ref react) = cinematic.react {
        for reaction in &react.reactions {
            if expr::uses_mouse(&reaction.signal) || expr::uses_mouse(&reaction.action) {
                return true;
            }
        }
    }

    false
}

/// Check if a `Param` references audio (value or modulation).
fn param_uses_audio(param: &Param) -> bool {
    expr::uses_audio(&param.value)
        || param.modulation.as_ref().map_or(false, |m| expr::uses_audio(m))
}

/// Check if a `Param` references mouse (value or modulation).
fn param_uses_mouse(param: &Param) -> bool {
    expr::uses_mouse(&param.value)
        || param.modulation.as_ref().map_or(false, |m| expr::uses_mouse(m))
}

// ── Tests ────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper to build a minimal cinematic for testing.
    fn make_cinematic_with_defines(
        defines: Vec<DefineBlock>,
        pipeline: Vec<Stage>,
    ) -> Cinematic {
        Cinematic {
            name: "test".into(),
            layers: vec![Layer {
                name: "main".into(),
                opts: vec![],
                memory: None,
                cast: None,
                body: LayerBody::Pipeline(pipeline),
            }],
            arcs: vec![],
            resonates: vec![],
            listen: None,
            voice: None,
            score: None,
            gravity: None,
            lenses: vec![],
            react: None,
            defines,
        }
    }

    fn empty_cinematic() -> Cinematic {
        Cinematic {
            name: "empty".into(),
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
        }
    }

    // ── expand_defines ───────────────────────────────────

    #[test]
    fn expand_defines_substitutes_params() {
        let define = DefineBlock {
            name: "my_shape".into(),
            params: vec!["r".into()],
            body: vec![Stage {
                name: "circle".into(),
                args: vec![Arg {
                    name: Some("radius".into()),
                    value: Expr::Ident("r".into()),
                }],
            }],
        };

        let pipeline = vec![Stage {
            name: "my_shape".into(),
            args: vec![Arg {
                name: None,
                value: Expr::Number(0.5),
            }],
        }];

        let mut cin = make_cinematic_with_defines(vec![define], pipeline);
        expand_defines(&mut cin).unwrap();

        if let LayerBody::Pipeline(stages) = &cin.layers[0].body {
            assert_eq!(stages.len(), 1);
            assert_eq!(stages[0].name, "circle");
            // The "r" param should be replaced with 0.5
            if let Expr::Number(v) = &stages[0].args[0].value {
                assert!((v - 0.5).abs() < f64::EPSILON);
            } else {
                panic!("expected Number(0.5) after substitution");
            }
        } else {
            panic!("expected Pipeline body");
        }
    }

    #[test]
    fn expand_defines_multi_stage_body() {
        let define = DefineBlock {
            name: "styled".into(),
            params: vec!["color_r".into(), "color_g".into(), "color_b".into()],
            body: vec![
                Stage {
                    name: "circle".into(),
                    args: vec![],
                },
                Stage {
                    name: "glow".into(),
                    args: vec![],
                },
                Stage {
                    name: "tint".into(),
                    args: vec![
                        Arg { name: Some("r".into()), value: Expr::Ident("color_r".into()) },
                        Arg { name: Some("g".into()), value: Expr::Ident("color_g".into()) },
                        Arg { name: Some("b".into()), value: Expr::Ident("color_b".into()) },
                    ],
                },
            ],
        };

        let pipeline = vec![Stage {
            name: "styled".into(),
            args: vec![
                Arg { name: None, value: Expr::Number(1.0) },
                Arg { name: None, value: Expr::Number(0.0) },
                Arg { name: None, value: Expr::Number(0.0) },
            ],
        }];

        let mut cin = make_cinematic_with_defines(vec![define], pipeline);
        expand_defines(&mut cin).unwrap();

        if let LayerBody::Pipeline(stages) = &cin.layers[0].body {
            assert_eq!(stages.len(), 3);
            assert_eq!(stages[0].name, "circle");
            assert_eq!(stages[1].name, "glow");
            assert_eq!(stages[2].name, "tint");
            // Check the tint r arg was substituted to 1.0
            if let Expr::Number(v) = &stages[2].args[0].value {
                assert!((v - 1.0).abs() < f64::EPSILON);
            } else {
                panic!("expected Number after substitution");
            }
        } else {
            panic!("expected Pipeline body");
        }
    }

    #[test]
    fn expand_defines_no_defines_is_noop() {
        let pipeline = vec![Stage {
            name: "circle".into(),
            args: vec![],
        }];
        let mut cin = make_cinematic_with_defines(vec![], pipeline);
        expand_defines(&mut cin).unwrap();

        if let LayerBody::Pipeline(stages) = &cin.layers[0].body {
            assert_eq!(stages.len(), 1);
            assert_eq!(stages[0].name, "circle");
        }
    }

    #[test]
    fn expand_defines_named_args() {
        let define = DefineBlock {
            name: "my_circle".into(),
            params: vec!["size".into()],
            body: vec![Stage {
                name: "circle".into(),
                args: vec![Arg {
                    name: Some("radius".into()),
                    value: Expr::Ident("size".into()),
                }],
            }],
        };

        let pipeline = vec![Stage {
            name: "my_circle".into(),
            args: vec![Arg {
                name: Some("size".into()),
                value: Expr::Number(0.3),
            }],
        }];

        let mut cin = make_cinematic_with_defines(vec![define], pipeline);
        expand_defines(&mut cin).unwrap();

        if let LayerBody::Pipeline(stages) = &cin.layers[0].body {
            if let Expr::Number(v) = &stages[0].args[0].value {
                assert!((v - 0.3).abs() < f64::EPSILON);
            } else {
                panic!("expected Number(0.3)");
            }
        }
    }

    // ── cinematic_uses_audio ─────────────────────────────

    #[test]
    fn cinematic_uses_audio_from_pipeline() {
        let cin = Cinematic {
            name: "test".into(),
            layers: vec![Layer {
                name: "main".into(),
                opts: vec![],
                memory: None,
                cast: None,
                body: LayerBody::Pipeline(vec![Stage {
                    name: "circle".into(),
                    args: vec![Arg {
                        name: None,
                        value: Expr::DottedIdent {
                            object: "audio".into(),
                            field: "bass".into(),
                        },
                    }],
                }]),
            }],
            arcs: vec![],
            resonates: vec![],
            listen: None,
            voice: None,
            score: None,
            gravity: None,
            lenses: vec![],
            react: None,
            defines: vec![],
        };
        assert!(cinematic_uses_audio(&cin));
    }

    #[test]
    fn cinematic_uses_audio_from_params() {
        let cin = Cinematic {
            name: "test".into(),
            layers: vec![Layer {
                name: "config".into(),
                opts: vec![],
                memory: None,
                cast: None,
                body: LayerBody::Params(vec![Param {
                    name: "intensity".into(),
                    value: Expr::DottedIdent {
                        object: "audio".into(),
                        field: "energy".into(),
                    },
                    modulation: None,
                    temporal_ops: vec![],
                }]),
            }],
            arcs: vec![],
            resonates: vec![],
            listen: None,
            voice: None,
            score: None,
            gravity: None,
            lenses: vec![],
            react: None,
            defines: vec![],
        };
        assert!(cinematic_uses_audio(&cin));
    }

    #[test]
    fn cinematic_uses_audio_from_listen() {
        let mut cin = empty_cinematic();
        cin.listen = Some(ListenBlock { signals: vec![] });
        assert!(cinematic_uses_audio(&cin));
    }

    #[test]
    fn cinematic_uses_audio_from_modulation() {
        let cin = Cinematic {
            name: "test".into(),
            layers: vec![Layer {
                name: "config".into(),
                opts: vec![],
                memory: None,
                cast: None,
                body: LayerBody::Params(vec![Param {
                    name: "size".into(),
                    value: Expr::Number(0.5),
                    modulation: Some(Expr::DottedIdent {
                        object: "audio".into(),
                        field: "beat".into(),
                    }),
                    temporal_ops: vec![],
                }]),
            }],
            arcs: vec![],
            resonates: vec![],
            listen: None,
            voice: None,
            score: None,
            gravity: None,
            lenses: vec![],
            react: None,
            defines: vec![],
        };
        assert!(cinematic_uses_audio(&cin));
    }

    #[test]
    fn cinematic_uses_audio_false_for_empty() {
        let cin = empty_cinematic();
        assert!(!cinematic_uses_audio(&cin));
    }

    #[test]
    fn cinematic_uses_audio_from_react() {
        let mut cin = empty_cinematic();
        cin.react = Some(ReactBlock {
            reactions: vec![Reaction {
                signal: Expr::DottedIdent {
                    object: "audio".into(),
                    field: "beat".into(),
                },
                action: Expr::Number(1.0),
            }],
        });
        assert!(cinematic_uses_audio(&cin));
    }

    #[test]
    fn cinematic_uses_audio_from_lens() {
        let mut cin = empty_cinematic();
        cin.lenses = vec![Lens {
            name: Some("cam".into()),
            properties: vec![Param {
                name: "zoom".into(),
                value: Expr::DottedIdent {
                    object: "audio".into(),
                    field: "treble".into(),
                },
                modulation: None,
                temporal_ops: vec![],
            }],
            post: vec![],
        }];
        assert!(cinematic_uses_audio(&cin));
    }

    // ── cinematic_uses_mouse ─────────────────────────────

    #[test]
    fn cinematic_uses_mouse_from_pipeline() {
        let cin = Cinematic {
            name: "test".into(),
            layers: vec![Layer {
                name: "main".into(),
                opts: vec![],
                memory: None,
                cast: None,
                body: LayerBody::Pipeline(vec![Stage {
                    name: "translate".into(),
                    args: vec![Arg {
                        name: None,
                        value: Expr::DottedIdent {
                            object: "mouse".into(),
                            field: "x".into(),
                        },
                    }],
                }]),
            }],
            arcs: vec![],
            resonates: vec![],
            listen: None,
            voice: None,
            score: None,
            gravity: None,
            lenses: vec![],
            react: None,
            defines: vec![],
        };
        assert!(cinematic_uses_mouse(&cin));
    }

    #[test]
    fn cinematic_uses_mouse_false_for_empty() {
        let cin = empty_cinematic();
        assert!(!cinematic_uses_mouse(&cin));
    }

    #[test]
    fn cinematic_uses_mouse_from_react() {
        let mut cin = empty_cinematic();
        cin.react = Some(ReactBlock {
            reactions: vec![Reaction {
                signal: Expr::DottedIdent {
                    object: "mouse".into(),
                    field: "click".into(),
                },
                action: Expr::Number(1.0),
            }],
        });
        assert!(cinematic_uses_mouse(&cin));
    }
}
