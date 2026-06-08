"use client";

import { useState, useCallback, useRef } from "react";
import { Point } from "../types/geometry";
import { detectDocument, isSameQuad } from "../utils/documentDetection";

interface CardDetectionResult {
  points: Point[] | null;
  isStable: boolean;
  stableCount: number;
}

export const useCardDetection = (cvReady: boolean) => {
  const [result, setResult] = useState<CardDetectionResult>({
    points: null,
    isStable: false,
    stableCount: 0,
  });

  const lastPointsRef = useRef<Point[] | null>(null);
  const stableCountRef = useRef(0);

  const processFrame = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    if (!cvReady) return;

    const cv = window.cv;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Synchronize canvas size with video frame
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // Capture current frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const src = cv.imread(canvas);
    
    try {
      const points = detectDocument(cv, src);

      if (points) {
        if (isSameQuad(points, lastPointsRef.current, 50)) {
          stableCountRef.current++;
        } else {
          stableCountRef.current = 0;
        }
        lastPointsRef.current = points;

        const isStable = stableCountRef.current >= 10;

        setResult({
          points,
          isStable,
          stableCount: stableCountRef.current,
        });
      } else {
        stableCountRef.current = 0;
        lastPointsRef.current = null;
        setResult({
          points: null,
          isStable: false,
          stableCount: 0,
        });
      }
    } catch (e) {
      console.error("Frame processing error:", e);
    } finally {
      src.delete();
    }
  }, [cvReady]);

  return {
    processFrame,
    ...result
  };
};
