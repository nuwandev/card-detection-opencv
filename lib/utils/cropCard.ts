// Single source of truth for card perspective-cropping.
// Used by:
//   - useCardDetection hook (auto-capture path, via cropMatToDataUrl)
//   - page.tsx manual + gallery paths (via cropCardFromCanvas)

import {
  detectDocument,
  DEFAULT_DETECTOR_CONFIG,
  type DetectorConfig,
} from "@/lib/detector";
import { orderCorners } from "@/lib/geometry";
import { Point } from "@/types/geometry";

// Negative = inset (trim background). Positive = expand outward.
// -0.008 trims ~0.8% from each edge of the detected quad.
const DEFAULT_CROP_PADDING = -0.008;

// ─── Internal geometry (not exported — no one else should need these) ─────────

export function padQuad(
  pts: Point[],
  width: number,
  height: number,
  padding: number,
): Point[] {
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  return pts.map((p) => ({
    x: Math.max(0, Math.min(width  - 1, cx + (p.x - cx) * (1 + padding))),
    y: Math.max(0, Math.min(height - 1, cy + (p.y - cy) * (1 + padding))),
  }));
}

export function fourPointTransform(cv: OpenCV, src: Mat, pts: Point[]): Mat {
  const wTop    = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const wBottom = Math.hypot(pts[2].x - pts[3].x, pts[2].y - pts[3].y);
  const hRight  = Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y);
  const hLeft   = Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y);

  const detW = Math.max(wTop, wBottom);
  const detH = Math.max(hRight, hLeft);

  const OUT_LONG  = 600;
  const OUT_SHORT = Math.round(OUT_LONG / 1.585);
  const outW = detH > detW ? OUT_SHORT : OUT_LONG;
  const outH = detH > detW ? OUT_LONG  : OUT_SHORT;

  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    pts[0].x, pts[0].y, pts[1].x, pts[1].y,
    pts[2].x, pts[2].y, pts[3].x, pts[3].y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0, outW - 1, 0, outW - 1, outH - 1, 0, outH - 1,
  ]);
  const M   = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat();
  cv.warpPerspective(src, dst, M, new cv.Size(outW, outH));
  srcTri.delete(); dstTri.delete(); M.delete();
  return dst;
}

// ─── Exported API ─────────────────────────────────────────────────────────────

/**
 * Crop a card from an already-detected Mat + corner points.
 * Called by useCardDetection hook (auto path) before the mat is deleted.
 * Caller owns mat lifetime — this function does NOT delete it.
 *
 * @param cv      - OpenCV instance
 * @param mat     - Source Mat (the ROI frame from the hook)
 * @param pts     - 4 detected corner points (in mat-local coordinates)
 * @param padding - Fractional inset/expand (default -0.008)
 */
export function cropMatToDataUrl(
  cv:      OpenCV,
  mat:     Mat,
  pts:     Point[],
  padding: number = DEFAULT_CROP_PADDING,
): string {
  const padded  = padQuad(pts, mat.cols, mat.rows, padding);
  const cropped = fourPointTransform(cv, mat, padded);
  try {
    const out = document.createElement("canvas");
    out.width  = cropped.cols;
    out.height = cropped.rows;
    cv.imshow(out, cropped);
    return out.toDataURL("image/jpeg", 0.95);
  } finally {
    cropped.delete();
  }
}

/**
 * Detect and perspective-crop a card from a raw canvas.
 * Called by page.tsx for manual capture and gallery upload.
 * Returns a JPEG data URL, or null if no card was detected.
 *
 * @param cv      - OpenCV instance
 * @param canvas  - Source canvas (guide-frame snapshot or decoded gallery image)
 * @param padding - Fractional inset/expand (default -0.008)
 * @param config  - Detector config (defaults to DEFAULT_DETECTOR_CONFIG)
 */
export function cropCardFromCanvas(
  cv:      OpenCV,
  canvas:  HTMLCanvasElement,
  padding: number         = DEFAULT_CROP_PADDING,
  config:  DetectorConfig = DEFAULT_DETECTOR_CONFIG,
): string | null {
  const src = cv.imread(canvas);
  try {
    const { best } = detectDocument(cv, src, config);
    if (!best) return null;
    const ordered = orderCorners(best.points);
    return cropMatToDataUrl(cv, src, ordered, padding);
  } finally {
    src.delete();
  }
}