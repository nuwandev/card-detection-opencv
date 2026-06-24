import { Point } from "../types/geometry";
import { orderCorners } from "./geometry";

export interface DetectorConfig {
  minAreaRatio: number;
  targetAspectRatio: number;
  aspectRatioTolerance: number;
  confidenceGap: number;
  qualityFloor: number;
  weightRatio: number;
  weightTexture: number;
  weightEdge: number;
}

export interface DetectionMetrics {
  ratio: number;
  ratioScore: number;
  textureScore: number;
  edgeScore: number;
  score: number;
  peri: number;
}

export interface DetectionResult {
  points: Point[];
  metrics: DetectionMetrics;
}

export interface DetectionOutput {
  best: DetectionResult | null;
  secondBestScore: number;
  allCandidates: { points: Point[]; score: number }[];
  rawBest: DetectionResult | null;
}

export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
  minAreaRatio: 0.05,
  targetAspectRatio: 1.58,
  aspectRatioTolerance: 0.3,
  confidenceGap: 0.08,
  qualityFloor: 0.24,
  weightRatio: 0.38,
  weightTexture: 0.12,
  weightEdge: -0.7,
};

/**
 * Calculates the 4 corner points of a RotatedRect returned by cv.minAreaRect.
 */
function getRotatedRectPoints(rect: RotatedRect): Point[] {
  const { x: cx, y: cy } = rect.center;
  const w = rect.size.width;
  const h = rect.size.height;
  const angleRad = (rect.angle * Math.PI) / 180;

  const dx1 = (w / 2) * Math.cos(angleRad);
  const dy1 = (w / 2) * Math.sin(angleRad);
  const dx2 = -(h / 2) * Math.sin(angleRad);
  const dy2 = (h / 2) * Math.cos(angleRad);

  return [
    { x: cx - dx1 - dx2, y: cy - dy1 - dy2 },
    { x: cx + dx1 - dx2, y: cy + dy1 - dy2 },
    { x: cx + dx1 + dx2, y: cy + dy1 + dy2 },
    { x: cx - dx1 + dx2, y: cy - dy1 + dy2 },
  ];
}

/**
 * Validates aspect ratio and orders corner points for a candidate quad.
 * Returns null if the candidate doesn't meet the ratio tolerance.
 */
function candidateFromPoints(
  pts: Point[],
  config: DetectorConfig,
): { ordered: Point[]; ratio: number } | null {
  const ordered = orderCorners(pts);
  const wTop = Math.hypot(
    ordered[1].x - ordered[0].x,
    ordered[1].y - ordered[0].y,
  );
  const wBottom = Math.hypot(
    ordered[2].x - ordered[3].x,
    ordered[2].y - ordered[3].y,
  );
  const hRight = Math.hypot(
    ordered[2].x - ordered[1].x,
    ordered[2].y - ordered[1].y,
  );
  const hLeft = Math.hypot(
    ordered[3].x - ordered[0].x,
    ordered[3].y - ordered[0].y,
  );

  const width = Math.max(wTop, wBottom);
  const height = Math.max(hRight, hLeft);
  if (width <= 0 || height <= 0) return null;

  const ratio = Math.max(width, height) / Math.min(width, height);
  if (
    Math.abs(ratio - config.targetAspectRatio) >=
    config.aspectRatioTolerance + 0.12
  ) {
    return null;
  }

  return { ordered, ratio };
}

/**
 * Evaluates a candidate quad's quality by normalising all signals into a
 * shared 0–1 space (lower score = better match).
 */
