import type Webcam from "react-webcam";
import type { RefObject } from "react";
import { useCardDetection } from "@/hooks/useCardDetection";
import { DetectorConfig } from "@/lib/detector";
import { CardDetectionUIState } from "../types";

export function useCardDetectionAdapter(
  cv: Window["cv"] | null,
  webcamRef: RefObject<Webcam | null>,
  frameRef: RefObject<HTMLElement | null>,
  config: DetectorConfig,
  onDetectedStable?: (dataUrl: string) => void,
): CardDetectionUIState {
  const d = useCardDetection(cv, webcamRef, frameRef, config, onDetectedStable);

  return {
    state: d.state,
    points: d.points,
    coverage: d.coverage,
    capturedCard: d.capturedCard,

    lastMetrics: d.lastMetrics,
    secondBestScore: d.secondBestScore,
    candidatesCount: d.candidatesCount,

    process: d.process,
    resetDetection: d.resetDetection,
  };
}
