"use client";

import { JSX, useCallback, useMemo, useRef, useState } from "react";
import Webcam from "react-webcam";
import { useOpenCV } from "@/hooks/useOpenCV";
import { useFrameLoop } from "@/lib/utils/useFrameLoop";
import { scalePoints } from "@/lib/utils/canvasScale";
import { DEFAULT_DETECTOR_CONFIG, type DetectorConfig } from "@/lib/detector";

import { useDisplayScale } from "./hooks/useDisplayScale";
import { downloadImage } from "./utils/downloadImage";
import { ScannerHeader } from "./components/ScannerHeader";
import { ScannerViewport } from "./components/ScannerViewport";
import { MetricsCard } from "./components/MetricsCard";
import { ParameterSlider } from "./components/ParameterSlider";
import { CapturePreviewModal } from "./components/CapturePreviewModal";
import { ScanStatusBar } from "./components/ScanStatusBar";
import { Point } from "@/types/geometry";
import { useCardDetectionAdapter } from "./adapters/useCardDetectionAdapter";

export default function CardVisionPage(): JSX.Element {
  const { ready, cv } = useOpenCV();
  const webcamRef = useRef<Webcam | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);

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
    resetDetection,
  } = useCardDetectionAdapter(cv, webcamRef, frameRef, config, () =>
    console.log("Card detected"),
  );

  useFrameLoop(ready && Boolean(cv), process, 24);

  const displayScale = useDisplayScale(ready, webcamRef, frameRef);

  const scaledPoints = useMemo<Point[]>(() => {
    if (!points) return [];
    return scalePoints(points, displayScale);
  }, [points, displayScale]);

  const updateConfigValue = useCallback(
    <K extends keyof DetectorConfig>(key: K, value: DetectorConfig[K]) => {
      setConfig((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    [],
  );

  const handleDownload = useCallback(() => {
    if (!capturedCard) return;
    downloadImage(capturedCard);
  }, [capturedCard]);

  const onLoadedMetadata = useCallback(() => {
    // useDisplayScale handles the actual scaling updates
  }, []);

  return (
    <main className="fixed inset-0 bg-neutral-950 flex flex-col items-center justify-between text-white font-sans overflow-hidden">
      <ScannerHeader
        ready={ready}
        showTuning={showTuning}
        onToggleTuning={() => setShowTuning((prev) => !prev)}
      />

      <ScannerViewport
        ready={ready}
        state={state}
        webcamRef={webcamRef}
        frameRef={frameRef}
        onLoadedMetadata={onLoadedMetadata}
        scaledPoints={scaledPoints}
      />

      {showTuning && (
        <div className="absolute top-0 right-0 h-full w-80 z-30 bg-neutral-900/95 backdrop-blur-md border-l border-white/10 p-6 flex flex-col gap-6 overflow-y-auto text-xs">
          <div>
            <h3 className="font-bold text-sm text-neutral-100 uppercase tracking-wider border-b border-white/10 pb-2">
              Live Parameters
            </h3>
          </div>

          <MetricsCard
            candidatesCount={candidatesCount}
            lastMetrics={lastMetrics}
            secondBestScore={secondBestScore}
            config={config}
          />

          <div className="flex flex-col gap-4">
            <h4 className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
              Tune Settings
            </h4>

            <ParameterSlider
              label="Min Area %:"
              value={config.minAreaRatio}
              min={0.01}
              max={0.25}
              step={0.01}
              valueLabel={`${(config.minAreaRatio * 100).toFixed(0)}%`}
              onChange={(value) => updateConfigValue("minAreaRatio", value)}
            />

            <ParameterSlider
              label="Target Aspect Ratio:"
              value={config.targetAspectRatio}
              min={1.0}
              max={2.0}
              step={0.02}
              valueLabel={config.targetAspectRatio.toFixed(2)}
              onChange={(value) =>
                updateConfigValue("targetAspectRatio", value)
              }
            />

            <ParameterSlider
              label="Aspect Tolerance:"
              value={config.aspectRatioTolerance}
              min={0.1}
              max={0.6}
              step={0.02}
              valueLabel={config.aspectRatioTolerance.toFixed(2)}
              onChange={(value) =>
                updateConfigValue("aspectRatioTolerance", value)
              }
            />

            <ParameterSlider
              label="Quality Floor:"
              value={config.qualityFloor}
              min={-0.5}
              max={0.5}
              step={0.05}
              valueLabel={config.qualityFloor.toFixed(2)}
              onChange={(value) => updateConfigValue("qualityFloor", value)}
            />

            <ParameterSlider
              label="Confidence Gap:"
              value={config.confidenceGap}
              min={0.0}
              max={0.4}
              step={0.02}
              valueLabel={config.confidenceGap.toFixed(2)}
              onChange={(value) => updateConfigValue("confidenceGap", value)}
            />

            <ParameterSlider
              label="Edge Weight (Higher Negative = Better):"
              value={config.weightEdge}
              min={-1.5}
              max={0.0}
              step={0.05}
              valueLabel={config.weightEdge.toFixed(2)}
              onChange={(value) => updateConfigValue("weightEdge", value)}
            />

            <ParameterSlider
              label="Ratio Penalty Weight:"
              value={config.weightRatio}
              min={0.0}
              max={1.5}
              step={0.05}
              valueLabel={config.weightRatio.toFixed(2)}
              onChange={(value) => updateConfigValue("weightRatio", value)}
            />

            <ParameterSlider
              label="Texture Penalty Weight:"
              value={config.weightTexture}
              min={0.0}
              max={1.0}
              step={0.05}
              valueLabel={config.weightTexture.toFixed(2)}
              onChange={(value) => updateConfigValue("weightTexture", value)}
            />

            <button
              onClick={() => setConfig(DEFAULT_DETECTOR_CONFIG)}
              className="mt-2 py-2.5 rounded-xl border border-white/10 bg-neutral-800 hover:bg-neutral-700 transition-all font-semibold cursor-pointer text-center"
            >
              Reset to Default
            </button>
          </div>
        </div>
      )}

      <footer className="w-full z-40 px-6 py-8 flex flex-col items-center gap-4 bg-gradient-to-t from-black/90 to-transparent">
        <ScanStatusBar state={state} coverage={coverage} />
      </footer>

      {capturedCard && (
        <CapturePreviewModal
          capturedCard={capturedCard}
          onReset={resetDetection}
          onDownload={handleDownload}
        />
      )}
    </main>
  );
}
