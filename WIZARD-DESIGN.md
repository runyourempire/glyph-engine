# GAME v1.0 — The Wizard's Design

*Transform GAME from a shader composition DSL into a visual state machine compiler.*

This is the master design document. Every syntax, AST node, codegen pattern, and runtime change is specified precisely. Each phase compiles, tests, and ships independently.

---

## The Three Transformations

| # | Transformation | What It Unlocks | Current State |
|---|---------------|----------------|---------------|
| 1 | **Expressions in Pipelines** | Living, breathing visuals from static code | Parser has Expr, codegen ignores it in pipeline args |
| 2 | **Visual State Machine** | Interactive components that rival Rive | Only continuous-time arcs exist |
| 3 | **Shared Renderer Runtime** | 2KB components instead of 18KB | Full renderer embedded in every .js |

Plus: keyframe sequences, finish particles/texture/3D wiring, IntersectionObserver pause.

---

## Phase 1: Expressions in Pipelines

**The unlock:** `circle(0.2 + sin(time) * 0.05)` compiles to inline shader math. Every component becomes alive without arc blocks.

### What exists today

The parser ALREADY handles expressions in pipeline args:
```
parse_expr() → parse_additive() → parse_term() → parse_factor() → parse_atom()
```
And `emit_wgsl_expr()` at wgsl.rs:927 ALREADY converts Expr to WGSL:
```rust
Expr::BinOp { op, left, right } => {
    let l = emit_wgsl_expr(left);
    let r = emit_wgsl_expr(right);
    match op { BinOp::Add => format!("({l} + {r})"), ... }
}
Expr::Call { name, args } => {
    let a: Vec<String> = args.iter().map(|a| emit_wgsl_expr(&a.value)).collect();
    format!("{}({})", name, a.join(", "))
}
```

**The problem:** Pipeline stages extract args as literal values for codegen templates. When wgsl.rs generates `sdf_circle(p, {radius})`, it evaluates `radius` as a constant. It doesn't emit `emit_wgsl_expr(arg)` for complex expressions.

### What to change

**`src/codegen/wgsl.rs`** — In every builtin's codegen template, replace literal parameter interpolation with expression emission:

```rust
// BEFORE (current, line ~400):
let radius = resolve_arg(args, 0, "radius", 0.2);
s.push_str(&format!("var sdf_result = sdf_circle(p, {radius:.6});\n"));

// AFTER:
let radius_expr = resolve_arg_expr(args, 0, "radius", "0.2");
let radius_wgsl = emit_wgsl_expr(&radius_expr);
s.push_str(&format!("var sdf_result = sdf_circle(p, {radius_wgsl});\n"));
```

**New helper function** in codegen/wgsl.rs:
```rust
/// Resolve a pipeline arg as an Expr, falling back to a default literal.
fn resolve_arg_expr(args: &[Arg], index: usize, name: &str, default: &str) -> Expr {
    // Try named arg first, then positional
    if let Some(arg) = args.iter().find(|a| a.name.as_deref() == Some(name)) {
        return arg.value.clone();
    }
    if let Some(arg) = args.get(index) {
        return arg.value.clone();
    }
    Expr::Number(default.parse().unwrap_or(0.0))
}
```

**Add math builtins to `emit_wgsl_expr`** — When Expr::Call encounters `sin`, `cos`, `abs`, `min`, `max`, `pow`, `sqrt`, `step`, `smoothstep`, `mix`, `clamp`, `fract`, `mod`, emit them directly:

```rust
Expr::Call { name, args } => {
    let a: Vec<String> = args.iter().map(|a| emit_wgsl_expr(&a.value)).collect();
    let wgsl_name = match name.as_str() {
        // GPU math functions — pass through to shader
        "sin" | "cos" | "tan" | "asin" | "acos" | "atan" |
        "abs" | "sign" | "floor" | "ceil" | "fract" | "sqrt" |
        "min" | "max" | "clamp" | "mix" | "step" | "smoothstep" |
        "pow" | "exp" | "log" | "length" | "normalize" | "dot" => name.as_str(),
        _ => name.as_str(), // user functions pass through too
    };
    format!("{}({})", wgsl_name, a.join(", "))
}
```

