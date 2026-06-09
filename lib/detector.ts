import { Point } from "../types/geometry";
import { orderCorners } from "./geometry";

const ID_ASPECT_RATIO = 1.58;
const RATIO_TOLERANCE = 0.2;
const MIN_AREA_RATIO = 0.05;

/**
 * Detects a quadrilateral document within the provided image source.
 * Orchestrates the OpenCV image processing pipeline.
 */
export function detectDocument(cv: any, src: any): Point[] | null {
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const blurred = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  let bestQuad: Point[] | null = null;
  let bestScore = Infinity;
  let secondBestScore = Infinity;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 20, 100);

    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const minArea = src.cols * src.rows * MIN_AREA_RATIO;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const approx = new cv.Mat();
      try {
        const area = cv.contourArea(cnt);
        if (area < minArea) continue;

        const peri = cv.arcLength(cnt, true);
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

        if (approx.rows === 4) {
          const data = approx.data32S;
          const pts = [
            { x: data[0], y: data[1] }, { x: data[2], y: data[3] },
            { x: data[4], y: data[5] }, { x: data[6], y: data[7] }
          ];
          
          const side1 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          const side2 = Math.hypot(pts[1].x - pts[2].x, pts[1].y - pts[2].y);
          const width = Math.max(side1, side2);
          const height = Math.min(side1, side2);
          const ratio = width / height;
          
          if (Math.abs(ratio - ID_ASPECT_RATIO) < 0.3) {
            const ordered = orderCorners(pts);
            const score = evaluateCandidate(cv, src, edges, ordered, ratio, peri);
            
            if (score < bestScore) {
              secondBestScore = bestScore;
              bestScore = score;
              bestQuad = ordered;
            } else if (score < secondBestScore) {
              secondBestScore = score;
            }
          }
        }
      } finally {
        cnt.delete();
        approx.delete();
      }
    }
  } finally {
    gray.delete(); 
    edges.delete(); 
    blurred.delete(); 
    contours.delete();
    hierarchy.delete();
  }

  // Confidence Check: Ensure best candidate is sufficiently better than others
  // and meets a minimum quality floor (score < 0 means "net positive" evidence)
  const CONFIDENCE_GAP = 0.15;
  const QUALITY_FLOOR = 0.0;

  if (bestScore < QUALITY_FLOOR && (secondBestScore - bestScore) > CONFIDENCE_GAP) {
    return bestQuad;
  }

  return null;
}

/**
 * Evaluates a candidate quadrilateral's quality by normalizing all signals
 * into a shared 0-1 space to ensure environmental and resolution independence.
 */
function evaluateCandidate(cv: any, src: any, edges: any, pts: Point[], ratio: number, peri: number): number {
  const mask = cv.Mat.zeros(src.rows, src.cols, cv.CV_8U);
  const poly = cv.matFromArray(4, 1, cv.CV_32SC2, [pts[0].x, pts[0].y, pts[1].x, pts[1].y, pts[2].x, pts[2].y, pts[3].x, pts[3].y]);
  const pols = new cv.MatVector();
  const mean = new cv.Mat();
  const stdDev = new cv.Mat();
  const edgeMasked = new cv.Mat();

  try {
    pols.push_back(poly);
    cv.fillPoly(mask, pols, new cv.Scalar(255));

    cv.meanStdDev(src, mean, stdDev, mask);
    
    let colorConsistency = 0;
    const channels = Math.min(stdDev.rows, 3);
    for (let i = 0; i < channels; i++) {
      colorConsistency += stdDev.doubleAt(i, 0);
    }

    cv.bitwise_and(edges, mask, edgeMasked);
    const edgeSupport = cv.countNonZero(edgeMasked);
    
    // 1. Ratio Score (0 to 1): 0 is perfect match, 1 is at tolerance limit (0.3)
    const ratioError = Math.abs(ratio - ID_ASPECT_RATIO);
    const ratioScore = Math.min(ratioError / 0.3, 1.0);

    // 2. Texture Score (0 to 1): 0 is flat/consistent, 1 is high noise (> 100 stddev sum)
    const textureScore = Math.min(colorConsistency / 100, 1.0);

    // 3. Edge Score (0 to 1): 0 is no edges, 1 is high density (> 0.5 per pixel of perimeter)
    const edgeDensity = edgeSupport / peri;
    const edgeScore = Math.min(edgeDensity / 0.5, 1.0);

    // Weights: Favor structural evidence (edges) over geometry alone.
    // Lower score is better.
    // Range: (0.3 * 0 + 0.2 * 0 - 0.6 * 1) = -0.6 [Perfect]
    // Range: (0.3 * 1 + 0.2 * 1 - 0.6 * 0) = +0.5 [Poor]
    return (0.3 * ratioScore) + (0.2 * textureScore) - (0.6 * edgeScore);
  } finally {
    mask.delete(); 
    poly.delete(); 
    pols.delete(); 
    mean.delete(); 
    stdDev.delete(); 
    edgeMasked.delete();
  }
}
