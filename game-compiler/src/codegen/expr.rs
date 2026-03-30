//! Expression compilation to WGSL and JavaScript.
//!
//! Provides two compilation targets for GAME expressions:
//! - WGSL for GPU shader code (fragment/compute shaders)
//! - JavaScript for runtime modulation (audio, mouse, data binding)
//!
//! Also includes signal detection utilities (`uses_audio`, `uses_mouse`, etc.)
//! used by the analysis module and runtime emitters.

use crate::ast::*;

/// Map a color name to its WGSL `vec3f` representation.
pub fn resolve_color(name: &str) -> Option<&'static str> {
    match name {
        "black" => Some("vec3f(0.0, 0.0, 0.0)"),
        "white" => Some("vec3f(1.0, 1.0, 1.0)"),
        "red" => Some("vec3f(1.0, 0.0, 0.0)"),
        "green" => Some("vec3f(0.0, 1.0, 0.0)"),
        "blue" => Some("vec3f(0.0, 0.0, 1.0)"),
        "gold" => Some("vec3f(0.831, 0.686, 0.216)"),
        "midnight" => Some("vec3f(0.039, 0.039, 0.118)"),
        "obsidian" => Some("vec3f(0.071, 0.059, 0.082)"),
        "ember" => Some("vec3f(0.898, 0.318, 0.129)"),
        "cyan" => Some("vec3f(0.0, 1.0, 1.0)"),
        "ivory" => Some("vec3f(1.0, 1.0, 0.941)"),
        "frost" => Some("vec3f(0.686, 0.878, 0.953)"),
        "orange" => Some("vec3f(1.0, 0.647, 0.0)"),
        "deep_blue" => Some("vec3f(0.0, 0.098, 0.392)"),
        "ash" => Some("vec3f(0.467, 0.467, 0.467)"),
        "charcoal" => Some("vec3f(0.212, 0.212, 0.212)"),
        "plasma" => Some("vec3f(0.580, 0.0, 0.827)"),
        "violet" => Some("vec3f(0.541, 0.169, 0.886)"),
        "magenta" => Some("vec3f(1.0, 0.0, 1.0)"),
        _ => None,
    }
}

/// Map a constant name to its numeric string value.
pub fn resolve_constant(name: &str) -> Option<&'static str> {
    match name {
        "pi" => Some("3.14159265358979"),
        "tau" => Some("6.28318530717959"),
        "e" => Some("2.71828182845905"),
        "phi" => Some("1.61803398874989"),
        _ => None,
    }
}

