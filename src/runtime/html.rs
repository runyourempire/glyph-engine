//! Standalone HTML output format.
//!
//! Generates a single `.html` file with embedded shaders and renderer.

use crate::codegen::ShaderOutput;

/// Generate a self-contained HTML page.
pub fn generate_html(shader: &ShaderOutput) -> String {
    let wgsl_v = escape_html_js(&shader.wgsl_vertex);
    let wgsl_f = escape_html_js(&shader.wgsl_fragment);
    let glsl_v = escape_html_js(&shader.glsl_vertex);
    let glsl_f = escape_html_js(&shader.glsl_fragment);

    let uniform_defs_json = shader
        .uniforms
        .iter()
        .map(|u| format!("{{name:'{}',default:{}}}", u.name, u.default))
        .collect::<Vec<_>>()
        .join(",");

    // Build incrementally to avoid stack overflow from giant format! macro
    let mut s = String::with_capacity(16384);

    s.push_str("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n");
    s.push_str("<meta charset=\"utf-8\">\n");
    s.push_str("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n");
    s.push_str(&format!("<title>{} — GAME</title>\n", shader.name));
    s.push_str("<style>*{margin:0;padding:0}html,body{width:100%;height:100%;overflow:hidden;background:#000}canvas{width:100%;height:100%;display:block}</style>\n");
    s.push_str("</head>\n<body>\n<canvas id=\"c\"></canvas>\n<script>\n");

    s.push_str(&format!("const WGSL_V = `{wgsl_v}`;\n"));
    s.push_str(&format!("const WGSL_F = `{wgsl_f}`;\n"));
    s.push_str(&format!("const GLSL_V = `{glsl_v}`;\n"));
    s.push_str(&format!("const GLSL_F = `{glsl_f}`;\n"));
    s.push_str(&format!("const UNIFORMS = [{uniform_defs_json}];\n\n"));

    s.push_str(super::helpers::webgpu_renderer());
    s.push_str("\n\n");
    s.push_str(super::helpers::webgl2_renderer());
    s.push_str("\n\n");

    // Inject feature JS modules (listen, voice, score, temporal, gravity, breed)
    for module_js in &shader.js_modules {
        s.push_str(module_js);
        s.push_str("\n\n");
    }

    s.push_str("(async function() {\n");
    s.push_str("  const canvas = document.getElementById('c');\n");
    s.push_str("  function resize() {\n");
    s.push_str("    canvas.width = window.innerWidth * devicePixelRatio;\n");
    s.push_str("    canvas.height = window.innerHeight * devicePixelRatio;\n");
    s.push_str("  }\n");
    s.push_str("  window.addEventListener('resize', resize);\n");
    s.push_str("  resize();\n\n");
    s.push_str("  const gpu = new GameRenderer(canvas, WGSL_V, WGSL_F, UNIFORMS);\n");
    s.push_str("  if (await gpu.init()) { gpu.start(); return; }\n");
    s.push_str("  const gl = new GameRendererGL(canvas, GLSL_V, GLSL_F, UNIFORMS);\n");
    s.push_str("  if (gl.init()) { gl.start(); return; }\n");
    s.push_str("  document.body.textContent = 'No WebGPU or WebGL2 support.';\n");
    s.push_str("})();\n");

    s.push_str("</script>\n</body>\n</html>\n");

    s
}