**Same changes in `src/codegen/glsl.rs`** — `emit_glsl_expr` with GLSL function names (mostly identical, but `fract()` not `fract()`, `mod()` not `%`).

### What this enables

```game
cinematic "breathing-orb" {
  layer core {
    circle(0.2 + sin(time * 2.0) * 0.05)
    | glow(1.5 + cos(time * 0.5) * 0.5)
    | tint(0.83, 0.69, 0.22)
  }
}
```

No arc block needed. The circle breathes. The glow pulses. All from one pipeline.

```game
cinematic "data-ring" {
  layer ring {
    ring(0.3, 0.02)
    | mask_arc(fill_level * 6.28318)
    | glow(1.5 + fill_level * 1.0)
    | tint(mix(0.93, 0.13, fill_level), mix(0.27, 0.77, fill_level), 0.2)
  }
}
```

A progress ring that goes from red (0%) to green (100%) — with `mix()` doing color interpolation in the shader. No JavaScript needed.

### Tests
- Parse `circle(0.2 + sin(time) * 0.05)` → verify Expr::BinOp in AST
- Compile → verify WGSL output contains `sin(u.time)`
- Compile → verify GLSL output contains `sin(u_time)`
- Verify all existing examples still compile (backward compatible — literal numbers are still Expr::Number)

### Effort: ~200 lines changed across wgsl.rs + glsl.rs. Parser unchanged (already works).

---

## Phase 2: Keyframe Animation Sequences

**The unlock:** `A → B → C → D` animation sequences with per-segment easing. Components can choreograph complex multi-step animations.

### Grammar

```game
arc enter {
  // Keyframe sequence: value at time with easing
  opacity: 0.0 @0ms -> 1.0 @200ms ease-out -> 1.0 @2s -> 0.8 @3s ease-in
  scale: 0.95 @0ms -> 1.02 @150ms ease-out -> 1.0 @300ms ease-in-out
}
```

The `@time` syntax marks absolute keyframe positions. Each `->` transition has its own easing.

### AST changes (ast.rs)

Replace `ArcEntry` with a keyframe-aware version:

```rust
/// A single animated property with one or more keyframes.
#[derive(Debug, Clone)]
pub struct ArcProperty {
    pub target: String,
    pub keyframes: Vec<Keyframe>,
}

/// A keyframe: value at a specific time, with easing to the NEXT keyframe.
#[derive(Debug, Clone)]
pub struct Keyframe {
    pub value: Expr,
    pub time: Duration,
    pub easing: Option<String>, // easing TO the next keyframe
}
```

**Backward compatibility:** The existing `from -> to over duration easing` syntax parses into 2 keyframes:
```
Keyframe { value: from, time: 0ms, easing: None }
Keyframe { value: to, time: duration, easing: Some(easing) }
```

### Parser changes (parser.rs)

In `parse_arc()`, after reading `target:`, check for `@` syntax:
- If next token after value is `@` → keyframe mode (new)
- If next token after value is `->` → legacy mode (existing, convert to 2 keyframes)

```rust
fn parse_arc_property(&mut self) -> Result<ArcProperty, CompileError> {
    let target = self.expect_ident_or_keyword()?;
    self.expect(&Token::Colon)?;

    let mut keyframes = Vec::new();

    // Parse first value
    let value = self.parse_expr()?;

    // Check mode: @time (keyframe) or -> (legacy)
    if self.check_ident("@") || matches!(self.peek(), Some(Token::Ident(s)) if s == "@") {
        // Keyframe mode: value @time [easing] -> value @time [easing] -> ...
        // ... parse keyframe chain
    } else {
        // Legacy mode: from -> to over duration [easing]
        self.expect(&Token::Arrow)?;
        let to = self.parse_expr()?;
        self.expect(&Token::Over)?;
        let duration = self.parse_duration()?;
        let easing = self.try_parse_easing();
        keyframes.push(Keyframe { value, time: Duration::Millis(0.0), easing: None });
        keyframes.push(Keyframe { value: to, time: duration, easing });
    }

    Ok(ArcProperty { target, keyframes })
}
```

