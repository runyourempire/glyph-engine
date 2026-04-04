# Video-to-GAME Pipeline: World-Class Technical Exploration

## The Core Problem, Precisely Stated

The existing auto-generation pipeline produces "animation by category." The code in `generate-game.ts` sees "water" and emits a `distort | sample | mask` stack. It sees "sky" and emits a `distort | sample | mask` stack. The `warp`, `fbm`, and `voronoi` parameters are scaled by a single `intensity` float derived from `ambient_motion_intensity`. A mountain stream and a Pacific surf break produce nearly identical `.game` files. The aurora file, hand-crafted by someone who watched aurora footage, has three distinct light layers with tuned frequencies, a star-twinkle layer using `voronoi(35.0)`, a snow-reflection layer masked against `depth`, and a cold-air layer moving at an orthogonal oscillation. That is what scene-specific knowledge looks like. Video provides exactly that knowledge algorithmically.

---

## 1. Video Analysis: The Full Model Landscape

### 1.1 Optical Flow — Dense Motion Vectors

Optical flow answers the most important question: at every pixel, what direction and how fast is material moving?

**RAFT** (Recurrent All-Pairs Field Transforms, ECCV 2020 Best Paper) remains the reference architecture. It builds a 4D cost volume over all pixel pairs, then iteratively refines a flow field. Performance: ~5.1% F1 on KITTI, ~2.85 EPE on Sintel Final. Available in `torchvision.models.optical_flow`. PyTorch inference, ~150ms at 1080p on an RTX 3090.

**SEA-RAFT** (ECCV 2024 Oral, Best Paper Award Candidate) is a rearchitected RAFT trained with a Mixture of Laplace loss. Same accuracy class but 2.3x faster — 21fps at 1080p on an RTX 3090 (48ms/frame). This is the practical choice for the pipeline. Available on GitHub at `princeton-vl/SEA-RAFT`.

**UniMatch** (TPAMI 2023, haofeixu/unimatch) unifies optical flow, stereo disparity, and depth in one transformer backbone. Relevant because you can get flow AND relative depth from the same inference pass, reducing total compute.

**GMFlow** (CVPR 2022 Oral) reformulates flow as global feature matching via transformer attention. Single forward pass, no iteration — 57ms on V100. Slightly less accurate than RAFT on fine detail but faster and easier to run on CPU-class hardware.

**For the pipeline:** SEA-RAFT at reduced resolution (e.g., 480p for the analysis pass). A 10-second clip at 24fps = 240 frame pairs. At 48ms/pair on a GPU: 11.5 seconds of compute. Perfectly acceptable for an offline processing step.

What optical flow gives you in GAME units:
- Per-pixel `(vx, vy)` vectors averaged over the clip = the flow map, measured in actual pixels-per-frame
- Magnitude map = how much each region moves = drives `strength` in `distort()`
- Direction map = region-specific `translate()` direction vectors

### 1.2 Frequency Analysis — Extracting Oscillation Parameters

This is the key insight that converts raw motion into `sin(time * freq)` expressions.

The approach: for each pixel (or macro-block), take the time-series of optical flow magnitude over the clip and compute its FFT. The dominant frequency peak tells you the oscillation period. The amplitude tells you the strength of that oscillation.

Concretely: if a tree canopy has leaves that oscillate at 1.2Hz (roughly 1.2 cycles per second), the FFT will show a peak at 1.2Hz. In GAME syntax this maps to `sin(time * 7.54)` (since `time` is in seconds, `freq = 2pi * 1.2 ~ 7.54`). The FFT amplitude drives the `strength` parameter.

Scene-specific parameters extracted by FFT:

| Scene element | Dominant FFT frequency | GAME mapping |
|---|---|---|
| Ocean waves (long swell) | 0.08-0.15 Hz | `sin(time * 0.5)` to `sin(time * 0.95)` |
| River surface chop | 0.8-2.5 Hz | `sin(time * 5.0)` to `sin(time * 16.0)` |
| Tree canopy sway | 0.3-0.8 Hz | `sin(time * 1.9)` to `sin(time * 5.0)` |
| Grass in wind | 1.5-4.0 Hz | `sin(time * 9.4)` to `sin(time * 25.1)` |
| Aurora curtains | 0.02-0.05 Hz | `sin(time * 0.12)` to `sin(time * 0.31)` |
| Campfire | 5-15 Hz (turbulent) | `distort(speed: 2.5)` with high `strength` |
| Distant cloud drift | 0.001-0.005 Hz | `translate(time * 0.003)` |

