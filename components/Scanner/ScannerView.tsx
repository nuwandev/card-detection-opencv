"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";
import { useOpenCV } from "@/hooks/useOpenCV";
import { useCardDetection } from "@/hooks/useCardDetection";
import { ScanOverlay } from "./ScanOverlay";
import { StatusBadge } from "./StatusBadge";
import type { ScanZone } from "@/lib/opencv/types";

// The scan zone is defined as a % of the video frame (matching the CSS layout)
// 80% wide (10% margin each side), 60% tall (20% margin each side)
const SCAN_ZONE_FRACTION = { x: 0.1, y: 0.2, w: 0.8, h: 0.6 };

export function ScannerView() {
  const webcamRef = useRef<Webcam>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { status: opencvStatus } = useOpenCV();
  const [scanZone, setScanZone] = useState<ScanZone>({ x: 0, y: 0, width: 640, height: 480 });
  const [cameraReady, setCameraReady] = useState(false);

  // Update scan zone when video dimensions are known
  const handleUserMedia = useCallback((stream: MediaStream) => {
    const track = stream.getVideoTracks()[0];
    const { width = 1280, height = 720 } = track.getSettings();

    // Sync overlay canvas to video resolution
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.width = width;
      overlayCanvasRef.current.height = height;
    }

    setScanZone({
      x: width * SCAN_ZONE_FRACTION.x,
      y: height * SCAN_ZONE_FRACTION.y,
      width: width * SCAN_ZONE_FRACTION.w,
      height: height * SCAN_ZONE_FRACTION.h,
    });

    setCameraReady(true);
    console.log(`[Scanner] Camera ready: ${width}×${height}`);
  }, []);

  const detectionEnabled = opencvStatus === "ready" && cameraReady;

  const { detectionStatus, lastResult } = useCardDetection({
    webcamRef,
    canvasRef: overlayCanvasRef,
    scanZone,
    enabled: detectionEnabled,
  });

  // Console logging as requested
  useEffect(() => {
    if (!lastResult) return;
    if (lastResult.status === "detected") {
      console.log(
        `[Scanner] ✅ DETECTED — confidence: ${(lastResult.confidence * 100).toFixed(1)}%`,
        lastResult.quad
      );
    } else {
      console.log("[Scanner] ❌ NOT DETECTED");
    }
  }, [lastResult]);

  const videoConstraints: MediaTrackConstraints = {
    facingMode: "environment", // rear camera on mobile, fallback to any
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-screen bg-black overflow-hidden"
    >
      {/* CAMERA FEED — fills entire screen */}
      <Webcam
        ref={webcamRef}
        audio={false}
        videoConstraints={videoConstraints}
        onUserMedia={handleUserMedia}
        onUserMediaError={(err) => console.error("[Scanner] Camera error:", err)}
        className="absolute inset-0 w-full h-full object-cover"
        screenshotFormat="image/jpeg"
        mirrored={false}
      />

      {/* SCAN ZONE OVERLAY + CORNER BRACKETS */}
      {cameraReady && (
        <ScanOverlay ref={overlayCanvasRef} status={detectionStatus} />
      )}

      {/* STATUS BADGE — bottom center */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <StatusBadge
          status={opencvStatus !== "ready" ? "idle" : detectionStatus}
          confidence={lastResult?.confidence ?? 0}
        />
      </div>

      {/* OPENCV LOADING OVERLAY */}
      {opencvStatus === "loading" && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-20 gap-4">
          <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-white/70 text-sm">Loading OpenCV…</p>
        </div>
      )}

      {opencvStatus === "error" && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20">
          <div className="text-center text-white">
            <p className="text-red-400 text-lg font-semibold mb-2">OpenCV failed to load</p>
            <p className="text-white/60 text-sm">Check your network connection</p>
          </div>
        </div>
      )}

      {/* HINT TEXT */}
      {detectionEnabled && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10">
          <p className="text-white/60 text-xs tracking-widest uppercase">
            Place card within frame
          </p>
        </div>
      )}
    </div>
  );
}