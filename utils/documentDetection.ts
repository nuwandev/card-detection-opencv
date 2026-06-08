import { Point } from "../types/geometry";

let lastQuad: Point[] | null = null;
let stableCount = 0;

export function orderCorners(points: Point[]): Point[] {
  // center point
  const cx = points.reduce((s, p) => s + p.x, 0) / 4;
  const cy = points.reduce((s, p) => s + p.y, 0) / 4;

  return points
    .map((p) => ({
      ...p,
      angle: Math.atan2(p.y - cy, p.x - cx),
    }))
    .sort((a, b) => a.angle - b.angle)
    .map(({ x, y }) => ({ x, y }));
}

function isSameQuad(a: Point[], b: Point[]) {
  if (!a || !b) return false;
  let dist = 0;
  for (let i = 0; i < 4; i++) {
    const dx = a[i].x - b[i].x;
    const dy = a[i].y - b[i].y;
    dist += Math.sqrt(dx * dx + dy * dy);
  }
  return dist < 40;
}

export function detectDocument(cv: any, src: any): Point[] | null {
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  let bestQuad: Point[] | null = null;
  let bestArea = 0;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 75, 200);

    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_LIST,
      cv.CHAIN_APPROX_SIMPLE
    );

    const items: { contour: any; area: number }[] = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area > 30000) {
        items.push({ contour, area });
      }
    }

    items.sort((a, b) => b.area - a.area);

    for (const item of items.slice(0, 10)) {
      const { contour } = item;
      const perimeter = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

      if (
        approx.rows === 4 &&
        cv.isContourConvex(approx)
      ) {
        const rect = cv.boundingRect(approx);
        const ratio = rect.width / rect.height;

        if (ratio >= 1.3 && ratio <= 2.0) {
          const area = cv.contourArea(approx);
          if (area > bestArea) {
            const data = approx.data32S;
            bestQuad = orderCorners([
              { x: data[0], y: data[1] },
              { x: data[2], y: data[3] },
              { x: data[4], y: data[5] },
              { x: data[6], y: data[7] },
            ]);
            bestArea = area;
          }
        }
      }
      approx.delete();
    }

    if (bestQuad) {
      if (isSameQuad(bestQuad, lastQuad)) {
        stableCount++;
      } else {
        stableCount = 0;
      }
      lastQuad = bestQuad;
    } else {
      stableCount = 0;
      lastQuad = null;
    }

    return bestQuad;
  } finally {
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }
}

export function getStableCount(): number {
  return stableCount;
}

export function drawQuad(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (points.length !== 4) return;

  ctx.strokeStyle = "#00ff00";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < 4; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.stroke();
}