/// Compile an expression to WGSL shader code.
pub fn compile_wgsl(expr: &Expr) -> String {
    match expr {
        Expr::Number(v) => {
            if *v == (*v as i64) as f64 {
                format!("{v:.1}")
            } else {
                format!("{v}")
            }
        }
        Expr::String(s) => format!("\"{s}\""),
        Expr::Ident(name) => {
            if let Some(color) = resolve_color(name) {
                color.to_string()
            } else if let Some(constant) = resolve_constant(name) {
                constant.to_string()
            } else {
                name.clone()
            }
        }
        Expr::DottedIdent { object, field } => format!("{object}.{field}"),
        Expr::Array(elems) => {
            let compiled: Vec<String> = elems.iter().map(compile_wgsl).collect();
            match compiled.len() {
                2 => format!("vec2f({}, {})", compiled[0], compiled[1]),
                3 => format!("vec3f({}, {}, {})", compiled[0], compiled[1], compiled[2]),
                4 => format!(
                    "vec4f({}, {}, {}, {})",
                    compiled[0], compiled[1], compiled[2], compiled[3]
                ),
                _ => format!("vec{}f({})", compiled.len(), compiled.join(", ")),
            }
        }
        Expr::Paren(inner) => format!("({})", compile_wgsl(inner)),
        Expr::Neg(inner) => format!("(-{})", compile_wgsl(inner)),
        Expr::BinOp { op, left, right } => {
            let l = compile_wgsl(left);
            let r = compile_wgsl(right);
            match op {
                BinOp::Add => format!("({l} + {r})"),
                BinOp::Sub => format!("({l} - {r})"),
                BinOp::Mul => format!("({l} * {r})"),
                BinOp::Div => format!("({l} / {r})"),
                BinOp::Pow => format!("pow({l}, {r})"),
                BinOp::Gt => format!("({l} > {r})"),
                BinOp::Lt => format!("({l} < {r})"),
            }
        }
        Expr::Call { name, args } => {
            let compiled_args: Vec<String> =
                args.iter().map(|a| compile_wgsl(&a.value)).collect();
            let args_str = compiled_args.join(", ");
            match name.as_str() {
                "mod" => {
                    if compiled_args.len() == 2 {
                        format!("({} % {})", compiled_args[0], compiled_args[1])
                    } else {
                        format!("({args_str} % 1.0)")
                    }
                }
                "abs" | "sin" | "cos" | "tan" | "sqrt" | "floor" | "ceil" | "fract"
                | "length" | "normalize" | "exp" | "log" | "sign" | "round" => {
                    format!("{name}({args_str})")
                }
                "mix" | "clamp" | "smoothstep" | "step" | "min" | "max" | "pow"
                | "distance" | "dot" | "cross" | "reflect" | "atan2" => {
                    format!("{name}({args_str})")
                }
                _ => format!("{name}({args_str})"),
            }
        }
        Expr::Duration(dur) => {
            let secs = match dur {
                Duration::Seconds(s) => *s,
                Duration::Millis(ms) => ms / 1000.0,
                Duration::Bars(b) => *b as f64 * 2.0, // assume 120 BPM default
            };
            if secs == (secs as i64) as f64 {
                format!("{secs:.1}")
            } else {
                format!("{secs}")
            }
        }
        Expr::Ternary {
            condition,
            if_true,
            if_false,
        } => {
            // WGSL uses select(false_val, true_val, condition)
            let cond = compile_wgsl(condition);
            let t = compile_wgsl(if_true);
            let f = compile_wgsl(if_false);
            format!("select({f}, {t}, {cond})")
        }
    }
}

