#!/bin/bash
# GAME Visual Batch Evaluator
# Compiles all showcase .game files and generates an evaluation harness

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPILER_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/output"

echo "=== GAME Visual Batch Evaluator ==="
echo "Compiler: $COMPILER_DIR"
echo "Output:   $OUTPUT_DIR"

# Clean output
rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

# Copy evaluator
cp "$SCRIPT_DIR/evaluate.html" "$OUTPUT_DIR/"

# Compile all showcase files
SHOWCASE_DIR="$COMPILER_DIR/examples/showcase"
if [ ! -d "$SHOWCASE_DIR" ]; then
  echo "ERROR: No showcase directory at $SHOWCASE_DIR"
  exit 1
fi

echo ""
echo "Compiling showcase components..."
COMPONENTS=()
for f in "$SHOWCASE_DIR"/*.game; do
  name=$(basename "$f" .game)
  echo "  $name..."
  cd "$COMPILER_DIR"
  cargo run --release -- build "$f" -o "$OUTPUT_DIR" 2>/dev/null
  COMPONENTS+=("$name")
done

echo ""
echo "Compiled ${#COMPONENTS[@]} components."

# Generate index page that evaluates all components
cat > "$OUTPUT_DIR/index.html" << 'HEADER'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>GAME Showcase — Batch Visual Evaluation</title>
<style>
  body { background: #0a0a0a; color: #fff; font-family: 'Inter', system-ui; padding: 24px; }
  h1 { color: #d4af37; font-size: 20px; margin-bottom: 8px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; margin-top: 16px; }
  .card { background: #111; border: 1px solid #222; border-radius: 8px; overflow: hidden; }
  .card-canvas { width: 100%; height: 240px; display: block; }
  .card-info { padding: 10px 12px; }
  .card-name { font-size: 13px; font-weight: 600; }
  .card-tag { font-size: 10px; color: #666; font-family: monospace; }
  #summary { margin-top: 16px; background: #111; padding: 12px; border-radius: 8px; font-size: 11px; font-family: monospace; }
</style>
HEADER

# Add script tags for each component
for name in "${COMPONENTS[@]}"; do
  echo "<script type=\"module\" src=\"./${name}.js\"></script>" >> "$OUTPUT_DIR/index.html"
done

cat >> "$OUTPUT_DIR/index.html" << 'MIDDLE'
</head>
<body>
<h1>GAME Showcase Gallery</h1>
<p style="color:#666;font-size:12px;">All components rendering live. Open browser console for evaluation metrics.</p>
<div class="grid" id="grid"></div>
<pre id="summary"></pre>
<script>
const grid = document.getElementById('grid');
const summary = document.getElementById('summary');
const results = [];

MIDDLE

# Add component cards
for name in "${COMPONENTS[@]}"; do
  tag="game-${name}"
  cat >> "$OUTPUT_DIR/index.html" << EOF
{
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = '<div class="card-canvas"><${tag}></${tag}></div><div class="card-info"><div class="card-name">${name}</div><div class="card-tag">&lt;${tag}&gt;</div></div>';
  grid.appendChild(card);
}
EOF
done

cat >> "$OUTPUT_DIR/index.html" << 'FOOTER'

// After 5 seconds, capture frame metrics from each component
setTimeout(async () => {
  const components = document.querySelectorAll('[class="card-canvas"] > *');
  for (const el of components) {
    const tag = el.tagName.toLowerCase();
    try {
      const frame = el.getFrame ? el.getFrame() : null;
      if (!frame) { results.push({ tag, status: 'NO_FRAME' }); continue; }
      const d = frame.data;
      let nonBlack = 0, totalBright = 0;
      for (let i = 0; i < d.length; i += 4) {
        const b = d[i] + d[i+1] + d[i+2];
        if (b > 5) nonBlack++;
        totalBright += b;
      }
      const pixelCount = d.length / 4;
      results.push({
        tag,
        status: nonBlack > pixelCount * 0.01 ? 'RENDERING' : 'BLACK',
        nonBlackPct: ((nonBlack / pixelCount) * 100).toFixed(1),
        avgBrightness: (totalBright / pixelCount / 765 * 100).toFixed(1)
      });
    } catch (e) {
      results.push({ tag, status: 'ERROR', error: e.message });
    }
  }
  summary.textContent = JSON.stringify(results, null, 2);
  window.__GAME_GALLERY_REPORT = results;
  console.log('GAME_GALLERY_REPORT:', JSON.stringify(results));
}, 5000);
</script>
</body>
</html>
FOOTER

echo ""
echo "Gallery generated at: $OUTPUT_DIR/index.html"
echo "Open in browser to see all ${#COMPONENTS[@]} components rendering live."
echo ""
echo "Components:"
for name in "${COMPONENTS[@]}"; do
  echo "  - game-${name}"
done
