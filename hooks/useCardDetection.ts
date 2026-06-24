import { useCallback, useRef, useState, useEffect } from "react";
import { Point } from "../types/geometry";
import {
  detectDocument,
  DetectorConfig,
  DetectionMetrics,
  DEFAULT_DETECTOR_CONFIG,
} from "../lib/detector";
import { calculateArea } from "../lib/geometry";
import { cropMatToDataUrl } from "../lib/utils/cropCard";
import { DetectionState } from "@/features/card-vision/types";

const EMA_ALPHA = 0.5;
const MAX_MISSED_FRAMES = 5;

export const useCardDetection = (
  cv: Window["cv"] | null,
  videoRef: React.RefObject<
    HTMLVideoElement | { video: HTMLVideoElement | null } | null
  >,
  frameRef: React.RefObject<HTMLElement | null>,
  config: DetectorConfig = DEFAULT_DETECTOR_CONFIG,
  onDetectedStable?: (dataUrl: string) => void,
) => {
  const [state, setState] = useState<DetectionState>("READY");
  const [points, setPoints] = useState<Point[] | null>(null);
  const [coverage, setCoverage] = useState<number>(0);
  const [capturedCard, setCapturedCard] = useState<string | null>(null);
  const [lastMetrics, setLastMetrics] = useState<DetectionMetrics | null>(null);
  const [secondBestScore, setSecondBestScore] = useState<number>(Infinity);
  const [candidatesCount, setCandidatesCount] = useState<number>(0);

  const missedFrames = useRef(0);
  const stabilityStartTime = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (typeof document !== "undefined" && !canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
  }, []);

  const getCroppedFrame = useCallback(() => {
    const current = videoRef.current;
    const video = current && "video" in current ? current.video : current;
    const frame = frameRef.current;

    if (
      !cv ||
      !video ||
      !(video instanceof HTMLVideoElement) ||
      !frame ||
      !video.videoWidth ||
      !canvasRef.current
    )
      return null;

    const container = frame.parentElement;
    if (!container) return null;

    const { width: containerW, height: containerH } =
      container.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const scaleX = video.videoWidth / containerW;
    const scaleY = video.videoHeight / containerH;
    const scale = Math.max(scaleX, scaleY);

    const renderedW = video.videoWidth / scale;
    const renderedH = video.videoHeight / scale;
    const offsetX = (containerW - renderedW) / 2;
    const offsetY = (containerH - renderedH) / 2;

    const frameX = frameRect.left - containerRect.left;
    const frameY = frameRect.top - containerRect.top;

    const rawX = (frameX - offsetX) * scale;
    const rawY = (frameY - offsetY) * scale;
    const rawW = frameRect.width * scale;
    const rawH = frameRect.height * scale;

    const srcX = Math.max(0, Math.min(video.videoWidth, rawX));
    const srcY = Math.max(0, Math.min(video.videoHeight, rawY));
    const srcW = Math.max(0, Math.min(video.videoWidth - srcX, rawW));
    const srcH = Math.max(0, Math.min(video.videoHeight - srcY, rawH));

    const analysisCanvas = canvasRef.current;
    analysisCanvas.width = srcW;
    analysisCanvas.height = srcH;
    const ctx = analysisCanvas.getContext("2d");
    if (!ctx || srcW <= 0 || srcH <= 0) return null;

    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

    return {
      mat: cv.imread(analysisCanvas),
      offset: { x: srcX, y: srcY },
      roiArea: srcW * srcH,
    };
  }, [cv, videoRef, frameRef]);

  const resetDetection = useCallback(() => {
    setCapturedCard(null);
    setPoints(null);
    setCoverage(0);
    setState("DETECTING");
    setLastMetrics(null);
    setSecondBestScore(Infinity);
    setCandidatesCount(0);
    missedFrames.current = 0;
    stabilityStartTime.current = null;
  }, []);

  const process = useCallback(() => {
    if (!cv || !videoRef.current) {
      if (!cv && state !== "ERROR") setState("ERROR");
      return;
    }

    if (capturedCard) return;

    const cropped = getCroppedFrame();
    if (!cropped) return;
    const { mat, offset, roiArea } = cropped;

    try {
      const {
        best,
        secondBestScore: sbs,
        allCandidates,
        rawBest,
      } = detectDocument(cv, mat, config);

      setSecondBestScore(sbs);
      setCandidatesCount(allCandidates.length);
      setLastMetrics(rawBest?.metrics ?? null);

      if (best) {
        const detected = best.points;
        missedFrames.current = 0;

        if (state !== "STABILIZING" && state !== "READY_TO_CAPTURE") {
          setState("STABILIZING");
          stabilityStartTime.current = Date.now();
        } else if (state === "STABILIZING" && stabilityStartTime.current) {
          if (Date.now() - stabilityStartTime.current >= 1500) {
            setState("READY_TO_CAPTURE");

            // ── Crop via shared utility — no duplicate logic here ──────────
            const dataUrl = cropMatToDataUrl(cv, mat, detected);

            setCapturedCard(dataUrl);
            setState("CAPTURED");
            onDetectedStable?.(dataUrl);
          }
        }

        const cardArea = calculateArea(detected);
        setCoverage(cardArea / roiArea);

        const globalPoints = detected.map((p) => ({
          x: p.x + offset.x,
          y: p.y + offset.y,
        }));

        setPoints((prev) =>
          prev
            ? globalPoints.map((p, i) => ({
                x: p.x * EMA_ALPHA + prev[i].x * (1 - EMA_ALPHA),
                y: p.y * EMA_ALPHA + prev[i].y * (1 - EMA_ALPHA),
              }))
            : globalPoints,
        );
      } else {
        missedFrames.current += 1;
        setCoverage(0);
        if (missedFrames.current >= MAX_MISSED_FRAMES) {
          setPoints(null);
          setState("DETECTING");
          stabilityStartTime.current = null;
        }
      }
    } catch (e) {
      console.error("Frame processing error:", e);
      missedFrames.current += 1;
      setCoverage(0);
      if (missedFrames.current >= MAX_MISSED_FRAMES) {
        setPoints(null);
        setState("DETECTING");
        stabilityStartTime.current = null;
      }
    } finally {
      mat.delete();
    }
  }, [
    cv,
    videoRef,
    state,
    getCroppedFrame,
    onDetectedStable,
    capturedCard,
    config,
  ]);

  useEffect(() => {
    if (videoRef.current && state === "READY") setState("DETECTING");
  }, [videoRef, state]);

  return {
    state,
    points,
    coverage,
    capturedCard,
    lastMetrics,
    secondBestScore,
    candidatesCount,
    process,
    resetDetection,
  };
};