/// Compile an expression to JavaScript (for runtime modulation).
pub fn compile_js(expr: &Expr) -> String {
    match expr {
        Expr::Number(v) => {
            if *v == (*v as i64) as f64 {
                format!("{v:.1}")
            } else {
                format!("{v}")
            }
        }
        Expr::String(s) => format!("\"{s}\""),
        Expr::Ident(name) => {
            if name == "time" {
                "time".to_string()
            } else if let Some(_color) = resolve_color(name) {
                // Return color as JS array [r, g, b]
                match name.as_str() {
                    "black" => "[0, 0, 0]".to_string(),
                    "white" => "[1, 1, 1]".to_string(),
                    "red" => "[1, 0, 0]".to_string(),
                    "green" => "[0, 1, 0]".to_string(),
                    "blue" => "[0, 0, 1]".to_string(),
                    "gold" => "[0.831, 0.686, 0.216]".to_string(),
                    "midnight" => "[0.039, 0.039, 0.118]".to_string(),
                    "obsidian" => "[0.071, 0.059, 0.082]".to_string(),
                    "ember" => "[0.898, 0.318, 0.129]".to_string(),
                    "cyan" => "[0, 1, 1]".to_string(),
                    "ivory" => "[1, 1, 0.941]".to_string(),
                    "frost" => "[0.686, 0.878, 0.953]".to_string(),
                    "orange" => "[1, 0.647, 0]".to_string(),
                    "deep_blue" => "[0, 0.098, 0.392]".to_string(),
                    "ash" => "[0.467, 0.467, 0.467]".to_string(),
                    "charcoal" => "[0.212, 0.212, 0.212]".to_string(),
                    "plasma" => "[0.580, 0, 0.827]".to_string(),
                    "violet" => "[0.541, 0.169, 0.886]".to_string(),
                    "magenta" => "[1, 0, 1]".to_string(),
                    _ => name.clone(),
                }
            } else if let Some(constant) = resolve_constant(name) {
                constant.to_string()
            } else {
                name.clone()
            }
        }
        Expr::DottedIdent { object, field } => match object.as_str() {
            "audio" => format!("audio{}", capitalize(field)),
            "mouse" => format!("mouse{}", capitalize(field)),
            "data" => format!("data_{field}"),
            _ => format!("{object}_{field}"),
        },
        Expr::Array(elems) => {
            let compiled: Vec<String> = elems.iter().map(compile_js).collect();
            format!("[{}]", compiled.join(", "))
        }
        Expr::Paren(inner) => format!("({})", compile_js(inner)),
        Expr::Neg(inner) => format!("(-{})", compile_js(inner)),
        Expr::BinOp { op, left, right } => {
            let l = compile_js(left);
            let r = compile_js(right);
            match op {
                BinOp::Add => format!("({l} + {r})"),
                BinOp::Sub => format!("({l} - {r})"),
                BinOp::Mul => format!("({l} * {r})"),
                BinOp::Div => format!("({l} / {r})"),
                BinOp::Pow => format!("({l} ** {r})"),
                BinOp::Gt => format!("({l} > {r})"),
                BinOp::Lt => format!("({l} < {r})"),
            }
        }
        Expr::Call { name, args } => {
            let compiled_args: Vec<String> =
                args.iter().map(|a| compile_js(&a.value)).collect();
            let args_str = compiled_args.join(", ");
            match name.as_str() {
                "mod" => {
                    if compiled_args.len() == 2 {
                        format!("({} % {})", compiled_args[0], compiled_args[1])
                    } else {
                        format!("({args_str} % 1)")
                    }
                }
                "abs" | "sin" | "cos" | "tan" | "sqrt" | "floor" | "ceil" | "round"
                | "exp" | "log" | "sign" | "min" | "max" | "pow" | "atan2" => {
                    format!("Math.{name}({args_str})")
                }
                "mix" => {
                    // mix(a, b, t) => a + (b - a) * t
                    if compiled_args.len() == 3 {
                        format!(
                            "({a} + ({b} - {a}) * {t})",
                            a = compiled_args[0],
                            b = compiled_args[1],
                            t = compiled_args[2]
                        )
                    } else {
                        format!("mix({args_str})")
                    }
                }
                "clamp" => {
                    if compiled_args.len() == 3 {
                        format!(
                            "Math.min(Math.max({val}, {lo}), {hi})",
                            val = compiled_args[0],
                            lo = compiled_args[1],
                            hi = compiled_args[2]
                        )
                    } else {
                        format!("clamp({args_str})")
                    }
                }
                "smoothstep" => {
                    if compiled_args.len() == 3 {
                        // smoothstep as inline JS
                        format!(
                            "((t => t * t * (3 - 2 * t))(Math.min(Math.max(({val} - {lo}) / ({hi} - {lo}), 0), 1)))",
                            val = compiled_args[2],
                            lo = compiled_args[0],
                            hi = compiled_args[1]
                        )
                    } else {
                        format!("smoothstep({args_str})")
                    }
                }
                "fract" => format!("(({args_str}) % 1)"),
                "length" => {
                    format!("Math.hypot({args_str})")
                }
                _ => format!("{name}({args_str})"),
            }
        }
        Expr::Duration(dur) => {
            let secs = match dur {
                Duration::Seconds(s) => *s,
                Duration::Millis(ms) => ms / 1000.0,
                Duration::Bars(b) => *b as f64 * 2.0,
            };
            if secs == (secs as i64) as f64 {
                format!("{secs:.1}")
            } else {
                format!("{secs}")
            }
        }
        Expr::Ternary {
            condition,
            if_true,
            if_false,
        } => {
            let cond = compile_js(condition);
            let t = compile_js(if_true);
            let f = compile_js(if_false);
            format!("({cond} ? {t} : {f})")
        }
    }
}

/// Capitalize the first letter of a string (for camelCase JS names).
fn capitalize(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(c) => c.to_uppercase().collect::<String>() + chars.as_str(),
    }
}

