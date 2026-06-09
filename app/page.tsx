"use client";

import { useRef, useEffect, useState } from "react";
import Webcam from "react-webcam";
import { useOpenCV } from "@/hooks/useOpenCV";
import { useCardDetection } from "@/hooks/useCardDetection";

export default function Home() {
  const { ready, cv } = useOpenCV();
  const webcamRef = useRef<Webcam>(null);
  
  const { state, points, process } = useCardDetection(cv, webcamRef.current?.video || null);

  // Detection Loop (Throttled for performance)
  useEffect(() => {
    if (!ready || !cv) return;

    let frameId: number;
    let lastTime = 0;
    const interval = 1000 / 24; // 24 FPS detection

    const loop = (time: number) => {
      if (time - lastTime >= interval) {
        process();
        lastTime = time;
      }
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [ready, cv, process]);

  // Calculate scaling factor and offset between video resolution and display size
  const getScale = () => {
    const video = webcamRef.current?.video;
    if (!video || !video.videoWidth) return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
    
    const rect = video.getBoundingClientRect();
    const videoRatio = video.videoWidth / video.videoHeight;
    const containerRatio = rect.width / rect.height;

    let displayWidth = rect.width;
    let displayHeight = rect.height;
    let offsetX = 0;
    let offsetY = 0;

    // Handle object-contain (letterboxing)
    if (containerRatio > videoRatio) {
      displayWidth = rect.height * videoRatio;
      offsetX = (rect.width - displayWidth) / 2;
    } else {
      displayHeight = rect.width / videoRatio;
      offsetY = (rect.height - displayHeight) / 2;
    }

    return {
      scaleX: displayWidth / video.videoWidth,
      scaleY: displayHeight / video.videoHeight,
      offsetX,
      offsetY
    };
  };

  const { scaleX, scaleY, offsetX, offsetY } = getScale();
  const scaledPoints = points ? points.map(p => ({ 
    x: p.x * scaleX + offsetX, 
    y: p.y * scaleY + offsetY 
  })) : null;

  return (
    <main className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="relative w-full h-full">
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/90 text-white">
            Loading OpenCV...
          </div>
        )}

        <Webcam
          ref={webcamRef}
          audio={false}
          videoConstraints={{ facingMode: "environment" }}
          className="absolute inset-0 w-full h-full object-contain"
        />

        {/* Guide Frame (Matches original visual flow) */}
        <div className="absolute inset-0 z-20 pointer-events-none flex flex-col items-center justify-between p-6">
          <div className="mt-8 px-4 py-2 bg-black/50 backdrop-blur-md rounded-full border border-white/10">
            <p className={`text-[10px] font-bold uppercase tracking-widest ${state === 'DETECTED' ? 'text-green-400' : 'text-amber-400'}`}>
              ● {state}
            </p>
          </div>

          <div className={`w-full max-w-sm aspect-[1.6] border-2 ${state === 'DETECTED' ? 'border-green-500' : 'border-white/30'} rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]`} />

          <div className="mb-8 px-4 py-2 bg-black/50 backdrop-blur-md rounded-lg">
            <p className="text-[10px] uppercase text-white/50 tracking-widest">
              {state === 'DETECTED' ? 'Card detected!' : 'Position card inside the frame'}
            </p>
          </div>
        </div>

        {/* Example usage: Simple SVG overlay for detected points */}
        {scaledPoints && (
          <svg className="absolute inset-0 w-full h-full z-10 pointer-events-none">
            <polygon
              points={scaledPoints.map(p => `${p.x},${p.y}`).join(" ")}
              className="fill-green-500/20 stroke-green-500 stroke-[6]"
            />
          </svg>
        )}
      </div>
    </main>
  );
}
