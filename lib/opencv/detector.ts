import type { DetectionResult, ScanZone, Quadrilateral, Point } from "./types";

// cv is the global opencv.js object injected via script tag
declare const cv: typeof import("@techstark/opencv-js");

/**
 * Detect the largest rectangle/quadrilateral in the given ImageData
 * that overlaps with the scan zone. Pure function — no React.
 */
export function detectRectangle(
  imageData: ImageData,
  scanZone: ScanZone
): DetectionResult {
  const now = Date.now();

  // Safety: if OpenCV not ready yet
  if (typeof cv === "undefined" || !cv.Mat) {
    return { status: "not_detected", quad: null, confidence: 0, timestamp: now };
  }

  let src: typeof cv.Mat.prototype | null = null;
  let gray: typeof cv.Mat.prototype | null = null;
  let blurred: typeof cv.Mat.prototype | null = null;
  let edges: typeof cv.Mat.prototype | null = null;
  let contours: typeof cv.MatVector.prototype | null = null;
  let hierarchy: typeof cv.Mat.prototype | null = null;

  try {
    // 1. Convert ImageData → cv.Mat
    src = cv.matFromImageData(imageData);

    // 2. Grayscale
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // 3. Gaussian blur to reduce noise
    blurred = new cv.Mat();
    const ksize = new cv.Size(5, 5);
    cv.GaussianBlur(gray, blurred, ksize, 0);

    // 4. Canny edge detection
    edges = new cv.Mat();
    cv.Canny(blurred, edges, 50, 150);

    // 5. Dilate edges slightly to close gaps
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edges, edges, kernel);
    kernel.delete();

    // 6. Find contours
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    const scanArea = scanZone.width * scanZone.height;
    let bestQuad: Quadrilateral | null = null;
    let bestArea = 0;

    // 7. Find the largest 4-sided polygon that overlaps with scan zone
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);

      // Skip tiny contours (less than 1% of scan zone area)
      if (area < scanArea * 0.01) {
        cnt.delete();
        continue;
      }

      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

      // Must be exactly 4 corners
      if (approx.rows === 4 && area > bestArea) {
        const quad = matToQuad(approx);
        if (quad && isQuadInScanZone(quad, scanZone)) {
          bestArea = area;
          bestQuad = quad;
        }
      }

      approx.delete();
      cnt.delete();
    }

    if (!bestQuad) {
      return { status: "not_detected", quad: null, confidence: 0, timestamp: now };
    }

    // 8. Confidence: ratio of detected quad area vs scan zone area (capped at 1)
    const confidence = Math.min(bestArea / scanArea, 1);

    return {
      status: "detected",
      quad: bestQuad,
      confidence,
      timestamp: now,
    };
  } finally {
    // Always free OpenCV memory
    src?.delete();
    gray?.delete();
    blurred?.delete();
    edges?.delete();
    contours?.delete();
    hierarchy?.delete();
  }
}

function matToQuad(approx: typeof cv.Mat.prototype): Quadrilateral | null {
  if (approx.rows !== 4) return null;

  const pts: Point[] = [];
  for (let i = 0; i < 4; i++) {
    pts.push({
      x: approx.data32S[i * 2],
      y: approx.data32S[i * 2 + 1],
    });
  }

  // Sort points: top-left, top-right, bottom-right, bottom-left
  // by summing and diffing x+y
  const sorted = sortQuadPoints(pts);
  return sorted;
}

function sortQuadPoints(pts: Point[]): Quadrilateral {
  const sum = pts.map((p) => ({ p, s: p.x + p.y, d: p.x - p.y }));
  sum.sort((a, b) => a.s - b.s);
  const topLeft = sum[0].p;
  const bottomRight = sum[3].p;

  const rest = [sum[1].p, sum[2].p];
  rest.sort((a, b) => a.d - b.d);
  const bottomLeft = rest[0];
  const topRight = rest[1];

  return { topLeft, topRight, bottomRight, bottomLeft };
}

function isQuadInScanZone(quad: Quadrilateral, zone: ScanZone): boolean {
  // At least the centroid of the quad must be inside the scan zone
  const pts = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;

  return (
    cx >= zone.x &&
    cx <= zone.x + zone.width &&
    cy >= zone.y &&
    cy <= zone.y + zone.height
  );
}