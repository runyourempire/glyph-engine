use std::path::PathBuf;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand, ValueEnum};

use game_compiler::{CompileConfig, OutputFormat, ShaderTarget};

/// GAME compiler — compiles .game DSL to WebGPU shaders + Web Components.
#[derive(Parser, Debug)]
#[command(name = "game", version, about)]
struct Cli {
    #[command(subcommand)]
    command: Command,

    /// Optimization level: 0 = none, 1 = default, 2 = aggressive.
    #[arg(global = true, long, short = 'O', default_value = "1")]
    optimize: u8,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Compile .game file(s) to output.
    Build {
        /// Input .game file(s).
        #[arg(required = true)]
        input: Vec<PathBuf>,

        /// Output directory.
        #[arg(short, long, default_value = "dist")]
        output_dir: PathBuf,

        /// Output format.
        #[arg(short, long, default_value = "component")]
        format: FormatArg,

        /// Shader target.
        #[arg(short, long, default_value = "both")]
        target: TargetArg,
    },

    /// Compile a .game file and print output to stdout.
    ///
    /// Used by the MCP server and scripts that capture compiler output.
    Compile {
        /// Input .game file.
        input: PathBuf,

        /// Output as self-contained HTML.
        #[arg(long)]
        html: bool,

        /// Output as ES module Web Component.
        #[arg(long)]
        component: bool,

        /// Custom element tag name (with --component).
        #[arg(long)]
        tag: Option<String>,

        /// Print AST instead of compiled output.
        #[arg(long)]
        emit_ast: bool,
    },

    /// Check .game files for errors without producing output.
    Check {
        /// Input .game file(s).
        #[arg(required = true)]
        input: Vec<PathBuf>,
    },

    /// Launch the hot-reload dev server.
    Dev {
        /// Input .game file(s).
        #[arg(required = true)]
        input: Vec<PathBuf>,

        /// Dev server port.
        #[arg(short, long, default_value_t = 3333)]
        port: u16,
    },
}

#[derive(Debug, Clone, ValueEnum)]
enum FormatArg {
    Component,
    Html,
    Standalone,
}

#[derive(Debug, Clone, ValueEnum)]
enum TargetArg {
    Webgpu,
    Webgl2,
    Both,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let opt_level = cli.optimize;

    match cli.command {
        Command::Build {
            input,
            output_dir,
            format,
            target,
        } => {
            let config = CompileConfig {
                output_format: match format {
                    FormatArg::Component => OutputFormat::Component,
                    FormatArg::Html => OutputFormat::Html,
                    FormatArg::Standalone => OutputFormat::Standalone,
                },
                target: match target {
                    TargetArg::Webgpu => ShaderTarget::WebGpu,
                    TargetArg::Webgl2 => ShaderTarget::WebGl2,
                    TargetArg::Both => ShaderTarget::Both,
                },
            };

            std::fs::create_dir_all(&output_dir)
                .with_context(|| format!("create output dir: {}", output_dir.display()))?;

            for path in &input {
                eprintln!("[game] compiling {}", path.display());
                let source = std::fs::read_to_string(path)
                    .with_context(|| format!("read: {}", path.display()))?;

                let results = game_compiler::compile(&source, &config)
                    .map_err(|e| anyhow::anyhow!("{e}"))?;

                for output in &results {
                    let stem = &output.name;

                    // Write JS component
                    let js_path = output_dir.join(format!("{stem}.js"));
                    std::fs::write(&js_path, &output.js)
                        .with_context(|| format!("write: {}", js_path.display()))?;
                    eprintln!("[game] wrote {}", js_path.display());

                    // Write HTML if generated
                    if let Some(html) = &output.html {
                        let html_path = output_dir.join(format!("{stem}.html"));
                        std::fs::write(&html_path, html)
                            .with_context(|| format!("write: {}", html_path.display()))?;
                        eprintln!("[game] wrote {}", html_path.display());
                    }

                    // Write shader files
                    if let Some(wgsl) = &output.wgsl {
                        let wgsl_path = output_dir.join(format!("{stem}.wgsl"));
                        std::fs::write(&wgsl_path, wgsl)
                            .with_context(|| format!("write: {}", wgsl_path.display()))?;
                    }
                    if let Some(glsl) = &output.glsl {
                        let glsl_path = output_dir.join(format!("{stem}.frag"));
                        std::fs::write(&glsl_path, glsl)
                            .with_context(|| format!("write: {}", glsl_path.display()))?;
                    }
                }
            }
        }
        Command::Compile {
            input,
            html,
            component,
            tag: _tag,
            emit_ast,
        } => {
            let source = std::fs::read_to_string(&input)
                .with_context(|| format!("read: {}", input.display()))?;

            // --emit-ast: print AST and exit
            if emit_ast {
                let program = game_compiler::compile_to_ast(&source)
                    .map_err(|e| anyhow::anyhow!("{e}"))?;
                println!("{program:#?}");
                return Ok(());
            }

            let format = if html {
                OutputFormat::Html
            } else if component {
                OutputFormat::Component
            } else {
                OutputFormat::Component // default: WGSL via component output
            };

            let config = CompileConfig {
                output_format: format,
                target: ShaderTarget::Both,
            };

            let results = game_compiler::compile(&source, &config)
                .map_err(|e| anyhow::anyhow!("{e}"))?;

            for output in &results {
                if html {
                    if let Some(h) = &output.html {
                        print!("{h}");
                    }
                } else if component {
                    print!("{}", output.js);
                } else {
                    // Default: print WGSL
                    if let Some(wgsl) = &output.wgsl {
                        print!("{wgsl}");
                    }
                }
            }
        }
        Command::Check { input } => {
            let mut had_errors = false;

            for path in &input {
                let source = std::fs::read_to_string(path)
                    .with_context(|| format!("read: {}", path.display()))?;

                // Phase 1: lex + parse
                let program = match game_compiler::compile_to_ast(&source) {
                    Ok(p) => p,
                    Err(e) => {
                        eprintln!(
                            "{}",
                            game_compiler::error::render_with_source(&e, &source)
                        );
                        had_errors = true;
                        continue;
                    }
                };

                // Phase 2: codegen validation (pipeline type-flow, cast types)
                for cinematic in &program.cinematics {
                    if let Err(e) = game_compiler::codegen::validate(cinematic) {
                        eprintln!(
                            "{}",
                            game_compiler::error::render_with_source(&e, &source)
                        );
                        had_errors = true;
                    }
                }

                // Phase 3: semantic checks (warnings)
                let warnings = game_compiler::check(&program);
                for w in &warnings {
                    eprintln!("warning: {}: {w}", path.display());
                }

                if !had_errors && warnings.is_empty() {
                    eprintln!("[game] {}: ok", path.display());
                }
            }

            if had_errors {
                std::process::exit(1);
            }
        }
        Command::Dev { input, port } => {
            let path = input.first().context("need at least one .game file")?;
            let rt = tokio::runtime::Runtime::new()?;
            rt.block_on(game_compiler::server::run_dev_server(path.clone(), port))
                .map_err(|e| anyhow::anyhow!("{e}"))?;
        }
    }

    // Note: opt_level is available for future optimization-level-dependent behavior.
    // Currently the optimizer always runs at level 1 inside compile().
    let _ = opt_level;

    Ok(())
}