/// Check if an expression references audio signals.
pub fn uses_audio(expr: &Expr) -> bool {
    match expr {
        Expr::DottedIdent { object, .. } => object == "audio",
        Expr::Paren(inner) | Expr::Neg(inner) => uses_audio(inner),
        Expr::BinOp { left, right, .. } => uses_audio(left) || uses_audio(right),
        Expr::Call { args, .. } => args.iter().any(|a| uses_audio(&a.value)),
        Expr::Array(elems) => elems.iter().any(uses_audio),
        Expr::Ternary {
            condition,
            if_true,
            if_false,
        } => uses_audio(condition) || uses_audio(if_true) || uses_audio(if_false),
        _ => false,
    }
}

/// Check if an expression references mouse signals.
pub fn uses_mouse(expr: &Expr) -> bool {
    match expr {
        Expr::DottedIdent { object, .. } => object == "mouse",
        Expr::Paren(inner) | Expr::Neg(inner) => uses_mouse(inner),
        Expr::BinOp { left, right, .. } => uses_mouse(left) || uses_mouse(right),
        Expr::Call { args, .. } => args.iter().any(|a| uses_mouse(&a.value)),
        Expr::Array(elems) => elems.iter().any(uses_mouse),
        Expr::Ternary {
            condition,
            if_true,
            if_false,
        } => uses_mouse(condition) || uses_mouse(if_true) || uses_mouse(if_false),
        _ => false,
    }
}

/// Check if an expression references data signals.
pub fn uses_data(expr: &Expr) -> bool {
    match expr {
        Expr::DottedIdent { object, .. } => object == "data",
        Expr::Paren(inner) | Expr::Neg(inner) => uses_data(inner),
        Expr::BinOp { left, right, .. } => uses_data(left) || uses_data(right),
        Expr::Call { args, .. } => args.iter().any(|a| uses_data(&a.value)),
        Expr::Array(elems) => elems.iter().any(uses_data),
        Expr::Ternary {
            condition,
            if_true,
            if_false,
        } => uses_data(condition) || uses_data(if_true) || uses_data(if_false),
        _ => false,
    }
}

/// Collect `data.*` field names from an expression into `fields`.
pub fn collect_data_fields(expr: &Expr, fields: &mut Vec<String>) {
    match expr {
        Expr::DottedIdent { object, field } if object == "data" => {
            if !fields.contains(field) {
                fields.push(field.clone());
            }
        }
        Expr::Paren(inner) | Expr::Neg(inner) => collect_data_fields(inner, fields),
        Expr::BinOp { left, right, .. } => {
            collect_data_fields(left, fields);
            collect_data_fields(right, fields);
        }
        Expr::Call { args, .. } => {
            for arg in args {
                collect_data_fields(&arg.value, fields);
            }
        }
        Expr::Array(elems) => {
            for elem in elems {
                collect_data_fields(elem, fields);
            }
        }
        Expr::Ternary {
            condition,
            if_true,
            if_false,
        } => {
            collect_data_fields(condition, fields);
            collect_data_fields(if_true, fields);
            collect_data_fields(if_false, fields);
        }
        _ => {}
    }
}

/// Extract a numeric value from an expression (literal or negated literal).
pub fn extract_number(expr: &Expr) -> Option<f64> {
    match expr {
        Expr::Number(v) => Some(*v),
        Expr::Neg(inner) => extract_number(inner).map(|v| -v),
        Expr::Paren(inner) => extract_number(inner),
        _ => None,
    }
}

