//! Hot-reload dev server for the GAME compiler.
//!
//! Serves a live preview UI with split-pane layout, WGSL inspector, inline editor,
//! and param sliders. File changes trigger automatic recompilation via LiveReload.

pub mod css;
pub mod export;
pub mod page;
pub mod util;

use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use axum::extract::State;
use axum::http::header;
use axum::response::{Html, IntoResponse};
use axum::routing::{get, post};
use axum::{Json, Router};
use notify::{Event, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tower_livereload::LiveReloadLayer;

use crate::{CompileConfig, CompileOutput, OutputFormat, ShaderTarget};

// ── State ───────────────────────────────────────────

struct DevState {
    source_path: PathBuf,
    tag_name: String,
}

// ── Helpers ─────────────────────────────────────────

/// Derive a Web Component tag name from a file path.
///
/// Takes the file stem, lowercases it, replaces non-alphanumeric chars with hyphens,
/// and prefixes with `game-`.
/// E.g. `hello.game` -> `game-hello`, `Boot Ring.game` -> `game-boot-ring`.
fn derive_tag_name(path: &Path) -> String {
    let stem = path
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let kebab: String = stem
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = kebab.trim_matches('-').to_string();
    // Collapse consecutive hyphens
    let mut collapsed = String::with_capacity(trimmed.len());
    let mut prev_hyphen = false;
    for c in trimmed.chars() {
        if c == '-' {
            if !prev_hyphen {
                collapsed.push('-');
            }
            prev_hyphen = true;
        } else {
            collapsed.push(c);
            prev_hyphen = false;
        }
    }
    format!("game-{collapsed}")
}

/// Read the source file and compile it, returning the source text and compilation result.
fn compile_source(state: &DevState) -> (String, Result<Vec<CompileOutput>, String>) {
    let source = match std::fs::read_to_string(&state.source_path) {
        Ok(s) => s,
        Err(e) => return (String::new(), Err(format!("read error: {e}"))),
    };
    let config = CompileConfig {
        output_format: OutputFormat::Html,
        target: ShaderTarget::Both,
    };
    let result = crate::compile(&source, &config).map_err(|e| e.to_string());
    (source, result)
}

/// Extract uniform info by compiling to AST and running codegen.
fn extract_uniforms_from_source(source: &str) -> Vec<UniformParam> {
    let program = match crate::compile_to_ast(source) {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };
    let mut params = Vec::new();
    for cinematic in &program.cinematics {
        if let Ok(shader) = crate::codegen::generate(cinematic) {
            for u in &shader.uniforms {
                params.push(UniformParam {
                    name: u.name.clone(),
                    default: u.default,
                });
            }
        }
    }
    params
}

// ── Public entry point ──────────────────────────────

/// Start the hot-reload dev server for a single `.game` file.
pub async fn run_dev_server(path: PathBuf, port: u16) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let tag_name = derive_tag_name(&path);

    let state = Arc::new(Mutex::new(DevState {
        source_path: path.clone(),
        tag_name: tag_name.clone(),
    }));

    // LiveReload layer — injected into HTML responses
    let livereload = LiveReloadLayer::new();
    let reloader = livereload.reloader();

    // File watcher — triggers livereload on source change
    let watch_path = path.clone();
    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            if event.kind.is_modify() || event.kind.is_create() {
                reloader.reload();
            }
        }
    })?;

    // Watch the parent directory (watching a single file can be unreliable on some OSes)
    let watch_dir = path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .to_path_buf();
    watcher.watch(&watch_dir, RecursiveMode::NonRecursive)?;

    let app = Router::new()
        .route("/", get(serve_preview))
        .route("/component.js", get(serve_component))
        .route("/preview.html", get(serve_fullscreen))
        .route("/compile", post(serve_compile))
        .route("/save", post(serve_save))
        .layer(livereload)
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    eprintln!();
    eprintln!("  GAME dev server");
    eprintln!("  ───────────────────────────────────");
    eprintln!("  File:      {}", watch_path.display());
    eprintln!("  Tag:       <{tag_name}>");
    eprintln!("  Preview:   http://127.0.0.1:{port}/");
    eprintln!("  Component: http://127.0.0.1:{port}/component.js");
    eprintln!("  Fullscreen: http://127.0.0.1:{port}/preview.html");
    eprintln!("  ───────────────────────────────────");
    eprintln!();

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app.into_make_service()).await?;

    // Keep watcher alive for the duration of the server
    drop(watcher);
    Ok(())
}

