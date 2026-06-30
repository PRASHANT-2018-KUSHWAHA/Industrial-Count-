#!/usr/bin/env python3
"""
Bühler Computer Vision Element Counter
Uses OpenCV HoughCircles for accurate circular industrial item detection.

Modes:
  reference  - Analyzes a single image without a profile; extracts circle params.
  calibrated - Receives a merged training profile; uses learned radius/params.
  train      - Accepts a list of images; returns a merged profile (called by server).
"""

import sys
import json
import base64
import math
import statistics
import traceback


# ---------------------------------------------------------------------------
# Image loading
# ---------------------------------------------------------------------------

def decode_image(base64_data):
    """Decode base64 → OpenCV BGR image (full resolution)."""
    import cv2
    import numpy as np

    b64 = base64_data
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    img_bytes = base64.b64decode(b64)
    nparr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return img


# ---------------------------------------------------------------------------
# Core OpenCV circle detector
# ---------------------------------------------------------------------------

def dedupe_circles(circles):
    """Remove near-duplicate circles returned by Hough transform."""
    if not circles:
        return []

    circles_sorted = sorted(circles, key=lambda c: c[2], reverse=True)
    kept = []
    for c in circles_sorted:
        cx, cy, r = c
        overlap = False
        for kx, ky, kr in kept:
            d = math.hypot(cx - kx, cy - ky)
            if d < max(4.0, min(r, kr) * 0.75):
                overlap = True
                break
        if not overlap:
            kept.append(c)
    return kept


def score_candidate(circles, profile):
    """Lower score is better. Uses profile count/radius when available."""
    if not circles:
        return 1e9

    radii = [c[2] for c in circles]
    mean_r = sum(radii) / len(radii)
    std_r = statistics.pstdev(radii) if len(radii) > 1 else mean_r * 0.1
    count = len(circles)

    # Uncalibrated mode: prefer stable sets with moderate spread.
    if not profile:
        return (std_r / max(mean_r, 1.0)) + (0.001 * count)

    target_r = max(1.0, float(profile.get("mean_radius", mean_r)))
    target_count = int(profile.get("item_count", count))
    radius_err = abs(mean_r - target_r) / target_r
    count_err = abs(count - target_count) / max(target_count, 1)
    spread_penalty = std_r / max(mean_r, 1.0)

    return (1.35 * count_err) + (1.10 * radius_err) + (0.35 * spread_penalty)


def detect_circles(img, profile=None):
    """
    Run HoughCircles on img.
    If profile is given, use its radius/dist params for precision.
    Returns (markers, detected_profile) where markers = [{x,y}, ...] in %.
    """
    import cv2
    import numpy as np

    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Preprocessing: blur reduces noise; CLAHE improves low-contrast images
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    blurred = cv2.GaussianBlur(enhanced, (9, 9), 2)

    # Determine radius range
    if profile and "min_radius" in profile:
        # Keep profile constraints but allow tolerance for camera distance/zoom drift.
        mean_r = max(3, int(profile.get("mean_radius", profile["min_radius"])))
        min_r = max(3, int(mean_r * 0.60), int(profile["min_radius"] * 0.80))
        max_r = max(min_r + 6, int(mean_r * 1.60), int(profile["max_radius"] * 1.20))
        min_dist = max(8, profile.get("min_dist", int(mean_r * 1.6)))
    else:
        # Adaptive defaults: items typically 1.5–12% of shortest image side
        short = min(w, h)
        min_r = max(5, int(short * 0.015))
        max_r = max(min_r + 8, int(short * 0.12))
        min_dist = max(min_r * 2, 15)

    # Evaluate several parameter combinations and choose best-scoring set.
    param2_values = [32, 28, 24, 20, 16, 12] if profile is None else [
        int(profile.get("param2", 24)), 28, 24, 20, 16
    ]
    dp_values = [1.1, 1.2, 1.35]

    best_circles = None
    best_score = 1e9
    used_p2 = 24

    for dp in dp_values:
        for p2 in param2_values:
            circles = cv2.HoughCircles(
                blurred,
                cv2.HOUGH_GRADIENT,
                dp=dp,
                minDist=min_dist,
                param1=60,
                param2=p2,
                minRadius=min_r,
                maxRadius=max_r,
            )

            if circles is None or len(circles[0]) < 1:
                continue

            raw = [(float(c[0]), float(c[1]), float(c[2])) for c in circles[0]]
            deduped = dedupe_circles(raw)
            score = score_candidate(deduped, profile)

            if score < best_score:
                best_score = score
                best_circles = deduped
                used_p2 = p2

    if not best_circles:
        return [], None

    circles_arr = np.round(np.array(best_circles)).astype(int)

    markers = []
    radii = []
    for (cx, cy, r) in circles_arr:
        px = round(max(1.0, min(99.0, (cx / w) * 100)), 2)
        py = round(max(1.0, min(99.0, (cy / h) * 100)), 2)
        markers.append({"x": px, "y": py})
        radii.append(int(r))

    # Build profile from this detection
    out_profile = None
    if radii:
        mean_r = sum(radii) / len(radii)
        std_r = (math.sqrt(sum((r - mean_r) ** 2 for r in radii) / len(radii))
                 if len(radii) > 1 else mean_r * 0.15)
        out_profile = {
            "mean_radius": round(mean_r, 2),
            "std_radius": round(std_r, 2),
            "min_radius": max(3, int(mean_r - 2.0 * std_r)),
            "max_radius": int(mean_r + 2.0 * std_r) + 2,
            "min_dist": max(10, int((mean_r - std_r) * 1.8)),
            "param2": used_p2,
            "item_count": len(radii),
            "mean_circularity": 0.85,
        }

    return markers, out_profile


