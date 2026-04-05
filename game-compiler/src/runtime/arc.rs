//! Arc block codegen — compiles `arc { target: from -> to over duration [easing] }`
//! into a JS timeline with easing functions.
//!
//! Emits a self-contained `arcUpdate(time)` function that interpolates uniform
//! parameters over time using configurable easing curves.

use crate::ast::{ArcBlock, Duration};
use crate::codegen::expr as expr_compile;
use crate::codegen::UniformInfo;

/// Escape a string for safe embedding in a JS single-quoted string literal.
fn escape_js_string(s: &str) -> String {
    s.replace('\\', "\\\\").replace('\'', "\\'")
}

/// Convert Duration to seconds using default 120 BPM (2s per bar).
fn duration_to_secs(d: &Duration) -> f64 {
    match d {
        Duration::Seconds(v) => *v,
        Duration::Millis(v) => v / 1000.0,
        Duration::Bars(v) => *v as f64 * 2.0, // default 120bpm = 2s/bar
    }
}

/// Generate the easing functions library (7 standard curves).
fn easing_library() -> &'static str {
    r#"const _ease = {
  linear: t => t,
  expo_in: t => t === 0 ? 0 : Math.pow(2, 10 * (t - 1)),
  expo_out: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  cubic_in_out: t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2,
  smooth: t => t*t*(3 - 2*t),
  elastic: t => t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2,10*(t-1)) * Math.sin((t-1.1)*5*Math.PI),
  bounce: t => { const n=7.5625,d=2.75; if(t<1/d) return n*t*t; if(t<2/d) return n*(t-=1.5/d)*t+0.75; if(t<2.5/d) return n*(t-=2.25/d)*t+0.9375; return n*(t-=2.625/d)*t+0.984375; }
};"#
}

/// A resolved arc timeline entry for JS emission.
struct ArcTimelineEntry {
    uniform_idx: Option<usize>,
    target_name: String,
    from_js: String,
    to_js: String,
    start_secs: f64,
    duration_secs: f64,
    easing: String,
}