Reference: "Optical Flow Estimation for a Periodic Image Sequence" (PMC 3773580)

### 1.3 Temporal Depth Estimation

**Video Depth Anything** (CVPR 2025 Highlight, DepthAnything/Video-Depth-Anything) is the direct successor to Depth Anything V2 with temporal consistency explicitly solved. The original V2 had flickering depth values between frames. Video Depth Anything adds a Spatial-Temporal Head (four temporal attention layers) and a temporal gradient matching loss. Trained on 730K annotated video frames plus 0.62M self-trained images. Produces metrically consistent depth across frames of several minutes.

When you average the depth across all frames of the video clip, noise cancels out and you get a clean depth map that actually represents scene geometry rather than single-frame estimation artifacts.

### 1.4 Video Segmentation — Tracking Regions Through Time

**SAM 2** (Meta, August 2024, arxiv 2408.00714) operates at 44fps (Hiera-L+ architecture) with streaming memory, tracks objects across video frames from a single point/box/mask prompt, trained on SA-V dataset (51K videos, 600K mask annotations across 47 countries).

What SAM 2 gives the GAME pipeline that image-based segmentation cannot: motion-consistent masks. An image-based mask of a waterfall might include spray that is ambiguously part of the rock face. The video-based mask tracks the water surface over time and cleanly separates it from the static rock, because the rock doesn't move.

The practical flow:
1. Run SAM 2 with automatic segmentation to get candidate object tracks
2. Cross-reference with optical flow: high-magnitude flow regions get "animated" classification; near-zero flow regions get "static"
3. Use temporal SAM 2 masks + depth map to generate per-region `.png` masks

### 1.5 Camera Motion Separation

Essential step most pipelines skip. A handheld video of a waterfall has camera shake mixed with actual water motion. A panning shot of clouds mixes camera drift with cloud drift.

**ORB-SLAM3** (UZ-SLAMLab/ORB_SLAM3): real-time visual SLAM, outputs camera pose per frame. Run ORB-SLAM3, get camera rotation + translation per frame, project expected pixel motion from camera motion, subtract from optical flow. What remains is scene-intrinsic motion.

Lightweight alternative: estimate homography between frames using keypoint matching (ORB features, RANSAC). Apply inverse homography to warp frame N to frame N+1's camera position, then compute residual flow.

### 1.6 LLM/VLM Scene Understanding

**Gemini 2.5 Pro** (Google, 2025): strongest model for long-form video understanding. Up to 6 hours of video context. CVPR 2025 MotionBench confirms it surpasses GPT-4.1 on fine-grained video motion understanding.

**LLaVA-Video** (EMNLP 2024): open-source, fine-tuned on LLaVA-Video-178K dataset (178K videos). Available via HuggingFace for local/offline operation.

What the LLM provides that pure optical flow cannot:
- Scene taxonomy: "this is a kelp forest with surface light penetrating through columns"
- Physics-aware motion classification: "these are tidal surge patterns, not river current"
- Aesthetic direction: "the aurora is predominantly green with occasional pink fringing"
- Layer ordering advice: "the foreground volcanic steam occludes the distant lava flow"
- Parameter intuition: "the wind is gusting -- motion is intermittent not continuous"

---

## 2. Motion-to-GAME Mapping: The Core Algorithmic Translation

### 2.1 Optical Flow Vectors -> translate() and Flow Maps

The flow map (currently synthetically generated in `flowmap.ts` using depth gradients + region classification) gets replaced by the actual measured optical flow from RAFT.

The existing `flowmap.ts` already uses the correct encoding: `R = flow_x * 0.5 + 0.5`, `G = flow_y * 0.5 + 0.5` in [0,255]. What changes is the source of the flow vectors.

### 2.2 Flow Magnitude Variance -> distort() Parameters

Standard deviation of optical flow magnitude over time indicates turbulence.

Mapping:
```
distort_strength = clamp(flow_std_dev * scale_factor, 0.01, 0.5)
distort_speed = dominant_frequency_hz * 2pi
distort_scale = 1.0 / (mean_spatial_coherence_length / image_width)
```

### 2.3 Turbulence Structure -> warp() and fbm() Octave Tuning

