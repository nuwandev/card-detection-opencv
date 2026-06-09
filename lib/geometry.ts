import { Point } from "../types/geometry";

/**
 * Sorts and orders points into a consistent Top-Left, Top-Right,
 * Bottom-Right, Bottom-Left format to ensure stable coordinate tracking.
 */
export function orderCorners(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.y - b.y);
  const top = sorted.slice(0, 2);
  const bottom = sorted.slice(2, 4);

  top.sort((a, b) => a.x - b.x);
  bottom.sort((a, b) => a.x - b.x);

  return [top[0], top[1], bottom[1], bottom[0]];
}

/**
 * Calculates Euclidean distance between two quads to determine similarity.
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
