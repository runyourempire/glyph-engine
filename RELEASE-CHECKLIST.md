# GAME v1.0 — Pre-Release Checklist

**Generated:** 2026-03-25
**Sources:** 3 deep-dive audits (VS Code extension, compiler edge cases, distribution/DX), 2 prior audit rounds
**Status:** Items marked [DONE] were fixed in this session. All others are open.

---

## Tier 0 — LEGAL / BLOCKS EVERYTHING

| # | Item | Details | Effort |
|---|------|---------|--------|
| 1 | **LICENSE file missing from repo** | No license file exists. README says "MIT", Cargo.toml/package.json say "FSL-1.1-Apache-2.0". Must add the full FSL-1.1-Apache-2.0 license text file and correct README. Without this, the project has no legal standing for distribution. | Trivial |
| 2 | **Cargo.toml missing required fields for crates.io** | No `license`, `authors`, `repository`, `homepage`, `keywords`, `categories`, `exclude`. Cannot publish. | Trivial |
| 3 | **README license section says "MIT"** | Must be changed to FSL-1.1-Apache-2.0 to match Cargo.toml and package.json | Trivial |

---

## Tier 1 — CRITICAL (would embarrass us publicly)

### Security

| # | Item | Details | Effort |
|---|------|---------|--------|
| 4 | **API key stored in plaintext settings.json** | `aiProvider.ts` saves Anthropic API key to `vscode.ConfigurationTarget.Global`. Should use VS Code `ExtensionContext.secrets` (SecretStorage API). Anyone with file access can read the key. | Medium |
| 5 | [DONE] **Dev server bound to 0.0.0.0** | Was network-accessible. Fixed to 127.0.0.1. | Done |

### VS Code Extension — Memory & Resource Leaks

| # | Item | Details | Effort |
|---|------|---------|--------|
| 6 | **WebView custom element registry leak** | Each recompile calls `customElements.define()` with a timestamp-suffixed tag. The Custom Elements Registry is append-only — entries can never be removed. After hundreds of recompiles, hundreds of orphaned class definitions accumulate with their closures (shader code, canvas setup, rAF callbacks). Fix: use `<iframe>` for isolation or rewrite preview to use a single updateable element. | Hard |
| 7 | **Old component animation loops never cancelled** | When a new component replaces the old one via `host.innerHTML = ''`, the old element's `disconnectedCallback` fires but the registered class and its module-scoped state persist. If `disconnectedCallback` doesn't cancel `requestAnimationFrame`, old loops keep running. Fix: track the rAF ID and cancel it explicitly before replacing, or use iframe approach from #6. | Hard |
| 8 | **AI panel HTTP request not cancelled on panel close** | `_handleGenerate` awaits streaming response. If user closes panel, `dispose()` runs but `https.request` keeps streaming. `onChunk` callback calls `postMessage` on disposed panel → throws. Request is never aborted. Fix: store the `ClientRequest` and call `req.destroy()` in `dispose()`. | Medium |

### Compiler

| # | Item | Details | Effort |
|---|------|---------|--------|
| 9 | [DONE] **5/8 `game new` templates broken** | Fixed: blend syntax, pipeline order, resonate syntax. | Done |
| 10 | [DONE] **32/32 gallery components broken** | Fixed: rewrote all to valid `cinematic` syntax. | Done |
| 11 | [DONE] **AI provider taught wrong GAME syntax** | Fixed: rewrote system prompt with correct cinematic/layer/pipeline syntax. | Done |
| 12 | **WASM package is non-functional** | `pkg/` contains a 375-byte placeholder WASM file. Needs real `wasm-pack build --features wasm`. | Easy |

---

## Tier 2 — HIGH (breaks user experience)

### Compiler Issues

| # | Item | Details | Effort |
|---|------|---------|--------|
| 13 | **`-t webgpu`/`-t webgl2` flags are no-ops** | Both renderers always bundled regardless of flag. ~18KB waste per component. | Medium |
| 14 | [DONE] **Unknown palette names compile silently** | Fixed: validation error with full palette list. | Done |
| 15 | **No argument count validation** | `circle(0.3, 0.5, 0.7)` silently ignores extra args. `circle("hello")` silently uses default. | Medium |
| 16 | **162 `unwrap()` calls in production code** | Potential panics on malformed input. Need audit — some are in codegen string formatting (safe), others in production paths. | Medium |
| 17 | **4 `panic!()` calls in production code** | (Not in test code.) Need review and conversion to Result. | Easy |