### Codegen changes (arc.rs)

The JavaScript timeline class changes from linear lerp to multi-segment interpolation:

```javascript
evaluate(elapsedSec) {
  const result = {};
  for (const prop of this._props) {
    let t = elapsedSec;
    // Find which segment we're in
    for (let i = 0; i < prop.keyframes.length - 1; i++) {
      const kf0 = prop.keyframes[i];
      const kf1 = prop.keyframes[i + 1];
      if (t <= kf1.time) {
        const segDuration = kf1.time - kf0.time;
        const segProgress = segDuration > 0 ? (t - kf0.time) / segDuration : 1;
        const eased = kf1.easing ? kf1.easing(Math.min(segProgress, 1)) : segProgress;
        result[prop.target] = kf0.value + (kf1.value - kf0.value) * eased;
        break;
      }
      if (i === prop.keyframes.length - 2) {
        result[prop.target] = kf1.value; // past last keyframe, hold
      }
    }
  }
  return result;
}
```

### Tests
- Parse `opacity: 0.0 @0ms -> 1.0 @200ms ease-out -> 0.8 @3s ease-in` → verify 3 keyframes
- Legacy `opacity: 0.0 -> 1.0 over 2s ease-out` still works (2 keyframes)
- JS output contains multi-segment evaluation logic

### Effort: ~150 lines AST + ~100 lines parser + ~200 lines arc.rs codegen

---

## Phase 3: Visual State Machine

**The unlock:** GAME components have discrete states with transitions. This is the transformation from "pretty pictures" to "interactive components."

### Grammar

```game
cinematic "button" {
  props {
    label: "Click Me"
    color_r: 0.83, color_g: 0.69, color_b: 0.22
  }

  // Default state — what the component looks like at rest
  state idle {
    layer bg blend: occlude {
      box(0.9, 0.35) | shade(0.08, 0.08, 0.08)
    }
    layer glow {
      box(0.88, 0.33) | glow(0.5) | tint(color_r, color_g, color_b)
    }
    layer border {
      box(0.9, 0.35) | shell(0.008) | glow(1.5) | tint(color_r, color_g, color_b)
    }
  }

  // Hover state — uniform overrides + transition timing
  state hover from idle over 150ms ease-out {
    glow.intensity: 1.2       // override uniform in 'glow' layer
    border.intensity: 2.5     // override uniform in 'border' layer
  }

  // Active (pressed) state
  state active from hover over 50ms ease-in {
    glow.intensity: 0.3
    bg.scale: 0.97            // scale the background down slightly
  }

  dom {
    text "label" {
      at: "50%" "50%"
      width: "80%"
      align: "center"
      style: "font:600 14px Inter;color:#FFFFFF;transform:translateY(-50%)"
      bind: "label"
    }
  }

  on "click" { emit: "pressed" }
  role: "button"
}
```

### Key design decisions

1. **States contain layers** — each state defines its own visual composition. On transition, layers cross-fade.
2. **States can inherit** — `state hover from idle` means hover starts with idle's layers and applies overrides. This avoids duplicating 20 lines of layer code for a hover effect.
3. **Transitions are automatic** — `over 150ms ease-out` defines how long the transition takes and what easing to use.
4. **Simple states are uniform overrides** — `hover` doesn't need to redefine all layers. It just says "change these uniforms." The runtime interpolates.
5. **Backward compatible** — Cinematics without `state` blocks work exactly as before. Layers at the top level are the implicit `idle` state.

### AST changes (ast.rs)

