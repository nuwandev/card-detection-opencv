"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import Webcam from "react-webcam";
import { useOpenCV } from "@/hooks/useOpenCV";
import { useCardDetection } from "@/hooks/useCardDetection";
import { useFrameLoop } from "@/lib/utils/useFrameLoop";
import { getDisplayScale, scalePoints, type DisplayScale } from "@/lib/utils/canvasScale";

export default function Home() {
  const { ready, cv } = useOpenCV();
  const webcamRef = useRef<Webcam>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [displayScale, setDisplayScale] = useState<DisplayScale>({ scale: 1, offsetX: 0, offsetY: 0 });

  const { state, points, coverage, process } = useCardDetection(
    cv, 
    webcamRef, 
    frameRef,
    () => console.log("Card detected and stable! Ready to capture.")
  );

  // Detection Loop (Throttled for performance)
  useFrameLoop(ready && !!cv, process, 24);

  // Update scaling factor when ready or window resizes
  useEffect(() => {
    if (!ready) return;
    
    const updateScale = () => {
      const video = webcamRef.current?.video || null;
      const container = frameRef.current?.parentElement || null;
      setDisplayScale(getDisplayScale(video, container));
    };

    updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [ready]);

  const scaledPoints = useMemo(() => scalePoints(points, displayScale), [points, displayScale]);

  const isReadyToCapture = state === 'READY_TO_CAPTURE';

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

        {/* Debug Info (Top Left) */}
        <div className="absolute top-4 left-4 z-30 flex flex-col gap-2 pointer-events-none">
          <div className="px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-lg border border-white/10">
            <p className="text-[10px] text-white/50 uppercase tracking-tighter">Fitness (Coverage)</p>
            <p className={`text-sm font-mono font-bold ${isReadyToCapture ? 'text-green-400' : 'text-white'}`}>
              {(coverage * 100).toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Guide Frame (Matches original visual flow) */}
        <div className="absolute inset-0 z-20 pointer-events-none flex flex-col items-center justify-between p-6">
          <div className="mt-8 px-4 py-2 bg-black/50 backdrop-blur-md rounded-full border border-white/10">
            <p className={`text-[10px] font-bold uppercase tracking-widest ${state === 'READY_TO_CAPTURE' ? 'text-green-400' : (state === 'STABILIZING' ? 'text-blue-400' : 'text-amber-400')}`}>
              ● {state}
            </p>
          </div>

          <div ref={frameRef} className={`w-full max-w-sm aspect-[1.6] border-2 transition-colors duration-200 ${isReadyToCapture ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.3)]' : (state === 'STABILIZING' ? 'border-blue-500' : 'border-white/30')} rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]`} />

          <div className="mb-8 px-4 py-2 bg-black/50 backdrop-blur-md rounded-lg">
            <p className="text-[10px] uppercase text-white/50 tracking-widest">
              {isReadyToCapture ? 'READY TO CAPTURE' : (state === 'STABILIZING' ? 'HOLD STEADY' : 'Position card inside the frame')}
            </p>
          </div>
        </div>

        {/* Example usage: Simple SVG overlay for detected points */}
        {scaledPoints && (
          <svg className="absolute inset-0 w-full h-full z-10 pointer-events-none">
            <polygon
              points={scaledPoints.map(p => `${p.x},${p.y}`).join(" ")}
              className={isReadyToCapture ? "fill-green-500/20 stroke-green-500 stroke-6" : "fill-blue-500/20 stroke-blue-500 stroke-6"}
            />
          </svg>
        )}
      </div>
    </main>
  );
}
