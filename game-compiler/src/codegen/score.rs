//! Score block codegen — flattens musical structure into timed arc moments.
//!
//! Converts motif/phrase/section/arrange hierarchy into a flat timeline
//! of parameter transitions, using BPM for bar→seconds conversion.

use crate::ast::{Duration, Expr, Motif, Phrase, ScoreBlock, Section};

/// Escape a string for safe embedding in a JS single-quoted string literal.
fn escape_js_string(s: &str) -> String {
    s.replace('\\', "\\\\").replace('\'', "\\'")
}

/// A resolved timeline entry with absolute start time in seconds.
#[derive(Debug, Clone)]
pub struct TimelineEntry {
    pub target: String,
    pub from: f64,
    pub to: f64,
    pub start_seconds: f64,
    pub duration_seconds: f64,
    pub easing: Option<String>,
}

/// Convert a Duration to seconds given a BPM.
fn duration_to_seconds(d: &Duration, bpm: f64) -> f64 {
    let spb = 60.0 / bpm; // seconds per beat
    match d {
        Duration::Seconds(v) => *v,
        Duration::Millis(v) => *v / 1000.0,
        Duration::Bars(v) => *v as f64 * 4.0 * spb, // 4 beats per bar
    }
}

/// Extract a float from an Expr (best-effort).
fn expr_to_f64(e: &Expr) -> f64 {
    match e {
        Expr::Number(v) => *v,
        _ => 0.0,
    }
}

/// Flatten a score block into a timeline of arc entries.
pub fn flatten_score(score: &ScoreBlock) -> Vec<TimelineEntry> {
    let bpm = score.tempo_bpm;
    let mut timeline = Vec::new();

    // Calculate motif durations
    let motif_durations: std::collections::HashMap<&str, f64> = score
        .motifs
        .iter()
        .map(|m| {
            let dur: f64 = m
                .entries
                .iter()
                .map(|e| duration_to_seconds(&e.duration, bpm))
                .sum();
            (m.name.as_str(), dur)
        })
        .collect();

    // Calculate phrase durations (sequence of motifs separated by |)
    let _phrase_motifs: std::collections::HashMap<&str, &Vec<String>> = score
        .phrases
        .iter()
        .map(|p| (p.name.as_str(), &p.motifs))
        .collect();

    fn phrase_duration(
        phrase: &Phrase,
        motif_durations: &std::collections::HashMap<&str, f64>,
    ) -> f64 {
        phrase
            .motifs
            .iter()
            .filter_map(|m| motif_durations.get(m.as_str()))
            .sum()
    }

    let phrase_durs: std::collections::HashMap<&str, f64> = score
        .phrases
        .iter()
        .map(|p| (p.name.as_str(), phrase_duration(p, &motif_durations)))
        .collect();

    // Calculate section durations (sequence of phrases)
    let _section_phrases: std::collections::HashMap<&str, &Vec<String>> = score
        .sections
        .iter()
        .map(|s| (s.name.as_str(), &s.phrases))
        .collect();

    fn section_duration(
        section: &Section,
        phrase_durs: &std::collections::HashMap<&str, f64>,
    ) -> f64 {
        section
            .phrases
            .iter()
            .filter_map(|p| phrase_durs.get(p.as_str()))
            .sum()
    }

    let section_durs: std::collections::HashMap<&str, f64> = score
        .sections
        .iter()
        .map(|s| (s.name.as_str(), section_duration(s, &phrase_durs)))
        .collect();

    // Flatten arrange into timeline
    let mut cursor = 0.0_f64;

    for item_name in &score.arrange {
        // Try section first, then phrase, then motif
        if let Some(section) = score.sections.iter().find(|s| s.name == *item_name) {
            let mut sec_cursor = cursor;
            for phrase_name in &section.phrases {
                if let Some(phrase) = score.phrases.iter().find(|p| p.name == *phrase_name) {
                    let mut phrase_cursor = sec_cursor;
                    for motif_name in &phrase.motifs {
                        if let Some(motif) = score.motifs.iter().find(|m| m.name == *motif_name) {
                            emit_motif(&mut timeline, motif, phrase_cursor, bpm);
                            phrase_cursor += motif_durations.get(motif_name.as_str()).copied().unwrap_or(0.0);
                        }
                    }
                    sec_cursor += phrase_durs.get(phrase_name.as_str()).copied().unwrap_or(0.0);
                }
            }
            cursor += section_durs.get(item_name.as_str()).copied().unwrap_or(0.0);
        } else if let Some(phrase) = score.phrases.iter().find(|p| p.name == *item_name) {
            let mut phrase_cursor = cursor;
            for motif_name in &phrase.motifs {
                if let Some(motif) = score.motifs.iter().find(|m| m.name == *motif_name) {
                    emit_motif(&mut timeline, motif, phrase_cursor, bpm);
                    phrase_cursor += motif_durations.get(motif_name.as_str()).copied().unwrap_or(0.0);
                }
            }
            cursor += phrase_durs.get(item_name.as_str()).copied().unwrap_or(0.0);
        } else if let Some(motif) = score.motifs.iter().find(|m| m.name == *item_name) {
            emit_motif(&mut timeline, motif, cursor, bpm);
            cursor += motif_durations.get(item_name.as_str()).copied().unwrap_or(0.0);
        }
    }

    timeline
}