# ---------------------------------------------------------------------------
# Merge multiple profiles (for multi-image training)
# ---------------------------------------------------------------------------

def merge_profiles(profiles):
    """Average a list of per-image profiles into one robust profile."""
    if not profiles:
        return None
    if len(profiles) == 1:
        return profiles[0]

    def med(key, default=0):
        vals = [p[key] for p in profiles if key in p]
        if not vals:
            return default
        return round(float(statistics.median(vals)), 2)

    mean_r = med("mean_radius", 20)
    std_r  = med("std_radius", mean_r * 0.15)
    item_count = int(round(statistics.median([p.get("item_count", 0) for p in profiles])))

    return {
        "mean_radius":    mean_r,
        "std_radius":     round(std_r, 2),
        "min_radius":     max(3, int(mean_r - 2.0 * std_r)),
        "max_radius":     int(mean_r + 2.0 * std_r) + 2,
        "min_dist":       max(10, int((mean_r - std_r) * 1.8)),
        "param2":         int(med("param2", 24)),
        "item_count":     max(0, item_count),
        "mean_circularity": 0.85,
        "training_images": len(profiles),
    }


# ---------------------------------------------------------------------------
# Fallback (PIL-based CCL) for when OpenCV is somehow unavailable
# ---------------------------------------------------------------------------

def ccl_fallback(base64_data, sku, expected_count):
    """Simple CCL counting when OpenCV fails."""
    try:
        from PIL import Image
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "pillow"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        from PIL import Image
    import io

    b64 = base64_data
    if "," in b64:
        b64 = b64.split(",", 1)[1]
    img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("L")
    img = img.resize((120, 90))
    pixels = list(img.getdata())
    mean_v = sum(pixels) / len(pixels)
    threshold = mean_v
    binary = [1 if p < threshold else 0 for p in pixels]
    w, h = 120, 90
    visited = bytearray(len(binary))
    markers = []
    for sy in range(h):
        for sx in range(w):
            idx = sy * w + sx
            if binary[idx] != 1 or visited[idx]:
                continue
            queue = [idx]; visited[idx] = 1; blob = []; head = 0
            while head < len(queue):
                cur = queue[head]; head += 1
                cx = cur % w; cy = cur // w; blob.append((cx, cy))
                for dx, dy in ((-1,0),(1,0),(0,-1),(0,1)):
                    nx, ny = cx+dx, cy+dy
                    if 0 <= nx < w and 0 <= ny < h:
                        nidx = ny*w+nx
                        if binary[nidx] and not visited[nidx]:
                            visited[nidx]=1; queue.append(nidx)
            if 3 <= len(blob) <= 500:
                cx_avg = sum(p[0] for p in blob)/len(blob)
                cy_avg = sum(p[1] for p in blob)/len(blob)
                markers.append({"x": round(cx_avg/w*100,2), "y": round(cy_avg/h*100,2)})
    return markers


