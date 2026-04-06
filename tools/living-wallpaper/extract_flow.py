#!/usr/bin/env python3
"""
Flow Texture Extraction Pipeline
==================================
Extracts high-quality flow textures from video using RAFT optical flow
with temporal averaging and multi-frequency decomposition.

The key insight: temporal averaging across ALL frames cancels noise and
captures only the persistent, physically-correct motion field. This is
what makes flowmap() textures look like real fluid dynamics instead of
noisy per-pixel chaos.

Pipeline:
  Video -> frame extraction -> camera stabilization -> optical flow ->
  temporal averaging -> multi-frequency decomposition -> per-region masking ->
  Gaussian smoothing -> PNG encoding (R=flowX, G=flowY, 128=zero)

Usage:
  python extract_flow.py input.mp4 -o ./output [--masks-dir masks/] [--no-raft] [--resolution 512]

Requirements:
  pip install torch torchvision opencv-python numpy scipy pillow
"""

import argparse
import math
import os
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
from scipy.ndimage import gaussian_filter


# ============================================================
# FRAME EXTRACTION
# ============================================================

def extract_frames(video_path: str, target_fps: int = 24, max_frames: int = 300,
                   analysis_width: int = 480) -> Tuple[np.ndarray, float, float, Tuple[int, int]]:
    """
    Extract frames from video at target FPS and resolution.
    Returns (frames_bgr, original_fps, duration_sec, original_size).
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("Cannot open video: {}".format(video_path))

    orig_fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frame_count / orig_fps if orig_fps > 0 else 0
    orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Calculate resize dimensions maintaining aspect ratio
    if orig_w >= orig_h:
        # Landscape or square
        scale = analysis_width / orig_w
    else:
        # Portrait: constrain by height
        scale = analysis_width / orig_h

    new_w = int(orig_w * scale)
    new_h = int(orig_h * scale)

    # Ensure minimum dimension
    new_w = max(new_w, 8)
    new_h = max(new_h, 8)

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
    print("[frames] Extracted {} frames at {}x{} (source: {}x{} @ {:.1f}fps, {:.1f}s)".format(
        len(frames), new_w, new_h, orig_w, orig_h, orig_fps, duration))

    if len(frames) < 2:
        raise ValueError("Need at least 2 frames, got {}".format(len(frames)))

    return np.array(frames), orig_fps, duration, (orig_w, orig_h)


# ============================================================
# CAMERA STABILIZATION
# ============================================================

def estimate_camera_motion(frames: np.ndarray) -> Tuple[List[np.ndarray], float, bool]:
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

    print("[camera] Average motion: {:.2f}px/frame ({})".format(
        avg_magnitude, "stable" if is_stable else "unstable -- will compensate"))

    return homographies, avg_magnitude, is_stable


def subtract_camera_motion(flow: np.ndarray, homographies: List[np.ndarray]) -> np.ndarray:
    """
    Remove camera-induced motion from optical flow fields.
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


# ============================================================
# OPTICAL FLOW — RAFT (GPU) + FARNEBACK (CPU FALLBACK)
# ============================================================

