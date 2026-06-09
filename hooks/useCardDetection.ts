"use client";

import { useCallback, useRef, useState } from "react";
import { Point } from "../types/geometry";
import { detectDocument } from "../lib/detector";
import { frameToMat } from "../runtime/frame";

const EMA_ALPHA = 0.15; // Lower alpha = smoother, less jittery

export const useCardDetection = (
  cv: Window['cv'] | null,
  videoElement: HTMLVideoElement | null,
  roi?: { x: number; y: number; width: number; height: number }
) => {
  const [points, setPoints] = useState<Point[] | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(
    typeof document !== "undefined" ? document.createElement("canvas") : ({} as any)
  );

  const isPointInRoi = (p: Point) => {
    if (!roi) return true;
    return p.x >= roi.x && p.x <= roi.x + roi.width &&
           p.y >= roi.y && p.y <= roi.y + roi.height;
  };

  const process = useCallback(() => {
    if (!cv || !videoElement || !canvasRef.current) return;

    const src = frameToMat(cv, videoElement, canvasRef.current, roi);
    if (!src) return;
    
    try {
      const detected = detectDocument(cv, src);

      if (detected) {
        if (points) {
          // Linear Interpolation for smoothing
          setPoints(detected.map((p, i) => ({
            x: p.x * EMA_ALPHA + points[i].x * (1 - EMA_ALPHA),
            y: p.y * EMA_ALPHA + points[i].y * (1 - EMA_ALPHA),
          })));
        } else {
          setPoints(detected);
        }
      } else {
        setPoints(null);
      }
    } catch (e) {
      console.error("Frame processing error:", e);
    } finally {
      src.delete();
    }
  }, [cv, videoElement, points, roi]);

  return {
    points,
    process
  };
};