// ── Route handlers ──────────────────────────────────

async fn serve_preview(State(state): State<Arc<Mutex<DevState>>>) -> Html<String> {
    let st = state.lock().unwrap();
    let (source, result) = compile_source(&st);
    match result {
        Ok(outputs) => Html(page::build_preview_page(&outputs, &st.tag_name, &source)),
        Err(e) => Html(page::build_error_page(&st.tag_name, &e)),
    }
}

async fn serve_component(State(state): State<Arc<Mutex<DevState>>>) -> impl IntoResponse {
    let st = state.lock().unwrap();
    let (_, result) = compile_source(&st);
    match result {
        Ok(outputs) => {
            let js = outputs.first().map(|o| o.js.clone()).unwrap_or_default();
            ([(header::CONTENT_TYPE, "text/javascript")], js)
        }
        Err(e) => {
            let escaped = util::json_escape(&e);
            let err_js = format!("console.error('GAME compile error: {escaped}');");
            ([(header::CONTENT_TYPE, "text/javascript")], err_js)
        }
    }
}

async fn serve_fullscreen(State(state): State<Arc<Mutex<DevState>>>) -> Html<String> {
    let st = state.lock().unwrap();
    let (_, result) = compile_source(&st);
    match result {
        Ok(outputs) => {
            let html = outputs
                .first()
                .and_then(|o| o.html.clone())
                .unwrap_or_else(|| "<html><body>No HTML output</body></html>".into());
            Html(html)
        }
        Err(e) => Html(page::build_error_page(&st.tag_name, &e)),
    }
}

#[derive(Deserialize)]
struct CompileRequest {
    source: String,
}

#[derive(Serialize)]
struct CompileResponse {
    wgsl: Option<String>,
    js: Option<String>,
    error: Option<String>,
    params: Vec<UniformParam>,
}

#[derive(Serialize, Clone)]
struct UniformParam {
    name: String,
    default: f64,
}

async fn serve_compile(
    State(_state): State<Arc<Mutex<DevState>>>,
    Json(req): Json<CompileRequest>,
) -> Json<CompileResponse> {
    let config = CompileConfig {
        output_format: OutputFormat::Html,
        target: ShaderTarget::Both,
    };
    match crate::compile(&req.source, &config) {
        Ok(outputs) => {
            let wgsl = outputs.first().and_then(|o| o.wgsl.clone());
            let js = outputs.first().map(|o| o.js.clone());
            let params = extract_uniforms_from_source(&req.source);
            Json(CompileResponse {
                wgsl,
                js,
                error: None,
                params,
            })
        }
        Err(e) => Json(CompileResponse {
            wgsl: None,
            js: None,
            error: Some(e.to_string()),
            params: Vec::new(),
        }),
    }
}

#[derive(Deserialize)]
struct SaveRequest {
    source: String,
}

#[derive(Serialize)]
struct SaveResponse {
    ok: bool,
    error: Option<String>,
}

async fn serve_save(
    State(state): State<Arc<Mutex<DevState>>>,
    Json(req): Json<SaveRequest>,
) -> Json<SaveResponse> {
    let st = state.lock().unwrap();
    match std::fs::write(&st.source_path, &req.source) {
        Ok(()) => Json(SaveResponse {
            ok: true,
            error: None,
        }),
        Err(e) => Json(SaveResponse {
            ok: false,
            error: Some(e.to_string()),
        }),
    }
}

// ── Tests ───────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derive_tag_name_simple() {
        assert_eq!(derive_tag_name(Path::new("hello.game")), "game-hello");
    }

    #[test]
    fn derive_tag_name_spaces() {
        assert_eq!(
            derive_tag_name(Path::new("Boot Ring.game")),
            "game-boot-ring"
        );
    }

    #[test]
    fn derive_tag_name_nested_path() {
        assert_eq!(
            derive_tag_name(Path::new("/home/user/shaders/My Cool Viz.game")),
            "game-my-cool-viz"
        );
    }

    #[test]
    fn derive_tag_name_already_kebab() {
        assert_eq!(
            derive_tag_name(Path::new("particle-storm.game")),
            "game-particle-storm"
        );
    }
}
