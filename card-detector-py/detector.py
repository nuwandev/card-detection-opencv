"""
Detector module — direct Python/OpenCV port of detector.ts + geometry.ts.

Scoring model (lower is better):
  score = 0.3 * ratio_score + 0.2 * texture_score - 0.6 * edge_score

  ratio_score   : 0 = perfect ID aspect ratio, 1 = at tolerance limit (±0.3)
  texture_score : 0 = flat/uniform region,     1 = high noise  (stddev sum > 100)
  edge_score    : 0 = no edge support,          1 = high density (>0.5 px/perimeter px)

Confidence gate: accept only if the best candidate is strong enough and is
                 separated from close alternatives.
"""

import math
import numpy as np
import cv2
from typing import Optional

# --- constants (mirrored from detector.ts) ---
ID_ASPECT_RATIO = 1.58
MIN_AREA_RATIO  = 0.05
MAX_AREA_RATIO  = 0.95
CONFIDENCE_GAP  = 0.08
QUALITY_FLOOR   = 0.24
MAX_PROCESS_SIDE = 1400


# ---------------------------------------------------------------------------
# geometry.ts equivalents
# ---------------------------------------------------------------------------

def order_corners(pts: np.ndarray) -> np.ndarray:
    """
    Sort 4 points into [TL, TR, BR, BL] order.
    Mirrors orderCorners() in geometry.ts.
    """
    pts = pts.reshape(4, 2).astype(float)
    sorted_y = pts[np.argsort(pts[:, 1])]   # sort by y
    top    = sorted_y[:2][np.argsort(sorted_y[:2, 0])]   # left→right
    bottom = sorted_y[2:][np.argsort(sorted_y[2:, 0])]   # left→right
    return np.array([top[0], top[1], bottom[1], bottom[0]])  # TL TR BR BL


# ---------------------------------------------------------------------------
# evaluateCandidate() — geometry.ts
# ---------------------------------------------------------------------------

def _evaluate_candidate(src: np.ndarray, edges: np.ndarray,
                         pts: np.ndarray, ratio: float, peri: float) -> float:
    """
    Normalised scoring function.  Mirrors evaluateCandidate() in detector.ts.
    """
    h, w = src.shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.fillPoly(mask, [pts.astype(np.int32)], 255)

    # colour consistency — stddev across channels inside the quad
    if src.ndim == 3:
        color_consistency = sum(
            float(cv2.meanStdDev(src[:, :, c], mask=mask)[1][0, 0])
            for c in range(min(src.shape[2], 3))
        )
    else:
        color_consistency = float(cv2.meanStdDev(src, mask=mask)[1][0, 0])

    # edge support — non-zero edge pixels inside the quad
    edge_masked  = cv2.bitwise_and(edges, mask)
    edge_support = int(np.count_nonzero(edge_masked))

    # --- normalised scores (0–1) ---
    ratio_score   = min(abs(ratio - ID_ASPECT_RATIO) / 0.3, 1.0)
    texture_score = min(color_consistency / 100.0, 1.0)
    edge_density  = edge_support / peri if peri > 0 else 0.0
    edge_score    = min(edge_density / 0.5, 1.0)

    return 0.38 * ratio_score + 0.12 * texture_score - 0.70 * edge_score


def _candidate_from_points(pts: np.ndarray) -> tuple[np.ndarray, float] | None:
    """
    Convert a 4-point contour/box into an ordered ID-card candidate.
    """
    pts = pts.reshape(4, 2).astype(float)
    ordered = order_corners(pts)

    width_top = math.hypot(*(ordered[1] - ordered[0]))
    width_bottom = math.hypot(*(ordered[2] - ordered[3]))
    height_right = math.hypot(*(ordered[2] - ordered[1]))
    height_left = math.hypot(*(ordered[3] - ordered[0]))

    width = max(width_top, width_bottom)
    height = max(height_right, height_left)
    if width <= 0 or height <= 0:
        return None

    ratio = max(width, height) / min(width, height)
    if abs(ratio - ID_ASPECT_RATIO) >= 0.42:
        return None

    return ordered, ratio


