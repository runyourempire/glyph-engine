# Animated GAME Examples

10 examples covering time-based animation via parameter modulation.

---

## 1. Breathing Circle

Gentle size pulse using sin(time).

```game
cinematic "Breathing" {
  layer orb {
    fn: circle(r) | glow(2.0) | tint(cyan)
    r: 0.2 ~ sin(time * 2.0) * 0.05
  }
}
```

## 2. Rotating Star

Continuous rotation using time directly in stage call.

```game
cinematic "Spinning Star" {
  layer star {
    fn: rotate(time * 1.5) | star(5, 0.25, 0.12) | glow(2.0) | tint(gold)
  }
}
```

## 3. Orbiting Dot

Circular orbit using sin/cos modulation.

```game
cinematic "Orbit" {
  layer center {
    fn: circle(0.05) | glow(1.5) | tint(gold)
  }
  layer satellite {
    fn: translate(ox, oy) | circle(0.03) | glow(2.5) | tint(cyan)
    ox: 0 ~ cos(time * 1.5) * 0.3
    oy: 0 ~ sin(time * 1.5) * 0.3
  }
}
```

## 4. Pulsing Glow

Glow intensity oscillates with time.

```game
cinematic "Pulse Glow" {
  layer orb {
    fn: circle(0.2) | glow(g) | tint(ember)
    g: 2.0 ~ sin(time * 3.0) * 1.5
  }
}
```

## 5. Color Breathing Ring

Ring with oscillating glow intensity.

```game
cinematic "Breathing Ring" {
  layer ring {
    fn: ring(0.3, 0.03) | glow(intensity) | tint(frost)
    intensity: 1.5 ~ sin(time * 1.0) * 1.0
  }
}
```

## 6. Drifting Noise

Animated domain warp creates flowing organic texture.

```game
cinematic "Drift" {
  layer field {
    fn: domain_warp(warp, 3.0) | fbm(2.0, 4, 0.5, 2.0) | glow(1.0) | tint(deep_blue) | vignette(0.4)
    warp: 0.15 ~ sin(time * 0.5) * 0.1
  }
}
```

## 7. Pendulum Swing

Horizontal oscillation.

```game
cinematic "Pendulum" {
  layer dot {
    fn: translate(x, 0) | circle(0.08) | glow(2.5) | tint(gold)
    x: 0 ~ sin(time * 2.0) * 0.4
  }
}
```

## 8. Expanding Rings

Ring grows and fades cyclically.

```game
cinematic "Expand" {
  layer ring {
    fn: ring(r, 0.02) | glow(g) | tint(cyan)
    r: 0.1 ~ fract(time * 0.3) * 0.4
    g: 3.0 ~ (1.0 - fract(time * 0.3)) * 3.0
  }
}
```

## 9. Rotating Hexagon Frame

Hexagonal outline rotating slowly.

```game
cinematic "Hex Spin" {
  layer hex {
    fn: rotate(time * 0.4) | polygon(6, 0.25) | onion(0.02) | glow(2.0) | tint(gold) | bloom(0.3, 1.0)
  }
}
```

## 10. Twin Orbit

Two dots orbiting in opposition.

```game
cinematic "Twin Orbit" {
  layer center {
    fn: circle(0.04) | glow(1.5) | tint(charcoal)
  }
  layer dot_a {
    fn: translate(ax, ay) | circle(0.03) | glow(3.0) | tint(gold)
    ax: 0 ~ cos(time * 1.2) * 0.25
    ay: 0 ~ sin(time * 1.2) * 0.25
  }
  layer dot_b {
    fn: translate(bx, by) | circle(0.03) | glow(3.0) | tint(cyan)
    bx: 0 ~ cos(time * 1.2 + pi) * 0.25
    by: 0 ~ sin(time * 1.2 + pi) * 0.25
  }
}
```
