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
    s.push_str("          return { current: e.cinematic, next: null, blend: 0, kind: null };\n");
    s.push_str("        } else {\n");
    s.push_str("          // transition: find next play entry\n");
    s.push_str("          const idx = this._entries.indexOf(e);\n");
    s.push_str(
        "          const nextEntry = this._entries.slice(idx + 1).find(x => x.type === 'play');\n",
    );
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

    s.push_str("    return { current: lastCinematic, next: null, blend: 0, kind: null };\n");
    s.push_str("  }\n\n");

    // isComplete
    s.push_str("  isComplete(elapsedSec) {\n");
    s.push_str("    if (this._startTime === null) return false;\n");
    s.push_str("    return (elapsedSec - this._startTime) >= this._totalDuration;\n");
    s.push_str("  }\n\n");

    // progress
    s.push_str("  progress(elapsedSec) {\n");
    s.push_str("    if (this._startTime === null) return 0;\n");
    s.push_str("    return Math.min((elapsedSec - this._startTime) / this._totalDuration, 1.0);\n");
    s.push_str("  }\n\n");

    // reset
    s.push_str("  reset() { this._startTime = null; }\n");

    s.push_str("}\n");

    s
}

/// Extract unique cinematic names referenced by a scene's play entries.
pub fn extract_cinematics(block: &SceneBlock) -> Vec<String> {
    let mut names = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for entry in &block.entries {
        if let SceneEntry::Play { cinematic, .. } = entry {
            if seen.insert(cinematic.clone()) {
                names.push(cinematic.clone());
            }
        }
    }
    names
}

/// Convert a cinematic name to its kebab-case tag form.
fn to_kebab(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn to_pascal(s: &str) -> String {
    s.split(|c: char| !c.is_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                Some(c) => {
                    let mut s = c.to_uppercase().to_string();
                    s.extend(chars);
                    s
                }
                None => String::new(),
            }
        })
        .collect()
}