```rust
/// A visual state with its own layer composition and transition parameters.
#[derive(Debug, Clone)]
pub struct StateBlock {
    pub name: String,
    /// Parent state to inherit layers from (`from idle`).
    pub parent: Option<String>,
    /// Transition duration from parent state.
    pub transition_duration: Option<Duration>,
    /// Transition easing.
    pub transition_easing: Option<String>,
    /// Full layer definitions (if this state has its own visual composition).
    pub layers: Vec<Layer>,
    /// Uniform overrides (if inheriting from parent — `glow.intensity: 1.2`).
    pub overrides: Vec<StateOverride>,
}

/// A uniform override within a state: `layer_name.param: value`
#[derive(Debug, Clone)]
pub struct StateOverride {
    pub layer: String,
    pub param: String,
    pub value: Expr,
}
```

Add to `Cinematic`:
```rust
pub states: Vec<StateBlock>,
```

### Parser changes (parser.rs)

In the cinematic parsing loop, add:
```rust
Some(Token::Ident(s)) if s == "state" => {
    states.push(self.parse_state_block()?);
}
```

```rust
fn parse_state_block(&mut self) -> Result<StateBlock, CompileError> {
    self.advance(); // consume "state"
    let name = self.expect_ident()?;

    // Optional: from <parent> over <duration> [easing]
    let mut parent = None;
    let mut transition_duration = None;
    let mut transition_easing = None;
    if matches!(self.peek(), Some(Token::From)) {
        self.advance();
        parent = Some(self.expect_ident()?);
        if matches!(self.peek(), Some(Token::Over)) {
            self.advance();
            transition_duration = Some(self.parse_duration()?);
            transition_easing = self.try_parse_easing();
        }
    }

    self.expect(&Token::LBrace)?;

    let mut layers = Vec::new();
    let mut overrides = Vec::new();

    while !self.check(&Token::RBrace) {
        if matches!(self.peek(), Some(Token::Layer)) {
            layers.push(self.parse_layer()?);
        } else {
            // Parse override: layer.param: value
            overrides.push(self.parse_state_override()?);
        }
    }
    self.expect(&Token::RBrace)?;

    Ok(StateBlock { name, parent, transition_duration, transition_easing, layers, overrides })
}
```

### Codegen changes

**New file: `src/codegen/state_machine.rs`**

Generates a `GameStateMachine` JavaScript class:

```javascript
class GameStateMachine {
  constructor(component) {
    this._component = component;
    this._current = 'idle';
    this._transitioning = false;
    this._transitionStart = 0;
    this._transitionDuration = 0;
    this._fromParams = {};
    this._toParams = {};
    this._easingFn = (t) => t;

    this._states = {
      idle: { params: { /* default uniforms */ } },
      hover: {
        parent: 'idle',
        duration: 0.15,
        easing: ease_out,
        overrides: { 'glow_intensity': 1.2, 'border_intensity': 2.5 }
      },
      active: {
        parent: 'hover',
        duration: 0.05,
        easing: ease_in,
        overrides: { 'glow_intensity': 0.3, 'bg_scale': 0.97 }
      }
    };
  }

  transition(targetState) {
    if (this._current === targetState) return;
    const state = this._states[targetState];
    if (!state) return;

    // Capture current params as "from"
    this._fromParams = { ...this._component._renderer.userParams };

    // Compute "to" params (parent defaults + overrides)
    const parentParams = state.parent
      ? { ...this._states[state.parent].params, ...this._states[state.parent].overrides }
      : {};
    this._toParams = { ...parentParams, ...state.overrides };

    this._transitionStart = performance.now() / 1000;
    this._transitionDuration = state.duration || 0.15;
    this._easingFn = state.easing || ((t) => t);
    this._transitioning = true;
    this._current = targetState;
  }

  evaluate() {
    if (!this._transitioning) return null;
    const elapsed = performance.now() / 1000 - this._transitionStart;
    const progress = Math.min(elapsed / this._transitionDuration, 1.0);
    const eased = this._easingFn(progress);

    const result = {};
    for (const [key, toVal] of Object.entries(this._toParams)) {
      const fromVal = this._fromParams[key] ?? toVal;
      result[key] = fromVal + (toVal - fromVal) * eased;
    }

    if (progress >= 1.0) this._transitioning = false;
    return result;
  }
}
```