### VS Code Extension Issues

| # | Item | Details | Effort |
|---|------|---------|--------|
| 18 | **Temp file path collisions across VS Code windows** | `game-preview.game`, `game-ai-gen.game`, `game-export.game` use hardcoded names in os.tmpdir(). Two windows = race condition. Fix: include PID or random suffix. | Easy |
| 19 | **Preview compile doesn't check panel disposal before postMessage** | `cp.exec` callback fires after panel close → throws. Child process not stored so can't be killed. | Medium |
| 20 | **Gallery fork overwrites existing files silently** | `_forkComponent` does `writeFileSync` with no existence check. Data loss risk. | Easy |
| 21 | [DONE] **Palette list mismatch** | Fixed: synced 30 palettes between extension and compiler. | Done |
| 22 | [DONE] **Gallery keybinding conflicts with VS Code build task** | Fixed: Ctrl+Shift+B → Ctrl+Shift+L. | Done |
| 23 | **Gallery description/name not HTML-escaped** | Component names/descriptions injected into WebView HTML without escaping. XSS vector if gallery index is ever user-editable. | Easy |
| 24 | **`onDidChangeTextDocument` fires for background .game documents** | Any .game file change triggers recompile — even non-active background documents. Preview may show wrong file. | Easy |
| 25 | **Stale output directory not cleaned before compile** | `readdirSync(outputDir)` may pick up files from previous compilation. | Easy |

---

## Tier 3 — MEDIUM (degrades quality)

### Documentation

| # | Item | Details | Effort |
|---|------|---------|--------|
| 26 | **README stats wrong** | Says 19,700 lines / 47 builtins / 400 tests / 43 examples. Actual: ~29K / 49 / 567 / 78. | Trivial |
| 27 | **LANGUAGE.md says "Version 0.7.0"** | Should be 1.0.0. Missing v0.8+ features (props, dom, on, state, role). | Medium |
| 28 | **No CHANGELOG.md** | Users have no version history. | Medium |
| 29 | **VISION.md and ROADMAP.md say "v0.6.0"** | Stale internal documents. | Trivial |
| 30 | **`outline()` parameter discrepancy** | README shows 4 params, `game info` shows 1. | Easy |
| 31 | **VS Code extension README doesn't document new features** | No mention of AI generation, gallery, parameter tuner, export. | Easy |
| 32 | **No CONTRIBUTING.md** | No contributor guidelines. | Easy |

### Compiler

| # | Item | Details | Effort |
|---|------|---------|--------|
| 33 | [DONE] **Empty file validates as "ok"** | Fixed: now warns "contains no components". | Done |
| 34 | [DONE] **`game new` fails if parent dirs don't exist** | Fixed: added `create_dir_all`. | Done |
| 35 | **`project` block compiles with no output, no warning** | Silent no-op. | Easy |
| 36 | **Empty cinematic generates 17KB** | Full renderer for empty shader. Should warn. | Easy |
| 37 | **No "did you mean?" for top-level keywords** | `componet` → lists valid keywords but no suggestion. Stage functions already have this. | Easy |
| 38 | **6 output types lack .d.ts** | breed, scene, ifs, lsystem, automaton, matrix. | Medium |
| 39 | **No file extension check** | Building a `.toml` file gives confusing parse errors instead of "not a .game file". | Easy |
| 40 | **Directory path gives OS error** | `game build examples/` doesn't say "expected file, got directory". | Easy |
| 41 | **No BOM stripping** | Windows Notepad may add UTF-8 BOM, causing parse failure. | Easy |
| 42 | [DONE] **Dev server mutex unwraps can cascade-panic** | Fixed: `unwrap_or_else(poisoned)`. | Done |
| 43 | **`cdylib` crate-type built unconditionally** | Slows every build. Should be behind `wasm` feature. | Easy |
| 44 | [DONE] **CI clippy was silently ignored** | Fixed: now shows all warnings. | Done |
| 45 | **No Cargo.toml `exclude` field** | Publishing would include ~100MB unnecessary files. | Trivial |

### VS Code Extension