# ---------------------------------------------------------------------------
# Main analysis entry point (single image)
# ---------------------------------------------------------------------------

def analyze_image_stream(base64_data, sku, expected_count,
                         is_simulator=False, simulated_markers=None,
                         reference_profile=None):
    if is_simulator and simulated_markers is not None:
        return {
            "count": len(simulated_markers),
            "markers": simulated_markers,
            "message": f"Simulator: {len(simulated_markers)} items.",
            "engine": "Simulator",
        }

    try:
        import cv2
        img = decode_image(base64_data)
        if img is None:
            raise ValueError("Image decode returned None")

        markers, profile = detect_circles(img, reference_profile)

        if not markers:
            # Try without profile (ignore radius constraints)
            markers, profile = detect_circles(img, None)

        if not markers:
            # Last resort: CCL
            markers = ccl_fallback(base64_data, sku, expected_count)
            engine = "Python-CCL-Fallback"
            mode = "fallback (no circles detected)"
            profile = None
        else:
            engine = "Python-CV-Calibrated" if reference_profile else "Python-CV-Reference"
            mode = "calibrated" if reference_profile else "reference"

        count = len(markers)
        result = {
            "count": count,
            "markers": markers,
            "message": f"Detected {count} items [{mode}] for SKU '{sku}'.",
            "engine": engine,
        }
        if profile:
            result["profile"] = profile
        return result

    except Exception as exc:
        traceback.print_exc(file=sys.stderr)
        return {
            "count": 0,
            "markers": [],
            "message": f"Error: {exc}",
            "engine": "Error",
            "error": str(exc),
        }


# ---------------------------------------------------------------------------
# Multi-image training entry point
# ---------------------------------------------------------------------------

def train_from_images(images, sku, expected_count):
    """
    Analyze a list of base64 images and return a merged profile.
    Called from server /api/train/:sku endpoint.
    """
    try:
        import cv2
    except ImportError:
        return {"error": "OpenCV not available for training"}

    profiles = []
    all_markers = []
    errors = []

    for i, b64 in enumerate(images):
        try:
            img = decode_image(b64)
            if img is None:
                errors.append(f"Image {i+1}: decode failed")
                continue
            markers, profile = detect_circles(img, None)
            if not markers:
                errors.append(f"Image {i+1}: no circles detected")
                continue
            profiles.append(profile)
            all_markers = markers  # keep last for thumbnail display
        except Exception as e:
            errors.append(f"Image {i+1}: {e}")

    if not profiles:
        return {
            "error": "No circles detected in any training image",
            "details": errors,
        }

    merged = merge_profiles(profiles)
    avg_count = int(round(sum(p["item_count"] for p in profiles) / len(profiles)))

    return {
        "profile": merged,
        "count": avg_count,
        "markers": all_markers,
        "trained_on": len(profiles),
        "errors": errors,
        "message": f"Trained on {len(profiles)}/{len(images)} images. Avg count: {avg_count}.",
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            print(json.dumps({"error": "Empty input"}))
            return

        payload = json.loads(raw)
        mode = payload.get("mode", "analyze")

        if mode == "train":
            images = payload.get("images", [])
            sku = payload.get("sku", "SKU-UNKNOWN")
            expected = int(payload.get("expected", 30))
            result = train_from_images(images, sku, expected)
            print(json.dumps(result))
            return

        # Default: single image analysis
        image_b64 = payload.get("image", "")
        sku = payload.get("sku", "SKU-UNKNOWN")
        expected = int(payload.get("expected", 30))
        is_simulator = payload.get("isSimulator", False)
        simulated_markers = payload.get("simulatedMarkers", None)
        reference_profile = payload.get("referenceProfile", None)

        if not image_b64:
            print(json.dumps({"error": "No image data"}))
            return

        result = analyze_image_stream(
            image_b64, sku, expected,
            is_simulator, simulated_markers, reference_profile
        )
        print(json.dumps(result))

    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"JSON parse error: {e}"}))
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": f"Unhandled error: {e}"}))


if __name__ == "__main__":
    main()
