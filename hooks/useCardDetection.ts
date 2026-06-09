"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { Point } from "../types/geometry";
import { detectDocument } from "../lib/detector";
import { frameToMat } from "../lib/frame";

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

    // Use parent container for scaling calculations (as per verified implementation)
    const container = frame.parentElement;
    if (!container) return null;
    
    const { width: containerW, height: containerH } = container.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Mapping video pixels to container space (object-fit: cover)
    const scaleX = video.videoWidth / containerW;
    const scaleY = video.videoHeight / containerH;
    const scale = Math.max(scaleX, scaleY);

    // Calculate offsets to account for object-fit: cover centering
    const renderedW = video.videoWidth / scale;
    const renderedH = video.videoHeight / scale;
    const offsetX = (containerW - renderedW) / 2;
    const offsetY = (containerH - renderedH) / 2;

    // Calculate frame position relative to container
    const frameX = frameRect.left - containerRect.left;
    const frameY = frameRect.top - containerRect.top;

    // Bridge the gap: Frame rect (DOM) to Video (Pixel)
    const srcX = (frameX - offsetX) * scale;
    const srcY = (frameY - offsetY) * scale;
    const srcW = frameRect.width * scale;
    const srcH = frameRect.height * scale;

    // Resize canvas for analysis
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