fn emit_motif(timeline: &mut Vec<TimelineEntry>, motif: &Motif, offset: f64, bpm: f64) {
    let mut local = 0.0;
    for entry in &motif.entries {
        let dur = duration_to_seconds(&entry.duration, bpm);
        timeline.push(TimelineEntry {
            target: entry.target.clone(),
            from: expr_to_f64(&entry.from),
            to: expr_to_f64(&entry.to),
            start_seconds: offset + local,
            duration_seconds: dur,
            easing: entry.easing.clone(),
        });
        local += dur;
    }
}

/// Generate JavaScript timeline playback engine from a score.
pub fn generate_score_js(score: &ScoreBlock) -> String {
    let timeline = flatten_score(score);
    let mut s = String::with_capacity(2048);

    s.push_str("class GameScorePlayer {\n");
    s.push_str("  constructor() {\n");
    s.push_str("    this._timeline = [\n");

    for entry in &timeline {
        s.push_str(&format!(
            "      {{target:'{}',from:{},to:{},start:{},dur:{},easing:'{}'}},\n",
            escape_js_string(&entry.target),
            entry.from,
            entry.to,
            entry.start_seconds,
            entry.duration_seconds,
            escape_js_string(entry.easing.as_deref().unwrap_or("linear")),
        ));
    }

    s.push_str("    ];\n");
    s.push_str(&format!("    this._totalDur = {};\n",
        timeline.iter().map(|e| e.start_seconds + e.duration_seconds).fold(0.0_f64, f64::max)
    ));
    s.push_str("    this._startTime = null;\n");
    s.push_str("  }\n\n");

    s.push_str("  start(time) { this._startTime = time; }\n\n");

    s.push_str("  evaluate(time) {\n");
    s.push_str("    if (this._startTime === null) return {};\n");
    s.push_str("    const t = time - this._startTime;\n");
    s.push_str("    const result = {};\n");
    s.push_str("    for (const e of this._timeline) {\n");
    s.push_str("      if (t >= e.start && t < e.start + e.dur) {\n");
    s.push_str("        const p = (t - e.start) / e.dur;\n");
    s.push_str("        const ep = this._ease(p, e.easing);\n");
    s.push_str("        result[e.target] = e.from + (e.to - e.from) * ep;\n");
    s.push_str("      } else if (t >= e.start + e.dur) {\n");
    s.push_str("        result[e.target] = e.to;\n");
    s.push_str("      }\n");
    s.push_str("    }\n");
    s.push_str("    return result;\n");
    s.push_str("  }\n\n");

    s.push_str("  _ease(t, name) {\n");
    s.push_str("    switch(name) {\n");
    s.push_str("      case 'ease_in': return t * t;\n");
    s.push_str("      case 'ease_out': return t * (2 - t);\n");
    s.push_str("      case 'ease_in_out': return t < 0.5 ? 2*t*t : -1+(4-2*t)*t;\n");
    s.push_str("      default: return t;\n");
    s.push_str("    }\n");
    s.push_str("  }\n");
    s.push_str("}\n");

    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::*;

    fn make_score() -> ScoreBlock {
        ScoreBlock {
            tempo_bpm: 120.0,
            motifs: vec![
                Motif {
                    name: "rise".into(),
                    entries: vec![ArcEntry {
                        target: "scale".into(),
                        from: Expr::Number(0.5),
                        to: Expr::Number(2.0),
                        duration: Duration::Bars(4),
                        easing: Some("ease_in".into()),
                    }],
                },
                Motif {
                    name: "fall".into(),
                    entries: vec![ArcEntry {
                        target: "scale".into(),
                        from: Expr::Number(2.0),
                        to: Expr::Number(0.5),
                        duration: Duration::Bars(2),
                        easing: None,
                    }],
                },
            ],
            phrases: vec![Phrase {
                name: "build".into(),
                motifs: vec!["rise".into(), "fall".into()],
            }],
            sections: vec![Section {
                name: "verse".into(),
                phrases: vec!["build".into()],
            }],
            arrange: vec!["verse".into()],
        }
    }

    #[test]
    fn flatten_produces_entries() {
        let score = make_score();
        let timeline = flatten_score(&score);
        assert_eq!(timeline.len(), 2);
        assert_eq!(timeline[0].target, "scale");
        assert!((timeline[0].start_seconds - 0.0).abs() < 0.01);
        // 120 BPM = 0.5s per beat, 4 bars = 16 beats = 8s
        assert!((timeline[0].duration_seconds - 8.0).abs() < 0.01);
        // Second entry starts after first
        assert!((timeline[1].start_seconds - 8.0).abs() < 0.01);
    }

    #[test]
    fn generate_score_js_produces_class() {
        let score = make_score();
        let js = generate_score_js(&score);
        assert!(js.contains("class GameScorePlayer"));
        assert!(js.contains("_timeline"));
        assert!(js.contains("ease_in"));
    }

    #[test]
    fn duration_conversion_120bpm() {
        // 120 BPM = 0.5s per beat = 2s per bar
        assert!((duration_to_seconds(&Duration::Bars(1), 120.0) - 2.0).abs() < 0.01);
        assert!((duration_to_seconds(&Duration::Seconds(1.5), 120.0) - 1.5).abs() < 0.01);
        assert!((duration_to_seconds(&Duration::Millis(500.0), 120.0) - 0.5).abs() < 0.01);
    }
}
