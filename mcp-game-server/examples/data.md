# Data-Driven GAME Examples

10 examples covering Web Component property bindings via `data.*` signals.

---

## 1. Progress Ring

Simple fill ring bound to `data.progress` (0-1).

```game
cinematic "Progress Ring" {
  layer track {
    fn: ring(0.3, 0.04) | glow(1.0) | tint(charcoal)
  }
  layer fill {
    fn: ring(0.3, 0.04) | mask_arc(angle) | glow(3.0) | tint(cyan)
    angle: 0.0 ~ data.progress * 6.28318
  }
}
```

## 2. Health Orb

Glow intensity driven by health value.

```game
cinematic "Health Orb" {
  layer bg {
    fn: circle(0.25) | glow(0.8) | tint(charcoal)
  }
  layer fill {
    fn: circle(0.22) | glow(g) | tint(green)
    g: 1.5 ~ data.health * 2.5
  }
}
```

## 3. Timer Ring

Countdown ring that empties as time runs out.

```game
cinematic "Timer" {
  layer track {
    fn: ring(0.35, 0.03) | glow(1.0) | tint(ash)
  }
  layer remaining {
    fn: ring(0.35, 0.04) | mask_arc(angle) | glow(2.0) | tint(ember)
    angle: 0.0 ~ data.remaining * 6.28318
  }
  layer center {
    fn: circle(0.12) | glow(1.2) | tint(midnight)
  }
}
```

## 4. Gauge with Target

Dashboard gauge with fill arc and target marker.

```game
cinematic "Gauge" {
  layer track {
    fn: ring(0.35, 0.03) | glow(1.0) | tint(charcoal)
  }
  layer fill {
    fn: ring(0.35, 0.05) | mask_arc(fa) | glow(2.5) | tint(cyan)
    fa: 0.0 ~ data.value * 6.28318
  }
  layer target {
    fn: ring(0.35, 0.06) | mask_arc(ta) | glow(1.5) | tint(gold)
    ta: 0.0 ~ data.target * 6.28318
  }
  layer center {
    fn: circle(0.15) | glow(1.5) | tint(midnight)
  }
}
```

## 5. Rating Stars

Five-pointed star with glow controlled by rating.

```game
cinematic "Rating" {
  layer bg_star {
    fn: star(5, 0.3, 0.15) | glow(0.8) | tint(charcoal)
  }
  layer fill_star {
    fn: star(5, 0.3, 0.15) | glow(g) | tint(gold)
    g: 0.5 ~ data.rating * 3.0
  }
}
```

## 6. Counter Orb

Glow intensity scales with count value.

```game
cinematic "Counter" {
  layer orb {
    fn: circle(r) | glow(g) | tint(gold) | bloom(0.3, 1.0)
    g: 1.0 ~ data.count * 0.5
    r: 0.15 ~ data.count * 0.01
  }
}
```

## 7. Status Indicator

Color intensity driven by status signal (0 = off, 1 = active).

```game
cinematic "Status" {
  layer dot {
    fn: circle(0.08) | glow(g) | tint(green) | bloom(0.3, 1.0)
    g: 0.5 ~ data.active * 3.0
  }
}
```

## 8. Level Progress

XP ring with inner level glow.

```game
cinematic "Level Progress" {
  layer track {
    fn: ring(0.3, 0.03) | glow(1.0) | tint(charcoal)
  }
  layer xp_fill {
    fn: ring(0.3, 0.04) | mask_arc(xa) | glow(2.0) | tint(cyan)
    xa: 0.0 ~ data.xp * 6.28318
  }
  layer level_glow {
    fn: circle(0.12) | glow(lg) | tint(gold)
    lg: 1.0 ~ data.level * 0.3
  }
}
```

## 9. Signal Strength

Concentric rings that light up based on signal level (0-1).

```game
cinematic "Signal" {
  layer ring_1 {
    fn: ring(0.1, 0.02) | glow(g1) | tint(cyan)
    g1: 0.5 ~ data.signal * 2.0
  }
  layer ring_2 {
    fn: ring(0.2, 0.02) | glow(g2) | tint(cyan)
    g2: 0.3 ~ clamp(data.signal - 0.33, 0.0, 1.0) * 2.0
  }
  layer ring_3 {
    fn: ring(0.3, 0.02) | glow(g3) | tint(cyan)
    g3: 0.2 ~ clamp(data.signal - 0.66, 0.0, 1.0) * 2.0
  }
}
```

## 10. Completion Burst

Orb that glows brighter as completion approaches 1.0.

```game
cinematic "Completion" {
  layer ring_track {
    fn: ring(0.3, 0.03) | glow(1.0) | tint(ash)
  }
  layer fill {
    fn: ring(0.3, 0.04) | mask_arc(fa) | glow(2.0) | tint(gold)
    fa: 0.0 ~ data.completion * 6.28318
  }
  layer burst {
    fn: circle(0.1) | glow(bg) | tint(gold) | bloom(0.3, 2.0)
    bg: 0.5 ~ data.completion * 5.0
  }
}
```
