//! Dev preview page builder — assembles the full HTML dev UI.

use crate::CompileOutput;
use super::css::build_css;
use super::util::{html_escape, json_escape};

/// Build the full dev-server preview page with split-pane layout, tabs, and param sliders.
pub fn build_preview_page(outputs: &[CompileOutput], tag_name: &str, source: &str) -> String {
    let css = build_css(tag_name);

    let wgsl = outputs.first().and_then(|o| o.wgsl.as_deref()).unwrap_or("// no WGSL output");
    let js = outputs.first().map(|o| o.js.as_str()).unwrap_or("");
    let html_preview = outputs.first().and_then(|o| o.html.as_deref()).unwrap_or("");

    let wgsl_escaped = html_escape(wgsl);
    let source_escaped = html_escape(source);
    let source_json = json_escape(source);
    let html_preview_json = json_escape(html_preview);

    // Extract uniform info for param sliders by looking for the UNIFORMS array pattern
    // We parse the JS output to find uniform names/defaults
    let param_sliders = build_param_sliders(js);

    let mut s = String::with_capacity(8192);

    s.push_str("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n");
    s.push_str("<meta charset=\"utf-8\">\n");
    s.push_str("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n");
    s.push_str(&format!("<title>{tag_name} — GAME dev</title>\n"));
    s.push_str(&format!("<style>{css}</style>\n"));
    s.push_str("</head>\n<body>\n");

    // Toolbar
    s.push_str("<div class=\"toolbar\">\n");
    s.push_str(&format!("  <span class=\"tag-name\">&lt;{tag_name}&gt;</span>\n"));
    s.push_str("  <span style=\"color:var(--text-muted);font-size:11px\">GAME dev</span>\n");
    s.push_str("  <div class=\"status\">\n");
    s.push_str("    <span class=\"status-dot\" id=\"statusDot\"></span>\n");
    s.push_str("    <span class=\"status-text\" id=\"statusText\">compiled</span>\n");
    s.push_str("  </div>\n");
    s.push_str("</div>\n");

    // Tab bar
    s.push_str("<div class=\"tab-bar\">\n");
    s.push_str("  <button class=\"active\" data-tab=\"preview\">Preview</button>\n");
    s.push_str("  <button data-tab=\"wgsl\">WGSL</button>\n");
    s.push_str("  <button data-tab=\"editor\">Editor</button>\n");
    s.push_str("</div>\n");

    // Split view
    s.push_str("<div class=\"split-view\">\n");
    s.push_str("  <div class=\"panel-left\">\n");

    // Tab: Preview
    s.push_str("    <div class=\"tab-pane active\" id=\"tab-preview\">\n");
    s.push_str("      <iframe class=\"preview-frame\" id=\"previewFrame\" sandbox=\"allow-scripts\"></iframe>\n");
    s.push_str("    </div>\n");

    // Tab: WGSL
    s.push_str("    <div class=\"tab-pane\" id=\"tab-wgsl\" style=\"position:relative\">\n");
    s.push_str("      <button class=\"wgsl-copy\" id=\"wgslCopy\">copy</button>\n");
    s.push_str(&format!("      <pre class=\"wgsl-viewer\" id=\"wgslCode\">{wgsl_escaped}</pre>\n"));
    s.push_str("    </div>\n");

    // Tab: Editor
    s.push_str("    <div class=\"tab-pane\" id=\"tab-editor\">\n");
    s.push_str("      <div class=\"editor-panel\">\n");
    s.push_str(&format!("        <textarea class=\"editor-textarea\" id=\"editorArea\" spellcheck=\"false\">{source_escaped}</textarea>\n"));
    s.push_str("        <div class=\"editor-actions\">\n");
    s.push_str("          <button id=\"compileBtn\">Compile</button>\n");
    s.push_str("          <button id=\"saveBtn\" class=\"primary\">Save &amp; Compile</button>\n");
    s.push_str("        </div>\n");
    s.push_str("      </div>\n");
    s.push_str("    </div>\n");

    s.push_str("  </div>\n"); // end panel-left

    // Right panel: component view + params
    s.push_str("  <div class=\"panel-right\">\n");

    // Size toggle
    s.push_str("    <div class=\"component-section\">\n");
    s.push_str("      <h3>Component</h3>\n");
    s.push_str("      <div class=\"size-toggle\">\n");
    s.push_str("        <button data-size=\"sm\">SM</button>\n");
    s.push_str("        <button data-size=\"md\" class=\"active\">MD</button>\n");
    s.push_str("        <button data-size=\"lg\">LG</button>\n");
    s.push_str("      </div>\n");
    s.push_str(&format!("      <div class=\"component-preview size-md\" id=\"componentPreview\"><{tag_name}></{tag_name}></div>\n"));
    s.push_str("    </div>\n");

    // Param sliders
    if !param_sliders.is_empty() {
        s.push_str("    <div class=\"component-section\">\n");
        s.push_str("      <h3>Parameters</h3>\n");
        s.push_str(&param_sliders);
        s.push_str("    </div>\n");
    }

    s.push_str("  </div>\n"); // end panel-right
    s.push_str("</div>\n"); // end split-view

    // Inline component JS via <script type="module">
    s.push_str("<script type=\"module\">\n");
    s.push_str("// Register the Web Component\n");
    s.push_str(&format!("const _componentJS = \"{}\";\n", json_escape(js)));
    s.push_str("const blob = new Blob([_componentJS], { type: 'text/javascript' });\n");
    s.push_str("const url = URL.createObjectURL(blob);\n");
    s.push_str("await import(url);\n");
    s.push_str("URL.revokeObjectURL(url);\n");
    s.push_str("</script>\n");

    // Inline JS for tab switching, size toggle, copy WGSL, editor save
    s.push_str("<script>\n");
    s.push_str(&build_inline_js(tag_name, &source_json, &html_preview_json));
    s.push_str("</script>\n");

    s.push_str("</body>\n</html>\n");
    s
}

