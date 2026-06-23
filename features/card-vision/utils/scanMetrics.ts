import type { DetectorConfig } from "@/lib/detector";
import type { ScanMetrics } from "../types";

export type DetectionSnapshot = {
  lastMetrics: ScanMetrics | null;
  secondBestScore: number;
  config: DetectorConfig;
};

export function buildDetectionSnapshot({
  lastMetrics,
  secondBestScore,
  config,
}: DetectionSnapshot) {
  const scoreSatisfied =
    lastMetrics !== null && lastMetrics.score < config.qualityFloor;

  const confidenceSatisfied =
    lastMetrics !== null &&
    secondBestScore - lastMetrics.score > config.confidenceGap;

  const confidenceGapValue =
    secondBestScore === Number.POSITIVE_INFINITY || lastMetrics === null
      ? Number.POSITIVE_INFINITY
      : secondBestScore - lastMetrics.score;

  const ratioDelta =
    lastMetrics === null
      ? null
      : Math.abs(lastMetrics.ratio - config.targetAspectRatio);

  return {
    scoreSatisfied,
    confidenceSatisfied,
    confidenceGapValue,
    ratioDelta,
  };
}