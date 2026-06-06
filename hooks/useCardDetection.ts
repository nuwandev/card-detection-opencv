"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type Webcam from "react-webcam";
import { detectRectangle } from "@/lib/opencv/detector";
import type { DetectionResult, DetectionStatus, ScanZone } from "@/lib/opencv/types";

const DETECTION_INTERVAL_MS = 100; // ~10fps detection

interface UseCardDetectionOptions {
  webcamRef: RefObject<Webcam | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  scanZone: ScanZone;
  enabled: boolean;
}

interface UseCardDetectionReturn {
  detectionStatus: DetectionStatus;
  lastResult: DetectionResult | null;
}

export function useCardDetection({
  webcamRef,
  canvasRef,
  scanZone,
  enabled,
}: UseCardDetectionOptions): UseCardDetectionReturn {
  const [detectionStatus, setDetectionStatus] = useState<DetectionStatus>("idle");
  const [lastResult, setLastResult] = useState<DetectionResult | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const runDetection = useCallback(() => {
    const webcam = webcamRef.current;
    if (!webcam) return;

    const video = webcam.video;
    if (!video || video.readyState !== 4) return;

    const { videoWidth, videoHeight } = video;
    if (!videoWidth || !videoHeight) return;

    // Create/reuse offscreen canvas for frame capture
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement("canvas");
    }
    const offscreen = offscreenCanvasRef.current;
    offscreen.width = videoWidth;
    offscreen.height = videoHeight;

    const ctx = offscreen.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, videoWidth, videoHeight);
    const imageData = ctx.getImageData(0, 0, videoWidth, videoHeight);

    setDetectionStatus("detecting");

    const result = detectRectangle(imageData, scanZone);
    setLastResult(result);
    setDetectionStatus(result.status === "detected" ? "detected" : "not_detected");

    // Draw debug overlay on overlay canvas
    drawOverlay(canvasRef.current, result, scanZone, videoWidth, videoHeight);
  }, [webcamRef, canvasRef, scanZone]);

  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setDetectionStatus("idle");
      return;
    }

    intervalRef.current = setInterval(runDetection, DETECTION_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, runDetection]);

  return { detectionStatus, lastResult };
}

function drawOverlay(
  canvas: HTMLCanvasElement | null,
  result: DetectionResult,
  scanZone: ScanZone,
  videoWidth: number,
  videoHeight: number
): void {
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (result.status !== "detected" || !result.quad) return;

  // Scale quad points from video space to canvas space
  const scaleX = canvas.width / videoWidth;
  const scaleY = canvas.height / videoHeight;

  const { topLeft, topRight, bottomRight, bottomLeft } = result.quad;

  const pts = [
    { x: topLeft.x * scaleX, y: topLeft.y * scaleY },
    { x: topRight.x * scaleX, y: topRight.y * scaleY },
    { x: bottomRight.x * scaleX, y: bottomRight.y * scaleY },
    { x: bottomLeft.x * scaleX, y: bottomLeft.y * scaleY },
  ];

  // Draw detected rectangle outline
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.closePath();
  ctx.strokeStyle = "rgba(34, 197, 94, 0.9)"; // green-500
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw corner dots
  pts.forEach((pt) => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(34, 197, 94, 1)";
    ctx.fill();
  });
}