# GLYPH Launch Playbook

## Hacker News Post

**Title:** Show HN: Glyph – 45 GPU shader visuals you can embed with one script tag

**URL:** https://glyph.4da.ai (or runyourempire.github.io/glyph-engine/)

**Comment (post immediately after submitting):**

I built Glyph — a visual language that compiles to WebGPU/WebGL2 Web Components.

The idea: every visual in the gallery is a self-contained `<glyph-xyz>` custom HTML element. One script tag, zero dependencies, 60fps on GPU. Drop it on any page and it renders.

```html
<script src="event-horizon.js"></script>
<glyph-event-horizon></glyph-event-horizon>
```

The language is designed for AI to write — a constrained state machine (Position → SDF → Color) means invalid shaders are syntactically impossible. 52 builtins compose with a pipe operator:

```
warp(scale: 0.5, octaves: 5, strength: 0.3) | fbm(scale: 0.6) | palette(aurora)
```

Tech: Rust compiler (31K LOC, 589 tests), 1.1MB WASM for in-browser compilation, dual WebGPU + WebGL2 output, VS Code extension with live preview.

The WASM compiler runs in the browser — you can edit code in the playground and see it compile + render in milliseconds.

Source: https://github.com/runyourempire/glyph-engine

**Timing:** Tuesday or Wednesday, 9-10am EST

---

## npm Publish Steps

```bash
cd D:\runyourempire\game-engine\game-compiler\pkg
npm login
# Enter your npm username, password, email, OTP
npm publish --access public
# Published: @4da/glyph-compiler@1.0.0
```

After publish, anyone can:
```bash
npm install @4da/glyph-compiler
```

```javascript
import init, { compileGlyph } from '@4da/glyph-compiler';
await init();
const result = compileGlyph(source, 'both');
```

---

## MCP Registry Submission

1. Visit https://registry.modelcontextprotocol.io
2. Submit server with:
   - Name: `glyph-mcp-server`
   - Description: "AI agents generate GPU-rendered interactive Web Components from natural language"
   - Install: `npm install -g glyph-mcp-server`
   - Tools: glyph_compile, glyph_render, glyph_gallery, glyph_builtins
   - Source: https://github.com/runyourempire/glyph-engine/tree/main/mcp-glyph-server

---

## VS Code Marketplace Publish

```bash
cd D:\runyourempire\game-engine\game-compiler\editors\vscode
npm install -g @vscode/vsce
vsce package
# Creates glyph-language-x.x.x.vsix
vsce publish
# Needs Personal Access Token from dev.azure.com
```

---

## Domain Setup (glyph.4da.ai)

1. DNS: Add CNAME `glyph.4da.ai` → `runyourempire.github.io`
2. GitHub: repo settings → Pages → Custom domain → `glyph.4da.ai`
3. GitHub auto-provisions SSL

---

## Tweet Thread

Tweet 1:
"Built something: type a description, get a GPU shader Web Component.

45 interactive visuals, each embeddable with one <script> tag. Zero dependencies. 60fps.

→ [link to glyph.4da.ai]"

Tweet 2:
"The language is 52 words. AI writes it perfectly on the first try because invalid programs are syntactically impossible.

warp | fbm | glow | tint

That's a living texture in 4 words."

Tweet 3:
"Everything runs in the browser. 1.1MB WASM compiler. No server. No account. No API key needed to browse the gallery.

The playground lets you edit code and see GPU shaders compile in milliseconds."

---

## Post-Launch Checklist

- [ ] Domain configured (glyph.4da.ai)
- [ ] npm published (@4da/glyph-compiler)
- [ ] MCP server submitted to registry
- [ ] VS Code extension on marketplace
- [ ] HN post submitted (Tuesday/Wednesday 9am EST)
- [ ] Tweet thread posted
- [ ] Test generation flow with real API key
- [ ] Test on Chrome, Firefox, Edge, Safari
- [ ] Test on mobile (gallery browsing)
