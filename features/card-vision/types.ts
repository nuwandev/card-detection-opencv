import { DetectionMetrics } from "@/lib/detector";
import { Point } from "@/types/geometry";

export type ScanMetrics = {
  score: number;
  ratio: number;
};

export type DetectionState =
  | "READY"
  | "INITIALIZING"
  | "DETECTING"
  | "STABILIZING"
  | "READY_TO_CAPTURE"
  | "CAPTURED"
  | "ERROR";

export type CardDetectionUIState = {
  state: DetectionState;
  points: Point[] | null;
  coverage: number;
  capturedCard: string | null;

  lastMetrics: DetectionMetrics | null;
  secondBestScore: number;
  candidatesCount: number;

  process: () => void;
  resetDetection: () => void;
};
