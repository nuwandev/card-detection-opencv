"use client";

import { useCallback, useRef } from "react";
import { Point } from "../types/geometry";
import { detectDocument } from "../utils/documentDetection";

const EMA_ALPHA = 0.3; // Smoothing factor

export const useCardDetection = (cvReady: boolean) => {
  const pointsRef = useRef<Point[] | null>(null);

  const processFrame = useCallback((video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    if (!cvReady || !window.cv) return;

    const cv = window.cv;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Synchronize canvas size
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // Capture frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const src = cv.imread(canvas);
    
    try {
      const detected = detectDocument(cv, src);

      if (detected) {
        if (pointsRef.current) {
          // Linear Interpolation for smoothing
          pointsRef.current = detected.map((p, i) => ({
            x: p.x * EMA_ALPHA + pointsRef.current![i].x * (1 - EMA_ALPHA),
            y: p.y * EMA_ALPHA + pointsRef.current![i].y * (1 - EMA_ALPHA),
          }));
        } else {
          pointsRef.current = detected;
        }
      } else {
        pointsRef.current = null;
      }
    } catch (e) {
      console.error("Frame processing error:", e);
    } finally {
      src.delete();
    }
  }, [cvReady]);

  return {
    processFrame,
    pointsRef
  };
};
