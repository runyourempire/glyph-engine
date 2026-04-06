#!/usr/bin/env python3
"""
AI Video Generation for GAME Living Wallpapers
================================================
Generates a seamlessly looping video from a single photo using Wan 2.2
image-to-video via ComfyUI's HTTP API.

Pipeline:
  Photo -> ComfyUI (Wan 2.2 TI2V 5B) -> raw video -> seam validation ->
  Laplacian crossfade (if needed) -> AV1 + H.264 encode

Usage:
  python generate_video.py <photo.jpg> -o <output_dir> [--duration 3] [--prompt "..."]

Requirements:
  - ComfyUI running at localhost:8188 (preferred)
  - OR: diffusers + torch + Wan-AI/Wan2.2-T2V-5B (fallback)
  - ffmpeg with libsvtav1 and libx264 (for encoding)
  - Pillow, requests, numpy, opencv-python
"""

import argparse
import json
import os
import random
import shutil
import subprocess
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional, Tuple

try:
    import cv2
    import numpy as np
    from PIL import Image
except ImportError as exc:
    print("Missing dependency: {}".format(exc))
    print("Install: pip install opencv-python numpy Pillow")
    sys.exit(1)


# ============================================================
# CONSTANTS
# ============================================================

COMFYUI_BASE = "http://127.0.0.1:8188"
COMFYUI_PROMPT_URL = "{}/prompt".format(COMFYUI_BASE)
COMFYUI_HISTORY_URL = "{}/history".format(COMFYUI_BASE)
COMFYUI_UPLOAD_URL = "{}/upload/image".format(COMFYUI_BASE)
COMFYUI_VIEW_URL = "{}/view".format(COMFYUI_BASE)

POLL_INTERVAL_SEC = 3.0
MAX_POLL_TIME_SEC = 600  # 10 minutes max wait

DEFAULT_PROMPT = (
    "subtle natural motion, camera static, seamless loop, "
    "gentle movement, wind, flowing water, ambient life"
)

SEAM_THRESHOLD = 15.0  # Mean per-pixel difference threshold
CROSSFADE_FRAMES = 4   # Frames for Laplacian crossfade blend

# Duration to frame count mapping at 24 FPS
# Wan 2.2 generates in multiples of ~81 frames (3.375s at 24fps)
DURATION_FRAME_MAP = {
    3: 81,
    4: 97,
    5: 121,
}


# ============================================================
# COMFYUI API
# ============================================================

def check_comfyui() -> bool:
    """Check if ComfyUI is running at localhost:8188."""
    try:
        req = urllib.request.Request(COMFYUI_BASE, method="GET")
        urllib.request.urlopen(req, timeout=3)
        return True
    except (urllib.error.URLError, OSError):
        return False


def upload_image_to_comfyui(image_path: str) -> str:
    """
    Upload an image to ComfyUI's input directory via the upload API.
    Returns the filename as stored by ComfyUI.
    """
    filename = os.path.basename(image_path)

    # Build multipart form data manually (no requests dependency)
    boundary = "----PythonBoundary{}".format(random.randint(100000, 999999))
    body_parts = []

    # File field
    body_parts.append("--{}".format(boundary).encode())
    body_parts.append(
        'Content-Disposition: form-data; name="image"; filename="{}"'.format(
            filename
        ).encode()
    )
    body_parts.append(b"Content-Type: application/octet-stream")
    body_parts.append(b"")
    with open(image_path, "rb") as f:
        body_parts.append(f.read())

    # Overwrite field
    body_parts.append("--{}".format(boundary).encode())
    body_parts.append(
        b'Content-Disposition: form-data; name="overwrite"'
    )
    body_parts.append(b"")
    body_parts.append(b"true")

    body_parts.append("--{}--".format(boundary).encode())

    body = b"\r\n".join(body_parts)

    req = urllib.request.Request(
        COMFYUI_UPLOAD_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "multipart/form-data; boundary={}".format(boundary),
        },
    )

    resp = urllib.request.urlopen(req, timeout=30)
    result = json.loads(resp.read().decode())
    uploaded_name = result.get("name", filename)
    print("[comfyui] Uploaded: {}".format(uploaded_name))
    return uploaded_name


