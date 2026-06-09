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
 * Hook managing the card detection lifecycle.
 * Accepts refs to the video and guide frame to automatically handle ROI cropping
 * via a canvas-based approach.
 */
export const useCardDetection = (
  cv: Window['cv'] | null,
  videoRef: React.RefObject<HTMLVideoElement>,
  frameRef: React.RefObject<HTMLDivElement>
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

  const getCroppedFrame = useCallback(() => {
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video || !frame || !video.videoWidth || !canvasRef.current) return null;

    const videoRect = video.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();

    const scaleX = video.videoWidth / videoRect.width;
    const scaleY = video.videoHeight / videoRect.height;

    // Calculate crop dimensions relative to video source
    const srcX = Math.max(0, (frameRect.left - videoRect.left) * scaleX);
    const srcY = Math.max(0, (frameRect.top - videoRect.top) * scaleY);
    const srcW = Math.min(frameRect.width * scaleX, video.videoWidth - srcX);
    const srcH = Math.min(frameRect.height * scaleY, video.videoHeight - srcY);

    // Resize canvas to frame dimensions for analysis
    const analysisCanvas = canvasRef.current;
    analysisCanvas.width = srcW;
    analysisCanvas.height = srcH;
    const ctx = analysisCanvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

    return {
        mat: cv.imread(analysisCanvas),
        offset: { x: srcX, y: srcY }
    };
  }, [cv, videoRef, frameRef]);

  const process = useCallback(() => {
    if (!cv || !videoRef.current) {
      if (!cv && state !== 'ERROR') setState('ERROR');
      return;
    }

    const cropped = getCroppedFrame();
    if (!cropped) return;
    const { mat, offset } = cropped;

    try {
      const detected = detectDocument(cv, mat);

      if (detected) {
        missedFrames.current = 0;
        setState('DETECTED');
        
        // Offset detected points back to global video coordinates
        const globalPoints = detected.map(p => ({ x: p.x + offset.x, y: p.y + offset.y }));

        if (points) {
          setPoints(globalPoints.map((p, i) => ({
            x: p.x * EMA_ALPHA + points[i].x * (1 - EMA_ALPHA),
            y: p.y * EMA_ALPHA + points[i].y * (1 - EMA_ALPHA),
          })));
        } else {
          setPoints(globalPoints);
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
      mat.delete();
    }
  }, [cv, videoRef, points, state, getCroppedFrame]);

  useEffect(() => {
    if (videoRef.current && state === 'READY') {
      setState('DETECTING');
    }
  }, [videoRef, state]);

  return {
    state,
    points,
    process
  };
};
