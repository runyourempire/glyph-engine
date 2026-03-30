//! Voice block codegen — emits Web Audio synthesis graph.
//!
//! Generates OscillatorNode, BiquadFilterNode, GainNode, ADSR envelope,
//! LFO modulator, and delay/feedback chains driven by layer visual state
//! (GPU readback).

use crate::ast::{VoiceBlock, Param, Expr};

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
                    "    this._nodes['{}'] = ctx.createOscillator();\n", node.name
                ));
                s.push_str(&format!(
                    "    this._nodes['{}'].type = '{}';\n", node.name, node.kind
                ));
                s.push_str(&format!(
                    "    this._nodes['{}'].frequency.value = {freq};\n", node.name
                ));
            }
            "noise" => {
                s.push_str(&format!(
                    "    {{ const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);\n"
                ));
                s.push_str("      const data = buf.getChannelData(0);\n");
                s.push_str("      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;\n");
                s.push_str(&format!(
                    "      this._nodes['{}'] = ctx.createBufferSource();\n", node.name
                ));
                s.push_str(&format!(
                    "      this._nodes['{}'].buffer = buf;\n", node.name
                ));
                s.push_str(&format!(
                    "      this._nodes['{}'].loop = true;\n", node.name
                ));
                s.push_str("    }\n");
            }
            "lowpass" | "highpass" | "bandpass" | "notch" => {
                let cutoff = get_param_f64(&node.params, "cutoff", 1000.0);
                let q = get_param_f64(&node.params, "q", 1.0);
                s.push_str(&format!(
                    "    this._nodes['{}'] = ctx.createBiquadFilter();\n", node.name
                ));
                s.push_str(&format!(
                    "    this._nodes['{}'].type = '{}';\n", node.name, node.kind
                ));
                s.push_str(&format!(
                    "    this._nodes['{}'].frequency.value = {cutoff};\n", node.name
                ));
                s.push_str(&format!(
                    "    this._nodes['{}'].Q.value = {q};\n", node.name
                ));
            }
            "gain" => {
                let level = get_param_f64(&node.params, "level", 0.5);
                s.push_str(&format!(
                    "    this._nodes['{}'] = ctx.createGain();\n", node.name
                ));
                s.push_str(&format!(
                    "    this._nodes['{}'].gain.value = {level};\n", node.name
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
                    "      this._nodes['{}'] = ctx.createConvolver();\n", node.name
                ));
                s.push_str(&format!(
                    "      this._nodes['{}'].buffer = buf;\n", node.name
                ));
                s.push_str("    }\n");
            }
            "envelope" | "adsr" => {
                let attack = get_param_f64(&node.params, "attack", 0.01);
                let decay = get_param_f64(&node.params, "decay", 0.1);
                let sustain = get_param_f64(&node.params, "sustain", 0.7);
                let release_t = get_param_f64(&node.params, "release", 0.3);

                s.push_str(&format!("    // ADSR Envelope: {}\n", node.name));
                s.push_str(&format!(
                    "    this._nodes['{}'] = ctx.createGain();\n", node.name
                ));
                s.push_str(&format!(
                    "    this._nodes['{}'].gain.value = 0;\n", node.name
                ));
                s.push_str(&format!(
                    "    this._adsr_{} = {{ a: {}, d: {}, s: {}, r: {} }};\n",
                    node.name, attack, decay, sustain, release_t
                ));
            }
            "lfo" => {
                let rate = get_param_f64(&node.params, "rate", 5.0);
                let depth = get_param_f64(&node.params, "depth", 50.0);
                let wave = get_param_str(&node.params, "wave", "sine");

                s.push_str(&format!("    // LFO: {}\n", node.name));
                s.push_str(&format!(
                    "    this._nodes['{}'] = ctx.createOscillator();\n", node.name
                ));
                s.push_str(&format!(
                    "    this._nodes['{}'].type = '{}';\n", node.name, wave
                ));
                s.push_str(&format!(
                    "    this._nodes['{}'].frequency.value = {};\n", node.name, rate
                ));
                s.push_str(&format!(
                    "    this._lfoGain_{} = ctx.createGain();\n", node.name
                ));
                s.push_str(&format!(
                    "    this._lfoGain_{}.gain.value = {};\n", node.name, depth
                ));
                s.push_str(&format!(
                    "    this._nodes['{}'].connect(this._lfoGain_{});\n",
                    node.name, node.name
                ));
                s.push_str(&format!(
                    "    this._nodes['{}'].start();\n", node.name
                ));
            }
            "delay" => {
                let time_val = get_param_f64(&node.params, "time", 0.3);
                let feedback = get_param_f64(&node.params, "feedback", 0.4);
                let max_time = time_val.max(1.0);

                s.push_str(&format!("    // Delay: {}\n", node.name));
                s.push_str(&format!(
                    "    this._nodes['{}'] = ctx.createDelay({});\n",
                    node.name, max_time
                ));
                s.push_str(&format!(
                    "    this._nodes['{}'].delayTime.value = {};\n",
                    node.name, time_val
                ));
                s.push_str(&format!(
                    "    this._feedbackGain_{} = ctx.createGain();\n", node.name
                ));
                s.push_str(&format!(
                    "    this._feedbackGain_{}.gain.value = {};\n", node.name, feedback
                ));
                // Feedback loop: delay -> feedbackGain -> delay
                s.push_str(&format!(
                    "    this._nodes['{}'].connect(this._feedbackGain_{});\n",
                    node.name, node.name
                ));
                s.push_str(&format!(
                    "    this._feedbackGain_{}.connect(this._nodes['{}']);\n",
                    node.name, node.name
                ));
            }
            _ => {
                s.push_str(&format!(
                    "    // unknown voice node kind: '{}'\n", node.kind
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
    s.push_str("    if (names.length > 0) this._nodes[names[names.length - 1]].connect(destination);\n");
    s.push_str("  }\n\n");

    s.push_str("  start() {\n");
    s.push_str("    for (const n of Object.values(this._nodes)) {\n");
    s.push_str("      if (n.start) n.start();\n");
    s.push_str("    }\n");
    s.push_str("  }\n\n");

    s.push_str("  setParam(nodeName, paramName, value) {\n");
    s.push_str("    const n = this._nodes[nodeName];\n");
    s.push_str("    if (!n) return;\n");
    s.push_str("    if (n[paramName] && n[paramName].value !== undefined) n[paramName].value = value;\n");
    s.push_str("    else if (n.frequency && paramName === 'freq') n.frequency.value = value;\n");
    s.push_str("    else if (n.gain && paramName === 'level') n.gain.value = value;\n");
    s.push_str("  }\n\n");

    // Generate ADSR trigger methods for each envelope node
    for node in &voice.nodes {
        if node.kind == "envelope" || node.kind == "adsr" {
            s.push_str(&format!(
                "  triggerAttack_{name}(velocity = 1.0) {{\n\
                 \x20   const now = this._ctx.currentTime;\n\
                 \x20   const env = this._adsr_{name};\n\
                 \x20   const gain = this._nodes['{name}'].gain;\n\
                 \x20   gain.cancelScheduledValues(now);\n\
                 \x20   gain.setValueAtTime(0, now);\n\
                 \x20   gain.linearRampToValueAtTime(velocity, now + env.a);\n\
                 \x20   gain.linearRampToValueAtTime(velocity * env.s, now + env.a + env.d);\n\
                 \x20 }}\n\n",
                name = node.name
            ));
            s.push_str(&format!(
                "  triggerRelease_{name}() {{\n\
                 \x20   const now = this._ctx.currentTime;\n\
                 \x20   const env = this._adsr_{name};\n\
                 \x20   const gain = this._nodes['{name}'].gain;\n\
                 \x20   gain.cancelScheduledValues(now);\n\
                 \x20   gain.setValueAtTime(gain.value, now);\n\
                 \x20   gain.linearRampToValueAtTime(0, now + env.r);\n\
                 \x20 }}\n\n",
                name = node.name
            ));
        }
    }

    // Generate LFO connectTo methods for each LFO node
    for node in &voice.nodes {
        if node.kind == "lfo" {
            s.push_str(&format!(
                "  connectLfo_{name}(targetNode, paramName) {{\n\
                 \x20   const param = targetNode[paramName];\n\
                 \x20   if (param && param.value !== undefined) {{\n\
                 \x20     this._lfoGain_{name}.connect(param);\n\
                 \x20   }}\n\
                 \x20 }}\n\n",
                name = node.name
            ));
        }
    }

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

fn get_param_str<'a>(params: &'a [Param], name: &str, default: &'a str) -> &'a str {
    for p in params {
        if p.name == name {
            match &p.value {
                Expr::Ident(v) => return v.as_str(),
                Expr::String(v) => return v.as_str(),
                _ => {}
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
                VoiceNode { name: "osc".into(), kind: "sine".into(), params: vec![] },
                VoiceNode { name: "filt".into(), kind: "lowpass".into(), params: vec![] },
                VoiceNode { name: "vol".into(), kind: "gain".into(), params: vec![] },
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

    #[test]
    fn voice_adsr_generates_envelope() {
        let voice = VoiceBlock {
            nodes: vec![VoiceNode {
                name: "env".into(),
                kind: "envelope".into(),
                params: vec![
                    Param { name: "attack".into(), value: Expr::Number(0.02), modulation: None, temporal_ops: vec![] },
                    Param { name: "decay".into(), value: Expr::Number(0.15), modulation: None, temporal_ops: vec![] },
                    Param { name: "sustain".into(), value: Expr::Number(0.6), modulation: None, temporal_ops: vec![] },
                    Param { name: "release".into(), value: Expr::Number(0.4), modulation: None, temporal_ops: vec![] },
                ],
            }],
        };
        let js = generate_voice_js(&voice);
        assert!(js.contains("ADSR Envelope"), "should label ADSR");
        assert!(js.contains("createGain"), "envelope uses gain node");
        assert!(js.contains("gain.value = 0"), "starts silent");
        assert!(js.contains("_adsr_env"), "stores ADSR params");
        assert!(js.contains("a: 0.02"), "attack param");
        assert!(js.contains("s: 0.6"), "sustain param");
        assert!(js.contains("triggerAttack_env"), "generates attack trigger");
        assert!(js.contains("triggerRelease_env"), "generates release trigger");
        assert!(js.contains("linearRampToValueAtTime"), "uses ramps");
        assert!(js.contains("cancelScheduledValues"), "cancels before re-trigger");
    }

    #[test]
    fn voice_adsr_alias_works() {
        let voice = VoiceBlock {
            nodes: vec![VoiceNode {
                name: "e".into(),
                kind: "adsr".into(),
                params: vec![],
            }],
        };
        let js = generate_voice_js(&voice);
        assert!(js.contains("ADSR Envelope: e"));
        assert!(js.contains("_adsr_e"));
    }

    #[test]
    fn voice_lfo_generates_modulator() {
        let voice = VoiceBlock {
            nodes: vec![VoiceNode {
                name: "vib".into(),
                kind: "lfo".into(),
                params: vec![
                    Param { name: "rate".into(), value: Expr::Number(6.0), modulation: None, temporal_ops: vec![] },
                    Param { name: "depth".into(), value: Expr::Number(30.0), modulation: None, temporal_ops: vec![] },
                    Param { name: "wave".into(), value: Expr::Ident("triangle".into()), modulation: None, temporal_ops: vec![] },
                ],
            }],
        };
        let js = generate_voice_js(&voice);
        assert!(js.contains("LFO: vib"), "should label LFO");
        assert!(js.contains("createOscillator"), "LFO is an oscillator");
        assert!(js.contains("type = 'triangle'"), "uses specified waveform");
        assert!(js.contains("frequency.value = 6"), "LFO rate");
        assert!(js.contains("_lfoGain_vib"), "creates gain for depth");
        assert!(js.contains("gain.value = 30"), "depth param");
        assert!(js.contains("connectLfo_vib"), "generates connect helper");
    }

    #[test]
    fn voice_delay_generates_feedback_loop() {
        let voice = VoiceBlock {
            nodes: vec![VoiceNode {
                name: "echo".into(),
                kind: "delay".into(),
                params: vec![
                    Param { name: "time".into(), value: Expr::Number(0.3), modulation: None, temporal_ops: vec![] },
                    Param { name: "feedback".into(), value: Expr::Number(0.5), modulation: None, temporal_ops: vec![] },
                ],
            }],
        };
        let js = generate_voice_js(&voice);
        assert!(js.contains("Delay: echo"), "should label delay");
        assert!(js.contains("createDelay"), "uses delay node");
        assert!(js.contains("delayTime.value = 0.3"), "delay time");
        assert!(js.contains("_feedbackGain_echo"), "feedback gain node");
        assert!(js.contains("gain.value = 0.5"), "feedback amount");
        // Verify feedback loop wiring
        assert!(js.contains("connect(this._feedbackGain_echo)"), "delay -> feedback");
        assert!(js.contains("_feedbackGain_echo.connect(this._nodes['echo'])"), "feedback -> delay");
    }

    #[test]
    fn voice_full_synth_chain() {
        // Realistic chain: osc -> envelope -> filter -> delay -> gain -> output
        let voice = VoiceBlock {
            nodes: vec![
                VoiceNode { name: "osc".into(), kind: "sawtooth".into(), params: vec![
                    Param { name: "freq".into(), value: Expr::Number(220.0), modulation: None, temporal_ops: vec![] },
                ]},
                VoiceNode { name: "env".into(), kind: "envelope".into(), params: vec![] },
                VoiceNode { name: "filt".into(), kind: "lowpass".into(), params: vec![
                    Param { name: "cutoff".into(), value: Expr::Number(800.0), modulation: None, temporal_ops: vec![] },
                ]},
                VoiceNode { name: "echo".into(), kind: "delay".into(), params: vec![
                    Param { name: "time".into(), value: Expr::Number(0.25), modulation: None, temporal_ops: vec![] },
                ]},
                VoiceNode { name: "vol".into(), kind: "gain".into(), params: vec![] },
            ],
        };
        let js = generate_voice_js(&voice);
        assert!(js.contains("createOscillator"), "has oscillator");
        assert!(js.contains("ADSR Envelope"), "has envelope");
        assert!(js.contains("createBiquadFilter"), "has filter");
        assert!(js.contains("createDelay"), "has delay");
        assert!(js.contains("connect(destination)"), "connects to output");
    }
}