/// Generate a full Web Component for a scene block.
///
/// The component creates child `<glyph-xxx>` elements for each referenced
/// cinematic and orchestrates crossfade transitions via CSS opacity.
pub fn generate_scene_component(block: &SceneBlock) -> String {
    if block.entries.is_empty() {
        return String::new();
    }

    let tag = to_kebab(&block.name);
    let class = format!("GameScene{}", to_pascal(&block.name));
    let cinematics = extract_cinematics(block);

    let mut s = String::with_capacity(4096);

    s.push_str(&format!(
        "// GLYPH Scene Component: {tag} — auto-generated, do not edit.\n"
    ));
    s.push_str("(function(){\n\n");

    // Emit the timeline class
    s.push_str(&generate_scene_js(block));
    s.push_str("\n");

    // Cinematic tag names referenced by this scene
    let cinematics_json: Vec<String> = cinematics
        .iter()
        .map(|c| format!("'{}'", to_kebab(c)))
        .collect();
    s.push_str(&format!(
        "const SCENE_CINEMATICS = [{}];\n\n",
        cinematics_json.join(", ")
    ));

    // Scene Web Component
    s.push_str(&format!("class {class} extends HTMLElement {{\n"));
    s.push_str("  constructor() {\n");
    s.push_str("    super();\n");
    s.push_str("    this.attachShadow({ mode: 'open' });\n");
    s.push_str(&format!(
        "    this._timeline = new GameSceneTimeline_{}();\n",
        block.name.replace('-', "_")
    ));
    s.push_str("    this._children = {};\n");
    s.push_str("    this._animFrame = null;\n");
    s.push_str("    this._startTime = null;\n");
    s.push_str("  }\n\n");

    s.push_str("  connectedCallback() {\n");
    s.push_str("    const style = document.createElement('style');\n");
    s.push_str("    style.textContent = `\n");
    s.push_str("      :host { display: block; width: 100%; height: 100%; position: relative; overflow: hidden; }\n");
    s.push_str("      .scene-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; }\n");
    s.push_str("    `;\n");
    s.push_str("    this.shadowRoot.appendChild(style);\n\n");

    s.push_str("    for (const tag of SCENE_CINEMATICS) {\n");
    s.push_str("      const el = document.createElement('glyph-' + tag);\n");
    s.push_str("      el.classList.add('scene-layer');\n");
    s.push_str("      this.shadowRoot.appendChild(el);\n");
    s.push_str("      this._children[tag] = el;\n");
    s.push_str("    }\n\n");

    s.push_str("    this._startTime = performance.now() / 1000;\n");
    s.push_str("    this._tick();\n");
    s.push_str("  }\n\n");

    s.push_str("  disconnectedCallback() {\n");
    s.push_str("    if (this._animFrame) cancelAnimationFrame(this._animFrame);\n");
    s.push_str("  }\n\n");

    s.push_str("  _tick() {\n");
    s.push_str("    const elapsed = performance.now() / 1000 - this._startTime;\n");
    s.push_str("    const state = this._timeline.evaluate(elapsed);\n\n");

    // Convert cinematic name to tag
    s.push_str(
        "    const toTag = n => n ? n.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() : null;\n",
    );
    s.push_str("    const curTag = toTag(state.current);\n");
    s.push_str("    const nextTag = toTag(state.next);\n\n");

    // Update opacity of all children
    s.push_str("    for (const [tag, el] of Object.entries(this._children)) {\n");
    s.push_str("      if (tag === curTag && !nextTag) {\n");
    s.push_str("        el.style.opacity = '1';\n");
    s.push_str("      } else if (tag === curTag && nextTag) {\n");
    s.push_str("        el.style.opacity = String(1 - state.blend);\n");
    s.push_str("      } else if (tag === nextTag) {\n");
    s.push_str("        el.style.opacity = String(state.blend);\n");
    s.push_str("      } else {\n");
    s.push_str("        el.style.opacity = '0';\n");
    s.push_str("      }\n");
    s.push_str("    }\n\n");

    s.push_str("    if (!this._timeline.isComplete(elapsed)) {\n");
    s.push_str("      this._animFrame = requestAnimationFrame(() => this._tick());\n");
    s.push_str("    }\n");
    s.push_str("  }\n\n");

    // Public API
    s.push_str("  reset() { this._timeline.reset(); this._startTime = performance.now() / 1000; this._tick(); }\n");
    s.push_str("  get progress() { return this._timeline.progress(performance.now() / 1000 - this._startTime); }\n");

    s.push_str("}\n\n");

    s.push_str(&format!(
        "customElements.define('glyph-scene-{tag}', {class});\n"
    ));
    s.push_str("})();\n");

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

    #[test]
    fn extract_cinematics_deduplicates() {
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
                    duration: Duration::Seconds(5.0),
                },
                SceneEntry::Transition {
                    kind: TransitionKind::Fade,
                    duration: Duration::Seconds(1.0),
                },
                SceneEntry::Play {
                    cinematic: "a".into(),
                    duration: Duration::Seconds(5.0),
                },
            ],
        };
        let names = extract_cinematics(&block);
        assert_eq!(names, vec!["a", "b"]);
    }

    #[test]
    fn scene_component_has_custom_element() {
        let block = SceneBlock {
            name: "show".into(),
            entries: vec![
                SceneEntry::Play {
                    cinematic: "intro".into(),
                    duration: Duration::Seconds(5.0),
                },
                SceneEntry::Play {
                    cinematic: "main".into(),
                    duration: Duration::Seconds(10.0),
                },
            ],
        };
        let js = generate_scene_component(&block);
        assert!(js.contains("customElements.define('glyph-scene-show'"));
        assert!(js.contains("class GameSceneShow extends HTMLElement"));
    }

    #[test]
    fn scene_component_creates_child_elements() {
        let block = SceneBlock {
            name: "demo".into(),
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
        let js = generate_scene_component(&block);
        assert!(js.contains("SCENE_CINEMATICS"));
        assert!(js.contains("'a'"));
        assert!(js.contains("'b'"));
        assert!(js.contains("createElement('glyph-' + tag)"));
    }

    #[test]
    fn scene_component_has_timeline() {
        let block = SceneBlock {
            name: "perf".into(),
            entries: vec![SceneEntry::Play {
                cinematic: "x".into(),
                duration: Duration::Seconds(5.0),
            }],
        };
        let js = generate_scene_component(&block);
        assert!(js.contains("GameSceneTimeline_perf"));
        assert!(js.contains("this._timeline.evaluate(elapsed)"));
        assert!(js.contains("style.opacity"));
    }

    #[test]
    fn scene_component_has_public_api() {
        let block = SceneBlock {
            name: "test".into(),
            entries: vec![SceneEntry::Play {
                cinematic: "a".into(),
                duration: Duration::Seconds(5.0),
            }],
        };
        let js = generate_scene_component(&block);
        assert!(js.contains("reset()"));
        assert!(js.contains("get progress()"));
    }

    #[test]
    fn empty_scene_component_is_empty() {
        let block = SceneBlock {
            name: "test".into(),
            entries: vec![],
        };
        assert!(generate_scene_component(&block).is_empty());
    }
}