/// Build param slider HTML from the JS output by searching for the UNIFORMS array.
fn build_param_sliders(js: &str) -> String {
    // Parse UNIFORMS = [{name:'x',default:0.5}, ...] from the component JS
    let mut sliders = String::new();
    let needle = "const UNIFORMS = [";
    if let Some(start) = js.find(needle) {
        let rest = &js[start + needle.len()..];
        if let Some(end) = rest.find("];") {
            let inner = &rest[..end];
            // Tiny parser: extract {name:'...',default:...} entries
            for entry in inner.split("},") {
                let name = extract_between(entry, "name:'", "'");
                let default = extract_between(entry, "default:", "}").or_else(|| extract_between(entry, "default:", ","));
                if let (Some(name), Some(default_str)) = (name, default) {
                    let default_str = default_str.trim();
                    let val: f64 = default_str.parse().unwrap_or(0.0);
                    let min = 0.0_f64;
                    let max = if val.abs() > 1.0 { val.abs() * 2.0 } else { 1.0 };
                    let step = max / 100.0;
                    let name_escaped = html_escape(name);
                    sliders.push_str(&format!(
                        "      <div class=\"param-row\">\
                        <label>{name_escaped}</label>\
                        <input type=\"range\" min=\"{min}\" max=\"{max}\" step=\"{step}\" value=\"{val}\" data-param=\"{name_escaped}\">\
                        <span class=\"param-value\">{val}</span>\
                        </div>\n"
                    ));
                }
            }
        }
    }
    sliders
}

fn extract_between<'a>(s: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let i = s.find(start)? + start.len();
    let rest = &s[i..];
    let j = rest.find(end)?;
    Some(&rest[..j])
}

