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

import { Point } from "../types/geometry";

const ID_ASPECT_RATIO = 1.58; // Approx ID card ratio
const RATIO_TOLERANCE = 0.3;
const MIN_AREA_RATIO = 0.05; // 5% of image area

export function detectDocument(cv: any, src: any): Point[] | null {
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const blurred = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  cv.Canny(blurred, edges, 20, 100);

  const contours = new cv.MatVector();
  cv.findContours(edges, contours, new cv.Mat(), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let bestQuad: Point[] | null = null;
  let bestScore = Infinity;

  const minArea = src.cols * src.rows * MIN_AREA_RATIO;

  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area < minArea) continue;

    const peri = cv.arcLength(cnt, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(cnt, approx, 0.04 * peri, true);

    if (approx.rows === 4) {
      const data = approx.data32S;
      const pts = [
        { x: data[0], y: data[1] }, { x: data[2], y: data[3] },
        { x: data[4], y: data[5] }, { x: data[6], y: data[7] }
      ];
      
      // Structural Constraint: Aspect Ratio
      const width = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const height = Math.hypot(pts[1].x - pts[2].x, pts[1].y - pts[2].y);
      const ratio = Math.max(width, height) / Math.min(width, height);
      
      if (Math.abs(ratio - ID_ASPECT_RATIO) < RATIO_TOLERANCE) {
        const score = evaluateCandidate(cv, src, edges, pts);
        
        if (score < bestScore) {
          bestScore = score;
          bestQuad = pts;
        }
      }
    }
    approx.delete();
  }

  gray.delete(); edges.delete(); blurred.delete(); contours.delete();
  return bestQuad;
}

function evaluateCandidate(cv: any, src: any, edges: any, pts: Point[]): number {
  const mask = new cv.Mat.zeros(src.rows, src.cols, cv.CV_8U);
  const poly = cv.matFromArray(4, 1, cv.CV_32SC2, [pts[0].x, pts[0].y, pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y]);
  const pols = new cv.MatVector();
  pols.push_back(poly);
  cv.fillPoly(mask, pols, new cv.Scalar(255));

  const mean = new cv.Mat(1, 1, cv.CV_32FC4);
  const stdDev = new cv.Mat(1, 1, cv.CV_32FC4);
  cv.meanStdDev(src, mean, stdDev, mask);
  
  const colorConsistency = stdDev.doubleAt(0, 0) + stdDev.doubleAt(0, 1) + stdDev.doubleAt(0, 2);

  const edgeMasked = new cv.Mat();
  cv.bitwise_and(edges, mask, edgeMasked);
  const edgeSupport = cv.countNonZero(edgeMasked);
  
  mask.delete(); poly.delete(); pols.delete(); mean.delete(); stdDev.delete(); edgeMasked.delete();

  if (edgeSupport < 100) return Infinity;

  return colorConsistency - (edgeSupport * 0.01);
}
