"use client";

import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import Webcam from "react-webcam";
import { useOpenCV } from "@/hooks/useOpenCV";
import { useCardDetection } from "@/hooks/useCardDetection";
import { useFrameLoop } from "@/lib/utils/useFrameLoop";
import { getDisplayScale, scalePoints, type DisplayScale } from "@/lib/utils/canvasScale";
import { DEFAULT_DETECTOR_CONFIG, type DetectorConfig } from "@/lib/detector";

export default function Home() {
  const { ready, cv } = useOpenCV();
  const webcamRef = useRef<Webcam>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [displayScale, setDisplayScale] = useState<DisplayScale>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [config, setConfig] = useState<DetectorConfig>(DEFAULT_DETECTOR_CONFIG);
  const [showTuning, setShowTuning] = useState(false);

  const { 
    state, 
    points, 
    coverage, 
    capturedCard, 
    lastMetrics,
    secondBestScore,
    candidatesCount,
    process, 
    resetDetection 
  } = useCardDetection(
    cv, 
    webcamRef, 
    frameRef,
    config,
    (url) => console.log("Card detected and stable! Autocaptured.")
  );

  // Detection Loop (Throttled for performance)
  useFrameLoop(ready && !!cv, process, 24);

  // Update scaling factor function
  const updateScale = useCallback(() => {
    const video = webcamRef.current?.video || null;
    const container = frameRef.current?.parentElement || null;
    if (video && container) {
      setDisplayScale(getDisplayScale(video, container));
    }
  }, [webcamRef, frameRef]);

  // Update scaling factor when ready or window resizes or video status changes
  useEffect(() => {
    if (!ready) return;
    
    updateScale();
    
    const videoElement = webcamRef.current?.video || null;
    if (videoElement) {
      videoElement.addEventListener("loadedmetadata", updateScale);
      videoElement.addEventListener("playing", updateScale);
      // If metadata is already loaded
      if (videoElement.readyState >= 1) {
        updateScale();
      }
    }

    window.addEventListener("resize", updateScale);
    return () => {
      if (videoElement) {
        videoElement.removeEventListener("loadedmetadata", updateScale);
        videoElement.removeEventListener("playing", updateScale);
      }
      window.removeEventListener("resize", updateScale);
    };
  }, [ready, updateScale]);

  const scaledPoints = useMemo(() => scalePoints(points, displayScale), [points, displayScale]);

  const handleDownload = () => {
    if (!capturedCard) return;
    const link = document.createElement("a");
    link.href = capturedCard;
    link.download = `captured-card-${Date.now()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusText = () => {
    switch (state) {
      case 'DETECTING':
        return 'Align card within the frame';
      case 'STABILIZING':
        return 'Hold steady...';
      case 'READY_TO_CAPTURE':
        return 'Autocapturing...';
      case 'CAPTURED':
        return 'Card captured successfully!';
      default:
        return 'Initializing...';
    }
  };

  const updateConfigValue = (key: keyof DetectorConfig, val: number) => {
    setConfig(prev => ({
      ...prev,
      [key]: val
    }));
  };

  // Determine if the best candidate meets the requirements
  const scoreSatisfied = lastMetrics ? lastMetrics.score < config.qualityFloor : false;
  const confidenceSatisfied = lastMetrics ? (secondBestScore - lastMetrics.score) > config.confidenceGap : false;

  return (
    <main className="fixed inset-0 bg-neutral-950 flex flex-col items-center justify-between text-white font-sans overflow-hidden">
      {/* Premium Header */}
      <header className="w-full z-40 px-6 py-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-sm font-bold uppercase tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-neutral-100 to-neutral-400">
            CardVision AI
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowTuning(!showTuning)}
            className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
              showTuning 
                ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.2)]" 
                : "bg-neutral-800/80 border-neutral-700 hover:border-neutral-600 text-neutral-300"
            }`}
          >
            ⚙️ Tune Parameters
          </button>
          <div className="px-3 py-1 text-[10px] uppercase font-mono font-bold tracking-widest bg-neutral-800/80 border border-neutral-700/50 rounded-full">
            {ready ? "OpenCV Active" : "WASM Loading..."}
          </div>
        </div>
      </header>

      {/* Main Viewport Container */}
      <div className="relative w-full flex-grow flex items-center justify-center">
        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-neutral-950/95 gap-3">
            <div className="h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-neutral-400 animate-pulse">Initializing Computer Vision Engine...</p>
          </div>
        )}

        {/* Webcam Viewport */}
        {ready && (
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            videoConstraints={{
              facingMode: "environment",
              width: { ideal: 1920 },
              height: { ideal: 1080 }
            }}
            onLoadedMetadata={updateScale}
            className="absolute inset-0 w-full h-full object-contain"
          />
        )}

        {/* SVG Bounding Outline */}
        {scaledPoints && state !== 'CAPTURED' && (
          <svg className="absolute inset-0 w-full h-full z-20 pointer-events-none">
            <polygon
              points={scaledPoints.map(p => `${p.x},${p.y}`).join(" ")}
              className={`fill-none stroke-[4] transition-all duration-150 ${
                state === 'STABILIZING' 
                  ? "stroke-sky-400/90 [stroke-dasharray:6,6] animate-[dash_2s_linear_infinite]" 
                  : "stroke-emerald-400/90 shadow-[0_0_15px_rgba(52,211,153,0.5)]"
              }`}
            />
            {scaledPoints.map((p, idx) => (
              <circle
                key={idx}
                cx={p.x}
                cy={p.y}
                r="6"
                className={state === 'STABILIZING' ? "fill-sky-400" : "fill-emerald-400"}
              />
            ))}
          </svg>
        )}

        {/* Camera Mask Guide Frame */}
        {state !== 'CAPTURED' && (
          <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center p-6">
            <div 
              ref={frameRef} 
              className={`w-full max-w-sm aspect-[1.58] border-2 transition-all duration-300 ${
                state === 'STABILIZING' 
                  ? 'border-sky-400 shadow-[0_0_30px_rgba(56,189,248,0.2)]' 
                  : state === 'READY_TO_CAPTURE'
                  ? 'border-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.4)]'
                  : 'border-white/30'
              } rounded-2xl shadow-[0_0_0_9999px_rgba(10,10,10,0.7)]`} 
            />
          </div>
        )}

        {/* Tuning Side Drawer */}
        {showTuning && (
          <div className="absolute top-0 right-0 h-full w-80 z-30 bg-neutral-900/95 backdrop-blur-md border-l border-white/10 p-6 flex flex-col gap-6 overflow-y-auto text-xs">
            <div>
              <h3 className="font-bold text-sm text-neutral-100 uppercase tracking-wider border-b border-white/10 pb-2">
                Live Parameters
              </h3>
            </div>

            {/* Live Metrics Dashboard */}
            <div className="flex flex-col gap-2.5 bg-black/40 border border-white/5 rounded-xl p-3.5 font-mono">
              <h4 className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                Detection Feed Metrics
              </h4>
              <div className="flex justify-between">
                <span className="text-neutral-400">Quads Found:</span>
                <span className={`font-semibold ${candidatesCount > 0 ? 'text-emerald-400' : 'text-amber-500'}`}>
                  {candidatesCount}
                </span>
              </div>
              {lastMetrics ? (
                <>
                  <div className="flex justify-between border-t border-white/5 pt-1.5 mt-1.5">
                    <span className="text-neutral-400">Best Score:</span>
                    <span className={`font-semibold ${scoreSatisfied ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {lastMetrics.score.toFixed(3)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] pl-2 text-neutral-400">
                    <span>Quality Floor:</span>
                    <span>{config.qualityFloor.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] pl-2 text-neutral-400">
                    <span>Score Pass:</span>
                    <span className={scoreSatisfied ? 'text-emerald-400' : 'text-rose-400'}>
                      {scoreSatisfied ? 'YES' : 'NO (Too High)'}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-white/5 pt-1.5 mt-1.5">
                    <span className="text-neutral-400">Confidence Gap:</span>
                    <span className={`font-semibold ${confidenceSatisfied ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {secondBestScore === Infinity ? '∞' : (secondBestScore - lastMetrics.score).toFixed(3)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] pl-2 text-neutral-400">
                    <span>Required Gap:</span>
                    <span>{config.confidenceGap.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] pl-2 text-neutral-400">
                    <span>Gap Pass:</span>
                    <span className={confidenceSatisfied ? 'text-emerald-400' : 'text-rose-400'}>
                      {confidenceSatisfied ? 'YES' : 'NO (Too Narrow)'}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-white/5 pt-1.5 mt-1.5">
                    <span className="text-neutral-400">Aspect Ratio:</span>
                    <span className="text-sky-300 font-semibold">{lastMetrics.ratio.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between text-[11px] pl-2 text-neutral-400">
                    <span>Diff from target:</span>
                    <span>{Math.abs(lastMetrics.ratio - config.targetAspectRatio).toFixed(3)}</span>
                  </div>
                </>
              ) : (
                <div className="text-neutral-500 italic text-center py-4 border-t border-white/5 mt-1.5">
                  No candidate shape detected
                </div>
              )}
            </div>

            {/* Parameters Controls */}
            <div className="flex flex-col gap-4">
              <h4 className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                Tune Settings
              </h4>

              {/* Min Area Ratio */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-neutral-300">
                  <span>Min Area %:</span>
                  <span className="font-mono">{(config.minAreaRatio * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.01"
                  max="0.25"
                  step="0.01"
                  value={config.minAreaRatio}
                  onChange={(e) => updateConfigValue("minAreaRatio", parseFloat(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              {/* Target Aspect Ratio */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-neutral-300">
                  <span>Target Aspect Ratio:</span>
                  <span className="font-mono">{config.targetAspectRatio.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="2.0"
                  step="0.02"
                  value={config.targetAspectRatio}
                  onChange={(e) => updateConfigValue("targetAspectRatio", parseFloat(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              {/* Aspect Ratio Tolerance */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-neutral-300">
                  <span>Aspect Tolerance:</span>
                  <span className="font-mono">{config.aspectRatioTolerance.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="0.6"
                  step="0.02"
                  value={config.aspectRatioTolerance}
                  onChange={(e) => updateConfigValue("aspectRatioTolerance", parseFloat(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              {/* Quality Floor */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-neutral-300">
                  <span>Quality Floor:</span>
                  <span className="font-mono">{config.qualityFloor.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="-0.5"
                  max="0.5"
                  step="0.05"
                  value={config.qualityFloor}
                  onChange={(e) => updateConfigValue("qualityFloor", parseFloat(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              {/* Confidence Gap */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-neutral-300">
                  <span>Confidence Gap:</span>
                  <span className="font-mono">{config.confidenceGap.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="0.4"
                  step="0.02"
                  value={config.confidenceGap}
                  onChange={(e) => updateConfigValue("confidenceGap", parseFloat(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              {/* Weight Edge */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-neutral-300">
                  <span>Edge Weight (Higher Negative = Better):</span>
                  <span className="font-mono text-emerald-400">{config.weightEdge.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="-1.5"
                  max="0.0"
                  step="0.05"
                  value={config.weightEdge}
                  onChange={(e) => updateConfigValue("weightEdge", parseFloat(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              {/* Weight Ratio */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-neutral-300">
                  <span>Ratio Penalty Weight:</span>
                  <span className="font-mono text-rose-300">{config.weightRatio.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.5"
                  step="0.05"
                  value={config.weightRatio}
                  onChange={(e) => updateConfigValue("weightRatio", parseFloat(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              {/* Weight Texture */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-neutral-300">
                  <span>Texture Penalty Weight:</span>
                  <span className="font-mono text-amber-300">{config.weightTexture.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={config.weightTexture}
                  onChange={(e) => updateConfigValue("weightTexture", parseFloat(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>

              {/* Reset to Defaults */}
              <button
                onClick={() => setConfig(DEFAULT_DETECTOR_CONFIG)}
                className="mt-2 py-2.5 rounded-xl border border-white/10 bg-neutral-800 hover:bg-neutral-700 transition-all font-semibold cursor-pointer text-center"
              >
                Reset to Default
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Control Bar & Status Banner */}
      <footer className="w-full z-40 px-6 py-8 flex flex-col items-center gap-4 bg-gradient-to-t from-black/90 to-transparent">
        {state !== 'CAPTURED' ? (
          <div className="flex flex-col items-center gap-2">
            <div className="px-4 py-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-full shadow-lg">
              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${
                state === 'STABILIZING' ? 'bg-sky-400 animate-ping' : state === 'READY_TO_CAPTURE' ? 'bg-emerald-400' : 'bg-amber-400'
              }`} />
              <span className="text-xs uppercase font-mono font-bold tracking-widest text-neutral-300">
                {getStatusText()}
              </span>
            </div>
            {coverage > 0 && (
              <p className="text-[10px] text-neutral-500 font-mono">
                Coverage: {(coverage * 100).toFixed(0)}%
              </p>
            )}
          </div>
        ) : (
          <div className="text-center">
            <h2 className="text-lg font-bold text-emerald-400 mb-1">Capture Completed!</h2>
            <p className="text-xs text-neutral-400">Card successfully processed and cropped.</p>
          </div>
        )}
      </footer>

      {/* Captured Preview Panel (Glassmorphic Slide-in Overlay) */}
      {capturedCard && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/85 backdrop-blur-sm transition-all duration-300">
          <div className="w-full max-w-md bg-neutral-900/90 border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h3 className="font-bold text-base tracking-tight text-neutral-100 flex items-center gap-2">
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Autocaptured Result
              </h3>
              <button 
                onClick={resetDetection}
                className="text-neutral-400 hover:text-neutral-200 transition-colors p-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="relative aspect-[1.58] w-full rounded-2xl overflow-hidden bg-neutral-950 border border-white/5 shadow-inner">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={capturedCard} 
                alt="Captured document result" 
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={resetDetection}
                className="flex-1 py-3 px-4 rounded-xl border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all font-medium text-sm text-neutral-200 cursor-pointer"
              >
                Scan Again
              </button>
              <button
                onClick={handleDownload}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 transition-all font-semibold text-sm text-white shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                Download Image
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

