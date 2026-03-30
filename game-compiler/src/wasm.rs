//! WASM bindings for the GAME compiler.
//!
//! Exposes the compiler's core functions to JavaScript via wasm-bindgen.
//! Build with: `wasm-pack build --target web --features wasm`

use wasm_bindgen::prelude::*;

use crate::{CompileConfig, OutputFormat, ShaderTarget};

/// Compile `.game` source to WGSL shader code.
///
/// Returns the WGSL fragment shader string on success, or throws a JS error.
#[wasm_bindgen]
pub fn compile_to_wgsl(source: &str) -> Result<String, JsError> {
    let config = CompileConfig {
        output_format: OutputFormat::Component,
        target: ShaderTarget::WebGpu,
    };
    let outputs = crate::compile(source, &config).map_err(|e| JsError::new(&e.to_string()))?;
    let first = outputs
        .first()
        .ok_or_else(|| JsError::new("no cinematic found in source"))?;
    first
        .wgsl
        .clone()
        .ok_or_else(|| JsError::new("no WGSL output generated"))
}

/// Compile `.game` source to a self-contained HTML file with WebGPU rendering.
///
/// Returns the HTML string on success, or throws a JS error.
#[wasm_bindgen]
pub fn compile_to_html(source: &str) -> Result<String, JsError> {
    let config = CompileConfig {
        output_format: OutputFormat::Html,
        target: ShaderTarget::Both,
    };
    let outputs = crate::compile(source, &config).map_err(|e| JsError::new(&e.to_string()))?;
    let first = outputs
        .first()
        .ok_or_else(|| JsError::new("no cinematic found in source"))?;
    first
        .html
        .clone()
        .ok_or_else(|| JsError::new("no HTML output generated"))
}

/// Compile `.game` source to a Web Component ES module.
///
/// Returns the JavaScript module string on success, or throws a JS error.
#[wasm_bindgen]
pub fn compile_to_component(source: &str) -> Result<String, JsError> {
    let config = CompileConfig {
        output_format: OutputFormat::Component,
        target: ShaderTarget::Both,
    };
    let outputs = crate::compile(source, &config).map_err(|e| JsError::new(&e.to_string()))?;
    let first = outputs
        .first()
        .ok_or_else(|| JsError::new("no cinematic found in source"))?;
    Ok(first.js.clone())
}

/// Validate `.game` source without full compilation.
///
/// Returns a JSON string with validation result:
/// `{ "valid": true, "cinematics": 2, "layers": 5 }` or
/// `{ "valid": false, "error": "..." }`
#[wasm_bindgen]
pub fn validate(source: &str) -> String {
    match crate::compile_to_ast(source) {
        Ok(program) => {
            let total_layers: usize = program
                .cinematics
                .iter()
                .map(|c| c.layers.len())
                .sum();
            format!(
                r#"{{"valid":true,"cinematics":{},"layers":{}}}"#,
                program.cinematics.len(),
                total_layers
            )
        }
        Err(e) => {
            let escaped = e
                .to_string()
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('\n', "\\n");
            format!(r#"{{"valid":false,"error":"{}"}}"#, escaped)
        }
    }
}
