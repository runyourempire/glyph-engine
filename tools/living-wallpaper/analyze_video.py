#!/usr/bin/env python3
"""
Video-to-GAME Analysis Pipeline
================================
Extracts motion data from video for living wallpaper generation.

Models:
  - SEA-RAFT (ECCV 2024): Dense optical flow
  - Video Depth Anything (CVPR 2025): Temporally consistent depth
  - SAM 2 (Meta 2024): Video segmentation with motion-consistent masks

Pipeline:
  Video -> frame extraction -> camera stabilization -> optical flow ->
  depth estimation -> segmentation -> FFT frequency analysis ->
  motion descriptor -> analysis.json + texture PNGs

Usage:
  python analyze_video.py input.mp4 --output-dir ./output [--llm-enhance]

Requirements:
  pip install torch torchvision opencv-python numpy scipy pillow
  pip install segment-anything-2  # Meta SAM 2
  # SEA-RAFT and Video Depth Anything installed from GitHub repos
"""

import argparse
import json
import math
import os
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
from scipy import signal as scipy_signal

# ════════════════════════════════════════════════════════════════
# DATA TYPES
# ════════════════════════════════════════════════════════════════

@dataclass
class RegionMotion:
    """Per-region motion analysis result."""
    name: str
    animation_class: str  # water, sky, vegetation, fire, smoke, static
    motion_type: str  # directional_flow, oscillating, turbulent, pulsing, static
    flow_direction: tuple  # (dx, dy) unit vector
    flow_speed: float  # 0-1 normalized
    flow_turbulence: float  # std dev of flow magnitude
    dominant_freq_hz: float  # from FFT
    game_angular_freq: float  # 2*pi*freq for sin(time * this)
    oscillation_amplitude: float
    derived_fbm_persistence: float
    derived_fbm_octaves: int
    derived_distort_strength: float
    mean_color: tuple  # (r, g, b) 0-1
    color_shift_amplitude: float

@dataclass
class VideoAnalysis:
    """Full video analysis result — maps to VideoMotionDescriptor in TypeScript."""
    scene_type: str
    scene_characteristic: str
    regions: list  # List[RegionMotion]
    global_wind_direction: tuple
    ambient_motion_intensity: float
    video_fps: float
    video_duration_sec: float
    analysis_resolution: tuple
    camera_stabilized: bool
    camera_motion_magnitude: float
    sun_position: Optional[tuple] = None
    color_temp: str = "neutral"
    time_of_day: str = "day"
    has_water: bool = False
    has_sky: bool = False
    has_fire: bool = False
    has_vegetation: bool = False


# ════════════════════════════════════════════════════════════════
# FRAME EXTRACTION
# ════════════════════════════════════════════════════════════════

