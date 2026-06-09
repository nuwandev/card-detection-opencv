"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { Point } from "../types/geometry";
import { detectDocument } from "../lib/detector";
import { frameToMat } from "../runtime/frame";

const EMA_ALPHA = 0.15; // Lower alpha = smoother, less jittery
const MAX_MISSED_FRAMES = 5; // How many frames to "ignore" a failure

export const useCardDetection = (
  cv: Window['cv'] | null,
  videoElement: HTMLVideoElement | null
) => {
  const [points, setPoints] = useState<Point[] | null>(null);
  const missedFrames = useRef(0); // Track missing frames
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize canvas only once on client
  useEffect(() => {
    if (typeof document !== "undefined" && !canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
  }, []);

  const process = useCallback(() => {
    if (!cv || !videoElement || !canvasRef.current) return;

    // Use runtime frame processor
    const src = frameToMat(cv, videoElement, canvasRef.current);
    if (!src) return;

    try {
      const detected = detectDocument(cv, src);

      if (detected) {
        missedFrames.current = 0; // Reset counter on success
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
        // Increment counter instead of immediately nulling
        missedFrames.current += 1;
        if (missedFrames.current >= MAX_MISSED_FRAMES) {
          setPoints(null);
        }
      }
    } catch (e) {
      console.error("Frame processing error:", e);
      // Handle error same as missing
      missedFrames.current += 1;
      if (missedFrames.current >= MAX_MISSED_FRAMES) setPoints(null);
    } finally {
      src.delete();
    }
  }, [cv, videoElement, points]);

  return {
    points,
    process
  };
};