| # | Item | Details | Effort |
|---|------|---------|--------|
| 46 | **Parameter tuner detects numbers in comments** | No comment/string awareness. Tuning a commented number edits dead code. | Medium |
| 47 | **Named parameter syntax not supported by tuner** | `warp(scale: 3.0)` — `:` breaks the context detection regex. Falls back to default range. | Easy |
| 48 | **stderr warnings on successful compile silently discarded** | Compiler may emit warnings but exit 0. Preview ignores them. | Easy |
| 49 | **AI code block parser only handles first code block** | Multiple code blocks → only first extracted. Newline-sensitive regex. | Easy |
| 50 | **`retainContextWhenHidden: true` on all panels** | Preview keeps running GPU animation when hidden. Gallery/AI waste memory. | Medium |
| 51 | **`client.stop()` called twice on deactivation** | Disposable + deactivate() both call it. Harmless but sloppy. | Trivial |
| 52 | **`resolveServerPath` is dead code** | Both branches return input unchanged. | Trivial |
| 53 | [DONE] **`vscode:prepublish` was no-op** | Fixed: now runs `tsc -p ./`. | Done |
| 54 | [DONE] **CI had no VS Code extension job** | Fixed: added tsc --noEmit job. | Done |
| 55 | **No guard against double AI generation (backend)** | WebView has button disable but extension-side has no flag. | Easy |
| 56 | **Gallery search doesn't search description field** | Only searches name, tags, category. | Easy |
| 57 | **VSIX is stale (0.1.0 vs 0.5.0)** | Needs repackaging with `vsce package`. | Trivial |

---

## Tier 4 — LOW (polish, edge cases)

### Compiler

| # | Item | Details | Effort |
|---|------|---------|--------|
| 58 | **No value range validation** | Negative glow, 999999 canvas, zero radius all pass through. | Easy |
| 59 | **200-char filenames accepted** | No name length limit. Windows MAX_PATH issues. | Trivial |
| 60 | **Unicode in component names** | Filesystem issues on some platforms. | Trivial |
| 61 | **No output size in build log** | Users can't see bloat. | Trivial |
| 62 | **No batch compilation mode** | 76 files = 15s due to process startup overhead. | Medium |
| 63 | **No `--strict` mode** | CI can't distinguish warnings from clean builds. | Easy |
| 64 | **`011-project-dome.game` silent no-op** | Compiles without error, produces nothing. | Easy |
| 65 | **Float precision truncated to 6 decimals** | `0.123456789012345` → 6 decimal output. Probably fine. | Low |
| 66 | **No MSRV declared in Cargo.toml** | Users don't know minimum Rust version. | Trivial |
| 67 | **LSP only reports first error per file** | Requires parser error recovery — hard. | Hard |
| 68 | **LSP has no palette name completions** | Common operation gets no editor support. | Medium |
| 69 | **Dev server uses polling (500ms) not WebSocket** | Slightly delayed updates. | Medium |

### VS Code Extension

| # | Item | Details | Effort |
|---|------|---------|--------|
| 70 | **`\b` word boundary catches numbers in identifiers** | `layer2` → tuner offers to tune `2`. | Low |
| 71 | **Only first `tint()`/`palette()` on line detected** | Multiple calls on same line → only first matched. | Low |
| 72 | **`activationEvents` is redundant** | VS Code 1.74+ auto-activates from language contribution. | Trivial |
| 73 | **Ctrl+Shift+G conflicts with Source Control** | Limited to .game files via `when` clause. Acceptable trade-off. | Low |
| 74 | **Ctrl+Shift+A conflicts with Block Comment** | Limited to .game files. | Low |
| 75 | **React export uses side-effect import** | Non-standard for modern React. Comment partially addresses it. | Low |
| 76 | **HTML export puts script after element** | FOUC possible. Browsers handle via upgrade. | Low |
| 77 | **Tuner doesn't validate line/col bounds** | Document modified between detection and edit → invalid range. | Low |
| 78 | **`tint()` regex accepts malformed floats** | `[\d.]` matches `3.14.15`. Benign in practice. | Low |
| 79 | [DONE] **React wrapper hangs on script load failure** | Fixed: added onerror handler. | Done |
| 80 | **Svelte wrapper uses deprecated Svelte 4 API** | Should use Svelte 5 runes. | Easy |

### Distribution

| # | Item | Details | Effort |
|---|------|---------|--------|
| 81 | **npm packages not published** | React, Vue, Svelte wrappers, WASM package — none on npm. | Medium |
| 82 | **VS Code extension not on marketplace** | Needs VS Code marketplace publishing. | Medium |
| 83 | **Extension version 0.5.0 doesn't match compiler 1.0.0** | Confusing. Should align or clearly document relationship. | Trivial |
| 84 | **AI model default hardcoded** | `claude-sonnet-4-20250514` will eventually be stale. | Trivial |
| 85 | **`@game-engine/react` npm scope not claimed** | Wrapper package.json references unclaimed scope. | Trivial |

