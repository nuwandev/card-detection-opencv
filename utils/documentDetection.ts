import { Point } from "../types/geometry";

/**
 * Orders corners: top-left, top-right, bottom-right, bottom-left.
 */
export function orderCorners(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.y - b.y);
  const topList = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottomList = sorted.slice(2, 4).sort((a, b) => b.x - a.x);
  return [topList[0], topList[1], bottomList[0], bottomList[1]];
}

/**
 * Checks if two quadrilaterals are similar enough.
 */
export function isSameQuad(a: Point[] | null, b: Point[] | null, threshold: number = 60): boolean {
  if (!a || !b) return false;
  let dist = 0;
  for (let i = 0; i < 4; i++) {
    const dx = a[i].x - b[i].x;
    const dy = a[i].y - b[i].y;
    dist += Math.sqrt(dx * dx + dy * dy);
  }
  return dist < threshold;
}

/**
 * Adjusts image brightness using Gamma Correction.
 */
export function adjustGamma(cv: any, src: any, dst: any, gamma: number = 1.3) {
  const invGamma = 1.0 / gamma;
  const table = new cv.Mat(1, 256, cv.CV_8U);
  for (let i = 0; i < 256; i++) {
    table.data[i] = Math.pow(i / 255.0, invGamma) * 255;
  }
  cv.LUT(src, table, dst);
  table.delete();
}

/**
 * Detects the document contour in the frame with advanced preprocessing.
 */
export function detectDocument(cv: any, src: any): Point[] | null {
  const gray = new cv.Mat();
  const processed = new cv.Mat();
  const edges = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    // 1. Grayscale
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // 2. Gamma Correction for better contrast
    adjustGamma(cv, gray, gray, 1.5);

    // 3. Bilateral Filter for edge-preserving smoothing
    cv.bilateralFilter(gray, processed, 9, 75, 75);

    // 4. Adaptive Thresholding to handle varied lighting
    cv.adaptiveThreshold(processed, processed, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);

    // 5. Morphological Dilation to close gaps in edges
    cv.dilate(processed, processed, kernel);

    // 6. Canny Edge Detection
    cv.Canny(processed, edges, 50, 150);

    // 7. Find Contours
    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    let maxArea = 0;
    let bestPoints: Point[] | null = null;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      
      // Filter out small artifacts
      if (area < (src.cols * src.rows) * 0.05) continue;

      const perimeter = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      // Use a slightly smaller epsilon to allow for slightly curved corners
      cv.approxPolyDP(contour, approx, 0.03 * perimeter, true);

      if (approx.rows >= 4 && approx.rows <= 6 && cv.isContourConvex(approx)) {
        // If more than 4 points, we might need a convex hull to reduce to 4
        let finalApprox = approx;
        if (approx.rows > 4) {
          const hull = new cv.Mat();
          cv.convexHull(approx, hull);
          finalApprox = hull;
          // Only use if hull reduces to 4 points
          if (finalApprox.rows !== 4) {
            hull.delete();
            approx.delete();
            continue;
          }
        }

        const data = finalApprox.data32S;
        const pts: Point[] = [
          { x: data[0], y: data[1] },
          { x: data[2], y: data[3] },
          { x: data[4], y: data[5] },
          { x: data[6], y: data[7] },
        ];

        // Validate as quadrilateral (less strict aspect ratio check)
        if (area > maxArea) {
          maxArea = area;
          bestPoints = orderCorners(pts);
        }
        
        if (finalApprox !== approx) finalApprox.delete();
      }
      approx.delete();
    }

    return bestPoints;
  } catch (e) {
    console.error("Detection error:", e);
    return null;
  } finally {
    gray.delete();
    processed.delete();
    edges.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();
  }
}
