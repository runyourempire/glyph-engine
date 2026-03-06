//! Scene block codegen — timeline-based cinematic sequencing.
//!
//! Scene is GAME's temporal composition primitive. It sequences cinematics
//! with transitions, producing a JS controller that orchestrates playback.
//!
//! ```game
//! scene "performance" {
//!   play "intro" for 10s
//!   transition dissolve over 2s
//!   play "main" for 30s
//! }
//! ```
//!
//! Generates a `GameSceneTimeline` JS class that:
//! 1. Manages ordered entries (play/transition) with durations
//! 2. Each frame: computes which cinematic is active based on elapsed time
//! 3. During transitions: provides blend factor for crossfading
//! 4. Exposes `currentCinematic`, `nextCinematic`, `blendFactor`, `isComplete`

use crate::ast::{Duration, SceneBlock, SceneEntry, TransitionKind};

/// Convert a Duration to seconds.
fn duration_to_seconds(d: &Duration) -> f64 {
    match d {
        Duration::Seconds(v) => *v,
        Duration::Millis(v) => *v / 1000.0,
        Duration::Bars(v) => *v as f64 * 2.0, // default 120 BPM
    }
}

/// Generate JavaScript for scene timeline sequencing.
pub fn generate_scene_js(block: &SceneBlock) -> String {
    if block.entries.is_empty() {
        return String::new();
    }

    let mut s = String::with_capacity(2048);

    s.push_str(&format!(
        "class GameSceneTimeline_{} {{\n",
        block.name.replace('-', "_")
    ));

    // Constructor: build timeline entries
    s.push_str("  constructor() {\n");
    s.push_str("    this._startTime = null;\n");
    s.push_str("    this._entries = [\n");

    for entry in &block.entries {
        match entry {
            SceneEntry::Play {
                cinematic,
                duration,
            } => {
                let dur = duration_to_seconds(duration);
                s.push_str(&format!(
                    "      {{ type: 'play', cinematic: '{}', duration: {} }},\n",
                    cinematic, dur
                ));
            }
            SceneEntry::Transition { kind, duration } => {
                let dur = duration_to_seconds(duration);
                let kind_str = match kind {
                    TransitionKind::Dissolve => "dissolve",
                    TransitionKind::Fade => "fade",
                    TransitionKind::Wipe => "wipe",
                    TransitionKind::Morph => "morph",
                };
                s.push_str(&format!(
                    "      {{ type: 'transition', kind: '{}', duration: {} }},\n",
                    kind_str, dur
                ));
            }
        }
    }

    s.push_str("    ];\n");
    s.push_str("    this._totalDuration = this._entries.reduce((s, e) => s + e.duration, 0);\n");
    s.push_str("  }\n\n");

    // evaluate(elapsedSec): returns { current, next, blend, kind }
    s.push_str("  evaluate(elapsedSec) {\n");
    s.push_str("    if (this._startTime === null) this._startTime = elapsedSec;\n");
    s.push_str("    const t = elapsedSec - this._startTime;\n");
    s.push_str("    let acc = 0;\n");
    s.push_str("    let lastCinematic = null;\n\n");

    s.push_str("    for (const e of this._entries) {\n");
    s.push_str("      if (t < acc + e.duration) {\n");
    s.push_str("        const progress = (t - acc) / e.duration;\n");
    s.push_str("        if (e.type === 'play') {\n");
    s.push_str(
        "          return { current: e.cinematic, next: null, blend: 0, kind: null };\n",
    );
    s.push_str("        } else {\n");
    s.push_str("          // transition: find next play entry\n");
    s.push_str("          const idx = this._entries.indexOf(e);\n");
    s.push_str("          const nextEntry = this._entries.slice(idx + 1).find(x => x.type === 'play');\n");
    s.push_str("          return {\n");
    s.push_str("            current: lastCinematic,\n");
    s.push_str("            next: nextEntry ? nextEntry.cinematic : null,\n");
    s.push_str("            blend: progress,\n");
    s.push_str("            kind: e.kind\n");
    s.push_str("          };\n");
    s.push_str("        }\n");
    s.push_str("      }\n");
    s.push_str("      if (e.type === 'play') lastCinematic = e.cinematic;\n");
    s.push_str("      acc += e.duration;\n");
    s.push_str("    }\n\n");

    s.push_str(
        "    return { current: lastCinematic, next: null, blend: 0, kind: null };\n",
    );
    s.push_str("  }\n\n");

    // isComplete
    s.push_str("  isComplete(elapsedSec) {\n");
    s.push_str("    if (this._startTime === null) return false;\n");
    s.push_str("    return (elapsedSec - this._startTime) >= this._totalDuration;\n");
    s.push_str("  }\n\n");

    // progress
    s.push_str("  progress(elapsedSec) {\n");
    s.push_str("    if (this._startTime === null) return 0;\n");
    s.push_str(
        "    return Math.min((elapsedSec - this._startTime) / this._totalDuration, 1.0);\n",
    );
    s.push_str("  }\n\n");

    // reset
    s.push_str("  reset() { this._startTime = null; }\n");

    s.push_str("}\n");

    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::*;

    #[test]
    fn empty_scene_produces_nothing() {
        let block = SceneBlock {
            name: "test".into(),
            entries: vec![],
        };
        assert!(generate_scene_js(&block).is_empty());
    }

    #[test]
    fn single_play_generates() {
        let block = SceneBlock {
            name: "test".into(),
            entries: vec![SceneEntry::Play {
                cinematic: "intro".into(),
                duration: Duration::Seconds(10.0),
            }],
        };
        let js = generate_scene_js(&block);
        assert!(js.contains("class GameSceneTimeline_test"));
        assert!(js.contains("cinematic: 'intro'"));
        assert!(js.contains("duration: 10"));
    }

    #[test]
    fn play_transition_play_generates() {
        let block = SceneBlock {
            name: "show".into(),
            entries: vec![
                SceneEntry::Play {
                    cinematic: "a".into(),
                    duration: Duration::Seconds(5.0),
                },
                SceneEntry::Transition {
                    kind: TransitionKind::Dissolve,
                    duration: Duration::Seconds(2.0),
                },
                SceneEntry::Play {
                    cinematic: "b".into(),
                    duration: Duration::Seconds(10.0),
                },
            ],
        };
        let js = generate_scene_js(&block);
        assert!(js.contains("'a'"));
        assert!(js.contains("'b'"));
        assert!(js.contains("kind: 'dissolve'"));
        assert!(js.contains("evaluate(elapsedSec)"));
        assert!(js.contains("isComplete"));
    }

    #[test]
    fn all_transition_types() {
        for (kind, expected) in [
            (TransitionKind::Dissolve, "dissolve"),
            (TransitionKind::Fade, "fade"),
            (TransitionKind::Wipe, "wipe"),
            (TransitionKind::Morph, "morph"),
        ] {
            let block = SceneBlock {
                name: "t".into(),
                entries: vec![SceneEntry::Transition {
                    kind,
                    duration: Duration::Seconds(1.0),
                }],
            };
            let js = generate_scene_js(&block);
            assert!(
                js.contains(&format!("kind: '{expected}'")),
                "expected {expected}"
            );
        }
    }

    #[test]
    fn millis_duration_converted() {
        let block = SceneBlock {
            name: "t".into(),
            entries: vec![SceneEntry::Play {
                cinematic: "x".into(),
                duration: Duration::Millis(2500.0),
            }],
        };
        let js = generate_scene_js(&block);
        assert!(js.contains("duration: 2.5"));
    }
}