function evaluateCandidate(
  cv: OpenCV,
  src: Mat,
  edges: Mat,
  pts: Point[],
  ratio: number,
  peri: number,
  config: DetectorConfig,
): DetectionMetrics {
  const mask = cv.Mat.zeros(src.rows, src.cols, cv.CV_8U);
  const poly = cv.matFromArray(4, 1, cv.CV_32SC2, [
    pts[0].x,
    pts[0].y,
    pts[1].x,
    pts[1].y,
    pts[2].x,
    pts[2].y,
    pts[3].x,
    pts[3].y,
  ]);
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

    // Ratio score  : 0 = perfect aspect ratio, 1 = at tolerance limit
    const ratioError = Math.abs(ratio - config.targetAspectRatio);
    const ratioScore = Math.min(ratioError / config.aspectRatioTolerance, 1.0);

    // Texture score: 0 = flat/uniform, 1 = high noise (stdDev sum > 100)
    const textureScore = Math.min(colorConsistency / 100, 1.0);

    // Edge score   : 0 = no edges, 1 = high density (> 0.5 px per perimeter px)
    const edgeDensity = edgeSupport / peri;
    const edgeScore = Math.min(edgeDensity / 0.5, 1.0);

    const score =
      config.weightRatio * ratioScore +
      config.weightTexture * textureScore +
      config.weightEdge * edgeScore;

    return { ratio, ratioScore, textureScore, edgeScore, score, peri };
  } finally {
    mask.delete();
    poly.delete();
    pols.delete();
    mean.delete();
    stdDev.delete();
    edgeMasked.delete();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detects a quadrilateral document (card) within the provided Mat.
 * Runs a multi-stage OpenCV pipeline and returns the best candidate.
 */
export function detectDocument(
  cv: OpenCV,
  src: Mat,
  config: DetectorConfig = DEFAULT_DETECTOR_CONFIG,
): DetectionOutput {
  // All intermediate Mats are tracked here so we can bulk-delete on exit,
  // preventing WebAssembly heap leaks even when exceptions occur.
  const tracked: Mat[] = [];
  const track = (m: Mat): Mat => {
    tracked.push(m);
    return m;
  };

  let bestQuad: Point[] | null = null;
  let bestMetrics: DetectionMetrics | null = null;
  let bestScore = Infinity;
  let secondBestScore = Infinity;

  const allCandidates: { points: Point[]; score: number }[] = [];
  const seen = new Set<string>();

  try {
    // ── Greyscale + blur ────────────────────────────────────────────────────
    const gray = track(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const blurred = track(new cv.Mat());
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // ── CLAHE (adaptive histogram eq) — combats glare and shadows ───────────
    const enhanced = track(new cv.Mat());
    let claheOk = false;
    try {
      const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
      clahe.apply(gray, enhanced);
      clahe.delete();
      claheOk = true;
    } catch {
      // CLAHE absent in this WASM build — fall back to plain grey
    }
    if (!claheOk) gray.copyTo(enhanced);

    const enhancedBlur = track(new cv.Mat());
    cv.GaussianBlur(enhanced, enhancedBlur, new cv.Size(5, 5), 0);

    // ── Edge maps ────────────────────────────────────────────────────────────
    const map1 = track(new cv.Mat());
    const map2 = track(new cv.Mat());
    const map3 = track(new cv.Mat());
    cv.Canny(blurred, map1, 20, 100);
    cv.Canny(blurred, map2, 40, 140);
    cv.Canny(enhancedBlur, map3, 25, 110);

    const kernel5 = track(
      cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)),
    );
    const morph1 = track(new cv.Mat());
    const morph2 = track(new cv.Mat());
    const morph3 = track(new cv.Mat());
    cv.morphologyEx(map1, morph1, cv.MORPH_CLOSE, kernel5);
    cv.morphologyEx(map2, morph2, cv.MORPH_CLOSE, kernel5);
    cv.morphologyEx(map3, morph3, cv.MORPH_CLOSE, kernel5);

    // ── HSV mask for pale/bright card surfaces ───────────────────────────────
    const rgb = track(new cv.Mat());
    const hsv = track(new cv.Mat());
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);

    const mask = track(new cv.Mat());
    const lower = track(cv.matFromArray(1, 3, cv.CV_8U, [0, 0, 105]));
    const upper = track(cv.matFromArray(1, 3, cv.CV_8U, [179, 135, 255]));
    cv.inRange(hsv, lower, upper, mask);

    const kernel9 = track(
      cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9)),
    );
    const closed1 = track(new cv.Mat());
    const closed2 = track(new cv.Mat());
    const opened = track(new cv.Mat());
    cv.morphologyEx(mask, closed1, cv.MORPH_CLOSE, kernel9);
    cv.morphologyEx(closed1, closed2, cv.MORPH_CLOSE, kernel9);
    cv.morphologyEx(closed2, opened, cv.MORPH_OPEN, kernel9);

    const lightEdges = track(new cv.Mat());
    cv.Canny(opened, lightEdges, 20, 80);

    const scoringEdges = track(new cv.Mat());
    cv.bitwise_or(morph1, morph3, scoringEdges);

    // ── Contour search across all edge maps ──────────────────────────────────
    const minArea = src.cols * src.rows * config.minAreaRatio;
    const maxArea = src.cols * src.rows * 0.95;
    const maps: Mat[] = [morph1, morph2, morph3, lightEdges];

    for (const edgeMap of maps) {
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      const cloned = edgeMap.clone();

      cv.findContours(
        cloned,
        contours,
        hierarchy,
        cv.RETR_LIST,
        cv.CHAIN_APPROX_SIMPLE,
      );
      cloned.delete();

      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);

        if (area < minArea || area > maxArea) {
          cnt.delete();
          continue;
        }

        const peri = cv.arcLength(cnt, true);
        if (peri <= 0) {
          cnt.delete();
          continue;
        }

        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.025 * peri, true);

        const pointSets: Point[][] = [];

        if (approx.rows === 4) {
          const d = approx.data32S;
          pointSets.push([
            { x: d[0], y: d[1] },
            { x: d[2], y: d[3] },
            { x: d[4], y: d[5] },
            { x: d[6], y: d[7] },
          ]);
        }

        if (approx.rows >= 4 && approx.rows <= 10) {
          try {
            const rect = cv.minAreaRect(cnt);
            const boxPts = getRotatedRectPoints(rect);
            pointSets.push(boxPts);
          } catch {
            // minAreaRect fallback failed — skip
          }
        }

        approx.delete();
        cnt.delete();

        for (const pts of pointSets) {
          const candidate = candidateFromPoints(pts, config);
          if (!candidate) continue;

          const { ordered, ratio } = candidate;

          // Must lie fully within the frame (not touching edges)
          const margin = 5;
          const insideFrame = ordered.every(
            (p) =>
              p.x >= margin &&
              p.x <= src.cols - margin &&
              p.y >= margin &&
              p.y <= src.rows - margin,
          );
          if (!insideFrame) continue;

          // Deduplicate near-identical quads
          const key = ordered
            .map((p) => `${Math.round(p.x / 8)},${Math.round(p.y / 8)}`)
            .join(";");
          if (seen.has(key)) continue;
          seen.add(key);

          const metrics = evaluateCandidate(
            cv,
            src,
            scoringEdges,
            ordered,
            ratio,
            peri,
            config,
          );
          allCandidates.push({ points: ordered, score: metrics.score });

          if (metrics.score < bestScore) {
            secondBestScore = bestScore;
            bestScore = metrics.score;
            bestQuad = ordered;
            bestMetrics = metrics;
          } else if (metrics.score < secondBestScore) {
            secondBestScore = metrics.score;
          }
        }
      }

      contours.delete();
      hierarchy.delete();
    }
  } catch (err) {
    console.error("[detectDocument] pipeline error:", err);
  } finally {
    for (const m of tracked) {
      try {
        m.delete();
      } catch {
        /* already deleted */
      }
    }
  }

  // ── Quality gates ─────────────────────────────────────────────────────────
  const satisfiesQuality = bestScore < config.qualityFloor;
  const satisfiesConfidence =
    secondBestScore - bestScore > config.confidenceGap;
  const veryGood = bestScore < 0.04; // bypass confidence gap for near-perfect scores

  const rawBest =
    bestQuad && bestMetrics ? { points: bestQuad, metrics: bestMetrics } : null;

  const passed =
    bestQuad &&
    bestMetrics &&
    satisfiesQuality &&
    (satisfiesConfidence || veryGood);

  return passed && bestQuad && bestMetrics
    ? {
        best: { points: bestQuad, metrics: bestMetrics },
        secondBestScore,
        allCandidates,
        rawBest,
      }
    : { best: null, secondBestScore, allCandidates, rawBest };
}
