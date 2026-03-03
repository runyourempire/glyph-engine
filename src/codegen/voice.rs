//! Voice block codegen — emits Web Audio synthesis graph.
//!
//! Generates OscillatorNode, BiquadFilterNode, and GainNode chains
//! driven by layer visual state (GPU readback).

use crate::ast::{Expr, Param, VoiceBlock};

/// Generate JavaScript for a voice block's Web Audio synthesis graph.
pub fn generate_voice_js(voice: &VoiceBlock) -> String {
    let mut s = String::with_capacity(2048);

    s.push_str("class GameVoiceSynth {\n");
    s.push_str("  constructor(ctx) {\n");
    s.push_str("    this._ctx = ctx;\n");
    s.push_str("    this._nodes = {};\n");

    for node in &voice.nodes {
        match node.kind.as_str() {
            "sine" | "square" | "sawtooth" | "triangle" => {
                let freq = get_param_f64(&node.params, "freq", 440.0);
                s.push_str(&format!(
                    "    this._nodes['{}'] = ctx.createOscillator();\n",
                    node.name
                ));
                s.push_str(&format!(
                    "    this._nodes['{}'].type = '{}';\n",
                    node.name, node.kind
                ));
                s.push_str(&format!(
                    "    this._nodes['{}'].frequency.value = {freq};\n",
                    node.name
                ));
            }
            "noise" => {
                s.push_str(&format!(
                    "    {{ const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);\n"
                ));
                s.push_str("      const data = buf.getChannelData(0);\n");
                s.push_str("      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;\n");
                s.push_str(&format!(
                    "      this._nodes['{}'] = ctx.createBufferSource();\n",
                    node.name
                ));
                s.push_str(&format!(
                    "      this._nodes['{}'].buffer = buf;\n",
                    node.name
                ));
                s.push_str(&format!(
                    "      this._nodes['{}'].loop = true;\n",
                    node.name
                ));
                s.push_str("    }\n");
            }
            "lowpass" | "highpass" | "bandpass" | "notch" => {
                let cutoff = get_param_f64(&node.params, "cutoff", 1000.0);
                let q = get_param_f64(&node.params, "q", 1.0);
                s.push_str(&format!(
                    "    this._nodes['{}'] = ctx.createBiquadFilter();\n",
                    node.name
                ));
                s.push_str(&format!(
                    "    this._nodes['{}'].type = '{}';\n",
                    node.name, node.kind
                ));
                s.push_str(&format!(
                    "    this._nodes['{}'].frequency.value = {cutoff};\n",
                    node.name
                ));
                s.push_str(&format!(
                    "    this._nodes['{}'].Q.value = {q};\n",
                    node.name
                ));
            }
            "gain" => {
                let level = get_param_f64(&node.params, "level", 0.5);
                s.push_str(&format!(
                    "    this._nodes['{}'] = ctx.createGain();\n",
                    node.name
                ));
                s.push_str(&format!(
                    "    this._nodes['{}'].gain.value = {level};\n",
                    node.name
                ));
            }
            "reverb" => {
                let room = get_param_f64(&node.params, "room", 0.4);
                let dur = (room * 5.0).max(0.5);
                s.push_str(&format!(
                    "    {{ const len = Math.floor(ctx.sampleRate * {dur});\n"
                ));
                s.push_str("      const buf = ctx.createBuffer(2, len, ctx.sampleRate);\n");
                s.push_str("      for (let ch = 0; ch < 2; ch++) {\n");
                s.push_str("        const d = buf.getChannelData(ch);\n");
                s.push_str("        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i/len, 2);\n");
                s.push_str("      }\n");
                s.push_str(&format!(
                    "      this._nodes['{}'] = ctx.createConvolver();\n",
                    node.name
                ));
                s.push_str(&format!(
                    "      this._nodes['{}'].buffer = buf;\n",
                    node.name
                ));
                s.push_str("    }\n");
            }
            _ => {
                s.push_str(&format!(
                    "    // unknown voice node kind: '{}'\n",
                    node.kind
                ));
            }
        }
    }

    s.push_str("  }\n\n");

    s.push_str("  connect(destination) {\n");
    s.push_str("    const names = Object.keys(this._nodes);\n");
    s.push_str("    for (let i = 0; i < names.length - 1; i++) {\n");
    s.push_str("      this._nodes[names[i]].connect(this._nodes[names[i + 1]]);\n");
    s.push_str("    }\n");
    s.push_str(
        "    if (names.length > 0) this._nodes[names[names.length - 1]].connect(destination);\n",
    );
    s.push_str("  }\n\n");

    s.push_str("  start() {\n");
    s.push_str("    for (const n of Object.values(this._nodes)) {\n");
    s.push_str("      if (n.start) n.start();\n");
    s.push_str("    }\n");
    s.push_str("  }\n\n");

    s.push_str("  setParam(nodeName, paramName, value) {\n");
    s.push_str("    const n = this._nodes[nodeName];\n");
    s.push_str("    if (!n) return;\n");
    s.push_str(
        "    if (n[paramName] && n[paramName].value !== undefined) n[paramName].value = value;\n",
    );
    s.push_str("    else if (n.frequency && paramName === 'freq') n.frequency.value = value;\n");
    s.push_str("    else if (n.gain && paramName === 'level') n.gain.value = value;\n");
    s.push_str("  }\n\n");

    s.push_str("  stop() {\n");
    s.push_str("    for (const n of Object.values(this._nodes)) {\n");
    s.push_str("      if (n.stop) try { n.stop(); } catch(_) {}\n");
    s.push_str("      if (n.disconnect) n.disconnect();\n");
    s.push_str("    }\n");
    s.push_str("  }\n");
    s.push_str("}\n");

    s
}