def compute_flow_farneback(frames: np.ndarray) -> np.ndarray:
    """
    Compute dense optical flow using OpenCV Farneback.
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

        if (i % 50) == 0:
            print("  [{}/{}] frames processed...".format(i, len(frames) - 1))

    print("[flow] Computed {} flow fields (OpenCV Farneback)".format(len(flows)))
    return np.array(flows)


def compute_flow_raft(frames: np.ndarray) -> np.ndarray:
    """
    Compute dense optical flow using RAFT (torchvision).
    Falls back to Farneback if RAFT is unavailable.
    Returns flow tensor of shape (T-1, H, W, 2).
    """
    try:
        import torch
        from torchvision.models.optical_flow import raft_large, Raft_Large_Weights
        from torchvision.transforms.functional import to_tensor

        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        print("[flow] Loading RAFT model on {}...".format(device))
        t0 = time.perf_counter()
        model = raft_large(weights=Raft_Large_Weights.DEFAULT).to(device).eval()
        print("[flow] Model loaded in {:.2f}s".format(time.perf_counter() - t0))

        orig_h, orig_w = frames.shape[1], frames.shape[2]
        # RAFT requires H and W divisible by 8 -- pad if needed
        pad_h = (8 - orig_h % 8) % 8
        pad_w = (8 - orig_w % 8) % 8
        if pad_h > 0 or pad_w > 0:
            print("[flow] Padding frames from {}x{} to {}x{} (RAFT requires divisible by 8)".format(
                orig_w, orig_h, orig_w + pad_w, orig_h + pad_h))

        flows = []
        t1 = time.perf_counter()
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

                if ((i + 1) % 50) == 0:
                    elapsed = time.perf_counter() - t1
                    fps = (i + 1) / elapsed if elapsed > 0 else 0
                    print("  [{}/{}] pairs processed ({:.1f} pairs/sec)...".format(
                        i + 1, len(frames) - 1, fps))

        elapsed = time.perf_counter() - t1
        fps = len(flows) / elapsed if elapsed > 0 else 0
        print("[flow] Computed {} flow fields (RAFT on {}) in {:.2f}s ({:.1f} pairs/sec)".format(
            len(flows), device, elapsed, fps))
        return np.array(flows)

    except (ImportError, RuntimeError, ValueError) as e:
        print("[flow] RAFT unavailable ({}), falling back to OpenCV Farneback".format(e))
        return compute_flow_farneback(frames)


# ============================================================
# TEMPORAL AVERAGING — THE CORE QUALITY STEP
# ============================================================

def compute_temporal_mean(flow: np.ndarray) -> np.ndarray:
    """
    Compute temporal mean of all flow fields.
    This is the single most important operation: averaging across all frames
    cancels noise and captures only the persistent, physically-correct motion.

    Input: flow of shape (T, H, W, 2)
    Output: flow_mean of shape (H, W, 2)
    """
    # Use float64 accumulation for precision across many frames
    flow_sum = np.zeros((flow.shape[1], flow.shape[2], 2), dtype=np.float64)
    for i in range(len(flow)):
        flow_sum += flow[i].astype(np.float64)
    flow_mean = flow_sum / len(flow)
    return flow_mean.astype(np.float32)


def compute_temporal_std(flow: np.ndarray, flow_mean: np.ndarray) -> np.ndarray:
    """
    Compute per-pixel standard deviation of flow relative to temporal mean.
    This captures the turbulence/variation layer: how much each pixel's flow
    deviates from the mean over time.

    Input: flow of shape (T, H, W, 2), flow_mean of shape (H, W, 2)
    Output: flow_std of shape (H, W, 2)
    """
    variance_sum = np.zeros_like(flow_mean, dtype=np.float64)
    for i in range(len(flow)):
        diff = flow[i].astype(np.float64) - flow_mean.astype(np.float64)
        variance_sum += diff ** 2
    variance = variance_sum / len(flow)
    flow_std = np.sqrt(variance).astype(np.float32)
    return flow_std


# ============================================================
# MULTI-FREQUENCY DECOMPOSITION
# ============================================================

def decompose_flow(flow: np.ndarray, flow_mean: np.ndarray,
                   base_sigma: float = 20.0,
                   detail_sigma: float = 5.0) -> Tuple[np.ndarray, np.ndarray]:
    """
    Decompose flow into base (low-frequency) and detail (high-frequency) layers.

    Base flow: Heavy Gaussian blur of the temporal mean. This is the dominant
    persistent motion -- slow cloud drift, steady river current, constant wind.

    Detail flow: The turbulence/variation layer. RMS of per-frame deviations
    from the temporal mean, with lighter Gaussian blur. This captures wave
    crests, flame flicker, leaf flutter.

    Returns (flow_base, flow_detail), both shape (H, W, 2).
    """
    # Base flow: heavily smoothed temporal mean
    flow_base = np.zeros_like(flow_mean)
    flow_base[:, :, 0] = gaussian_filter(flow_mean[:, :, 0], sigma=base_sigma)
    flow_base[:, :, 1] = gaussian_filter(flow_mean[:, :, 1], sigma=base_sigma)

    # Detail flow: standard deviation of per-frame flow relative to mean
    flow_std = compute_temporal_std(flow, flow_mean)

    # Apply lighter blur to detail to smooth out per-pixel noise
    # while preserving the spatial structure of turbulence
    flow_detail = np.zeros_like(flow_std)
    flow_detail[:, :, 0] = gaussian_filter(flow_std[:, :, 0], sigma=detail_sigma)
    flow_detail[:, :, 1] = gaussian_filter(flow_std[:, :, 1], sigma=detail_sigma)

    return flow_base, flow_detail


# ============================================================
# PER-REGION MASKING
# ============================================================

def load_masks(masks_dir: str, target_h: int, target_w: int) -> Dict[str, np.ndarray]:
    """
    Load region mask PNGs from directory.
    Expects files named mask_water.png, mask_sky.png, mask_fire.png, mask_vegetation.png.
    Returns dict of region_name -> mask array (H, W) with values 0.0-1.0.
    """
    masks = {}
    region_names = ['water', 'sky', 'fire', 'vegetation', 'smoke', 'clouds']

    for name in region_names:
        mask_path = os.path.join(masks_dir, "mask_{}.png".format(name))
        if not os.path.exists(mask_path):
            continue

        mask = cv2.imread(mask_path, cv2.IMREAD_GRAYSCALE)
        if mask is None:
            print("[masks] Warning: could not read {}".format(mask_path))
            continue

        # Resize to match flow dimensions
        mask = cv2.resize(mask, (target_w, target_h), interpolation=cv2.INTER_LINEAR)
        # Normalize to 0-1
        mask = mask.astype(np.float32) / 255.0
        masks[name] = mask
        print("[masks] Loaded mask for '{}' from {}".format(name, mask_path))

    return masks


def apply_mask_to_flow(flow: np.ndarray, mask: np.ndarray,
                       boundary_sigma: float = 10.0) -> np.ndarray:
    """
    Apply a region mask to a flow field with smooth boundary blending.

    Multiplies flow by a blurred version of the mask so that region edges
    fade smoothly rather than creating hard discontinuities in the flow texture.

    Input: flow (H, W, 2), mask (H, W) 0.0-1.0
    Output: masked flow (H, W, 2)
    """
    # Smooth the mask boundaries to prevent hard edges in the flow texture
    smooth_mask = gaussian_filter(mask, sigma=boundary_sigma)
    # Apply to both channels
    result = np.zeros_like(flow)
    result[:, :, 0] = flow[:, :, 0] * smooth_mask
    result[:, :, 1] = flow[:, :, 1] * smooth_mask
    return result


# ============================================================
# FLOW TEXTURE ENCODING
# ============================================================

def normalize_flow_magnitude(flow: np.ndarray, headroom: float = 0.8) -> Tuple[np.ndarray, float]:
    """
    Normalize flow so that the maximum magnitude maps to headroom (default 80%)
    of the available range. This prevents clipping while preserving dynamic range.

    Returns (normalized_flow, scale_factor).
    """
    magnitude = np.sqrt(flow[:, :, 0] ** 2 + flow[:, :, 1] ** 2)
    # Use 98th percentile to ignore outliers
    max_mag = np.percentile(magnitude, 98)
    if max_mag < 1e-8:
        # No significant flow -- return zeros
        return np.zeros_like(flow), 0.0

    scale = headroom / max_mag
    normalized = flow * scale
    return normalized, scale


def encode_flow_to_png(flow: np.ndarray, output_path: str, resolution: int) -> None:
    """
    Encode a 2D flow field as a PNG image.

    Encoding:
      R = clamp(flow_x * scale + 128, 0, 255)
      G = clamp(flow_y * scale + 128, 0, 255)
      B = 128 (unused, neutral)

    The scale factor normalizes so max magnitude maps to ~80% of range.
    128 = zero flow. Values > 128 = positive, < 128 = negative.
    """
    h, w = flow.shape[0], flow.shape[1]

    # Resize to output resolution
    if h != resolution or w != resolution:
        flow_resized = np.zeros((resolution, resolution, 2), dtype=np.float32)
        flow_resized[:, :, 0] = cv2.resize(flow[:, :, 0], (resolution, resolution),
                                            interpolation=cv2.INTER_LINEAR)
        flow_resized[:, :, 1] = cv2.resize(flow[:, :, 1], (resolution, resolution),
                                            interpolation=cv2.INTER_LINEAR)
    else:
        flow_resized = flow

    # Normalize magnitude
    flow_norm, scale = normalize_flow_magnitude(flow_resized)

    # Encode: flow values in [-headroom, headroom] -> [0, 255] with 128 as center
    # flow_norm * (127/headroom) + 128 would map [-0.8, 0.8] -> [~0.8, ~255.2]
    # Simpler: flow_norm is already in [-0.8, 0.8], map to [0, 255]
    flow_r = np.clip(flow_norm[:, :, 0] * (127.0 / 0.8) + 128.0, 0, 255).astype(np.uint8)
    flow_g = np.clip(flow_norm[:, :, 1] * (127.0 / 0.8) + 128.0, 0, 255).astype(np.uint8)
    flow_b = np.full_like(flow_r, 128, dtype=np.uint8)

    # Stack as BGR for OpenCV (B=128, G=flowY, R=flowX)
    # But we want the PNG to read as R=flowX, G=flowY, B=128
    # OpenCV uses BGR ordering, so: B=flow_b, G=flow_g, R=flow_r
    texture = np.stack([flow_b, flow_g, flow_r], axis=-1)

    cv2.imwrite(output_path, texture)


def encode_detail_to_png(flow_detail: np.ndarray, output_path: str, resolution: int) -> None:
    """
    Encode detail (std deviation / turbulence) flow as a PNG.

    Detail flow is always non-negative (it's a standard deviation).
    Encoding:
      R = clamp(detail_x * scale, 0, 255)  -- magnitude of X turbulence
      G = clamp(detail_y * scale, 0, 255)  -- magnitude of Y turbulence
      B = 128 (unused)

    Unlike base flow, detail has no direction -- it represents the AMOUNT
    of variation. 0 = no turbulence, 255 = maximum turbulence.
    But to stay consistent with flowmap() usage where 128 = zero,
    we encode detail as offset from 128 (adding directional info from mean).
    """
    h, w = flow_detail.shape[0], flow_detail.shape[1]

    # Resize to output resolution
    if h != resolution or w != resolution:
        detail_resized = np.zeros((resolution, resolution, 2), dtype=np.float32)
        detail_resized[:, :, 0] = cv2.resize(flow_detail[:, :, 0], (resolution, resolution),
                                              interpolation=cv2.INTER_LINEAR)
        detail_resized[:, :, 1] = cv2.resize(flow_detail[:, :, 1], (resolution, resolution),
                                              interpolation=cv2.INTER_LINEAR)
    else:
        detail_resized = flow_detail.copy()

    # For detail flow: encode as magnitude from center (128)
    # The detail represents variability amplitude, so we store it as offset from 128
    # This way the detail texture can be used with flowmap() the same way as base
    max_val = np.percentile(np.abs(detail_resized), 98)
    if max_val < 1e-8:
        max_val = 1.0

    # Scale so 98th percentile maps to ~80% of half-range (0.8 * 127 ~ 102)
    scale = 0.8 * 127.0 / max_val
    detail_r = np.clip(detail_resized[:, :, 0] * scale + 128.0, 0, 255).astype(np.uint8)
    detail_g = np.clip(detail_resized[:, :, 1] * scale + 128.0, 0, 255).astype(np.uint8)
    detail_b = np.full_like(detail_r, 128, dtype=np.uint8)

    texture = np.stack([detail_b, detail_g, detail_r], axis=-1)
    cv2.imwrite(output_path, texture)


# ============================================================
# MAIN PIPELINE
# ============================================================

def extract_flow_textures(video_path: str, output_dir: str,
                          masks_dir: Optional[str] = None,
                          use_raft: bool = True,
                          resolution: int = 512,
                          base_blur_sigma: float = 20.0,
                          detail_blur_sigma: float = 5.0) -> None:
    """
    Full flow texture extraction pipeline.

    1. Extract frames from video
    2. Estimate and subtract camera motion
    3. Compute optical flow (RAFT or Farneback) for every frame pair
    4. Temporal averaging across ALL frames -> clean flow field
    5. Multi-frequency decomposition -> base + detail layers
    6. Per-region masking (if masks provided)
    7. Gaussian smoothing for clean textures
    8. Encode as PNG (R=flowX, G=flowY, 128=zero)
    """
    os.makedirs(output_dir, exist_ok=True)
    base_name = Path(video_path).stem
    pipeline_start = time.perf_counter()

    print("")
    print("=" * 64)
    print("  Flow Texture Extraction Pipeline")
    print("  Input:      {}".format(video_path))
    print("  Output:     {}".format(output_dir))
    print("  Resolution: {}x{}".format(resolution, resolution))
    print("  Method:     {}".format("RAFT (GPU)" if use_raft else "Farneback (CPU)"))
    if masks_dir:
        print("  Masks:      {}".format(masks_dir))
    print("=" * 64)
    print("")

    # ----------------------------------------------------------
    # Step 1: Frame extraction
    # ----------------------------------------------------------
    print("=== Step 1/6: Frame Extraction ===")
    t0 = time.perf_counter()
    frames, orig_fps, duration, orig_size = extract_frames(video_path)
    print("[timing] Frame extraction: {:.2f}s".format(time.perf_counter() - t0))
    frame_h, frame_w = frames.shape[1], frames.shape[2]

    # ----------------------------------------------------------
    # Step 2: Camera stabilization
    # ----------------------------------------------------------
    print("")
    print("=== Step 2/6: Camera Stabilization ===")
    t0 = time.perf_counter()
    homographies, cam_mag, is_stable = estimate_camera_motion(frames)
    print("[timing] Camera estimation: {:.2f}s".format(time.perf_counter() - t0))

    # ----------------------------------------------------------
    # Step 3: Optical flow computation
    # ----------------------------------------------------------
    print("")
    print("=== Step 3/6: Optical Flow ({}) ===".format("RAFT" if use_raft else "Farneback"))
    t0 = time.perf_counter()
    if use_raft:
        flow = compute_flow_raft(frames)
    else:
        flow = compute_flow_farneback(frames)
    print("[timing] Optical flow: {:.2f}s".format(time.perf_counter() - t0))

    # Subtract camera motion if significant
    if not is_stable:
        print("[flow] Subtracting camera motion from {} flow fields...".format(len(flow)))
        t0 = time.perf_counter()
        flow = subtract_camera_motion(flow, homographies)
        print("[timing] Camera subtraction: {:.2f}s".format(time.perf_counter() - t0))

    num_pairs = len(flow)
    print("[flow] {} frame pairs, flow field shape: {}x{} per frame".format(
        num_pairs, frame_w, frame_h))

    # ----------------------------------------------------------
    # Step 4: Temporal averaging
    # ----------------------------------------------------------
    print("")
    print("=== Step 4/6: Temporal Averaging ({} frames) ===".format(num_pairs))
    t0 = time.perf_counter()
    flow_mean = compute_temporal_mean(flow)

    # Report flow statistics
    mean_mag = np.sqrt(flow_mean[:, :, 0] ** 2 + flow_mean[:, :, 1] ** 2)
    print("[temporal] Mean flow magnitude: {:.4f} px/frame".format(np.mean(mean_mag)))
    print("[temporal] Max flow magnitude:  {:.4f} px/frame (98th pct: {:.4f})".format(
        np.max(mean_mag), np.percentile(mean_mag, 98)))
    print("[temporal] Flow direction bias: dx={:.4f}, dy={:.4f}".format(
        np.mean(flow_mean[:, :, 0]), np.mean(flow_mean[:, :, 1])))
    print("[timing] Temporal averaging: {:.2f}s".format(time.perf_counter() - t0))

    # ----------------------------------------------------------
    # Step 5: Multi-frequency decomposition
    # ----------------------------------------------------------
    print("")
    print("=== Step 5/6: Multi-Frequency Decomposition ===")
    print("[decompose] Base blur sigma:   {:.1f}px".format(base_blur_sigma))
    print("[decompose] Detail blur sigma: {:.1f}px".format(detail_blur_sigma))
    t0 = time.perf_counter()
    flow_base, flow_detail = decompose_flow(
        flow, flow_mean,
        base_sigma=base_blur_sigma,
        detail_sigma=detail_blur_sigma
    )

    base_mag = np.sqrt(flow_base[:, :, 0] ** 2 + flow_base[:, :, 1] ** 2)
    detail_mag = np.sqrt(flow_detail[:, :, 0] ** 2 + flow_detail[:, :, 1] ** 2)
    print("[decompose] Base flow magnitude:   mean={:.4f}, max={:.4f}".format(
        np.mean(base_mag), np.max(base_mag)))
    print("[decompose] Detail flow magnitude: mean={:.4f}, max={:.4f}".format(
        np.mean(detail_mag), np.max(detail_mag)))
    print("[timing] Decomposition: {:.2f}s".format(time.perf_counter() - t0))

    # ----------------------------------------------------------
    # Step 6: Output generation
    # ----------------------------------------------------------
    print("")
    print("=== Step 6/6: Encoding Flow Textures ({}x{}) ===".format(resolution, resolution))
    t0 = time.perf_counter()
    output_files = []

    # Always generate full-image flow textures
    full_base_path = os.path.join(output_dir, "{}-flow_full_base.png".format(base_name))
    full_detail_path = os.path.join(output_dir, "{}-flow_full_detail.png".format(base_name))
    encode_flow_to_png(flow_base, full_base_path, resolution)
    encode_detail_to_png(flow_detail, full_detail_path, resolution)
    output_files.append(full_base_path)
    output_files.append(full_detail_path)
    print("[output] {} (full-image base flow)".format(os.path.basename(full_base_path)))
    print("[output] {} (full-image detail flow)".format(os.path.basename(full_detail_path)))

    # Per-region flow textures (if masks provided)
    if masks_dir and os.path.isdir(masks_dir):
        masks = load_masks(masks_dir, frame_h, frame_w)

        if not masks:
            print("[masks] No valid masks found in {}".format(masks_dir))
        else:
            print("[masks] Generating per-region flow textures for {} regions...".format(len(masks)))

            for region_name, mask in masks.items():
                # Apply mask to base flow with smooth boundaries
                region_base = apply_mask_to_flow(flow_base, mask, boundary_sigma=10.0)
                region_detail = apply_mask_to_flow(flow_detail, mask, boundary_sigma=10.0)

                # Check if region has meaningful flow
                region_base_mag = np.sqrt(
                    region_base[:, :, 0] ** 2 + region_base[:, :, 1] ** 2)
                mask_area = np.sum(mask > 0.3)
                if mask_area < 1:
                    print("[masks] Skipping '{}' -- empty mask".format(region_name))
                    continue

                mean_region_mag = np.sum(region_base_mag) / (mask_area + 1e-8)
                print("[masks] Region '{}': area={:.1f}%, mean_flow={:.4f}".format(
                    region_name,
                    100.0 * mask_area / (frame_h * frame_w),
                    mean_region_mag))

                # Encode per-region textures
                base_path = os.path.join(
                    output_dir, "{}-flow_{}_base.png".format(base_name, region_name))
                detail_path = os.path.join(
                    output_dir, "{}-flow_{}_detail.png".format(base_name, region_name))

                encode_flow_to_png(region_base, base_path, resolution)
                encode_detail_to_png(region_detail, detail_path, resolution)
                output_files.append(base_path)
                output_files.append(detail_path)
                print("[output] {} (base)".format(os.path.basename(base_path)))
                print("[output] {} (detail)".format(os.path.basename(detail_path)))

    print("[timing] Encoding: {:.2f}s".format(time.perf_counter() - t0))

    # ----------------------------------------------------------
    # Summary
    # ----------------------------------------------------------
    total_time = time.perf_counter() - pipeline_start
    print("")
    print("=" * 64)
    print("  Pipeline complete in {:.2f}s".format(total_time))
    print("  Generated {} flow texture files:".format(len(output_files)))
    for f in output_files:
        size_kb = os.path.getsize(f) / 1024.0
        print("    - {} ({:.1f} KB)".format(os.path.basename(f), size_kb))
    print("")
    print("  Encoding format:")
    print("    R = flow_x (128 = zero, >128 = rightward, <128 = leftward)")
    print("    G = flow_y (128 = zero, >128 = downward,  <128 = upward)")
    print("    B = 128 (unused)")
    print("")
    print("  Usage in GAME shader:")
    print("    sample(\"flow_full_base.png\", uv)")
    print("    flowmap(\"flow_water_base.png\", uv, time * 0.1)")
    print("=" * 64)


# ============================================================
# CLI
# ============================================================

if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Extract high-quality flow textures from video using RAFT optical flow',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python extract_flow.py input.mp4 -o ./output
  python extract_flow.py river.mov -o ./textures --masks-dir ./masks --resolution 1024
  python extract_flow.py campfire.mp4 -o ./fire --no-raft --resolution 256

Output files:
  {name}-flow_full_base.png     Full-image base flow (dominant persistent motion)
  {name}-flow_full_detail.png   Full-image detail flow (turbulence/variation)
  {name}-flow_{region}_base.png Per-region base flow (when --masks-dir given)
  {name}-flow_{region}_detail.png Per-region detail flow

Mask files (place in --masks-dir):
  mask_water.png      Water regions (river, ocean, lake)
  mask_sky.png        Sky/cloud regions
  mask_fire.png       Fire/flame regions
  mask_vegetation.png Trees, grass, foliage
  mask_smoke.png      Smoke regions
  mask_clouds.png     Cloud regions (separate from sky)
"""
    )
    parser.add_argument('video', help='Input video file (MP4, MOV, etc.)')
    parser.add_argument('-o', '--output-dir', required=True,
                        help='Output directory for flow textures')
    parser.add_argument('--masks-dir', default=None,
                        help='Directory containing mask_*.png region masks')
    parser.add_argument('--no-raft', action='store_true',
                        help='Use OpenCV Farneback instead of RAFT (no GPU needed)')
    parser.add_argument('--resolution', type=int, default=512,
                        help='Output flow texture resolution (default: 512)')
    parser.add_argument('--base-sigma', type=float, default=20.0,
                        help='Gaussian blur sigma for base flow (default: 20.0)')
    parser.add_argument('--detail-sigma', type=float, default=5.0,
                        help='Gaussian blur sigma for detail flow (default: 5.0)')

    args = parser.parse_args()

    if not os.path.exists(args.video):
        print("Error: video file not found: {}".format(args.video))
        sys.exit(1)

    if args.resolution < 32 or args.resolution > 4096:
        print("Error: resolution must be between 32 and 4096, got {}".format(args.resolution))
        sys.exit(1)

    if args.masks_dir and not os.path.isdir(args.masks_dir):
        print("Error: masks directory not found: {}".format(args.masks_dir))
        sys.exit(1)

    extract_flow_textures(
        video_path=args.video,
        output_dir=args.output_dir,
        masks_dir=args.masks_dir,
        use_raft=not args.no_raft,
        resolution=args.resolution,
        base_blur_sigma=args.base_sigma,
        detail_blur_sigma=args.detail_sigma,
    )
