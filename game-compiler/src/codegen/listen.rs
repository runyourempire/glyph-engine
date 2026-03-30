//! Listen block codegen — emits Web Audio DSP chain for semantic audio signals.
//!
//! Supported algorithms: attack (spectral-flux onset detection), pitch (YIN
//! with parabolic interpolation), phase (beat subdivision), delta (energy
//! derivative). All time-domain analysis uses a precomputed Hann window.

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
    // Precompute Hann window coefficients
    s.push_str("    this._window = new Float32Array(analyser.fftSize);\n");
    s.push_str("    for (let i = 0; i < this._window.length; i++) {\n");
    s.push_str("      this._window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (this._window.length - 1)));\n");
    s.push_str("    }\n");
    s.push_str("    this._windowedData = new Float32Array(analyser.fftSize);\n");
    s.push_str("    this.signals = {};\n");

    for sig in &listen.signals {
        s.push_str(&format!("    this.signals['{}'] = 0;\n", sig.name));
    }

    s.push_str("  }\n\n");

    s.push_str("  update() {\n");
    s.push_str("    this._analyser.getFloatFrequencyData(this._fftData);\n");
    s.push_str("    this._analyser.getFloatTimeDomainData(this._timeData);\n");
    // Apply Hann window to time-domain data (reduces spectral leakage)
    s.push_str("    for (let i = 0; i < this._timeData.length; i++) {\n");
    s.push_str("      this._windowedData[i] = this._timeData[i] * this._window[i];\n");
    s.push_str("    }\n\n");

    for sig in &listen.signals {
        match sig.algorithm.as_str() {
            "attack" => {
                let decay_ms = get_param_f64(&sig.params, "decay", 300.0);
                let decay_rate = 1.0 / (decay_ms / 16.67); // ~60fps
                s.push_str(&format!(
                    "    {{ // onset (spectral flux): {}\n", sig.name
                ));
                // Spectral flux — half-wave rectified difference
                s.push_str("      const fft = this._fftData;\n");
                s.push_str("      const N = fft.length;\n");
                s.push_str("      let flux = 0;\n");
                s.push_str("      if (this._prevSpectrum) {\n");
                s.push_str("        for (let i = 0; i < N; i++) {\n");
                s.push_str("          const diff = fft[i] - this._prevSpectrum[i];\n");
                s.push_str("          if (diff > 0) flux += diff * diff;\n");
                s.push_str("        }\n");
                s.push_str("        flux = Math.sqrt(flux / N);\n");
                s.push_str("      }\n");
                s.push_str("      if (!this._prevSpectrum) {\n");
                s.push_str("        this._prevSpectrum = new Float32Array(N);\n");
                s.push_str("      }\n");
                s.push_str("      this._prevSpectrum.set(fft);\n");
                // Adaptive threshold using running mean
                s.push_str("      if (!this._fluxHistory) this._fluxHistory = [];\n");
                s.push_str("      this._fluxHistory.push(flux);\n");
                s.push_str("      if (this._fluxHistory.length > 30) this._fluxHistory.shift();\n");
                s.push_str("      const mean = this._fluxHistory.reduce((a, b) => a + b, 0) / this._fluxHistory.length;\n");
                s.push_str(&format!(
                    "      const onset = flux > mean * 1.5 ? 1.0 : Math.max(0, flux / (mean || 1) - 0.5);\n"
                ));
                s.push_str(&format!(
                    "      if (onset > 0.5) {{\n        this.signals['{}'] = 1.0;\n      }} else {{\n        this.signals['{}'] = Math.max(0, this.signals['{}'] - {decay_rate});\n      }}\n",
                    sig.name, sig.name, sig.name
                ));
                s.push_str("    }\n");
            }
            "pitch" => {
                let min_hz = get_param_f64(&sig.params, "min", 80.0);
                let max_hz = get_param_f64(&sig.params, "max", 4000.0);
                let yin_threshold = get_param_f64(&sig.params, "threshold", 0.15);
                s.push_str(&format!("    {{ // pitch (YIN): {}\n", sig.name));
                s.push_str("      const buf = this._windowedData;\n");
                s.push_str("      const N = buf.length;\n");
                s.push_str("      const sr = this._analyser.context.sampleRate;\n");
                s.push_str(&format!(
                    "      const maxLag = Math.min(Math.floor(sr / {min_hz}), N >> 1);\n"
                ));
                s.push_str(&format!(
                    "      const minLag = Math.floor(sr / {max_hz});\n"
                ));
                // Step 1: Difference function
                s.push_str("      const diff = new Float32Array(maxLag);\n");
                s.push_str("      for (let lag = 1; lag < maxLag; lag++) {\n");
                s.push_str("        let sum = 0;\n");
                s.push_str("        for (let i = 0; i < N - lag; i++) {\n");
                s.push_str("          const d = buf[i] - buf[i + lag];\n");
                s.push_str("          sum += d * d;\n");
                s.push_str("        }\n");
                s.push_str("        diff[lag] = sum;\n");
                s.push_str("      }\n");
                // Step 2: Cumulative mean normalized difference
                s.push_str("      diff[0] = 1;\n");
                s.push_str("      let runningSum = 0;\n");
                s.push_str("      for (let lag = 1; lag < maxLag; lag++) {\n");
                s.push_str("        runningSum += diff[lag];\n");
                s.push_str("        diff[lag] = diff[lag] * lag / runningSum;\n");
                s.push_str("      }\n");
                // Step 3: Absolute threshold with parabolic interpolation
                s.push_str("      let bestLag = -1;\n");
                s.push_str(&format!(
                    "      const yinThreshold = {yin_threshold};\n"
                ));
                s.push_str("      for (let lag = minLag; lag < maxLag; lag++) {\n");
                s.push_str("        if (diff[lag] < yinThreshold) {\n");
                s.push_str("          bestLag = lag;\n");
                // Step 4: Parabolic interpolation for sub-sample accuracy
                s.push_str("          if (lag > 0 && lag < maxLag - 1) {\n");
                s.push_str("            const alpha = diff[lag - 1];\n");
                s.push_str("            const beta = diff[lag];\n");
                s.push_str("            const gamma = diff[lag + 1];\n");
                s.push_str("            const denom = alpha - 2 * beta + gamma;\n");
                s.push_str("            if (denom !== 0) bestLag = lag + 0.5 * (alpha - gamma) / denom;\n");
                s.push_str("          }\n");
                s.push_str("          break;\n");
                s.push_str("        }\n");
                s.push_str("      }\n");
                s.push_str(&format!(
                    "      this.signals['{}'] = bestLag > 0 ? Math.max(0, Math.min(1, (sr / bestLag - {min_hz}) / ({max_hz} - {min_hz}))) : 0;\n",
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
    fn listen_onset_generates_spectral_flux() {
        let listen = ListenBlock {
            signals: vec![ListenSignal {
                name: "onset".into(),
                algorithm: "attack".into(),
                params: vec![Param {
                    name: "decay".into(),
                    value: Expr::Number(300.0),
                    modulation: None,
                    temporal_ops: vec![],
                }],
            }],
        };
        let js = generate_listen_js(&listen);
        assert!(js.contains("class GameListenPipeline"));
        assert!(js.contains("signals['onset']"));
        assert!(js.contains("spectral flux"));
        assert!(js.contains("_fluxHistory"));
        assert!(js.contains("_prevSpectrum"));
    }

    #[test]
    fn listen_pitch_generates_yin() {
        let listen = ListenBlock {
            signals: vec![ListenSignal {
                name: "melody".into(),
                algorithm: "pitch".into(),
                params: vec![],
            }],
        };
        let js = generate_listen_js(&listen);
        assert!(js.contains("YIN"));
        assert!(js.contains("sampleRate"));
        assert!(js.contains("diff[lag]"), "should compute difference function");
        assert!(js.contains("runningSum"), "should compute CMND");
        assert!(js.contains("yinThreshold"), "should use absolute threshold");
        assert!(js.contains("alpha - gamma"), "should do parabolic interpolation");
    }

    #[test]
    fn listen_hann_window_precomputed() {
        let listen = ListenBlock {
            signals: vec![ListenSignal {
                name: "test".into(),
                algorithm: "pitch".into(),
                params: vec![],
            }],
        };
        let js = generate_listen_js(&listen);
        assert!(js.contains("this._window"), "should precompute Hann window");
        assert!(js.contains("Math.cos(2 * Math.PI"), "should use cosine formula");
        assert!(js.contains("_windowedData"), "should apply window to data");
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