### Runtime wiring (component.rs)

When states exist, the component:
1. Creates `GameStateMachine` instance
2. Hooks `mouseenter` → `this._stateMachine.transition('hover')`
3. Hooks `mouseleave` → `this._stateMachine.transition('idle')`
4. Hooks `mousedown` → `this._stateMachine.transition('active')`
5. Hooks `mouseup` → `this._stateMachine.transition('hover')`
6. In the render loop pre-render, calls `stateMachine.evaluate()` and applies results via `setParam()`

### Tests
- Parse `state idle { layer bg { ... } }` → verify StateBlock in AST
- Parse `state hover from idle over 150ms ease-out { glow.intensity: 1.2 }` → verify overrides
- Codegen produces GameStateMachine class
- Component hooks mouseenter/mouseleave to state transitions

### Effort: ~80 lines AST + ~100 lines parser + ~250 lines state_machine.rs + ~60 lines component.rs

---

## Phase 4: Shared Renderer Runtime

**The unlock:** Components go from 18KB to ~2KB. Multiple components on a page share one renderer library.

### Architecture

Split the output into two files:
- **`game-runtime.js`** (~8KB, one per page) — GameRenderer class, GameRendererGL class, all boilerplate
- **`game-<name>.js`** (~2KB, one per component) — shader constants, uniforms, component class

### Changes

**New output mode in `src/lib.rs`:**
```rust
pub enum OutputFormat {
    Component,    // Current: everything in one file
    Split,        // NEW: separate runtime + component
    Html,
    Standalone,
    ArtBlocks,
}
```

**`src/runtime/mod.rs`** — New function:
```rust
pub fn generate_runtime_js() -> String {
    // Extract GameRenderer + GameRendererGL from helpers.rs
    // This is the same code, just emitted once as a standalone file
}
```

**`src/runtime/component.rs`** — When `Split` format:
```rust
// Component file assumes GameRenderer and GameRendererGL are global
// Much smaller: just shader strings + custom element class
```

**CLI change in `src/main.rs`:**
```
game build app.game -o dist/ --split
```
Outputs: `dist/game-runtime.js` + `dist/app.js`

### Effort: ~100 lines lib.rs + ~50 lines component.rs + ~20 lines main.rs. Mostly moving code, not writing new code.

---

## Phase 5: Finish What's Started

### 5.1 Wire particles to component runtime

The particle compute shaders and GameParticleSim JS class are COMPLETE (codegen/particles.rs, 543 lines, 18 tests). What's missing: component.rs doesn't instantiate or dispatch them.

**Changes:** Mirror the existing swarm/react/flow pattern in component.rs:
- Check `shader.particles_sim_wgsl.is_some()`
- Create `GameParticleSim` instance in `_initRenderer`
- Call `dispatch(dt)` in `_preRender` hook
- Bind particle texture buffer to fragment shader

~40 lines in component.rs, following the exact pattern of swarm at lines 190-234.

### 5.2 Wire textures to component runtime

**Changes:** When `shader.textures` is non-empty:
- Add `loadTexture(name, url)` method to component class
- Create GPU texture from ImageBitmap on load
- Bind to correct slot in the bind group
- Add `loadTextureFromData(name, imageData)` for programmatic loading

~80 lines in component.rs + ~40 lines in helpers.rs.

### 5.3 3D WebGL2 fallback

Generate GLSL equivalent of the ray marching shader. The WGSL version (raymarcher.rs) is complete with 5 tests. Mirror it to GLSL:
- `sdf_sphere_3d`, `sdf_box_3d`, `sdf_torus_3d` → GLSL equivalents
- Fragment shader main() with ray march loop
- Phong lighting in GLSL

~200 lines in codegen/glsl.rs (mirroring raymarcher.rs patterns).

### 5.4 IntersectionObserver pause

In helpers.rs render loop:
```javascript
// In start():
this._observer = new IntersectionObserver(([e]) => {
  this._visible = e.isIntersecting;
}, { threshold: 0 });
this._observer.observe(this.canvas);

// In render loop:
if (!this._visible) { requestAnimationFrame(loop); return; }
```