### Accessibility

| # | Item | Details | Effort |
|---|------|---------|--------|
| 86 | **WebView panels lack ARIA attributes** | Preview, tuner, gallery, AI panel — no roles or labels. | Medium |
| 87 | **All text hardcoded English** | No i18n infrastructure. | Hard |

### Testing Gaps

| # | Item | Details | Effort |
|---|------|---------|--------|
| 88 | **No CLI integration tests** | Argument parsing untested. | Medium |
| 89 | **No dev server tests** | Hot reload, error handling untested. | Medium |
| 90 | **No WASM binding tests** | WASM exports untested. | Medium |
| 91 | **No VS Code extension tests** | No automated testing of extension behavior. | Hard |
| 92 | **No runtime JS output tests** | Generated JS never loaded in a browser to verify it works. | Hard |
| 93 | **No cross-platform CI** | Only tested on Windows. Should test Linux/macOS. | Medium |
| 94 | **No memory leak tests** | No testing of repeated compilation memory usage. | Medium |

### Compiler Edge Case Findings (from 75+ boundary tests)

| # | Item | Details | Effort |
|---|------|---------|--------|
| 101 | **Arc parser easing is greedy** | Non-last arc entries without easing consume the next entry's name as easing string → parse error. `parser.rs:1003`. Workaround: always specify easing on non-last entries. Fix: verify ident is a known easing name or lookahead for colon. | Medium |
| 102 | **Zero-size canvas not guarded in WebGPU render** | Generated `render()` uses `canvas.width/height` without `|| 1`. ResizeObserver on hidden elements → zero-size → invalid WebGPU textures. | Easy |
| 103 | **Duplicate layer names not validated** | Two layers with the same name in one cinematic compiles without warning. Could confuse users and cause unexpected behavior. | Easy |
| 104 | **Empty cinematic (with no layers) generates 17KB with no warning** | `cinematic "foo" {}` produces full WebComponent. Empty-file case warns but empty-cinematic doesn't. | Easy |

### Remaining From Prior Audits

| # | Item | Details | Effort |
|---|------|---------|--------|
| 95 | **Gallery shows code previews, not rendered thumbnails** | Needs WASM or pre-rendered screenshots. | Hard |
| 96 | **Extension never loaded in real VS Code** | Tuner, gallery, AI — never human-tested. | Medium |
| 97 | **WASM preview for instant feedback** | Currently uses CLI (300ms). WASM would be ~5ms. | Hard |
| 98 | **VS Code marketplace publishing** | Account, branding, screenshots, documentation. | Medium |
| 99 | **`game init` command** | Create project directory with recommended structure. | Medium |
| 100 | **Dev server hot reload via WebSocket** | Replace polling with push-based updates. | Medium |

---

## Summary

| Tier | Count | Theme |
|------|-------|-------|
| **0 — Legal** | 3 | LICENSE file, Cargo.toml fields, README license |
| **1 — Critical** | 8 (4 done) | Security, memory leaks, broken features |
| **2 — High** | 13 (4 done) | UX breaks, data loss, race conditions |
| **3 — Medium** | 24 (6 done) | Docs, warnings, polish, validation |
| **4 — Low** | 41 (1 done) | Edge cases, accessibility, testing, distribution |
| **DONE** | 15 | Fixed in this session |
| **REMAINING** | 89 | Open items |

### Optimal Trajectory

**Immediate (next session):**
1. Items 1-3 (LICENSE + Cargo.toml) — 15 minutes, unblocks everything
2. Item 4 (API key SecretStorage) — 30 minutes, security fix
3. Items 18, 20, 23-25 (easy extension fixes) — 1 hour batch

**Next phase:**
4. Items 6-7 (preview memory leak) — iframe-based rewrite, biggest architectural fix
5. Items 26-31 (documentation) — bring all docs to 1.0 accuracy
6. Item 12 (real WASM build) — unblocks npm publish + in-browser preview

**Before public release:**
7. Items 13, 15 (compiler validation) — target flag + argument validation
8. Items 57, 82 (packaging) — VSIX + marketplace publishing
9. Item 96 (human testing) — actually use the extension

---

*This checklist supersedes AUDIT-REPORT.md. 100 items, 3 audit sources, every surface covered.*