fn get_param_f64(params: &[Param], name: &str, default: f64) -> f64 {
    for p in params {
        if p.name == name {
            if let Expr::Number(v) = &p.value {
                return *v;
            }
        }
    }
    default
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ast::*;

    #[test]
    fn voice_oscillator_generates() {
        let voice = VoiceBlock {
            nodes: vec![VoiceNode {
                name: "tone".into(),
                kind: "sine".into(),
                params: vec![Param {
                    name: "freq".into(),
                    value: Expr::Number(440.0),
                    modulation: None,
                    temporal_ops: vec![],
                }],
            }],
        };
        let js = generate_voice_js(&voice);
        assert!(js.contains("createOscillator"));
        assert!(js.contains("frequency.value = 440"));
    }

    #[test]
    fn voice_filter_generates() {
        let voice = VoiceBlock {
            nodes: vec![VoiceNode {
                name: "filt".into(),
                kind: "lowpass".into(),
                params: vec![Param {
                    name: "cutoff".into(),
                    value: Expr::Number(2000.0),
                    modulation: None,
                    temporal_ops: vec![],
                }],
            }],
        };
        let js = generate_voice_js(&voice);
        assert!(js.contains("createBiquadFilter"));
        assert!(js.contains("frequency.value = 2000"));
    }

    #[test]
    fn voice_chain_connects() {
        let voice = VoiceBlock {
            nodes: vec![
                VoiceNode {
                    name: "osc".into(),
                    kind: "sine".into(),
                    params: vec![],
                },
                VoiceNode {
                    name: "filt".into(),
                    kind: "lowpass".into(),
                    params: vec![],
                },
                VoiceNode {
                    name: "vol".into(),
                    kind: "gain".into(),
                    params: vec![],
                },
            ],
        };
        let js = generate_voice_js(&voice);
        assert!(js.contains("connect(destination)"));
        assert!(js.contains("connect(this._nodes"));
    }

    #[test]
    fn voice_reverb_generates_convolver() {
        let voice = VoiceBlock {
            nodes: vec![VoiceNode {
                name: "verb".into(),
                kind: "reverb".into(),
                params: vec![Param {
                    name: "room".into(),
                    value: Expr::Number(0.4),
                    modulation: None,
                    temporal_ops: vec![],
                }],
            }],
        };
        let js = generate_voice_js(&voice);
        assert!(js.contains("createConvolver"));
        assert!(js.contains("createBuffer"));
    }

    #[test]
    fn voice_noise_generates_buffer_source() {
        let voice = VoiceBlock {
            nodes: vec![VoiceNode {
                name: "noise".into(),
                kind: "noise".into(),
                params: vec![],
            }],
        };
        let js = generate_voice_js(&voice);
        assert!(js.contains("createBufferSource"));
        assert!(js.contains("Math.random()"));
    }
}
