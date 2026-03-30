//! CSS for the GAME dev server preview UI.
//!
//! Uses the 4DA design-system palette: dark backgrounds, gold accent, JetBrains Mono.

/// Build the full CSS string for the dev preview page.
pub fn build_css(tag_name: &str) -> String {
    format!(
        r#"/* GAME dev server — {tag_name} */
:root {{
  --bg-primary:   #0A0A0A;
  --bg-secondary: #141414;
  --bg-tertiary:  #1F1F1F;
  --text-primary:   #FFFFFF;
  --text-secondary: #A0A0A0;
  --text-muted:     #666666;
  --accent-gold:  #D4AF37;
  --accent-white: #FFFFFF;
  --success:      #22C55E;
  --error:        #EF4444;
  --border:       #2A2A2A;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
}}
*, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ height: 100%; font-family: var(--font-mono); background: var(--bg-primary); color: var(--text-primary); overflow: hidden; }}

/* ── Toolbar ─────────────────────────────────────── */
.toolbar {{
  display: flex;
  align-items: center;
  gap: 12px;
  height: 40px;
  padding: 0 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}}
.toolbar .tag-name {{
  color: var(--accent-gold);
  font-weight: 600;
}}
.toolbar .status {{
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
}}
.toolbar .status-dot {{
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--success);
}}
.toolbar .status-dot.error {{
  background: var(--error);
}}
.toolbar .status-text {{
  color: var(--text-secondary);
  font-size: 11px;
}}

/* ── Tab bar ─────────────────────────────────────── */
.tab-bar {{
  display: flex;
  height: 32px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
}}
.tab-bar button {{
  background: none;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 0 16px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: color 0.15s, border-color 0.15s;
}}
.tab-bar button:hover {{
  color: var(--text-secondary);
}}
.tab-bar button.active {{
  color: var(--text-primary);
  border-bottom-color: var(--accent-gold);
}}

/* ── Split view ──────────────────────────────────── */
.split-view {{
  display: flex;
  height: calc(100vh - 72px);
}}
.panel-left {{
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
}}
.panel-right {{
  width: 380px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  overflow-y: auto;
}}

/* ── Tab panes ───────────────────────────────────── */
.tab-pane {{
  display: none;
  flex: 1;
  min-height: 0;
  overflow: auto;
}}
.tab-pane.active {{
  display: flex;
  flex-direction: column;
}}

/* ── Preview (iframe) ────────────────────────────── */
.preview-frame {{
  flex: 1;
  width: 100%;
  border: none;
  background: #000;
}}

/* ── WGSL viewer ─────────────────────────────────── */
.wgsl-viewer {{
  flex: 1;
  padding: 16px;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  overflow: auto;
  background: var(--bg-primary);
  color: var(--text-secondary);
}}
.wgsl-viewer .kw  {{ color: #C678DD; }}
.wgsl-viewer .fn  {{ color: #61AFEF; }}
.wgsl-viewer .ty  {{ color: #E5C07B; }}
.wgsl-viewer .num {{ color: #D19A66; }}
.wgsl-viewer .cmt {{ color: var(--text-muted); font-style: italic; }}
.wgsl-copy {{
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
  border-radius: 4px;
}}
.wgsl-copy:hover {{
  color: var(--text-primary);
  border-color: var(--accent-gold);
}}

/* ── Editor panel ────────────────────────────────── */
.editor-panel {{
  flex: 1;
  display: flex;
  flex-direction: column;
}}
.editor-textarea {{
  flex: 1;
  width: 100%;
  resize: none;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  padding: 16px;
  border: none;
  outline: none;
  tab-size: 2;
}}
.editor-actions {{
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border);
}}
.editor-actions button {{
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 4px 12px;
  cursor: pointer;
  border-radius: 4px;
}}
.editor-actions button:hover {{
  color: var(--text-primary);
  border-color: var(--accent-gold);
}}
.editor-actions button.primary {{
  background: var(--accent-gold);
  color: var(--bg-primary);
  border-color: var(--accent-gold);
  font-weight: 600;
}}
.editor-actions button.primary:hover {{
  opacity: 0.9;
}}

/* ── Component panel (right) ─────────────────────── */
.component-section {{
  padding: 16px;
  border-bottom: 1px solid var(--border);
}}
.component-section h3 {{
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
}}

/* ── Size toggle ─────────────────────────────────── */
.size-toggle {{
  display: flex;
  gap: 4px;
}}
.size-toggle button {{
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 3px 10px;
  cursor: pointer;
  border-radius: 3px;
}}
.size-toggle button.active {{
  color: var(--accent-gold);
  border-color: var(--accent-gold);
}}

/* ── Component preview ───────────────────────────── */
.component-preview {{
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  overflow: hidden;
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: width 0.2s, height 0.2s;
}}
.component-preview.size-sm {{ width: 160px; height: 120px; }}
.component-preview.size-md {{ width: 280px; height: 210px; }}
.component-preview.size-lg {{ width: 100%; height: 300px; }}

/* ── Param monitor ───────────────────────────────── */
.param-row {{
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}}
.param-row label {{
  font-size: 11px;
  color: var(--text-secondary);
  min-width: 80px;
}}
.param-row input[type="range"] {{
  flex: 1;
  accent-color: var(--accent-gold);
}}
.param-row .param-value {{
  font-size: 11px;
  color: var(--text-muted);
  min-width: 40px;
  text-align: right;
}}

/* ── Error styling ───────────────────────────────── */
.error-page {{
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background: var(--bg-primary);
  color: var(--error);
  padding: 32px;
  text-align: center;
}}
.error-page h1 {{
  font-size: 16px;
  margin-bottom: 16px;
}}
.error-page pre {{
  font-size: 12px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  max-width: 600px;
  text-align: left;
  background: var(--bg-secondary);
  padding: 16px;
  border-radius: 6px;
  border: 1px solid var(--border);
  margin-bottom: 24px;
}}
.error-page .waiting {{
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 12px;
}}
.error-page .waiting .dot {{
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--error);
  animation: pulse 1.5s ease-in-out infinite;
}}
@keyframes pulse {{
  0%, 100% {{ opacity: 0.3; }}
  50% {{ opacity: 1; }}
}}
"#
    )
}