/// Generate JS arc timeline code from a list of ArcBlocks.
///
/// Emits:
/// 1. Easing functions library
/// 2. Timeline data array
/// 3. `arcUpdate(time, params)` function that interpolates uniforms
///
/// Multiple ArcBlocks are concatenated sequentially.
pub fn generate_arc_js(arcs: &[ArcBlock], uniforms: &[UniformInfo]) -> String {
    if arcs.is_empty() {
        return "function arcUpdate(time, params) {}\n".into();
    }

    let mut s = String::with_capacity(2048);
    s.push_str("// GAME arc — timeline animation\n");
    s.push_str(easing_library());
    s.push('\n');

    // Flatten all arc blocks into sequential timeline entries
    let mut entries = Vec::new();
    let mut cursor = 0.0_f64;

    for block in arcs {
        for entry in &block.entries {
            let dur_secs = duration_to_secs(&entry.duration);

            // Look up uniform index: try "target" as dotted name e.g. "bg.opacity" -> "bg_opacity"
            let uniform_name = entry.target.replace('.', "_");
            let idx = uniforms
                .iter()
                .position(|u| u.name == uniform_name)
                .or_else(|| {
                    // Also try bare name (last segment after dot)
                    let bare = entry.target.rsplit('.').next().unwrap_or(&entry.target);
                    uniforms.iter().position(|u| u.name == bare)
                });

            entries.push(ArcTimelineEntry {
                uniform_idx: idx,
                target_name: entry.target.clone(),
                from_js: expr_compile::compile_js(&entry.from),
                to_js: expr_compile::compile_js(&entry.to),
                start_secs: cursor,
                duration_secs: dur_secs,
                easing: entry.easing.clone().unwrap_or_else(|| "linear".into()),
            });

            cursor += dur_secs;
        }
    }

    // Emit timeline data
    s.push_str("const _arcTimeline = [\n");
    for e in &entries {
        let idx_str = match e.uniform_idx {
            Some(i) => format!("{i}"),
            None => "-1".into(),
        };
        s.push_str(&format!(
            "  {{idx:{},name:'{}',from:{},to:{},start:{},dur:{},ease:'{}'}},\n",
            idx_str, escape_js_string(&e.target_name), e.from_js, e.to_js, e.start_secs, e.duration_secs, escape_js_string(&e.easing),
        ));
    }
    s.push_str("];\n\n");

    // Emit arcUpdate function
    s.push_str("function arcUpdate(time, params) {\n");
    s.push_str("  for (const a of _arcTimeline) {\n");
    s.push_str("    if (a.idx < 0) continue;\n");
    s.push_str("    if (time < a.start) continue;\n");
    s.push_str("    if (time >= a.start + a.dur) {\n");
    s.push_str("      params[a.idx] = a.to;\n");
    s.push_str("      continue;\n");
    s.push_str("    }\n");
    s.push_str("    const t = (time - a.start) / a.dur;\n");
    s.push_str("    const easeFn = _ease[a.ease] || _ease.linear;\n");
    s.push_str("    params[a.idx] = a.from + (a.to - a.from) * easeFn(t);\n");
    s.push_str("  }\n");
    s.push_str("}\n");

    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::*;

    #[test]
    fn empty_arcs_returns_stub() {
        let js = generate_arc_js(&[], &[]);
        assert!(js.contains("function arcUpdate"));
        assert!(!js.contains("_arcTimeline"));
    }

    #[test]
    fn single_arc_entry_generates_timeline() {
        let arcs = vec![ArcBlock {
            entries: vec![ArcEntry {
                target: "opacity".into(),
                from: Expr::Number(0.0),
                to: Expr::Number(1.0),
                duration: Duration::Seconds(2.0),
                easing: Some("expo_out".into()),
            }],
        }];
        let uniforms = vec![UniformInfo {
            name: "opacity".into(),
            default: 0.0,
        }];
        let js = generate_arc_js(&arcs, &uniforms);
        assert!(js.contains("_arcTimeline"));
        assert!(js.contains("idx:0"));
        assert!(js.contains("expo_out"));
        assert!(js.contains("from:0.0"));
        assert!(js.contains("to:1.0"));
        assert!(js.contains("dur:2"));
    }

    #[test]
    fn duration_conversion_seconds() {
        let d = Duration::Seconds(3.5);
        assert!((duration_to_secs(&d) - 3.5).abs() < f64::EPSILON);
    }

    #[test]
    fn duration_conversion_millis() {
        let d = Duration::Millis(500.0);
        assert!((duration_to_secs(&d) - 0.5).abs() < f64::EPSILON);
    }

    #[test]
    fn duration_conversion_bars() {
        let d = Duration::Bars(4);
        assert!((duration_to_secs(&d) - 8.0).abs() < f64::EPSILON);
    }

    #[test]
    fn multiple_blocks_concatenate_sequentially() {
        let arcs = vec![
            ArcBlock {
                entries: vec![ArcEntry {
                    target: "scale".into(),
                    from: Expr::Number(1.0),
                    to: Expr::Number(2.0),
                    duration: Duration::Seconds(1.0),
                    easing: None,
                }],
            },
            ArcBlock {
                entries: vec![ArcEntry {
                    target: "scale".into(),
                    from: Expr::Number(2.0),
                    to: Expr::Number(0.5),
                    duration: Duration::Seconds(1.0),
                    easing: Some("smooth".into()),
                }],
            },
        ];
        let uniforms = vec![UniformInfo {
            name: "scale".into(),
            default: 1.0,
        }];
        let js = generate_arc_js(&arcs, &uniforms);
        // Should have two entries in timeline
        assert!(js.contains("start:0"));
        assert!(js.contains("start:1"));
    }

    #[test]
    fn unmapped_target_gets_negative_idx() {
        let arcs = vec![ArcBlock {
            entries: vec![ArcEntry {
                target: "unknown_param".into(),
                from: Expr::Number(0.0),
                to: Expr::Number(1.0),
                duration: Duration::Seconds(1.0),
                easing: None,
            }],
        }];
        let js = generate_arc_js(&arcs, &[]);
        assert!(js.contains("idx:-1"));
    }

    #[test]
    fn dotted_target_resolves_to_underscore_uniform() {
        let arcs = vec![ArcBlock {
            entries: vec![ArcEntry {
                target: "bg.opacity".into(),
                from: Expr::Number(0.0),
                to: Expr::Number(1.0),
                duration: Duration::Seconds(1.0),
                easing: None,
            }],
        }];
        let uniforms = vec![UniformInfo {
            name: "bg_opacity".into(),
            default: 0.0,
        }];
        let js = generate_arc_js(&arcs, &uniforms);
        assert!(js.contains("idx:0"));
    }

    #[test]
    fn easing_library_included() {
        let arcs = vec![ArcBlock {
            entries: vec![ArcEntry {
                target: "x".into(),
                from: Expr::Number(0.0),
                to: Expr::Number(1.0),
                duration: Duration::Seconds(1.0),
                easing: None,
            }],
        }];
        let js = generate_arc_js(&arcs, &[]);
        assert!(js.contains("expo_in"));
        assert!(js.contains("expo_out"));
        assert!(js.contains("cubic_in_out"));
        assert!(js.contains("smooth"));
        assert!(js.contains("elastic"));
        assert!(js.contains("bounce"));
        assert!(js.contains("linear"));
    }
}