~15 lines in helpers.rs. Massive performance win for pages with many components.

### 5.5 JS minification

In lib.rs compile output, add optional minification:
- Strip comments (regex)
- Collapse whitespace
- Shorten local variable names (optional, risky)

Or: document `npx terser game-output.js -o game-output.min.js` as a post-compile step.

Recommendation: Don't build a minifier. Document the terser command. Focus on the shared runtime (Phase 4) which solves the size problem structurally.

---

## Execution Order

| Order | Phase | Why This Order | Tests Added |
|-------|-------|---------------|-------------|
| 1 | **Expressions in Pipelines** | Foundation for everything — makes state overrides evaluate as shader math | ~10 |
| 2 | **Keyframe Sequences** | Natural extension of expressions — multi-step animations | ~8 |
| 3 | **Visual State Machine** | The transformative leap — depends on expressions for override evaluation | ~15 |
| 4 | **Wire Particles + Textures** | Finish 90%-done features — quick wins | ~5 |
| 5 | **3D WebGL2 Fallback** | Complete the 3D story | ~3 |
| 6 | **Shared Runtime** | Size optimization — do last because it's a refactor, not a feature | ~5 |
| 7 | **IntersectionObserver** | Performance polish — small change, big impact | ~2 |

**Total estimated new code:** ~1,500 lines Rust + ~48 new tests
**Total after completion:** ~28.5K LOC, ~574 tests, ~100 examples

---

## What This Makes Possible

After all 7 items, a GAME component can:

```game
cinematic "notification-card" {
  props {
    title: "Alert"
    body: "Something happened"
    urgency: 0.5
  }

  state idle {
    layer bg blend: occlude {
      box(0.98, 0.92) | shade(0.078, 0.078, 0.078)
    }
    layer accent {
      translate(-0.47, 0.0)
      | box(0.02, 0.88)
      | shade(mix(0.83, 0.93, urgency), mix(0.69, 0.27, urgency), mix(0.22, 0.27, urgency))
    }
    layer indicator {
      translate(-0.35, 0.0)
      | circle(0.06 + sin(time * 2.0) * 0.01)
      | glow(1.5 + urgency * 1.0)
      | tint(mix(0.83, 0.93, urgency), mix(0.69, 0.27, urgency), 0.22)
    }
  }

  state hover from idle over 150ms ease-out {
    indicator.glow_intensity: 2.5
    accent.opacity: 1.0
  }

  state dismissing from idle over 300ms ease-in {
    bg.opacity: 0.0
    bg.translate_x: 0.5
  }

  arc enter {
    opacity: 0.0 @0ms -> 1.0 @200ms ease-out
    scale: 0.97 @0ms -> 1.02 @150ms ease-out -> 1.0 @300ms ease-in-out
  }

  dom {
    text "title" {
      at: 88 20
      width: 200
      style: "font:600 15px Inter;color:#FFF"
      bind: "title"
    }
    text "body" {
      at: 88 44
      width: 200
      style: "font:400 13px Inter;color:#A0A0A0"
      bind: "body"
    }
  }

  on "click" { emit: "dismiss" }
  role: "alert"
}
```

This notification card:
- Has a **breathing indicator** (expressions: `sin(time * 2.0)`)
- **Changes color based on urgency** (expressions: `mix()` in pipeline)
- **Glows brighter on hover** (state machine: idle → hover)
- **Slides out when dismissed** (state machine: idle → dismissing)
- Has a **multi-step entrance animation** (keyframes: scale overshoots then settles)
- Shows **real text content** (DOM overlay with props)
- Fires **events** (click → dismiss)
- Is **accessible** (role="alert")
- Compiles to a **2KB Web Component** (shared runtime)

That's not a pretty picture. That's a production interactive component.

---

*Designed: 2026-03-24*
*By: The Wizard, with evidence from Sherlock, questions from the Alien, rigor from the Nerd, and precision from the Surgeon.*