Compute optical flow at multiple spatial scales (Gaussian pyramid). The ratio of energy at scale k vs scale k+1 is the persistence parameter for `fbm`. The number of scales with significant energy sets `octaves`.

### 2.4 Periodic Motion -> sin(time * freq) Expressions

From FFT analysis, for any region showing dominant periodic motion (spectral peak with SNR > 3dB), replace constant `translate()` with oscillating terms.

For non-symmetric oscillation:
```
translate(time * mean_vx + sin(time * freq_x) * amp_x, 
          time * mean_vy + sin(time * freq_y) * amp_y)
```

### 2.5 Color and Light Variation -> tint() and Blend Opacity

Sampling dominant color of each region over time gives `tint()` values. Time-derivative of regional luminance gives `light_pulse` layer parameters.

---

## 3. New GAME Features Required

### 3.1 Flow Texture Advection -- Critical New Builtin

The single most impactful new feature. Based on Valve's Portal 2 water shader (SIGGRAPH 2010): a 2D RG texture where each pixel encodes a velocity vector, used to advect a base texture in physically plausible, non-uniform directions.

New `flowmap(texture_name, speed, strength)` builtin:

```glsl
vec2 flow = texture(flowmap_texture, uv).rg * 2.0 - 1.0;
float phase1 = fract(time * speed);
float phase2 = fract(time * speed + 0.5);
float blend = abs(phase1 * 2.0 - 1.0);  // triangle wave: 0->1->0
vec2 uv1 = uv + flow * phase1 * strength;
vec2 uv2 = uv + flow * phase2 * strength;
vec4 sample1 = texture(base_texture, uv1);
vec4 sample2 = texture(base_texture, uv2);
return mix(sample1, sample2, blend);
```

GAME syntax:
```
layer water_flow opacity: 0.95 {
    flowmap("flow", speed: 0.3, strength: 0.08)
    | sample("photo")
    | mask("mask_water")
}
```

### 3.2 Motion Texture Builtin

`motion(texture_name)` that reads from a pre-computed motion magnitude texture. Drives per-pixel `distort` strength rather than uniform value.

### 3.3 Frequency Texture Builtin

Store per-pixel dominant frequency (from FFT analysis) as a texture. `oscillate()` builtin reads it to vary oscillation frequency spatially.

### 3.4 Temporal Color Builtin

`colorshift(texture_name)` that samples from a 1D lookup texture encoding color variation over time.

### 3.5 What Does NOT Need to Change

GAME does not need:
- Sprite sheets or frame sequences (procedural, not video playback)
- Keyframe animation (procedural noise parametrized by video data is superior -- loops seamlessly, infinite resolution, kilobytes not megabytes)
- Compute shaders (fragment shaders sufficient for all flow operations)
- Per-pixel GPU-side flow simulation (flow texture is precomputed; shader only samples and advects)

---

## 4. The LLM's Role -- Algorithmic Extraction + Creative Direction

### 4.1 The Hybrid Architecture (Optimal Approach)

**Pass 1 -- Algorithmic extraction** (pure computer vision, no LLM):
- RAFT/SEA-RAFT optical flow -> per-pixel velocity map, mean + std
- FFT of flow time-series -> per-region dominant frequency and amplitude
- Video Depth Anything -> temporally consistent depth map
- SAM 2 -> object tracks and region masks
- Camera motion estimation -> residual scene-intrinsic flow

This produces: `MotionDescriptor` per region with numeric values.

**Pass 2 -- LLM creative direction** (Gemini 2.5 Pro or Claude with frame samples):
- Input: `MotionDescriptor` JSON + 5-10 representative frames
- Task: Validate the algorithmic extraction, add semantic understanding, recommend specific GAME layer compositions

**Pass 3 -- Code synthesis** (deterministic function):
- Input: validated `MotionDescriptor` + LLM scene understanding
- Output: `.game` source code with video-derived parameters

The LLM is not a black box generating code -- it is a semantic validator and creative director operating on top of ground-truth measured data.

---

## 5. End-to-End Pipeline Architecture