def _edge_maps(src_bgr: np.ndarray) -> list[np.ndarray]:
    """
    Build several edge maps. Phone photos vary more than webcam frames: glare,
    shadows, high resolution, and fingers on the card edge can each break a
    single Canny pass.
    """
    gray = cv2.cvtColor(src_bgr, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    enhanced_blur = cv2.GaussianBlur(enhanced, (5, 5), 0)

    maps = [
        cv2.Canny(blurred, 20, 100),
        cv2.Canny(blurred, 40, 140),
        cv2.Canny(enhanced_blur, 25, 110),
    ]

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    return [cv2.morphologyEx(edge, cv2.MORPH_CLOSE, kernel, iterations=1)
            for edge in maps]


def _light_region_edges(src_bgr: np.ndarray) -> np.ndarray:
    """
    Segment pale document-like areas. This catches Sri Lankan NIC photos where
    the pastel border is weak in grayscale but still forms a light rectangle
    against skin, laptop, or desk regions.
    """
    hsv = cv2.cvtColor(src_bgr, cv2.COLOR_BGR2HSV)
    h, s, v = cv2.split(hsv)
    mask = cv2.inRange(hsv, np.array([0, 0, 105]), np.array([179, 135, 255]))

    # Keep local contrast from text/photo while suppressing tiny holes.
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    return cv2.Canny(mask, 20, 80)


def _detect_at_scale(src_bgr: np.ndarray) -> Optional[np.ndarray]:
    h, w = src_bgr.shape[:2]
    min_area = w * h * MIN_AREA_RATIO
    max_area = w * h * MAX_AREA_RATIO

    best_quad = None
    best_score = math.inf
    second_best = math.inf

    edge_maps = _edge_maps(src_bgr)
    edge_maps.append(_light_region_edges(src_bgr))
    scoring_edges = cv2.bitwise_or(edge_maps[0], edge_maps[2])

    seen = set()
    for edges in edge_maps:
        contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < min_area or area > max_area:
                continue

            peri = cv2.arcLength(cnt, True)
            if peri <= 0:
                continue

            approx = cv2.approxPolyDP(cnt, 0.025 * peri, True)
            point_sets = []
            if len(approx) == 4:
                point_sets.append(approx.reshape(4, 2))

            if 4 <= len(approx) <= 10:
                box = cv2.boxPoints(cv2.minAreaRect(cnt))
                point_sets.append(box)

            for pts in point_sets:
                candidate = _candidate_from_points(np.asarray(pts))
                if candidate is None:
                    continue

                ordered, ratio = candidate
                candidate_area = abs(cv2.contourArea(ordered.astype(np.float32)))
                if candidate_area < min_area or candidate_area > max_area:
                    continue

                key = tuple(np.round(ordered.reshape(-1) / 8).astype(int))
                if key in seen:
                    continue
                seen.add(key)

                score = _evaluate_candidate(src_bgr, scoring_edges, ordered, ratio, peri)
                if score < best_score:
                    second_best = best_score
                    best_score = score
                    best_quad = ordered
                elif score < second_best:
                    second_best = score

    has_gap = math.isinf(second_best) or (second_best - best_score) > CONFIDENCE_GAP
    very_good = best_score < 0.04
    if best_quad is not None and best_score < QUALITY_FLOOR and (has_gap or very_good):
        return best_quad

    return None


# ---------------------------------------------------------------------------
# detectDocument() — detector.ts
# ---------------------------------------------------------------------------

def detect_document(src: np.ndarray) -> Optional[np.ndarray]:
    """
    Detect an ID-card-shaped quadrilateral in *src* (BGR or BGRA image).

    Returns an (4, 2) float64 array ordered [TL, TR, BR, BL],
    or None if no confident candidate is found.
    """
    # --- pre-processing (mirrors the TS pipeline) ---
    if src.ndim == 3 and src.shape[2] == 4:          # BGRA → BGR
        src_bgr = cv2.cvtColor(src, cv2.COLOR_BGRA2BGR)
    else:
        src_bgr = src

    h, w = src_bgr.shape[:2]
    scale = min(1.0, MAX_PROCESS_SIDE / max(h, w))
    if scale < 1.0:
        processed = cv2.resize(src_bgr, None, fx=scale, fy=scale,
                               interpolation=cv2.INTER_AREA)
    else:
        processed = src_bgr

    quad = _detect_at_scale(processed)
    if quad is None:
        return None

    if scale < 1.0:
        quad = quad / scale
    return quad
