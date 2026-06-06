export type DetectionStatus = "idle" | "detecting" | "detected" | "not_detected";

export interface Quadrilateral {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

export interface Point {
  x: number;
  y: number;
}

export interface DetectionResult {
  status: "detected" | "not_detected";
  quad: Quadrilateral | null;
  /** Confidence 0–1 based on how well the quad fits inside the scan zone */
  confidence: number;
  timestamp: number;
}

export interface ScanZone {
  x: number;
  y: number;
  width: number;
  height: number;
}