def extract_frames(video_path: str, target_fps: int = 24, max_frames: int = 300,
                   analysis_width: int = 480) -> tuple:
    """
    Extract frames from video at target FPS and resolution.
    Returns (frames_bgr, original_fps, duration_sec, original_size).
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    orig_fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frame_count / orig_fps if orig_fps > 0 else 0
    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Calculate resize dimensions maintaining aspect ratio
    scale = analysis_width / orig_w
    new_h = int(orig_h * scale)
    new_w = analysis_width

    # Sample frames at target FPS
    sample_interval = max(1, int(orig_fps / target_fps))
    frames = []
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % sample_interval == 0:
            resized = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
            frames.append(resized)
            if len(frames) >= max_frames:
                break
        frame_idx += 1

    cap.release()
    print(f"[video] Extracted {len(frames)} frames at {new_w}x{new_h} "
          f"(source: {orig_w}x{orig_h} @ {orig_fps:.1f}fps, {duration:.1f}s)")

    return np.array(frames), orig_fps, duration, (orig_w, orig_h)


def select_representative_frame(frames: np.ndarray, flow_magnitudes: np.ndarray) -> np.ndarray:
    """
    Select the most representative frame — median motion intensity.
    Avoids extremes (wave crash peak, dead calm).
    """
    mean_motion = np.mean(flow_magnitudes, axis=(1, 2))
    median_idx = np.argmin(np.abs(mean_motion - np.median(mean_motion)))
    return frames[median_idx]


# ════════════════════════════════════════════════════════════════
# CAMERA STABILIZATION
# ════════════════════════════════════════════════════════════════

def estimate_camera_motion(frames: np.ndarray) -> tuple:
    """
    Estimate camera motion using ORB feature matching + homography RANSAC.
    Returns (homographies, camera_magnitude, is_stable).
    """
    orb = cv2.ORB_create(nfeatures=500)
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)

    homographies = []
    magnitudes = []
    prev_gray = cv2.cvtColor(frames[0], cv2.COLOR_BGR2GRAY)

    for i in range(1, len(frames)):
        curr_gray = cv2.cvtColor(frames[i], cv2.COLOR_BGR2GRAY)

        kp1, des1 = orb.detectAndCompute(prev_gray, None)
        kp2, des2 = orb.detectAndCompute(curr_gray, None)

        if des1 is None or des2 is None or len(kp1) < 4 or len(kp2) < 4:
            homographies.append(np.eye(3))
            magnitudes.append(0.0)
            prev_gray = curr_gray
            continue

        matches = bf.match(des1, des2)
        if len(matches) < 4:
            homographies.append(np.eye(3))
            magnitudes.append(0.0)
            prev_gray = curr_gray
            continue

        src_pts = np.float32([kp1[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
        dst_pts = np.float32([kp2[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)

        H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
        if H is None:
            H = np.eye(3)

        # Camera motion magnitude: translation component of homography
        tx, ty = H[0, 2], H[1, 2]
        mag = math.sqrt(tx * tx + ty * ty)
        magnitudes.append(mag)
        homographies.append(H)
        prev_gray = curr_gray

    avg_magnitude = np.mean(magnitudes) if magnitudes else 0.0
    is_stable = avg_magnitude < 2.0  # pixels per frame

    print(f"[camera] Average motion: {avg_magnitude:.2f}px/frame "
          f"({'stable' if is_stable else 'unstable — will compensate'})")

    return homographies, avg_magnitude, is_stable


def subtract_camera_motion(flow: np.ndarray, homographies: list) -> np.ndarray:
    """
    Remove camera-induced motion from optical flow field.
    Returns residual (scene-intrinsic) flow.
    """
    h, w = flow.shape[1], flow.shape[2]
    residual = flow.copy()

    for i in range(len(homographies)):
        if i >= len(flow):
            break
        H = homographies[i]
        # Camera motion at each pixel from homography
        y_coords, x_coords = np.mgrid[0:h, 0:w]
        ones = np.ones_like(x_coords)
        pts = np.stack([x_coords, y_coords, ones], axis=-1).astype(np.float32)
        # Apply homography
        transformed = np.einsum('ij,...j->...i', H, pts)
        transformed = transformed[..., :2] / (transformed[..., 2:3] + 1e-8)
        # Camera motion = transformed - original
        cam_flow_x = transformed[..., 0] - x_coords
        cam_flow_y = transformed[..., 1] - y_coords
        # Subtract from measured flow
        residual[i, :, :, 0] -= cam_flow_x
        residual[i, :, :, 1] -= cam_flow_y

    return residual


# ════════════════════════════════════════════════════════════════
# OPTICAL FLOW (RAFT / SEA-RAFT)
# ════════════════════════════════════════════════════════════════

def compute_optical_flow_opencv(frames: np.ndarray) -> np.ndarray:
    """
    Compute dense optical flow using OpenCV Farneback (fallback when RAFT unavailable).
    Returns flow tensor of shape (T-1, H, W, 2).
    """
    flows = []
    prev_gray = cv2.cvtColor(frames[0], cv2.COLOR_BGR2GRAY)

    for i in range(1, len(frames)):
        curr_gray = cv2.cvtColor(frames[i], cv2.COLOR_BGR2GRAY)
        flow = cv2.calcOpticalFlowFarneback(
            prev_gray, curr_gray, None,
            pyr_scale=0.5, levels=3, winsize=15,
            iterations=3, poly_n=5, poly_sigma=1.2, flags=0
        )
        flows.append(flow)
        prev_gray = curr_gray

    print(f"[flow] Computed {len(flows)} flow fields (OpenCV Farneback)")
    return np.array(flows)


def compute_optical_flow_raft(frames: np.ndarray) -> np.ndarray:
    """
    Compute dense optical flow using RAFT (torchvision).
    Requires: pip install torchvision
    Falls back to OpenCV if unavailable.
    """
    try:
        import torch
        import time as _time
        from torchvision.models.optical_flow import raft_large, Raft_Large_Weights
        from torchvision.transforms.functional import to_tensor

        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        print(f"[flow] Loading RAFT model on {device}...")
        t0 = _time.perf_counter()
        model = raft_large(weights=Raft_Large_Weights.DEFAULT).to(device).eval()
        print(f"[flow] Model loaded in {_time.perf_counter() - t0:.2f}s")

        orig_h, orig_w = frames.shape[1], frames.shape[2]
        # RAFT requires H and W divisible by 8 — pad if needed
        pad_h = (8 - orig_h % 8) % 8
        pad_w = (8 - orig_w % 8) % 8
        if pad_h > 0 or pad_w > 0:
            print(f"[flow] Padding frames from {orig_w}x{orig_h} to "
                  f"{orig_w + pad_w}x{orig_h + pad_h} (RAFT requires divisible by 8)")

        flows = []
        t1 = _time.perf_counter()
        with torch.no_grad():
            for i in range(len(frames) - 1):
                img1 = to_tensor(cv2.cvtColor(frames[i], cv2.COLOR_BGR2RGB)).unsqueeze(0).to(device)
                img2 = to_tensor(cv2.cvtColor(frames[i + 1], cv2.COLOR_BGR2RGB)).unsqueeze(0).to(device)
                # Pad to divisible-by-8 dimensions
                if pad_h > 0 or pad_w > 0:
                    img1 = torch.nn.functional.pad(img1, (0, pad_w, 0, pad_h), mode='reflect')
                    img2 = torch.nn.functional.pad(img2, (0, pad_w, 0, pad_h), mode='reflect')
                # RAFT returns list of flow predictions; last is most refined
                flow_predictions = model(img1, img2)
                flow = flow_predictions[-1].squeeze(0).permute(1, 2, 0).cpu().numpy()
                # Crop back to original dimensions
                flow = flow[:orig_h, :orig_w, :]
                flows.append(flow)

        elapsed = _time.perf_counter() - t1
        fps = len(flows) / elapsed if elapsed > 0 else 0
        print(f"[flow] Computed {len(flows)} flow fields (RAFT on {device}) "
              f"in {elapsed:.2f}s ({fps:.1f} pairs/sec)")
        return np.array(flows)

    except (ImportError, RuntimeError, ValueError) as e:
        print(f"[flow] RAFT unavailable ({e}), falling back to OpenCV Farneback")
        return compute_optical_flow_opencv(frames)


# ════════════════════════════════════════════════════════════════
# DEPTH ESTIMATION
# ════════════════════════════════════════════════════════════════

def estimate_depth_temporal(frames: np.ndarray) -> np.ndarray:
    """
    Estimate temporally consistent depth by averaging per-frame depth.
    Uses MiDaS (via OpenCV DNN) as fallback; Video Depth Anything preferred.
    Returns depth map (H, W) with values 0-1 (0=far, 1=near).
    """
    try:
        # Try Video Depth Anything first
        from transformers import pipeline as hf_pipeline
        depth_pipe = hf_pipeline("depth-estimation",
                                 model="depth-anything/Depth-Anything-V2-Small-hf")

        depth_maps = []
        sample_indices = np.linspace(0, len(frames) - 1, min(10, len(frames)), dtype=int)

        for idx in sample_indices:
            frame_rgb = cv2.cvtColor(frames[idx], cv2.COLOR_BGR2RGB)
            from PIL import Image
            pil_image = Image.fromarray(frame_rgb)
            result = depth_pipe(pil_image)
            depth = np.array(result["depth"])
            # Normalize to 0-1
            depth = (depth - depth.min()) / (depth.max() - depth.min() + 1e-8)
            # Resize to match frame dimensions
            h, w = frames.shape[1], frames.shape[2]
            depth = cv2.resize(depth, (w, h), interpolation=cv2.INTER_LINEAR)
            depth_maps.append(depth)

        # Temporal average for consistency
        avg_depth = np.mean(depth_maps, axis=0)
        print(f"[depth] Estimated depth from {len(depth_maps)} frames (Depth Anything V2)")
        return avg_depth

    except (ImportError, Exception) as e:
        print(f"[depth] Depth Anything unavailable ({e}), using Sobel-based approximation")
        # Fallback: use edge-based depth approximation
        gray = cv2.cvtColor(frames[len(frames) // 2], cv2.COLOR_BGR2GRAY).astype(np.float32)
        # Higher frequency = closer (rough heuristic)
        sobelx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=5)
        sobely = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=5)
        edges = np.sqrt(sobelx ** 2 + sobely ** 2)
        # Blur and normalize
        depth = cv2.GaussianBlur(edges, (31, 31), 0)
        depth = (depth - depth.min()) / (depth.max() - depth.min() + 1e-8)
        return depth


# ════════════════════════════════════════════════════════════════
# REGION SEGMENTATION
# ════════════════════════════════════════════════════════════════

def segment_regions_by_motion(flow: np.ndarray, depth: np.ndarray) -> dict:
    """
    Segment the scene into motion-coherent regions.
    Uses flow magnitude + direction clustering.
    Returns dict of region_name -> binary mask (H, W).
    """
    h, w = depth.shape

    # Compute mean flow magnitude per pixel
    flow_mag = np.sqrt(flow[:, :, :, 0] ** 2 + flow[:, :, :, 1] ** 2)
    mean_mag = np.mean(flow_mag, axis=0)

    # Normalize magnitude
    mag_norm = mean_mag / (np.percentile(mean_mag, 95) + 1e-8)
    mag_norm = np.clip(mag_norm, 0, 1)

    # Classify by motion + depth:
    # Sky: top portion, low depth (far), moderate motion
    # Water: high motion, low depth variation locally
    # Vegetation: moderate motion, mid-depth
    # Static: very low motion

    masks = {}

    # Sky mask: top 40% of frame, depth < 0.3 (far)
    sky_mask = np.zeros((h, w), dtype=np.float32)
    sky_mask[:int(h * 0.45), :] = 1.0
    sky_mask *= (depth < 0.35).astype(np.float32)
    # Smooth
    sky_mask = cv2.GaussianBlur(sky_mask, (15, 15), 0)
    if np.sum(sky_mask > 0.5) > h * w * 0.05:  # At least 5% of image
        masks['sky'] = sky_mask

    # Water mask: high motion, relatively uniform direction
    flow_mean_dir = np.mean(flow, axis=0)  # (H, W, 2)
    dir_consistency = np.zeros((h, w))
    for t in range(min(len(flow), 20)):
        cos_sim = (flow[t, :, :, 0] * flow_mean_dir[:, :, 0] +
                   flow[t, :, :, 1] * flow_mean_dir[:, :, 1])
        dir_consistency += cos_sim
    dir_consistency /= min(len(flow), 20)
    dir_consistency = np.clip(dir_consistency / (mean_mag + 1e-8), 0, 1)

    water_candidate = (mag_norm > 0.15) & (dir_consistency > 0.3)
    water_mask = water_candidate.astype(np.float32)
    water_mask = cv2.GaussianBlur(water_mask, (21, 21), 0)
    # Exclude sky region
    if 'sky' in masks:
        water_mask *= (1.0 - (masks['sky'] > 0.5).astype(np.float32))
    if np.sum(water_mask > 0.3) > h * w * 0.03:
        masks['water'] = water_mask

    # Vegetation: moderate motion, mid-range depth
    veg_candidate = (mag_norm > 0.05) & (mag_norm < 0.4) & (depth > 0.2) & (depth < 0.7)
    veg_mask = veg_candidate.astype(np.float32)
    veg_mask = cv2.GaussianBlur(veg_mask, (21, 21), 0)
    # Exclude water and sky
    if 'water' in masks:
        veg_mask *= (1.0 - (masks['water'] > 0.3).astype(np.float32))
    if 'sky' in masks:
        veg_mask *= (1.0 - (masks['sky'] > 0.5).astype(np.float32))
    if np.sum(veg_mask > 0.3) > h * w * 0.05:
        masks['vegetation'] = veg_mask

    # Fire/smoke: very high motion in concentrated area, upward direction
    upward_flow = -np.mean(flow[:, :, :, 1], axis=0)  # negative y = upward
    fire_candidate = (mag_norm > 0.4) & (upward_flow > 0)
    fire_mask = fire_candidate.astype(np.float32)
    fire_mask = cv2.GaussianBlur(fire_mask, (15, 15), 0)
    if np.sum(fire_mask > 0.3) > h * w * 0.01:
        masks['fire'] = fire_mask
        # Smoke: above fire region, less intense
        smoke_mask = np.zeros_like(fire_mask)
        fire_rows = np.where(fire_mask > 0.3)
        if len(fire_rows[0]) > 0:
            fire_top = np.min(fire_rows[0])
            smoke_region = max(0, fire_top - int(h * 0.2))
            smoke_mask[smoke_region:fire_top, :] = 0.5
            smoke_mask = cv2.GaussianBlur(smoke_mask, (21, 21), 0)
            if np.sum(smoke_mask > 0.1) > 0:
                masks['smoke'] = smoke_mask

    print(f"[segment] Found regions: {list(masks.keys())}")
    return masks


# ════════════════════════════════════════════════════════════════
# FFT FREQUENCY ANALYSIS — THE SECRET WEAPON
# ════════════════════════════════════════════════════════════════

def extract_motion_frequencies(flow: np.ndarray, masks: dict,
                               fps: float) -> dict:
    """
    Extract dominant oscillation frequencies per region via FFT.
    Returns dict of region_name -> RegionMotion parameters.

    The FFT converts temporal motion patterns into sin(time * freq)
    parameters for the GAME shader language.
    """
    results = {}
    T = len(flow)

    for region_name, mask in masks.items():
        # Get mean flow magnitude time-series for this region
        mask_binary = mask > 0.3
        if np.sum(mask_binary) < 10:
            continue

        mag_series = []
        dir_x_series = []
        dir_y_series = []

        for t in range(T):
            region_flow = flow[t][mask_binary]
            mag = np.sqrt(region_flow[:, 0] ** 2 + region_flow[:, 1] ** 2)
            mag_series.append(np.mean(mag))
            dir_x_series.append(np.mean(region_flow[:, 0]))
            dir_y_series.append(np.mean(region_flow[:, 1]))

        mag_series = np.array(mag_series)
        dir_x_series = np.array(dir_x_series)
        dir_y_series = np.array(dir_y_series)

        if len(mag_series) < 8:
            continue

        # FFT of magnitude time-series
        freqs = np.fft.rfftfreq(len(mag_series), d=1.0 / fps)
        spectrum = np.abs(np.fft.rfft(mag_series - np.mean(mag_series)))

        # Find dominant frequency (skip DC at index 0)
        if len(spectrum) > 1:
            dominant_idx = np.argmax(spectrum[1:]) + 1
            dominant_freq_hz = float(freqs[dominant_idx])
            dominant_amplitude = float(spectrum[dominant_idx] / len(mag_series))
            snr = float(spectrum[dominant_idx] / (np.mean(spectrum[1:]) + 1e-8))
        else:
            dominant_freq_hz = 0.0
            dominant_amplitude = 0.0
            snr = 0.0

        # Mean flow direction and speed
        mean_dir_x = float(np.mean(dir_x_series))
        mean_dir_y = float(np.mean(dir_y_series))
        dir_mag = math.sqrt(mean_dir_x ** 2 + mean_dir_y ** 2) + 1e-8
        flow_direction = (mean_dir_x / dir_mag, mean_dir_y / dir_mag)
        flow_speed = float(np.clip(np.mean(mag_series) / 5.0, 0, 1))  # normalize

        # Turbulence: std of magnitude
        flow_turbulence = float(np.std(mag_series))

        # Multi-scale energy analysis for FBM parameters
        fbm_persistence, fbm_octaves = analyze_multiscale_energy(flow, mask_binary)

        # Distort strength from flow std
        distort_strength = float(np.clip(flow_turbulence * 0.15, 0.005, 0.3))

        # Motion type classification
        if flow_speed < 0.02:
            motion_type = "static"
        elif snr > 3.0 and dominant_freq_hz > 0.05:
            motion_type = "oscillating"
        elif flow_turbulence > 0.5 * np.mean(mag_series):
            motion_type = "turbulent"
        elif dominant_freq_hz < 0.05 and flow_speed > 0.1:
            motion_type = "directional_flow"
        else:
            motion_type = "pulsing"

        # Mean color of region (from would-be frame data — placeholder)
        mean_color = (0.5, 0.5, 0.5)

        results[region_name] = RegionMotion(
            name=region_name,
            animation_class=region_name,
            motion_type=motion_type,
            flow_direction=flow_direction,
            flow_speed=flow_speed,
            flow_turbulence=flow_turbulence,
            dominant_freq_hz=dominant_freq_hz,
            game_angular_freq=float(2 * math.pi * dominant_freq_hz),
            oscillation_amplitude=dominant_amplitude,
            derived_fbm_persistence=fbm_persistence,
            derived_fbm_octaves=fbm_octaves,
            derived_distort_strength=distort_strength,
            mean_color=mean_color,
            color_shift_amplitude=0.05,
        )

        print(f"  - {region_name}: {motion_type}, speed={flow_speed:.3f}, "
              f"freq={dominant_freq_hz:.3f}Hz -> sin(time*{2*math.pi*dominant_freq_hz:.2f}), "
              f"turbulence={flow_turbulence:.3f}")

    return results


def analyze_multiscale_energy(flow: np.ndarray, mask: np.ndarray) -> tuple:
    """
    Compute FBM persistence and octave count from multi-scale flow energy.
    Uses Gaussian pyramid to decompose flow at multiple spatial scales.
    """
    # Use mean flow magnitude
    mean_flow = np.mean(np.sqrt(flow[:, :, :, 0]**2 + flow[:, :, :, 1]**2), axis=0)
    masked_flow = mean_flow * mask

    energy_per_scale = []
    current = masked_flow.copy()
    current_mask = mask.astype(np.float32)

    for octave in range(6):
        energy = np.mean(current ** 2)
        energy_per_scale.append(energy)
        if current.shape[0] < 4 or current.shape[1] < 4:
            break
        current = cv2.pyrDown(current)
        current_mask = cv2.pyrDown(current_mask)
        current = current * (current_mask > 0.3).astype(np.float32)

    if len(energy_per_scale) < 2:
        return 0.55, 4

    # Persistence = ratio between successive octaves
    ratios = []
    for i in range(len(energy_per_scale) - 1):
        if energy_per_scale[i] > 1e-10:
            ratios.append(energy_per_scale[i + 1] / energy_per_scale[i])

    persistence = float(np.clip(np.mean(ratios) if ratios else 0.55, 0.3, 0.8))

    # Count significant octaves (energy > 5% of base)
    base = energy_per_scale[0] if energy_per_scale[0] > 0 else 1.0
    significant = sum(1 for e in energy_per_scale if e > base * 0.05)
    octaves = max(2, min(6, significant))

    return persistence, octaves


# ════════════════════════════════════════════════════════════════
# TEXTURE GENERATION
# ════════════════════════════════════════════════════════════════

def generate_flow_texture(flow: np.ndarray, h: int, w: int) -> np.ndarray:
    """
    Generate flow map PNG from mean optical flow.
    Encodes as RG texture: R = flow_x, G = flow_y, mapped from [-max, max] to [0, 255].
    0.5 (128) = no motion.
    """
    mean_flow = np.mean(flow, axis=0)

    # Resize to output dimensions
    flow_resized = cv2.resize(mean_flow, (w, h), interpolation=cv2.INTER_LINEAR)

    # Normalize to [-1, 1] range
    max_mag = np.percentile(np.abs(flow_resized), 98) + 1e-8
    flow_norm = np.clip(flow_resized / max_mag, -1, 1)

    # Encode: [-1,1] -> [0,255] with 128 as zero
    flow_r = ((flow_norm[:, :, 0] * 0.5 + 0.5) * 255).astype(np.uint8)
    flow_g = ((flow_norm[:, :, 1] * 0.5 + 0.5) * 255).astype(np.uint8)
    flow_b = np.full_like(flow_r, 128)

    return np.stack([flow_r, flow_g, flow_b], axis=-1)


def generate_motion_texture(flow: np.ndarray, h: int, w: int) -> np.ndarray:
    """
    Generate motion magnitude texture from flow standard deviation.
    Bright = high motion, dark = static.
    """
    flow_mag = np.sqrt(flow[:, :, :, 0] ** 2 + flow[:, :, :, 1] ** 2)
    motion_std = np.std(flow_mag, axis=0)

    # Resize
    motion_resized = cv2.resize(motion_std, (w, h), interpolation=cv2.INTER_LINEAR)

    # Normalize to 0-255
    max_val = np.percentile(motion_resized, 98) + 1e-8
    motion_norm = np.clip(motion_resized / max_val, 0, 1)

    return (motion_norm * 255).astype(np.uint8)


def generate_depth_texture(depth: np.ndarray, h: int, w: int) -> np.ndarray:
    """Resize and encode depth map as 8-bit grayscale."""
    depth_resized = cv2.resize(depth, (w, h), interpolation=cv2.INTER_LINEAR)
    return (np.clip(depth_resized, 0, 1) * 255).astype(np.uint8)


def generate_mask_textures(masks: dict, h: int, w: int) -> dict:
    """Resize and encode all region masks as 8-bit grayscale."""
    result = {}
    for name, mask in masks.items():
        resized = cv2.resize(mask, (w, h), interpolation=cv2.INTER_LINEAR)
        result[name] = (np.clip(resized, 0, 1) * 255).astype(np.uint8)
    return result


# ════════════════════════════════════════════════════════════════
# SCENE CLASSIFICATION
# ════════════════════════════════════════════════════════════════

def classify_scene(masks: dict, region_motions: dict, depth: np.ndarray) -> tuple:
    """
    Classify scene type from motion analysis.
    Returns (scene_type, scene_characteristic).
    """
    has_water = 'water' in masks
    has_sky = 'sky' in masks
    has_fire = 'fire' in masks
    has_vegetation = 'vegetation' in masks

    water_motion = region_motions.get('water')
    sky_motion = region_motions.get('sky')

    # Fire scenes
    if has_fire:
        return 'campfire', 'Active flame with rising heat and smoke'

    # Water classification
    if has_water and water_motion:
        speed = water_motion.flow_speed
        turb = water_motion.flow_turbulence
        direction = water_motion.flow_direction

        # Waterfall: strong downward flow
        if abs(direction[1]) > 0.7 and speed > 0.3:
            return 'waterfall', f'Vertical cascade, speed {speed:.2f}'

        # Ocean: high turbulence, rhythmic
        if turb > 0.3 and water_motion.motion_type == 'oscillating':
            return 'ocean_coast', f'Rhythmic waves at {water_motion.dominant_freq_hz:.2f}Hz'

        # Forest stream: gentle, low turbulence
        if speed < 0.2 and has_vegetation:
            return 'forest_stream', f'Gentle creek flow, speed {speed:.2f}'

    # Sky-dominant scenes
    if has_sky and not has_water:
        if sky_motion and sky_motion.motion_type == 'oscillating':
            freq = sky_motion.dominant_freq_hz
            if freq < 0.05:
                return 'aurora', f'Slow sky oscillation at {freq:.3f}Hz'

    # Night scenes: low overall brightness
    if has_water:
        mean_depth = np.mean(depth)
        if mean_depth > 0.5:  # Generally darker/closer
            return 'city_night', 'Urban scene with reflective surfaces'

    # Desert: minimal motion, no water
    if not has_water and not has_vegetation and not has_fire:
        total_motion = sum(m.flow_speed for m in region_motions.values())
        if total_motion < 0.1:
            return 'desert_dunes', 'Minimal motion, arid landscape'

    # Storm: high atmospheric motion
    if has_sky and sky_motion and sky_motion.flow_turbulence > 0.4:
        return 'thunderstorm', f'Turbulent sky, turbulence {sky_motion.flow_turbulence:.2f}'

    # Generic landscape fallback
    return 'generic', 'Standard landscape scene'


# ════════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ════════════════════════════════════════════════════════════════

def analyze_video(video_path: str, output_dir: str,
                  output_width: int = 1920, output_height: int = 1080,
                  use_raft: bool = True) -> VideoAnalysis:
    """
    Full video analysis pipeline.

    Input: video file path
    Output: analysis.json + texture PNGs in output_dir
    """
    os.makedirs(output_dir, exist_ok=True)
    base_name = Path(video_path).stem

    print(f"\n{'=' * 60}")
    print(f"  Video-to-GAME Analysis Pipeline")
    print(f"  Input: {video_path}")
    print(f"  Output: {output_dir}")
    print(f"{'=' * 60}\n")

    # Step 1: Extract frames
    print("=== Step 1/7: Frame Extraction ===")
    frames, orig_fps, duration, orig_size = extract_frames(video_path)
    analysis_fps = orig_fps  # Analysis FPS matches extraction

    # Step 2: Camera stabilization
    print("\n=== Step 2/7: Camera Stabilization ===")
    homographies, cam_mag, is_stable = estimate_camera_motion(frames)

    # Step 3: Optical flow
    print("\n=== Step 3/7: Optical Flow ===")
    if use_raft:
        flow = compute_optical_flow_raft(frames)
    else:
        flow = compute_optical_flow_opencv(frames)

    # Subtract camera motion if significant
    if not is_stable:
        print("[flow] Subtracting camera motion...")
        flow = subtract_camera_motion(flow, homographies)

    # Step 4: Depth estimation
    print("\n=== Step 4/7: Depth Estimation ===")
    depth = estimate_depth_temporal(frames)

    # Step 5: Region segmentation
    print("\n=== Step 5/7: Region Segmentation ===")
    masks = segment_regions_by_motion(flow, depth)

    # Step 6: FFT frequency analysis
    print("\n=== Step 6/7: Frequency Analysis ===")
    region_motions = extract_motion_frequencies(flow, masks, analysis_fps)

    # Step 7: Scene classification
    print("\n=== Step 7/7: Scene Classification ===")
    scene_type, scene_char = classify_scene(masks, region_motions, depth)
    print(f"[classify] Scene: {scene_type} — {scene_char}")

    # Generate output textures
    print("\n=== Generating Textures ===")
    h, w = output_height, output_width

    # Representative still frame
    flow_magnitudes = np.sqrt(flow[:, :, :, 0]**2 + flow[:, :, :, 1]**2)
    still = select_representative_frame(frames, flow_magnitudes)
    still_resized = cv2.resize(still, (w, h), interpolation=cv2.INTER_LANCZOS4)
    cv2.imwrite(os.path.join(output_dir, f"{base_name}.jpg"), still_resized,
                [cv2.IMWRITE_JPEG_QUALITY, 95])

    # Flow texture
    flow_tex = generate_flow_texture(flow, h, w)
    cv2.imwrite(os.path.join(output_dir, f"{base_name}-flow.png"), flow_tex)

    # Motion magnitude texture
    motion_tex = generate_motion_texture(flow, h, w)
    cv2.imwrite(os.path.join(output_dir, f"{base_name}-motion.png"), motion_tex)

    # Depth texture
    depth_tex = generate_depth_texture(depth, h, w)
    cv2.imwrite(os.path.join(output_dir, f"{base_name}-depth.png"), depth_tex)

    # Region masks
    mask_textures = generate_mask_textures(masks, h, w)
    for name, tex in mask_textures.items():
        cv2.imwrite(os.path.join(output_dir, f"{base_name}-mask_{name}.png"), tex)

    # Build analysis result
    analysis = VideoAnalysis(
        scene_type=scene_type,
        scene_characteristic=scene_char,
        regions=[asdict(m) for m in region_motions.values()],
        global_wind_direction=(
            float(np.mean([m.flow_direction[0] for m in region_motions.values()])) if region_motions else 1.0,
            float(np.mean([m.flow_direction[1] for m in region_motions.values()])) if region_motions else 0.0,
        ),
        ambient_motion_intensity=float(np.clip(
            np.mean([m.flow_speed for m in region_motions.values()]) * 2.0 if region_motions else 0.3,
            0.1, 0.5
        )),
        video_fps=float(orig_fps),
        video_duration_sec=float(duration),
        analysis_resolution=(frames.shape[2], frames.shape[1]),
        camera_stabilized=not is_stable,
        camera_motion_magnitude=float(cam_mag),
        has_water='water' in masks,
        has_sky='sky' in masks,
        has_fire='fire' in masks,
        has_vegetation='vegetation' in masks,
    )

    # Save analysis JSON
    analysis_path = os.path.join(output_dir, f"{base_name}-analysis.json")
    with open(analysis_path, 'w') as f:
        json.dump(asdict(analysis), f, indent=2)

    print(f"\n[pipeline] Done! Generated files in {output_dir}/")
    print(f"  - {base_name}.jpg (representative still)")
    print(f"  - {base_name}-depth.png")
    print(f"  - {base_name}-flow.png (measured optical flow)")
    print(f"  - {base_name}-motion.png (motion magnitude)")
    for name in masks:
        print(f"  - {base_name}-mask_{name}.png")
    print(f"  - {base_name}-analysis.json")

    return analysis


# ════════════════════════════════════════════════════════════════
# CLI
# ════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Video-to-GAME Analysis Pipeline')
    parser.add_argument('video', help='Input video file path')
    parser.add_argument('--output-dir', '-o', default='./output',
                        help='Output directory for textures and analysis')
    parser.add_argument('--width', type=int, default=1920, help='Output texture width')
    parser.add_argument('--height', type=int, default=1080, help='Output texture height')
    parser.add_argument('--no-raft', action='store_true',
                        help='Use OpenCV Farneback instead of RAFT')
    args = parser.parse_args()

    analyze_video(
        args.video,
        args.output_dir,
        output_width=args.width,
        output_height=args.height,
        use_raft=not args.no_raft,
    )
