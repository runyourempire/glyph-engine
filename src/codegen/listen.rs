//! Listen block codegen — emits Web Audio DSP chain for semantic audio signals.
//!
//! Supported algorithms: attack (onset detection), pitch (autocorrelation),
//! phase (beat subdivision), delta (energy derivative).

use crate::ast::{ListenBlock, Param, Expr};

/// Generate JavaScript for a listen block's Web Audio DSP pipeline.
pub fn generate_listen_js(listen: &ListenBlock) -> String {
    let mut s = String::with_capacity(2048);

    s.push_str("class GameListenPipeline {\n");
    s.push_str("  constructor(analyser) {\n");
    s.push_str("    this._analyser = analyser;\n");
    s.push_str("    this._fftData = new Float32Array(analyser.frequencyBinCount);\n");
    s.push_str("    this._timeData = new Float32Array(analyser.fftSize);\n");
    s.push_str("    this._prevEnergy = 0;\n");
    s.push_str("    this._prevSpectrum = null;\n");
    s.push_str("    this.signals = {};\n");

    for sig in &listen.signals {
        s.push_str(&format!("    this.signals['{}'] = 0;\n", sig.name));
    }

    s.push_str("  }\n\n");

    s.push_str("  update() {\n");
    s.push_str("    this._analyser.getFloatFrequencyData(this._fftData);\n");
    s.push_str("    this._analyser.getFloatTimeDomainData(this._timeData);\n\n");

    for sig in &listen.signals {
        match sig.algorithm.as_str() {
            "attack" => {
                let threshold = get_param_f64(&sig.params, "threshold", 0.7);
                let decay_ms = get_param_f64(&sig.params, "decay", 300.0);
                let decay_rate = 1.0 / (decay_ms / 16.67); // ~60fps
                s.push_str(&format!(
                    "    {{ // onset: {}\n", sig.name
                ));
                s.push_str("      let energy = 0;\n");
                s.push_str("      for (let i = 0; i < this._fftData.length; i++) {\n");
                s.push_str("        const v = (this._fftData[i] + 140) / 140;\n");
                s.push_str("        energy += v * v;\n");
                s.push_str("      }\n");
                s.push_str("      energy /= this._fftData.length;\n");
                s.push_str(&format!(
                    "      if (this._prevSpectrum !== null && energy - this._prevEnergy > {threshold}) {{\n"
                ));
                s.push_str(&format!(
                    "        this.signals['{}'] = 1.0;\n", sig.name
                ));
                s.push_str("      } else {\n");
                s.push_str(&format!(
                    "        this.signals['{}'] = Math.max(0, this.signals['{}'] - {decay_rate});\n",
                    sig.name, sig.name
                ));
                s.push_str("      }\n");
                s.push_str("      this._prevEnergy = energy;\n");
                s.push_str("      this._prevSpectrum = true;\n");
                s.push_str("    }\n");
            }
            "pitch" => {
                let min_hz = get_param_f64(&sig.params, "min", 200.0);
                let max_hz = get_param_f64(&sig.params, "max", 4000.0);
                s.push_str(&format!("    {{ // pitch: {}\n", sig.name));
                s.push_str("      let bestCorr = 0, bestLag = 0;\n");
                s.push_str("      const sr = this._analyser.context.sampleRate;\n");
                s.push_str(&format!(
                    "      const minLag = Math.floor(sr / {max_hz});\n"
                ));
                s.push_str(&format!(
                    "      const maxLag = Math.ceil(sr / {min_hz});\n"
                ));
                s.push_str("      for (let lag = minLag; lag <= Math.min(maxLag, this._timeData.length / 2); lag++) {\n");
                s.push_str("        let corr = 0;\n");
                s.push_str("        for (let i = 0; i < this._timeData.length - lag; i++) {\n");
                s.push_str("          corr += this._timeData[i] * this._timeData[i + lag];\n");
                s.push_str("        }\n");
                s.push_str("        if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }\n");
                s.push_str("      }\n");
                s.push_str(&format!(
                    "      this.signals['{}'] = bestLag > 0 ? (sr / bestLag - {min_hz}) / ({max_hz} - {min_hz}) : 0;\n",
                    sig.name
                ));
                s.push_str("    }\n");
            }
            "phase" => {
                let subdivide = get_param_f64(&sig.params, "subdivide", 16.0) as i64;
                s.push_str(&format!("    {{ // rhythm phase: {}\n", sig.name));
                s.push_str("      let rmsEnergy = 0;\n");
                s.push_str("      for (let i = 0; i < this._timeData.length; i++) {\n");
                s.push_str("        rmsEnergy += this._timeData[i] * this._timeData[i];\n");
                s.push_str("      }\n");
                s.push_str("      rmsEnergy = Math.sqrt(rmsEnergy / this._timeData.length);\n");
                s.push_str(&format!(
                    "      this.signals['{}'] = (rmsEnergy * {subdivide}) % 1.0;\n",
                    sig.name
                ));
                s.push_str("    }\n");
            }
            "delta" => {
                let window_s = get_param_f64(&sig.params, "window", 2.0);
                let _direction = get_param_str(&sig.params, "direction", "negative");
                s.push_str(&format!("    {{ // energy delta: {}\n", sig.name));
                s.push_str("      let energy = 0;\n");
                s.push_str("      for (let i = 0; i < this._fftData.length; i++) {\n");
                s.push_str("        const v = (this._fftData[i] + 140) / 140;\n");
                s.push_str("        energy += v * v;\n");
                s.push_str("      }\n");
                s.push_str("      energy /= this._fftData.length;\n");
                s.push_str(&format!(
                    "      const alpha = 1.0 / ({window_s} * 60);\n"
                ));
                s.push_str("      const delta = energy - this._prevEnergy;\n");
                s.push_str(&format!(
                    "      this.signals['{}'] = Math.max(-1, Math.min(1, delta * 10));\n",
                    sig.name
                ));
                s.push_str("      this._prevEnergy += alpha * delta;\n");
                s.push_str("    }\n");
            }
            _ => {
                s.push_str(&format!(
                    "    // unknown algorithm '{}' for signal '{}'\n",
                    sig.algorithm, sig.name
                ));
            }
        }
    }

    s.push_str("    return this.signals;\n");
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
            if let Expr::Ident(v) = &p.value {
                return v.as_str();
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
    fn listen_onset_generates_class() {
        let listen = ListenBlock {
            signals: vec![ListenSignal {
                name: "onset".into(),
                algorithm: "attack".into(),
                params: vec![Param {
                    name: "threshold".into(),
                    value: Expr::Number(0.7),
                    modulation: None,
                    temporal_ops: vec![],
                }],
            }],
        };
        let js = generate_listen_js(&listen);
        assert!(js.contains("class GameListenPipeline"));
        assert!(js.contains("signals['onset']"));
        assert!(js.contains("energy"));
    }

    #[test]
    fn listen_pitch_generates_autocorrelation() {
        let listen = ListenBlock {
            signals: vec![ListenSignal {
                name: "melody".into(),
                algorithm: "pitch".into(),
                params: vec![],
            }],
        };
        let js = generate_listen_js(&listen);
        assert!(js.contains("bestCorr"));
        assert!(js.contains("sampleRate"));
    }

    #[test]
    fn listen_phase_generates_rhythm() {
        let listen = ListenBlock {
            signals: vec![ListenSignal {
                name: "rhythm".into(),
                algorithm: "phase".into(),
                params: vec![Param {
                    name: "subdivide".into(),
                    value: Expr::Number(16.0),
                    modulation: None,
                    temporal_ops: vec![],
                }],
            }],
        };
        let js = generate_listen_js(&listen);
        assert!(js.contains("rmsEnergy"));
        assert!(js.contains("16"));
    }

    #[test]
    fn listen_delta_generates_derivative() {
        let listen = ListenBlock {
            signals: vec![ListenSignal {
                name: "drop".into(),
                algorithm: "delta".into(),
                params: vec![],
            }],
        };
        let js = generate_listen_js(&listen);
        assert!(js.contains("delta"));
        assert!(js.contains("signals['drop']"));
    }
}
