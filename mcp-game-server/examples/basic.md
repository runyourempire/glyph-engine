# Basic GAME Examples

10 micro-examples covering fundamental shapes and rendering.

---

## 1. Circle

```game
cinematic "Circle" {
  layer orb {
    fn: circle(0.3) | glow(2.0)
  }
}
```

## 2. Ring

```game
cinematic "Ring" {
  layer ring {
    fn: ring(0.3, 0.04) | glow(2.5) | tint(cyan)
  }
}
```

## 3. Star

```game
cinematic "Star" {
  layer star {
    fn: star(5, 0.3, 0.15) | glow(2.0) | tint(gold)
  }
}
```

## 4. Box

```game
cinematic "Box" {
  layer rect {
    fn: box(0.25, 0.15) | glow(1.5) | tint(frost)
  }
}
```

## 5. Polygon (Hexagon)

```game
cinematic "Hexagon" {
  layer hex {
    fn: polygon(6, 0.3) | glow(2.0) | tint(cyan)
  }
}
```

## 6. Noise Field

```game
cinematic "Noise" {
  layer field {
    fn: fbm(2.0, 5, 0.5, 2.0) | glow(1.0) | tint(plasma) | vignette(0.5)
  }
}
```

## 7. Gradient Background

```game
cinematic "Gradient" {
  layer bg {
    fn: gradient(deep_blue, black, "radial") | vignette(0.4)
  }
}
```

## 8. Tinted Shape

```game
cinematic "Ember Orb" {
  layer orb {
    fn: circle(0.2) | glow(3.0) | tint(ember) | bloom(0.3, 1.5)
  }
}
```

## 9. Glowing Outline

```game
cinematic "Outline" {
  layer shell {
    fn: circle(0.25) | onion(0.02) | glow(2.5) | tint(gold)
  }
}
```

## 10. Solid Shape with Shade

```game
cinematic "Solid" {
  layer disc {
    fn: circle(0.2) | shade(0.0, 0.8, 1.0)
  }
}
```