// ── Tests ────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── WGSL compilation ─────────────────────────────────

    #[test]
    fn wgsl_number_integer_gets_decimal() {
        assert_eq!(compile_wgsl(&Expr::Number(5.0)), "5.0");
    }

    #[test]
    fn wgsl_number_float_preserved() {
        assert_eq!(compile_wgsl(&Expr::Number(3.14)), "3.14");
    }

    #[test]
    fn wgsl_ident_color_resolved() {
        assert_eq!(
            compile_wgsl(&Expr::Ident("gold".into())),
            "vec3f(0.831, 0.686, 0.216)"
        );
    }

    #[test]
    fn wgsl_ident_constant_resolved() {
        assert_eq!(
            compile_wgsl(&Expr::Ident("pi".into())),
            "3.14159265358979"
        );
    }

    #[test]
    fn wgsl_ident_passthrough() {
        assert_eq!(compile_wgsl(&Expr::Ident("intensity".into())), "intensity");
    }

    #[test]
    fn wgsl_binop_add() {
        let expr = Expr::BinOp {
            op: BinOp::Add,
            left: Box::new(Expr::Number(1.0)),
            right: Box::new(Expr::Number(2.0)),
        };
        assert_eq!(compile_wgsl(&expr), "(1.0 + 2.0)");
    }

    #[test]
    fn wgsl_binop_pow_uses_pow_fn() {
        let expr = Expr::BinOp {
            op: BinOp::Pow,
            left: Box::new(Expr::Ident("x".into())),
            right: Box::new(Expr::Number(2.0)),
        };
        assert_eq!(compile_wgsl(&expr), "pow(x, 2.0)");
    }

    #[test]
    fn wgsl_ternary_uses_select() {
        let expr = Expr::Ternary {
            condition: Box::new(Expr::Ident("cond".into())),
            if_true: Box::new(Expr::Number(1.0)),
            if_false: Box::new(Expr::Number(0.0)),
        };
        assert_eq!(compile_wgsl(&expr), "select(0.0, 1.0, cond)");
    }

    #[test]
    fn wgsl_call_sin() {
        let expr = Expr::Call {
            name: "sin".into(),
            args: vec![Arg {
                name: None,
                value: Expr::Ident("time".into()),
            }],
        };
        assert_eq!(compile_wgsl(&expr), "sin(time)");
    }

    #[test]
    fn wgsl_call_mod_becomes_percent() {
        let expr = Expr::Call {
            name: "mod".into(),
            args: vec![
                Arg { name: None, value: Expr::Ident("x".into()) },
                Arg { name: None, value: Expr::Number(1.0) },
            ],
        };
        assert_eq!(compile_wgsl(&expr), "(x % 1.0)");
    }

    #[test]
    fn wgsl_array_vec3() {
        let expr = Expr::Array(vec![
            Expr::Number(1.0),
            Expr::Number(0.5),
            Expr::Number(0.0),
        ]);
        assert_eq!(compile_wgsl(&expr), "vec3f(1.0, 0.5, 0.0)");
    }

    #[test]
    fn wgsl_neg() {
        let expr = Expr::Neg(Box::new(Expr::Number(3.0)));
        assert_eq!(compile_wgsl(&expr), "(-3.0)");
    }

    #[test]
    fn wgsl_dotted_ident() {
        let expr = Expr::DottedIdent {
            object: "audio".into(),
            field: "bass".into(),
        };
        assert_eq!(compile_wgsl(&expr), "audio.bass");
    }

    #[test]
    fn wgsl_duration_seconds() {
        let expr = Expr::Duration(Duration::Seconds(2.5));
        assert_eq!(compile_wgsl(&expr), "2.5");
    }

    #[test]
    fn wgsl_duration_millis() {
        let expr = Expr::Duration(Duration::Millis(500.0));
        assert_eq!(compile_wgsl(&expr), "0.5");
    }

    #[test]
    fn wgsl_paren() {
        let expr = Expr::Paren(Box::new(Expr::Number(42.0)));
        assert_eq!(compile_wgsl(&expr), "(42.0)");
    }

    #[test]
    fn wgsl_string() {
        assert_eq!(compile_wgsl(&Expr::String("hello".into())), "\"hello\"");
    }

    #[test]
    fn wgsl_gt_lt() {
        let gt = Expr::BinOp {
            op: BinOp::Gt,
            left: Box::new(Expr::Ident("x".into())),
            right: Box::new(Expr::Number(0.0)),
        };
        assert_eq!(compile_wgsl(&gt), "(x > 0.0)");

        let lt = Expr::BinOp {
            op: BinOp::Lt,
            left: Box::new(Expr::Ident("y".into())),
            right: Box::new(Expr::Number(1.0)),
        };
        assert_eq!(compile_wgsl(&lt), "(y < 1.0)");
    }

    // ── JS compilation ───────────────────────────────────

    #[test]
    fn js_dotted_audio_bass() {
        let expr = Expr::DottedIdent {
            object: "audio".into(),
            field: "bass".into(),
        };
        assert_eq!(compile_js(&expr), "audioBass");
    }

    #[test]
    fn js_dotted_mouse_x() {
        let expr = Expr::DottedIdent {
            object: "mouse".into(),
            field: "x".into(),
        };
        assert_eq!(compile_js(&expr), "mouseX");
    }

    #[test]
    fn js_dotted_data_field() {
        let expr = Expr::DottedIdent {
            object: "data".into(),
            field: "temperature".into(),
        };
        assert_eq!(compile_js(&expr), "data_temperature");
    }

    #[test]
    fn js_pow_uses_double_star() {
        let expr = Expr::BinOp {
            op: BinOp::Pow,
            left: Box::new(Expr::Ident("x".into())),
            right: Box::new(Expr::Number(2.0)),
        };
        assert_eq!(compile_js(&expr), "(x ** 2.0)");
    }

    #[test]
    fn js_call_sin_uses_math() {
        let expr = Expr::Call {
            name: "sin".into(),
            args: vec![Arg {
                name: None,
                value: Expr::Ident("time".into()),
            }],
        };
        assert_eq!(compile_js(&expr), "Math.sin(time)");
    }

    #[test]
    fn js_ternary_uses_question_mark() {
        let expr = Expr::Ternary {
            condition: Box::new(Expr::Ident("cond".into())),
            if_true: Box::new(Expr::Number(1.0)),
            if_false: Box::new(Expr::Number(0.0)),
        };
        assert_eq!(compile_js(&expr), "(cond ? 1.0 : 0.0)");
    }

    #[test]
    fn js_number_formats() {
        assert_eq!(compile_js(&Expr::Number(5.0)), "5.0");
        assert_eq!(compile_js(&Expr::Number(3.14)), "3.14");
    }

    #[test]
    fn js_ident_time() {
        assert_eq!(compile_js(&Expr::Ident("time".into())), "time");
    }

    #[test]
    fn js_ident_color_as_array() {
        assert_eq!(compile_js(&Expr::Ident("red".into())), "[1, 0, 0]");
    }

    #[test]
    fn js_array() {
        let expr = Expr::Array(vec![Expr::Number(1.0), Expr::Number(2.0)]);
        assert_eq!(compile_js(&expr), "[1.0, 2.0]");
    }

    #[test]
    fn js_mix_expansion() {
        let expr = Expr::Call {
            name: "mix".into(),
            args: vec![
                Arg { name: None, value: Expr::Number(0.0) },
                Arg { name: None, value: Expr::Number(1.0) },
                Arg { name: None, value: Expr::Number(0.5) },
            ],
        };
        assert_eq!(compile_js(&expr), "(0.0 + (1.0 - 0.0) * 0.5)");
    }

    #[test]
    fn js_clamp_expansion() {
        let expr = Expr::Call {
            name: "clamp".into(),
            args: vec![
                Arg { name: None, value: Expr::Ident("x".into()) },
                Arg { name: None, value: Expr::Number(0.0) },
                Arg { name: None, value: Expr::Number(1.0) },
            ],
        };
        assert_eq!(compile_js(&expr), "Math.min(Math.max(x, 0.0), 1.0)");
    }

    // ── Signal detection ─────────────────────────────────

    #[test]
    fn uses_audio_returns_true_for_audio_bass() {
        let expr = Expr::DottedIdent {
            object: "audio".into(),
            field: "bass".into(),
        };
        assert!(uses_audio(&expr));
        assert!(!uses_mouse(&expr));
        assert!(!uses_data(&expr));
    }

    #[test]
    fn uses_audio_detects_nested() {
        let expr = Expr::BinOp {
            op: BinOp::Mul,
            left: Box::new(Expr::DottedIdent {
                object: "audio".into(),
                field: "energy".into(),
            }),
            right: Box::new(Expr::Number(2.0)),
        };
        assert!(uses_audio(&expr));
    }

    #[test]
    fn uses_mouse_returns_true_for_mouse_x() {
        let expr = Expr::DottedIdent {
            object: "mouse".into(),
            field: "x".into(),
        };
        assert!(uses_mouse(&expr));
        assert!(!uses_audio(&expr));
    }

    #[test]
    fn uses_data_returns_true_for_data_temp() {
        let expr = Expr::DottedIdent {
            object: "data".into(),
            field: "temp".into(),
        };
        assert!(uses_data(&expr));
    }

    #[test]
    fn uses_audio_false_for_plain_number() {
        assert!(!uses_audio(&Expr::Number(42.0)));
    }

    #[test]
    fn uses_audio_through_call() {
        let expr = Expr::Call {
            name: "sin".into(),
            args: vec![Arg {
                name: None,
                value: Expr::DottedIdent {
                    object: "audio".into(),
                    field: "beat".into(),
                },
            }],
        };
        assert!(uses_audio(&expr));
    }

    #[test]
    fn uses_audio_through_ternary() {
        let expr = Expr::Ternary {
            condition: Box::new(Expr::DottedIdent {
                object: "audio".into(),
                field: "beat".into(),
            }),
            if_true: Box::new(Expr::Number(1.0)),
            if_false: Box::new(Expr::Number(0.0)),
        };
        assert!(uses_audio(&expr));
    }

    // ── Data field collection ────────────────────────────

    #[test]
    fn collect_data_fields_gathers_unique() {
        let expr = Expr::BinOp {
            op: BinOp::Add,
            left: Box::new(Expr::DottedIdent {
                object: "data".into(),
                field: "temp".into(),
            }),
            right: Box::new(Expr::DottedIdent {
                object: "data".into(),
                field: "temp".into(), // duplicate
            }),
        };
        let mut fields = Vec::new();
        collect_data_fields(&expr, &mut fields);
        assert_eq!(fields, vec!["temp".to_string()]);
    }

    #[test]
    fn collect_data_fields_multiple() {
        let expr = Expr::BinOp {
            op: BinOp::Add,
            left: Box::new(Expr::DottedIdent {
                object: "data".into(),
                field: "x".into(),
            }),
            right: Box::new(Expr::DottedIdent {
                object: "data".into(),
                field: "y".into(),
            }),
        };
        let mut fields = Vec::new();
        collect_data_fields(&expr, &mut fields);
        assert_eq!(fields.len(), 2);
        assert!(fields.contains(&"x".to_string()));
        assert!(fields.contains(&"y".to_string()));
    }

    // ── extract_number ───────────────────────────────────

    #[test]
    fn extract_number_literal() {
        assert_eq!(extract_number(&Expr::Number(42.0)), Some(42.0));
    }

    #[test]
    fn extract_number_neg() {
        let expr = Expr::Neg(Box::new(Expr::Number(3.0)));
        assert_eq!(extract_number(&expr), Some(-3.0));
    }

    #[test]
    fn extract_number_paren() {
        let expr = Expr::Paren(Box::new(Expr::Number(7.0)));
        assert_eq!(extract_number(&expr), Some(7.0));
    }

    #[test]
    fn extract_number_non_numeric() {
        assert_eq!(extract_number(&Expr::Ident("foo".into())), None);
    }

    // ── Color/constant resolution ────────────────────────

    #[test]
    fn resolve_all_colors() {
        let names = [
            "black", "white", "red", "green", "blue", "gold", "midnight",
            "obsidian", "ember", "cyan", "ivory", "frost", "orange",
            "deep_blue", "ash", "charcoal", "plasma", "violet", "magenta",
        ];
        for name in names {
            assert!(
                resolve_color(name).is_some(),
                "missing color: {name}"
            );
        }
    }

    #[test]
    fn resolve_unknown_color_is_none() {
        assert!(resolve_color("rainbow").is_none());
    }

    #[test]
    fn resolve_all_constants() {
        for name in ["pi", "tau", "e", "phi"] {
            assert!(
                resolve_constant(name).is_some(),
                "missing constant: {name}"
            );
        }
    }
}
