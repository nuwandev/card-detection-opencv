"use client";

import { useEffect, useRef } from "react";
import Webcam from "react-webcam";

import { useOpenCV } from "@/hooks/useOpenCV";
import { useCamera } from "@/hooks/useCamera";
import { useCardDetection } from "@/hooks/useCardDetection";

export default function Home() {
  const cvReady = useOpenCV();
  const { webcamRef, getVideoElement } = useCamera();
  const { processFrame, points, isStable } = useCardDetection(cvReady);

  const processingCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!cvReady) return;

    let frameId: number;
    let lastTime = 0;
    const fps = 20; // Limit to 20 FPS
    const interval = 1000 / fps;

    const loop = (time: number) => {
      const video = getVideoElement();
      const canvas = processingCanvasRef.current;

      if (time - lastTime >= interval) {
        if (video && canvas && video.readyState >= 2) {
          processFrame(video, canvas);
        }
        lastTime = time;
      }
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [cvReady, getVideoElement, processFrame]);

  // Draw overlay
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    const video = getVideoElement();
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Keep overlay resolution in sync with video
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (points) {
      // Draw detected polygon
      ctx.strokeStyle = isStable ? "#00ff00" : "#ffff00";
      ctx.lineWidth = 6;
      ctx.lineJoin = "round";
      
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.lineTo(points[2].x, points[2].y);
      ctx.lineTo(points[3].x, points[3].y);
      ctx.closePath();
      ctx.stroke();

      // Inner fill for better visibility
      ctx.fillStyle = isStable ? "rgba(0, 255, 0, 0.2)" : "rgba(255, 255, 0, 0.1)";
      ctx.fill();

      // Draw corner points
      ctx.fillStyle = "white";
      points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }, [points, isStable, getVideoElement]);

  return (
    <main className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
      {/* Container: Stacked elements using relative/absolute */}
      <div className="relative w-full h-full">
        {!cvReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-black/90">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-blue-400 font-medium text-xs tracking-widest">INITIALIZING...</p>
          </div>
        )}

        {/* Video feed - The only source */}
        <Webcam
          ref={webcamRef}
          audio={false}
          videoConstraints={{ 
            facingMode: "environment",
            width: { ideal: 640 },
            height: { ideal: 480 }
          }}
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Overlay canvas - Perfectly aligned on top */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full object-cover z-10"
        />

        {/* Hidden processing canvas */}
        <canvas ref={processingCanvasRef} className="hidden" />

        {/* HUD Elements */}
        <div className="absolute inset-0 z-20 pointer-events-none flex flex-col items-center justify-between p-6">
          {/* Header */}
          <div className="mt-8 px-4 py-2 bg-black/50 backdrop-blur-md rounded-full border border-white/10">
            <p className={`text-[10px] font-bold uppercase tracking-widest ${
              isStable ? "text-green-400" : "text-white/70"
            }`}>
              {isStable ? "● CARD DETECTED" : points ? "● ALIGNING..." : "● SCANNING..."}
            </p>
          </div>

          {/* Frame Guide - Centered */}
          <div className="w-full max-w-sm aspect-[1.6] border-2 border-white/30 rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />

          {/* Footer instruction */}
          <div className="mb-8 px-4 py-2 bg-black/50 backdrop-blur-md rounded-lg">
            <p className="text-[10px] uppercase text-white/50 tracking-widest">
              Position card inside the frame
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