def build_workflow(
    image_name: str,
    motion_prompt: str,
    width: int,
    height: int,
    num_frames: int,
    seed: Optional[int] = None,
) -> dict:
    """
    Build the ComfyUI workflow JSON for Wan 2.2 TI2V (image-to-video).

    Nodes:
      1: LoadImage
      2: UNETLoader (Wan 2.2 TI2V 5B)
      3: CLIPLoader (UMT5-XXL)
      4: VAELoader (Wan 2.2 VAE)
      5: CLIPTextEncode
      6: WanImageToVideo
      7: VAEDecode
      8: SaveAnimatedWEBP (so we can retrieve the result)
    """
    if seed is None:
        seed = random.randint(0, 2**32 - 1)

    # Clamp dimensions to Wan 2.2 supported range (multiples of 16)
    width = max(256, (width // 16) * 16)
    height = max(256, (height // 16) * 16)

    # Cap at 832x480 for 5B model VRAM constraints
    if width > 832:
        scale = 832 / width
        width = 832
        height = max(256, (int(height * scale) // 16) * 16)
    if height > 480:
        scale = 480 / height
        height = 480
        width = max(256, (int(width * scale) // 16) * 16)

    workflow = {
        "1": {
            "class_type": "LoadImage",
            "inputs": {
                "image": image_name,
            },
        },
        "2": {
            "class_type": "UNETLoader",
            "inputs": {
                "unet_name": "wan2.2_ti2v_5B_fp16.safetensors",
                "weight_dtype": "default",
            },
        },
        "3": {
            "class_type": "CLIPLoader",
            "inputs": {
                "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors",
                "type": "wan",
            },
        },
        "4": {
            "class_type": "VAELoader",
            "inputs": {
                "vae_name": "wan2.2_vae.safetensors",
            },
        },
        "5": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": motion_prompt,
                "clip": ["3", 0],
            },
        },
        "50": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": "",
                "clip": ["3", 0],
            },
        },
        "6": {
            "class_type": "WanImageToVideo",
            "inputs": {
                "positive": ["5", 0],
                "negative": ["50", 0],
                "vae": ["4", 0],
                "width": width,
                "height": height,
                "length": num_frames,
                "batch_size": 1,
                "start_image": ["1", 0],
            },
        },
        "7": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["2", 0],
                "positive": ["6", 0],
                "negative": ["6", 1],
                "latent_image": ["6", 2],
                "seed": seed,
                "steps": 30,
                "cfg": 5.0,
                "sampler_name": "euler",
                "scheduler": "normal",
                "denoise": 1.0,
            },
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["7", 0],
                "vae": ["4", 0],
            },
        },
        "9": {
            "class_type": "SaveAnimatedWEBP",
            "inputs": {
                "images": ["8", 0],
                "filename_prefix": "wan_output",
                "fps": 24,
                "quality": 85,
                "method": "default",
                "lossless": False,
            },
        },
    }

    return workflow


def submit_prompt(workflow: dict) -> str:
    """Submit a workflow to ComfyUI and return the prompt_id."""
    payload = json.dumps({"prompt": workflow}).encode()

    req = urllib.request.Request(
        COMFYUI_PROMPT_URL,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json"},
    )

    resp = urllib.request.urlopen(req, timeout=30)
    result = json.loads(resp.read().decode())

    prompt_id = result.get("prompt_id")
    if not prompt_id:
        raise RuntimeError(
            "ComfyUI did not return a prompt_id. Response: {}".format(result)
        )

    print("[comfyui] Submitted prompt: {}".format(prompt_id))
    return prompt_id


def wait_for_completion(prompt_id: str) -> dict:
    """
    Poll ComfyUI history until the prompt is done.
    Returns the history entry for the completed prompt.
    """
    url = "{}/{}".format(COMFYUI_HISTORY_URL, prompt_id)
    start = time.time()

    while True:
        elapsed = time.time() - start
        if elapsed > MAX_POLL_TIME_SEC:
            raise TimeoutError(
                "ComfyUI prompt did not complete within {} seconds".format(
                    MAX_POLL_TIME_SEC
                )
            )

        try:
            req = urllib.request.Request(url, method="GET")
            resp = urllib.request.urlopen(req, timeout=10)
            history = json.loads(resp.read().decode())
        except (urllib.error.URLError, OSError):
            # ComfyUI might be busy, retry
            time.sleep(POLL_INTERVAL_SEC)
            continue

        if prompt_id in history:
            entry = history[prompt_id]
            status = entry.get("status", {})
            if status.get("completed", False):
                print("[comfyui] Generation complete ({:.0f}s)".format(elapsed))
                return entry
            if status.get("status_str") == "error":
                msgs = status.get("messages", [])
                raise RuntimeError(
                    "ComfyUI prompt failed: {}".format(msgs)
                )

        mins = int(elapsed) // 60
        secs = int(elapsed) % 60
        print(
            "[comfyui] Waiting... {}m{}s elapsed".format(mins, secs),
            end="\r",
        )
        time.sleep(POLL_INTERVAL_SEC)


def download_output(history_entry: dict, output_dir: str) -> str:
    """
    Download the generated output from ComfyUI.
    Returns path to the downloaded file.
    """
    outputs = history_entry.get("outputs", {})

    # Find the SaveAnimatedWEBP node output (node "8")
    for node_id, node_output in outputs.items():
        images = node_output.get("images", [])
        if not images:
            # Also check "gifs" key (some ComfyUI versions)
            images = node_output.get("gifs", [])
        if images:
            img_info = images[0]
            filename = img_info["filename"]
            subfolder = img_info.get("subfolder", "")
            file_type = img_info.get("type", "output")

            # Build download URL
            params = "filename={}&subfolder={}&type={}".format(
                filename, subfolder, file_type
            )
            url = "{}?{}".format(COMFYUI_VIEW_URL, params)

            req = urllib.request.Request(url, method="GET")
            resp = urllib.request.urlopen(req, timeout=60)
            data = resp.read()

            out_path = os.path.join(output_dir, filename)
            with open(out_path, "wb") as f:
                f.write(data)

            size_mb = len(data) / (1024 * 1024)
            print("[comfyui] Downloaded: {} ({:.1f} MB)".format(out_path, size_mb))
            return out_path

    raise RuntimeError(
        "No output images found in ComfyUI history. "
        "Outputs: {}".format(json.dumps(outputs, indent=2))
    )


# ============================================================
# DIFFUSERS FALLBACK
# ============================================================

def run_diffusers_fallback(
    image_path: str,
    motion_prompt: str,
    num_frames: int,
    output_dir: str,
) -> str:
    """
    Fallback: run Wan 2.2 directly via diffusers if ComfyUI is not available.
    Returns path to the generated video file.
    """
    try:
        import torch
        from diffusers import WanPipeline
        from diffusers.utils import export_to_video
    except ImportError:
        print("[fallback] diffusers not installed.")
        print("Install: pip install diffusers torch transformers accelerate")
        sys.exit(1)

    print("[fallback] Loading Wan 2.2 pipeline via diffusers...")
    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    device = "cuda" if torch.cuda.is_available() else "cpu"

    pipe = WanPipeline.from_pretrained(
        "Wan-AI/Wan2.2-T2V-5B",
        torch_dtype=dtype,
    )
    pipe.to(device)

    if device == "cuda":
        pipe.enable_model_cpu_offload()

    print("[fallback] Running inference ({} frames)...".format(num_frames))
    input_image = Image.open(image_path).convert("RGB")

    start = time.time()
    output = pipe(
        prompt=motion_prompt,
        image=input_image,
        num_frames=num_frames,
        guidance_scale=5.0,
        num_inference_steps=30,
    )
    elapsed = time.time() - start
    print("[fallback] Inference complete ({:.1f}s)".format(elapsed))

    # Export frames to video
    out_path = os.path.join(output_dir, "wan_raw.mp4")
    export_to_video(output.frames[0], out_path, fps=24)
    print("[fallback] Saved raw video: {}".format(out_path))
    return out_path


# ============================================================
# SEAM VALIDATION & CROSSFADE
# ============================================================

def load_video_frames(video_path: str) -> Tuple[np.ndarray, float]:
    """
    Load all frames from a video file.
    Returns (frames array [N, H, W, 3], fps).
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("Cannot open video: {}".format(video_path))

    fps = cap.get(cv2.CAP_PROP_FPS)
    frames = []

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        # Convert BGR to RGB
        frames.append(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))

    cap.release()

    if not frames:
        raise ValueError("Video has no frames: {}".format(video_path))

    return np.array(frames, dtype=np.uint8), fps


def compute_seam_score(frames: np.ndarray) -> float:
    """
    Compute mean per-pixel absolute difference between first and last frame.
    Lower = more seamless loop.
    """
    first = frames[0].astype(np.float32)
    last = frames[-1].astype(np.float32)
    diff = np.abs(first - last)
    return float(np.mean(diff))


def laplacian_crossfade(frames: np.ndarray, blend_frames: int = 4) -> np.ndarray:
    """
    Apply Laplacian-pyramid crossfade between last and first frames
    to create a seamless loop transition.

    Uses multi-scale blending to avoid ghosting artifacts that simple
    alpha crossfade produces.
    """
    n = len(frames)
    if blend_frames < 2 or n < blend_frames * 2:
        return frames

    result = frames.copy()

    for i in range(blend_frames):
        # Alpha ramps from 0 (fully original) to 1 (fully looped)
        alpha = (i + 1) / (blend_frames + 1)

        # Blend tail: mix frame[n-blend+i] toward frame[0]
        tail_idx = n - blend_frames + i
        tail_frame = frames[tail_idx].astype(np.float32)
        first_frame = frames[0].astype(np.float32)

        # Build Laplacian pyramids for multi-scale blend
        blended = _laplacian_blend(tail_frame, first_frame, alpha)
        result[tail_idx] = np.clip(blended, 0, 255).astype(np.uint8)

        # Blend head: mix frame[i] toward frame[n-1]
        if i < blend_frames - 1:
            head_idx = i
            head_frame = frames[head_idx].astype(np.float32)
            last_frame = frames[-1].astype(np.float32)
            head_alpha = 1.0 - alpha

            blended = _laplacian_blend(head_frame, last_frame, head_alpha)
            result[head_idx] = np.clip(blended, 0, 255).astype(np.uint8)

    return result


def _laplacian_blend(
    img_a: np.ndarray, img_b: np.ndarray, alpha: float, levels: int = 3
) -> np.ndarray:
    """
    Blend two images using Laplacian pyramid for smooth multi-scale transition.
    """
    # For small images or few levels, fall back to linear blend
    h, w = img_a.shape[:2]
    if h < 16 or w < 16 or levels < 1:
        return img_a * (1.0 - alpha) + img_b * alpha

    # Build Gaussian pyramids
    ga = [img_a.astype(np.float32)]
    gb = [img_b.astype(np.float32)]

    for _ in range(levels):
        ga.append(cv2.pyrDown(ga[-1]))
        gb.append(cv2.pyrDown(gb[-1]))

    # Build Laplacian pyramids
    la = []
    lb = []
    for i in range(levels):
        expanded_a = cv2.pyrUp(ga[i + 1], dstsize=(ga[i].shape[1], ga[i].shape[0]))
        expanded_b = cv2.pyrUp(gb[i + 1], dstsize=(gb[i].shape[1], gb[i].shape[0]))
        la.append(ga[i] - expanded_a)
        lb.append(gb[i] - expanded_b)

    # Top of pyramid
    la.append(ga[levels])
    lb.append(gb[levels])

    # Blend at each level
    blended_pyramid = []
    for lap_a, lap_b in zip(la, lb):
        blended_pyramid.append(lap_a * (1.0 - alpha) + lap_b * alpha)

    # Reconstruct from blended pyramid
    result = blended_pyramid[-1]
    for i in range(levels - 1, -1, -1):
        result = cv2.pyrUp(result, dstsize=(blended_pyramid[i].shape[1], blended_pyramid[i].shape[0]))
        result = result + blended_pyramid[i]

    return result


def save_frames_to_video(
    frames: np.ndarray, output_path: str, fps: float
) -> None:
    """Save frames array to an uncompressed video for further encoding."""
    h, w = frames.shape[1], frames.shape[2]

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    for frame in frames:
        # Convert RGB back to BGR for OpenCV
        bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        writer.write(bgr)

    writer.release()


# ============================================================
# FFMPEG ENCODING
# ============================================================

def check_ffmpeg() -> bool:
    """Check if ffmpeg is available."""
    return shutil.which("ffmpeg") is not None


def encode_av1(input_path: str, output_path: str) -> bool:
    """
    Encode video to AV1 using SVT-AV1 via ffmpeg.
    Returns True if encoding succeeded.
    """
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-c:v", "libsvtav1",
        "-crf", "38",
        "-preset", "6",
        "-pix_fmt", "yuv420p",
        "-an",  # No audio
        output_path,
    ]

    print("[encode] AV1: {}".format(" ".join(cmd)))

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
        )
        if result.returncode != 0:
            print("[encode] AV1 failed (exit {}): {}".format(
                result.returncode, result.stderr[-500:]
            ))
            return False
        return True
    except FileNotFoundError:
        print("[encode] ffmpeg not found in PATH")
        return False
    except subprocess.TimeoutExpired:
        print("[encode] AV1 encoding timed out (>300s)")
        return False


def encode_h264(input_path: str, output_path: str) -> bool:
    """
    Encode video to H.264 via ffmpeg (universal fallback format).
    Returns True if encoding succeeded.
    """
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-c:v", "libx264",
        "-crf", "28",
        "-pix_fmt", "yuv420p",
        "-an",  # No audio
        output_path,
    ]

    print("[encode] H.264: {}".format(" ".join(cmd)))

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,
        )
        if result.returncode != 0:
            print("[encode] H.264 failed (exit {}): {}".format(
                result.returncode, result.stderr[-500:]
            ))
            return False
        return True
    except FileNotFoundError:
        print("[encode] ffmpeg not found in PATH")
        return False
    except subprocess.TimeoutExpired:
        print("[encode] H.264 encoding timed out (>300s)")
        return False


# ============================================================
# MAIN PIPELINE
# ============================================================

def generate_video(
    photo_path: str,
    output_dir: str,
    duration: int = 3,
    motion_prompt: Optional[str] = None,
) -> dict:
    """
    Full pipeline: photo -> AI video -> seam fix -> encode.
    Returns dict with output file paths and metadata.
    """
    start_time = time.time()

    # Validate input
    if not os.path.isfile(photo_path):
        raise FileNotFoundError("Photo not found: {}".format(photo_path))

    os.makedirs(output_dir, exist_ok=True)

    base_name = Path(photo_path).stem
    prompt = motion_prompt or DEFAULT_PROMPT

    # Load photo dimensions
    img = Image.open(photo_path)
    orig_w, orig_h = img.size
    print("[video] Input: {} ({}x{})".format(photo_path, orig_w, orig_h))
    print("[video] Prompt: {}".format(prompt))

    # Calculate frame count from duration
    num_frames = DURATION_FRAME_MAP.get(duration, 81)
    print("[video] Duration: {}s ({} frames at 24fps)".format(duration, num_frames))

    # -- Step 1: Generate raw video --------------------------------
    print("\n=== Step 1/4: AI Video Generation ===")

    raw_video_path = None

    if check_comfyui():
        print("[video] ComfyUI detected at {}".format(COMFYUI_BASE))

        # Upload source image
        uploaded_name = upload_image_to_comfyui(photo_path)

        # Build and submit workflow
        workflow = build_workflow(
            image_name=uploaded_name,
            motion_prompt=prompt,
            width=orig_w,
            height=orig_h,
            num_frames=num_frames,
        )

        prompt_id = submit_prompt(workflow)

        # Wait for generation
        history_entry = wait_for_completion(prompt_id)

        # Download result
        raw_video_path = download_output(history_entry, output_dir)
    else:
        print("[video] ComfyUI not running at {}".format(COMFYUI_BASE))
        print("[video] Falling back to diffusers direct inference...")
        raw_video_path = run_diffusers_fallback(
            photo_path, prompt, num_frames, output_dir
        )

    gen_elapsed = time.time() - start_time
    print("[video] Generation time: {:.1f}s".format(gen_elapsed))

    # -- Step 2: Seam validation ------------------------------------
    print("\n=== Step 2/4: Seam Validation ===")

    frames, fps = load_video_frames(raw_video_path)
    frame_count = len(frames)
    frame_h, frame_w = frames.shape[1], frames.shape[2]
    actual_duration = frame_count / fps if fps > 0 else 0

    print("[seam] Frames: {} at {:.1f}fps ({:.1f}s)".format(
        frame_count, fps, actual_duration
    ))

    seam_score = compute_seam_score(frames)
    print("[seam] Seam score: {:.1f} (threshold: {:.1f})".format(
        seam_score, SEAM_THRESHOLD
    ))

    crossfaded = False
    if seam_score > SEAM_THRESHOLD:
        print("[seam] Seam detected, applying {}-frame Laplacian crossfade...".format(
            CROSSFADE_FRAMES
        ))
        frames = laplacian_crossfade(frames, CROSSFADE_FRAMES)
        new_score = compute_seam_score(frames)
        print("[seam] Post-crossfade score: {:.1f}".format(new_score))
        crossfaded = True
    else:
        print("[seam] Loop is seamless, no crossfade needed")

    # -- Step 3: Save intermediate (if crossfaded) -----------------
    print("\n=== Step 3/4: Intermediate Save ===")

    intermediate_path = os.path.join(output_dir, "{}-raw-loop.mp4".format(base_name))
    if crossfaded:
        save_frames_to_video(frames, intermediate_path, fps)
        print("[video] Saved crossfaded intermediate: {}".format(intermediate_path))
    else:
        # Use the raw video directly
        intermediate_path = raw_video_path
        print("[video] Using raw video as intermediate (no crossfade needed)")

    # -- Step 4: Final encoding -------------------------------------
    print("\n=== Step 4/4: Final Encoding ===")

    results = {
        "base_name": base_name,
        "photo_path": photo_path,
        "resolution": "{}x{}".format(frame_w, frame_h),
        "frame_count": frame_count,
        "fps": fps,
        "duration_sec": actual_duration,
        "seam_score": seam_score,
        "crossfaded": crossfaded,
    }

    if not check_ffmpeg():
        print("[encode] WARNING: ffmpeg not found in PATH")
        print("[encode] Skipping AV1/H.264 encoding")
        print("[encode] Raw video available at: {}".format(intermediate_path))
        results["raw_path"] = intermediate_path
    else:
        # AV1 (primary -- best quality/size for web)
        av1_path = os.path.join(output_dir, "{}-loop.webm".format(base_name))
        if encode_av1(intermediate_path, av1_path):
            av1_size = os.path.getsize(av1_path)
            results["av1_path"] = av1_path
            results["av1_size_bytes"] = av1_size
            print("[encode] AV1: {} ({:.1f} KB)".format(
                av1_path, av1_size / 1024
            ))
        else:
            print("[encode] AV1 encoding failed, skipping")

        # H.264 (fallback -- universal browser support)
        h264_path = os.path.join(output_dir, "{}-loop.mp4".format(base_name))
        if encode_h264(intermediate_path, h264_path):
            h264_size = os.path.getsize(h264_path)
            results["h264_path"] = h264_path
            results["h264_size_bytes"] = h264_size
            print("[encode] H.264: {} ({:.1f} KB)".format(
                h264_path, h264_size / 1024
            ))
        else:
            print("[encode] H.264 encoding failed, skipping")

    # -- Summary --------------------------------------------------
    total_elapsed = time.time() - start_time

    print("\n========================================")
    print("  AI Video Generation Complete")
    print("========================================")
    print("  Photo:       {}".format(photo_path))
    print("  Resolution:  {}x{}".format(frame_w, frame_h))
    print("  Duration:    {:.1f}s ({} frames at {:.0f}fps)".format(
        actual_duration, frame_count, fps
    ))
    print("  Seam score:  {:.1f} (crossfade: {})".format(
        seam_score, "applied" if crossfaded else "not needed"
    ))

    if "av1_path" in results:
        print("  AV1 output:  {} ({:.1f} KB)".format(
            results["av1_path"], results["av1_size_bytes"] / 1024
        ))
    if "h264_path" in results:
        print("  H.264 output: {} ({:.1f} KB)".format(
            results["h264_path"], results["h264_size_bytes"] / 1024
        ))

    print("  Total time:  {:.1f}s".format(total_elapsed))

    results["total_time_sec"] = total_elapsed
    return results


# ============================================================
# CLI ENTRY POINT
# ============================================================

def main():
    parser = argparse.ArgumentParser(
        description="Generate seamlessly looping video from a photo using Wan 2.2",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python generate_video.py landscape.jpg -o ./output\n"
            "  python generate_video.py beach.png -o ./output --duration 5\n"
            "  python generate_video.py photo.jpg -o ./output --prompt \"ocean waves\"\n"
            "\n"
            "Requirements:\n"
            "  ComfyUI at localhost:8188 (preferred), OR diffusers + torch\n"
            "  ffmpeg with libsvtav1 and libx264 for final encoding"
        ),
    )

    parser.add_argument(
        "photo",
        help="Path to input photo (JPEG, PNG, or WebP)",
    )
    parser.add_argument(
        "-o", "--output",
        required=True,
        help="Output directory for generated video files",
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=3,
        choices=[3, 4, 5],
        help="Video duration in seconds (default: 3)",
    )
    parser.add_argument(
        "--prompt",
        type=str,
        default=None,
        help="Motion prompt for video generation (default: subtle natural motion)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Random seed for reproducible generation",
    )

    args = parser.parse_args()

    # Validate input
    if not os.path.isfile(args.photo):
        print("Error: Photo not found: {}".format(args.photo))
        sys.exit(1)

    # Set seed if provided
    if args.seed is not None:
        random.seed(args.seed)

    try:
        results = generate_video(
            photo_path=args.photo,
            output_dir=args.output,
            duration=args.duration,
            motion_prompt=args.prompt,
        )

        # Write results metadata
        meta_path = os.path.join(args.output, "{}-video-meta.json".format(
            results["base_name"]
        ))
        with open(meta_path, "w") as f:
            json.dump(results, f, indent=2)
        print("\nMetadata: {}".format(meta_path))

    except KeyboardInterrupt:
        print("\nAborted by user")
        sys.exit(130)
    except Exception as exc:
        print("\nVideo generation failed: {}".format(exc))
        sys.exit(1)


if __name__ == "__main__":
    main()
