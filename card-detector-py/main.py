"""
main.py — Batch ID-card detector.

Usage:
    1. Drop images into the inputs/ folder (jpg, jpeg, png, webp, bmp, tiff).
    2. Run:  python main.py
    3. Cropped cards appear in outputs/.

Each successfully detected card is perspective-corrected to a flat
ID-card rectangle (standard 85.6 × 54 mm proportions at 600 px width).
"""

import sys
import secrets
import cv2
import numpy as np
from pathlib import Path
from detector import detect_document

# ---------------------------------------------------------------------------
# config
# ---------------------------------------------------------------------------

INPUTS_DIR   = Path("inputs")
OUTPUTS_DIR  = Path("outputs")
SUPPORTED    = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif"}

# Output card dimensions (pixels) - keeps the 1.585 ID aspect ratio.
# The cropper chooses landscape or portrait from the detected card orientation.
OUT_LONG = 600
OUT_SHORT = int(OUT_LONG / 1.585)   # approx 378 px
CROP_PADDING = 0.01


# ---------------------------------------------------------------------------
# perspective crop  (four-point transform)
# ---------------------------------------------------------------------------

def four_point_transform(image: np.ndarray, pts: np.ndarray) -> np.ndarray:
    """
    Warp the quadrilateral defined by *pts* [TL, TR, BR, BL] into a
    clean rectangle that keeps the detected card orientation.
    """
    width_top = np.linalg.norm(pts[1] - pts[0])
    width_bottom = np.linalg.norm(pts[2] - pts[3])
    height_right = np.linalg.norm(pts[2] - pts[1])
    height_left = np.linalg.norm(pts[3] - pts[0])

    detected_width = max(width_top, width_bottom)
    detected_height = max(height_right, height_left)
    if detected_height > detected_width:
        out_w, out_h = OUT_SHORT, OUT_LONG
    else:
        out_w, out_h = OUT_LONG, OUT_SHORT

    dst = np.array([
        [0,       0      ],
        [out_w-1, 0      ],
        [out_w-1, out_h-1],
        [0,       out_h-1],
    ], dtype=np.float32)

    M   = cv2.getPerspectiveTransform(pts.astype(np.float32), dst)
    return cv2.warpPerspective(image, M, (out_w, out_h))


def pad_quad(pts: np.ndarray, image_shape: tuple[int, ...],
             padding: float = CROP_PADDING) -> np.ndarray:
    """
    Move each detected corner slightly away from the quad center so the output
    includes a small border instead of clipping tightly at the card edge.
    """
    h, w = image_shape[:2]
    padded = pts.astype(np.float32).copy()
    center = padded.mean(axis=0)
    padded = center + (padded - center) * (1.0 + padding)
    padded[:, 0] = np.clip(padded[:, 0], 0, w - 1)
    padded[:, 1] = np.clip(padded[:, 1], 0, h - 1)
    return padded


def unique_output_path(suffix: str) -> Path:
    """Create a fresh nic_<random> output name without using the input name."""
    suffix = suffix.lower()
    while True:
        out_path = OUTPUTS_DIR / f"non_nic_{secrets.token_hex(4)}{suffix}"
        if not out_path.exists():
            return out_path


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def process_image(image_path: Path) -> bool:
    """Load, detect, crop, and save.  Returns True on success."""
    try:
        img = cv2.imread(str(image_path))
        if img is None:
            print("  [!] Not a readable image - skipping.")
            return False

        quad = detect_document(img)
        if quad is None:
            print("  [ ] No card detected.")
            return False

        cropped = four_point_transform(img, pad_quad(quad, img.shape))

        out_path = unique_output_path(image_path.suffix)
        if not cv2.imwrite(str(out_path), cropped):
            print("  [!] Could not save output - skipping.")
            return False

        print(f"  [OK] Saved -> {out_path.name}")
        return True
    except cv2.error as exc:
        print(f"  [!] OpenCV could not process this file - skipping. ({exc})")
        return False


def main():
    if not INPUTS_DIR.exists():
        INPUTS_DIR.mkdir()
        print(f"Created '{INPUTS_DIR}/'. Drop .jpg/.png (etc.) files there and re-run.")
        sys.exit(0)

    OUTPUTS_DIR.mkdir(exist_ok=True)

    files = [p for p in sorted(INPUTS_DIR.iterdir()) if p.is_file()]
    images = [p for p in files if p.suffix.lower() in SUPPORTED]
    unsupported = [p for p in files if p.suffix.lower() not in SUPPORTED]

    if not images:
        print(f"No supported images found in '{INPUTS_DIR}/'. "
              "Drop .jpg/.png (etc.) files there and re-run.")
        if unsupported:
            print(f"Skipped {len(unsupported)} unsupported file(s).")
        sys.exit(0)

    ok = fail = skip = 0
    print(f"Processing {len(images)} image(s)...\n")

    for file_path in unsupported:
        print(f"-> {file_path.name}")
        print("  [ ] Unsupported file type - skipping.")
        skip += 1

    for img_path in images:
        print(f"-> {img_path.name}")
        result = process_image(img_path)
        if result:
            ok += 1
        else:
            skip += 1

    print(f"\nDone.  {ok} cropped   {skip} skipped   "
          f"({len(images)} total)")


if __name__ == "__main__":
    main()
