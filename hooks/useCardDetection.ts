"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { Point } from "../types/geometry";
import { detectDocument } from "../lib/detector";
import { frameToMat } from "../runtime/frame";

// High alpha makes tracking more responsive but more prone to jitter.
const EMA_ALPHA = 0.5;
// Defines the buffer for failure before resetting the detected state.
const MAX_MISSED_FRAMES = 5;

export type DetectionState = 'READY' | 'DETECTING' | 'DETECTED' | 'ERROR';

/**
 * Hook managing the card detection lifecycle, including frame processing,
 * state transitions, and coordinate smoothing.
 */
export const useCardDetection = (
  cv: Window['cv'] | null,
  videoElement: HTMLVideoElement | null
) => {
  const [state, setState] = useState<DetectionState>('READY');
  const [points, setPoints] = useState<Point[] | null>(null);
  const missedFrames = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (typeof document !== "undefined" && !canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
  }, []);

  const process = useCallback(() => {
    if (!cv || !videoElement || !canvasRef.current) {
      if (!cv && state !== 'ERROR') setState('ERROR');
      return;
    }

    const src = frameToMat(cv, videoElement, canvasRef.current);
    if (!src) return;

    try {
      const detected = detectDocument(cv, src);

      if (detected) {
        missedFrames.current = 0;
        setState('DETECTED');
        
        if (points) {
          // Use Exponential Moving Average (EMA) to smooth corner movement and reduce visual jitter.
          setPoints(detected.map((p, i) => ({
            x: p.x * EMA_ALPHA + points[i].x * (1 - EMA_ALPHA),
            y: p.y * EMA_ALPHA + points[i].y * (1 - EMA_ALPHA),
          })));
        } else {
          setPoints(detected);
        }
      } else {
        missedFrames.current += 1;
        if (missedFrames.current >= MAX_MISSED_FRAMES) {
          setPoints(null);
          setState('DETECTING');
        }
      }
    } catch (e) {
      console.error("Frame processing error:", e);
      missedFrames.current += 1;
      if (missedFrames.current >= MAX_MISSED_FRAMES) {
        setPoints(null);
        setState('DETECTING');
      }
    } finally {
      src.delete();
    }
  }, [cv, videoElement, points, state]);

  useEffect(() => {
    if (videoElement && state === 'READY') {
      setState('DETECTING');
    }
  }, [videoElement, state]);

  return {
    state,
    points,
    process
  };
};