/// Generate an Art Blocks / fxhash compatible HTML page.
///
/// Differences from standard HTML:
/// - Injects seeded PRNG (splitmix32)
/// - Reads `fxhash` from URL hash or platform variable
/// - Deterministic: same seed → same output
/// - Self-contained with no external dependencies
pub fn generate_artblocks_html(shader: &ShaderOutput, seed: Option<u64>) -> String {
    let wgsl_v = escape_html_js(&shader.wgsl_vertex);
    let wgsl_f = escape_html_js(&shader.wgsl_fragment);
    let glsl_v = escape_html_js(&shader.glsl_vertex);
    let glsl_f = escape_html_js(&shader.glsl_fragment);

    let uniform_defs_json = shader
        .uniforms
        .iter()
        .map(|u| format!("{{name:'{}',default:{}}}", u.name, u.default))
        .collect::<Vec<_>>()
        .join(",");

    let mut s = String::with_capacity(16384);

    s.push_str("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n");
    s.push_str("<meta charset=\"utf-8\">\n");
    s.push_str("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n");
    s.push_str(&format!("<title>{} — GAME (Art Blocks)</title>\n", shader.name));
    s.push_str("<style>*{margin:0;padding:0}html,body{width:100%;height:100%;overflow:hidden;background:#000}canvas{width:100%;height:100%;display:block}</style>\n");
    s.push_str("</head>\n<body>\n<canvas id=\"c\"></canvas>\n<script>\n");

    // Seeded PRNG (splitmix32)
    s.push_str("// Deterministic PRNG — splitmix32\n");
    s.push_str("let _fxhash = window.fxhash || window.location.hash.slice(1) || '");
    s.push_str(&format!("{}", seed.unwrap_or(0)));
    s.push_str("';\n");
    s.push_str("let _seed = parseInt(_fxhash, 16) || parseInt(_fxhash, 10) || 0;\n");
    s.push_str("function fxrand() {\n");
    s.push_str("  _seed |= 0; _seed = _seed + 0x9e3779b9 | 0;\n");
    s.push_str("  let t = _seed ^ _seed >>> 16;\n");
    s.push_str("  t = Math.imul(t, 0x21f0aaad);\n");
    s.push_str("  t = t ^ t >>> 15;\n");
    s.push_str("  t = Math.imul(t, 0x735a2d97);\n");
    s.push_str("  t = t ^ t >>> 15;\n");
    s.push_str("  return (t >>> 0) / 4294967296;\n");
    s.push_str("}\n");
    s.push_str("// Override Math.random for determinism\n");
    s.push_str("Math.random = fxrand;\n\n");

    s.push_str(&format!("const WGSL_V = `{wgsl_v}`;\n"));
    s.push_str(&format!("const WGSL_F = `{wgsl_f}`;\n"));
    s.push_str(&format!("const GLSL_V = `{glsl_v}`;\n"));
    s.push_str(&format!("const GLSL_F = `{glsl_f}`;\n"));
    s.push_str(&format!("const UNIFORMS = [{uniform_defs_json}];\n\n"));

    s.push_str(super::helpers::webgpu_renderer());
    s.push_str("\n\n");
    s.push_str(super::helpers::webgl2_renderer());
    s.push_str("\n\n");

    for module_js in &shader.js_modules {
        s.push_str(module_js);
        s.push_str("\n\n");
    }

    s.push_str("(async function() {\n");
    s.push_str("  const canvas = document.getElementById('c');\n");
    s.push_str("  function resize() {\n");
    s.push_str("    canvas.width = window.innerWidth * devicePixelRatio;\n");
    s.push_str("    canvas.height = window.innerHeight * devicePixelRatio;\n");
    s.push_str("  }\n");
    s.push_str("  window.addEventListener('resize', resize);\n");
    s.push_str("  resize();\n\n");
    s.push_str("  const gpu = new GameRenderer(canvas, WGSL_V, WGSL_F, UNIFORMS);\n");
    s.push_str("  if (await gpu.init()) { gpu.start(); return; }\n");
    s.push_str("  const gl = new GameRendererGL(canvas, GLSL_V, GLSL_F, UNIFORMS);\n");
    s.push_str("  if (gl.init()) { gl.start(); return; }\n");
    s.push_str("  document.body.textContent = 'No WebGPU or WebGL2 support.';\n");
    s.push_str("})();\n");

    // fxhash preview trigger
    s.push_str("// Art Blocks preview trigger\n");
    s.push_str("if (typeof window.fxpreview === 'function') { setTimeout(fxpreview, 2000); }\n");

    s.push_str("</script>\n</body>\n</html>\n");

    s
}

fn escape_html_js(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('`', "\\`")
        .replace("${", "\\${")
        .replace("</", "<\\/")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codegen::ShaderOutput;

    #[test]
    fn html_output_is_valid() {
        let shader = ShaderOutput {
            name: "demo".into(),
            wgsl_fragment: "fn fs_main() {}".into(),
            wgsl_vertex: "fn vs_main() {}".into(),
            glsl_fragment: "void main(){}".into(),
            glsl_vertex: "void main(){}".into(),
            uniforms: vec![],
            uses_memory: false,
            js_modules: vec![],
            compute_wgsl: None,
            react_wgsl: None,
            swarm_agent_wgsl: None,
            swarm_trail_wgsl: None,
            flow_wgsl: None,
            pass_wgsl: vec![],
            pass_count: 0,
            uses_feedback: false,
        };
        let html = generate_html(&shader);
        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("<title>demo"));
        assert!(html.contains("class GameRenderer"));
        assert!(html.contains("class GameRendererGL"));
        assert!(html.contains("</html>"));
    }
}
