# Advanced GAME Examples

10 complex examples covering multi-layer composition, memory trails, resonate coupling, arc timelines, post-processing chains, and domain warping.

---

## 1. Multi-Layer Galaxy

Background gradient, tiled rings, and a golden core.

```game
cinematic "Galaxy" {
  layer bg {
    fn: gradient(deep_blue, black, "radial")
  }
  layer rings {
    fn: repeat(1.5) | ring(0.3, 0.04) | glow(2.0) | tint(cyan)
  }
  layer core {
    fn: circle(0.1) | glow(4.0) | tint(gold) | bloom(0.3, 1.5)
  }
}
```

## 2. Memory Trail

Moving dot leaves a fading trail. `memory: 0.94` goes between name and brace.

```game
cinematic "Trail" {
  layer bg {
    fn: gradient(black, midnight, "radial")
  }
  layer dot memory: 0.94 {
    fn: translate(x, y) | circle(0.04) | glow(3.0) | tint(gold)
    x: 0 ~ sin(time * 1.5) * 0.35
    y: 0 ~ cos(time * 2.3) * 0.25
  }
}
```

## 3. Resonance Coupling

Two layers with bidirectional parameter feedback.

```game
cinematic "Resonance" {
  layer fire {
    fn: circle(0.15) | glow(intensity) | tint(ember)
    intensity: 2.0
  }
  layer ice {
    fn: ring(0.3, 0.03) | glow(brightness) | tint(frost)
    brightness: 2.0
  }
  resonate {
    fire -> ice.brightness * 0.4
    ice -> fire.intensity * 0.3
  }
}
```

## 4. Timeline-Driven Reveal

Parameters animate through named moments using arc.

```game
cinematic "Reveal" {
  layer bg {
    fn: gradient(black, deep_blue, "radial")
  }
  layer frame {
    fn: rotate(time * 0.5) | polygon(6, hex_size) | onion(0.02) | glow(hex_glow) | tint(cyan)
    hex_size: 0.05
    hex_glow: 0.3
  }
  layer core {
    fn: circle(core_r) | glow(core_g) | tint(gold)
    core_r: 0.01
    core_g: 0.5
  }
  arc {
    0:00 "void" {
      hex_size: 0.05
      hex_glow: 0.3
      core_r: 0.01
      core_g: 0.5
    }
    0:02 "ignite" {
      hex_size -> 0.25 ease(expo_out) over 2s
      hex_glow -> 3.0 ease(smooth) over 2s
      core_r -> 0.06 ease(expo_out) over 1s
      core_g -> 4.0 ease(expo_out) over 2s
    }
    0:06 "bloom" {
      hex_size -> 0.35 ease(cubic_in_out) over 3s
      hex_glow -> 5.0 ease(expo_out) over 2s
      core_r -> 0.08 ease(smooth) over 2s
      core_g -> 6.0 ease(expo_out) over 2s
    }
  }
}
```

## 5. Cinematic Post-Processing

Heavy post-processing chain for film-like quality.

```game
cinematic "Cinematic" {
  layer bg {
    fn: gradient(midnight, black, "radial")
  }
  layer shape {
    fn: rotate(time * 0.2) | star(6, 0.25, 0.1) | glow(2.5) | tint(gold)
      | bloom(0.3, 1.5) | chromatic(0.006) | scanlines(200, 0.1)
      | grain(0.04) | vignette(0.4) | tonemap(1.2)
  }
}
```

## 6. Domain-Warped Voronoi

Organic crystalline texture with noise distortion.

```game
cinematic "Warped Crystal" {
  layer crystal {
    fn: domain_warp(warp, 3.0) | voronoi(6.0) | glow(1.5) | tint(frost) | chromatic(0.005) | vignette(0.4)
    warp: 0.15 ~ sin(time * 0.3) * 0.1
  }
}
```

## 7. Layered Audio Visualizer with Post

Full audio visualizer with background, multiple bands, and cinematic processing.

```game
cinematic "Audio Cinema" {
  layer bg {
    fn: gradient(deep_blue, black, "radial") | vignette(0.6)
  }
  layer bass {
    fn: ring(0.12, 0.05) | glow(bass_g) | tint(ember)
    bass_g: 1.5 ~ audio.bass * 5.0
  }
  layer mid {
    fn: ring(0.24, 0.04) | glow(mid_g) | tint(cyan)
    mid_g: 1.0 ~ audio.mid * 4.0
  }
  layer treble {
    fn: ring(0.35, 0.02) | glow(treble_g) | tint(frost) | chromatic(0.004)
    treble_g: 0.8 ~ audio.treble * 3.5
  }
  layer core {
    fn: circle(cr) | glow(cg) | tint(gold) | bloom(0.3, 1.5)
    cr: 0.04 ~ audio.energy * 0.03
    cg: 3.0 ~ audio.energy * 6.0
  }
}
```

## 8. Kaleidoscope

Symmetry via mirror + repeat with domain transforms.

```game
cinematic "Kaleidoscope" {
  layer bg {
    fn: simplex(3.0) | glow(1.0) | tint(deep_blue) | vignette(0.4)
  }
  layer pattern {
    fn: mirror(0) | repeat(0.6) | rotate(time * 0.4) | star(5, 0.15, 0.07) | glow(3.0) | tint(gold) | bloom(0.4, 1.2)
  }
  layer overlay {
    fn: ring(0.35, 0.02) | onion(0.01) | glow(2.0) | tint(cyan)
  }
}
```

## 9. Define + Reuse

Reusable macros for DRY multi-layer composition.

```game
cinematic "Rings System" {
  define glow_ring(size, width) {
    ring(size, width) | glow(ring_glow) | tint(cyan)
  }

  layer bg {
    fn: gradient(black, deep_blue, "radial")
  }
  layer inner {
    fn: glow_ring(0.12, 0.03) | tint(gold)
    ring_glow: 2.0
  }
  layer mid {
    fn: glow_ring(0.24, 0.02)
    ring_glow: 1.5
  }
  layer outer {
    fn: glow_ring(0.36, 0.015) | tint(frost)
    ring_glow: 1.0
  }
}
```

## 10. Interactive Mouse Follow with Trail

Mouse-driven positioning with memory trail.

```game
cinematic "Mouse Trail" {
  layer bg {
    fn: voronoi(5.0) | glow(0.6) | tint(deep_blue) | vignette(0.4)
  }
  layer trail memory: 0.90 {
    fn: translate(tx, ty) | circle(0.1) | glow(1.5) | tint(cyan)
    tx: 0 ~ mouse.x * 1.8 - 0.9
    ty: 0 ~ mouse.y * 1.8 - 0.9
  }
  layer cursor {
    fn: translate(mx, my) | circle(0.05) | glow(4.0) | tint(gold)
    mx: 0 ~ mouse.x * 2.0 - 1.0
    my: 0 ~ mouse.y * 2.0 - 1.0
  }
}
```
