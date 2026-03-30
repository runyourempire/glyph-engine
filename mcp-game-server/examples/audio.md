# Audio-Reactive GAME Examples

10 examples covering audio signal bindings for music visualization.

---

## 1. Bass Pulse

Circle radius pulses with bass frequency.

```game
cinematic "Bass Pulse" {
  layer orb {
    fn: circle(r) | glow(2.5) | tint(ember)
    r: 0.15 ~ audio.bass * 0.15
  }
}
```

## 2. Treble Scatter Ring

Ring width widens with treble energy.

```game
cinematic "Treble Ring" {
  layer ring {
    fn: ring(0.3, w) | glow(2.0) | tint(frost)
    w: 0.02 ~ audio.treble * 0.04
  }
}
```

## 3. Energy Glow

Overall energy controls glow intensity.

```game
cinematic "Energy" {
  layer core {
    fn: circle(0.2) | glow(g) | tint(gold) | bloom(0.3, 1.5)
    g: 1.5 ~ audio.energy * 6.0
  }
}
```

## 4. Beat Flash

Bright flash on each detected beat.

```game
cinematic "Beat Flash" {
  layer flash {
    fn: circle(0.25) | glow(intensity) | tint(cyan) | bloom(0.2, 2.0)
    intensity: 0.5 ~ audio.beat * 5.0
  }
}
```

## 5. Three-Band Spectrum

Concentric rings respond to bass, mid, and treble.

```game
cinematic "Spectrum" {
  layer bass_ring {
    fn: ring(0.12, 0.05) | glow(bg) | tint(ember)
    bg: 1.0 ~ audio.bass * 5.0
  }
  layer mid_ring {
    fn: ring(0.24, 0.04) | glow(mg) | tint(cyan)
    mg: 1.0 ~ audio.mid * 4.0
  }
  layer treble_ring {
    fn: ring(0.35, 0.02) | glow(tg) | tint(frost)
    tg: 0.8 ~ audio.treble * 3.5
  }
}
```

## 6. Bass-Driven Noise

FBM noise intensity modulated by bass.

```game
cinematic "Bass Field" {
  layer field {
    fn: fbm(3.0, 5, 0.5, 2.0) | glow(g) | tint(deep_blue) | vignette(0.5)
    g: 0.5 ~ audio.bass * 3.0
  }
}
```

## 7. Audio Energy Core

Central orb with energy-reactive radius and glow.

```game
cinematic "Audio Core" {
  layer bg {
    fn: gradient(black, deep_blue, "radial")
  }
  layer core {
    fn: circle(r) | glow(g) | tint(gold)
    r: 0.04 ~ audio.energy * 0.03
    g: 3.0 ~ audio.energy * 6.0
  }
}
```

## 8. Multi-Band Rings with Core

Full audio visualizer with background, bands, and core.

```game
cinematic "Visualizer" {
  layer bg {
    fn: gradient(deep_blue, black, "radial") | vignette(0.5)
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
    fn: ring(0.35, 0.02) | glow(treble_g) | tint(frost)
    treble_g: 0.8 ~ audio.treble * 3.5
  }
  layer core {
    fn: circle(core_r) | glow(core_g) | tint(gold)
    core_r: 0.04 ~ audio.energy * 0.03
    core_g: 3.0 ~ audio.energy * 6.0
  }
}
```

## 9. Beat-Reactive Star

Star that flashes with each beat and slowly rotates.

```game
cinematic "Beat Star" {
  layer star {
    fn: rotate(time * 0.3) | star(6, 0.25, 0.1) | glow(g) | tint(gold) | bloom(0.3, 1.0)
    g: 1.5 ~ audio.beat * 4.0
  }
}
```

## 10. Audio Voronoi

Voronoi pattern with energy-driven glow and bass-driven chromatic.

```game
cinematic "Audio Crystal" {
  layer crystal {
    fn: voronoi(5.0) | glow(g) | tint(frost) | chromatic(c) | vignette(0.4)
    g: 1.0 ~ audio.energy * 3.0
    c: 0.003 ~ audio.bass * 0.01
  }
}
```