```
VIDEO INPUT (mp4/mov, 5-30 seconds, any resolution)
    |
    v
[Pre-processing]
    +- Extract frames at target analysis resolution (480p, 24fps)
    +- Detect camera motion (ORB features + homography RANSAC)
    +- Stabilize: subtract camera motion from flow
    
    v
[Computer Vision -- parallel execution]
    +- SEA-RAFT optical flow on all frame pairs
    |   -> Output: (T-1, H, W, 2) flow tensor
    +- Video Depth Anything on all frames
    |   -> Output: (T, H, W) depth tensor, temporally consistent
    +- SAM 2 auto-segmentation + flow-based region classification
        -> Output: (N_regions, H, W) mask set + region labels
    
    v
[Motion Analysis]
    +- Per-region mean flow -> translate() parameters
    +- Per-region flow std -> distort() strength
    +- FFT of per-region flow time-series -> sin() frequencies
    +- Spatial autocorrelation -> fbm() scale and persistence
    +- Temporal depth averaging -> depth texture
    +- Temporal color analysis -> tint() values + color LUT
    
    v
[LLM Analysis -- optional, quality-boosting pass]
    +- Input: 8 representative frames + MotionDescriptor JSON
    +- Model: Gemini 2.5 Pro (cloud) or LLaVA-Video (local)
    +- Output: scene semantic labels + layer composition recommendations
    
    v
[GAME Code Synthesis]
    +- Map MotionDescriptor -> layer stack
    +- Generate flow texture PNG from mean optical flow
    +- Generate motion magnitude texture from flow std
    +- Write .game source file with video-derived parameters
    
    v
[Existing Pipeline]
    +- cargo run -- build output.game (GAME compiler)
    +- HTML/JS Web Component
```

### Local vs. Cloud Split

**Runs locally:**
- Frame extraction (ffmpeg)
- SEA-RAFT optical flow (PyTorch, ~15s for 10-second clip on GPU, ~5min on CPU)
- Video Depth Anything (same)
- SAM 2 (same)
- Camera motion estimation (OpenCV homography, negligible)
- FFT motion analysis (numpy, negligible)
- All texture generation
- GAME compilation

**Cloud-optional:**
- Gemini 2.5 Pro / GPT-4o for semantic scene understanding (Pass 2)
- Can fallback to LLaVA-Video locally (7B model, ~4GB VRAM)
- Or fallback to pure algorithmic classification (no LLM, still much better than current)

**Total processing time estimate for a 10-second 1080p clip:**
- GPU (RTX 3080+): ~45-90 seconds end-to-end
- CPU only: ~8-15 minutes
- Cloud LLM call: +5-10 seconds

### Intermediate Data Storage

```
output/
  scene-name.jpg           # representative still (first/middle/last blend)
  scene-name-depth.png     # temporally averaged depth (from Video Depth Anything)
  scene-name-flow.png      # mean optical flow as RG texture (real measured, not synthetic)
  scene-name-motion.png    # flow magnitude std-dev per pixel
  scene-name-freq.png      # dominant FFT frequency per pixel
  scene-name-mask_*.png    # SAM 2 region masks (water, sky, vegetation, etc.)
  scene-name-color.png     # 1x256 temporal color LUT
  scene-name-analysis.json # full MotionDescriptor + LLM interpretation
  scene-name-living.game   # generated GAME source
```

---

## 6. State of the Art and Prior Art

### Wallpaper Engine
Uses GLSL/HLSL shaders with `g_Time` uniform. Supports video textures as background layers. Does NOT extract motion parameters from video to drive procedural shaders. Parameterization is manual.

### Lively Wallpaper
Hardware-accelerated video playback via mpv/VLC. No video-to-shader analysis pipeline.

### MotionBGS / PixaMotion / Photica
Mobile "photo animation" apps that classify regions and apply canned effects per category. Exactly the approach GAME's current auto-generation takes.

### Cinemagraph Research
- "Animating Landscape" (1910.07192) -- trains on motion prediction from single image
- "Sketch-Guided Motion Diffusion for Stylized Cinemagraph Synthesis" (arXiv 2412.00638) -- confirms motion-field as texture paradigm
- "LoopGaussian" (ACM MM 2024) -- 3D Gaussian Splatting for cinemagraph

### Neural Scene Animation
- **AnimateDiff** (ICLR 2024): inserts motion module into frozen Stable Diffusion. Relevant as complementary tool: if no video available, AnimateDiff can *generate* a short clip from the photo, which the GAME pipeline can then analyze.