fn build_inline_js(tag_name: &str, _source_json: &str, html_preview_json: &str) -> String {
    format!(
        r#"(function() {{
  // ── Tab switching ────────────────────────────────
  const tabs = document.querySelectorAll('.tab-bar button');
  tabs.forEach(btn => {{
    btn.addEventListener('click', () => {{
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      const target = document.getElementById('tab-' + btn.dataset.tab);
      if (target) target.classList.add('active');
    }});
  }});

  // ── Size toggle ──────────────────────────────────
  const sizeButtons = document.querySelectorAll('.size-toggle button');
  const preview = document.getElementById('componentPreview');
  sizeButtons.forEach(btn => {{
    btn.addEventListener('click', () => {{
      sizeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      preview.className = 'component-preview size-' + btn.dataset.size;
    }});
  }});

  // ── Preview iframe ───────────────────────────────
  const iframe = document.getElementById('previewFrame');
  const htmlContent = "{html_preview_json}";
  if (htmlContent) {{
    iframe.srcdoc = htmlContent;
  }}

  // ── Copy WGSL ────────────────────────────────────
  document.getElementById('wgslCopy').addEventListener('click', () => {{
    const code = document.getElementById('wgslCode').textContent;
    navigator.clipboard.writeText(code).then(() => {{
      const btn = document.getElementById('wgslCopy');
      btn.textContent = 'copied!';
      setTimeout(() => btn.textContent = 'copy', 1500);
    }});
  }});

  // ── WGSL syntax highlighting ─────────────────────
  function escapeHTMLText(s) {{
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }}
  function highlightWGSL(code) {{
    return escapeHTMLText(code)
      .replace(/\b(fn|var|let|return|if|else|for|struct|override|const)\b/g, '<span class="kw">$1</span>')
      .replace(/\b(vec[234]f?|mat[234]x[234]f?|f32|u32|i32|bool)\b/g, '<span class="ty">$1</span>')
      .replace(/\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/g, '<span class="num">$1</span>')
      .replace(/(\/\/.*)/g, '<span class="cmt">$1</span>');
  }}
  const wgslEl = document.getElementById('wgslCode');
  wgslEl.innerHTML = highlightWGSL(wgslEl.textContent);

  // ── Status helper ────────────────────────────────
  function setStatus(ok, msg) {{
    const dot = document.getElementById('statusDot');
    const txt = document.getElementById('statusText');
    dot.className = 'status-dot' + (ok ? '' : ' error');
    txt.textContent = msg;
  }}

  // ── Compile handler ──────────────────────────────
  async function doCompile(source, save) {{
    setStatus(true, 'compiling...');
    try {{
      if (save) {{
        await fetch('/save', {{
          method: 'POST',
          headers: {{ 'Content-Type': 'application/json' }},
          body: JSON.stringify({{ source }})
        }});
      }}
      const res = await fetch('/compile', {{
        method: 'POST',
        headers: {{ 'Content-Type': 'application/json' }},
        body: JSON.stringify({{ source }})
      }});
      const data = await res.json();
      if (data.error) {{
        setStatus(false, 'error');
        return;
      }}
      setStatus(true, 'compiled');
      // Update WGSL viewer
      if (data.wgsl) {{
        wgslEl.innerHTML = highlightWGSL(data.wgsl);
      }}
      // Reload component by re-fetching component.js
      const el = preview.querySelector('{tag_name}');
      if (el) el.remove();
      const fresh = document.createElement('{tag_name}');
      preview.appendChild(fresh);
    }} catch (err) {{
      setStatus(false, 'fetch error');
    }}
  }}

  document.getElementById('compileBtn').addEventListener('click', () => {{
    doCompile(document.getElementById('editorArea').value, false);
  }});
  document.getElementById('saveBtn').addEventListener('click', () => {{
    doCompile(document.getElementById('editorArea').value, true);
  }});

  // ── Param sliders → component ────────────────────
  document.querySelectorAll('input[data-param]').forEach(slider => {{
    slider.addEventListener('input', () => {{
      const name = slider.dataset.param;
      const val = parseFloat(slider.value);
      slider.nextElementSibling.textContent = val.toFixed(2);
      const el = preview.querySelector('{tag_name}');
      if (el) el.setAttribute(name, val);
    }});
  }});
}})();
"#
    )
}

/// Build a dark-themed error page with a pulsing "waiting for fix" indicator.
pub fn build_error_page(tag_name: &str, error: &str) -> String {
    let css = build_css(tag_name);
    let error_escaped = html_escape(error);

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{tag_name} — error</title>
<style>{css}</style>
</head>
<body>
<div class="error-page">
  <h1>&lt;{tag_name}&gt; compile error</h1>
  <pre>{error_escaped}</pre>
  <div class="waiting"><span class="dot"></span> waiting for fix...</div>
</div>
</body>
</html>
"#
    )
}