### Flow Map Technique (Games Industry)
Valve's Portal 2 water shader (Alex Vlachos, SIGGRAPH 2010): canonical production use of flow maps. Two-sample ping-pong with triangle-wave blending to eliminate distortion reset artifact.

### No Tool Does the Full Pipeline
As of April 2026: no publicly available tool combines measured optical flow from video + FFT-derived oscillation parameters + temporally consistent depth + SAM 2 segmentation + LLM scene understanding to produce procedural shader code.

---

## 7. The Killer Advantage

### Why This Is Structurally Better Than Everything Else

**Video playback wallpapers** (Wallpaper Engine, Lively): require the original video file at runtime. A 10-second 1080p video is 50-200MB. A `.game` component with video-derived parameters is 80KB of HTML/JS. Runs forever, seamlessly loops, scales to any resolution, consumes ~3% GPU vs. 15-30% for video decode.

**Canned-preset wallpapers** (PixaMotion, Photica): category-based, not scene-specific. All oceans look the same. The video pipeline measures *this* ocean's actual wave period, direction, and turbulence. Every output is unique because every input is unique.

**Hand-crafted shaders** (the aurora example): require expert knowledge and hours of tuning. The video pipeline gets within striking distance of hand-crafted quality automatically. The artist's time shifts from "tune every parameter" to "select the source video and review the output."

### The Compound Moat

The quality of the output compounds with GAME's feature set. As the GAME compiler gains `flowmap()`, `oscillate()`, and `colorshift()`, the video pipeline gains new output capabilities automatically. The more precise the compiler's primitives, the more accurately video-derived data can be expressed.

### The Paradigm Shift

The existing pipeline: "photo -> guess what effects belong here based on region type."
The video pipeline: "video -> measure exactly what motion exists here -> generate effects that reproduce that motion procedurally."

The former is generative. The latter is analytical. The former produces plausible animations. The latter produces *accurate* animations.

---

## Implementation Roadmap

**Phase 1 -- Python Analysis Script (2-3 days):**
Wrap SEA-RAFT + Video Depth Anything + SAM 2 into `analyze_video.py`. Call from Node.js via `child_process.spawn`. All three models have MIT/Apache licenses.

**Phase 2 -- GAME `flowmap()` Builtin (1 day):**
Add to AST, codegen (WGSL + GLSL), parser, TypeScript defs. ~15 lines GLSL. Highest-leverage single feature.

**Phase 3 -- Video Pipeline Integration (1-2 days):**
Add `runVideoPipeline()` alongside existing `runPipeline()`. CLI flag `--input-video`. New `generate-game-video.ts`.

**Phase 4 -- LLM Video Analysis Pass (1 day):**
Augment `analyze.ts` with `analyzeVideo()`. Send frames + analysis.json to Gemini 2.5 Pro. Optional step.

**Phase 5 -- FFT Oscillation Extraction (1 day):**
Per-region FFT in Python, encode as `freq_map.png`, add `oscillate()` builtin.

---

## Sources

- SEA-RAFT: Simple, Efficient, Accurate RAFT for Optical Flow (ECCV 2024) -- princeton-vl/SEA-RAFT
- RAFT: Recurrent All-Pairs Field Transforms for Optical Flow (ECCV 2020)
- Video Depth Anything: Consistent Depth Estimation for Super-Long Videos (CVPR 2025 Highlight)
- SAM 2: Segment Anything in Images and Videos (arxiv 2408.00714)
- UniMatch: Unifying Flow, Stereo and Depth Estimation (TPAMI 2023)
- GMFlow: Learning Optical Flow via Global Matching (CVPR 2022 Oral)
- Gemini 2.5 Pro Video Understanding (Google, 2025)
- LLaVA-Video: Video Instruction Tuning With Synthetic Data (EMNLP 2024)
- MotionBench: Fine-grained Video Motion Understanding (CVPR 2025)
- DeFlowSLAM: Self-Supervised Scene Motion Decomposition
- ORB-SLAM3 (UZ-SLAMLab)
- Optical Flow Estimation for a Periodic Image Sequence (PMC 3773580)
- AnimateDiff: Animate Your Personalized Text-to-Image Diffusion Models (ICLR 2024)
- Valve Portal 2 Water Shader (Alex Vlachos, SIGGRAPH 2010)
- Lively Wallpaper (rocksdanister/lively)
- Wallpaper Engine Shader Programming
