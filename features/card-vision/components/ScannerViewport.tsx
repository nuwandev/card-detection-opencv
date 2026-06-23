import Webcam from "react-webcam";
import type { DetectionState } from "../types";
import { FRAME_STYLE_BY_STATE } from "../utils/scanUi";
import { JSX } from "react/jsx-runtime";

type Point = { x: number; y: number };

type ScannerViewportProps = {
  ready: boolean;
  state: DetectionState;
  webcamRef: React.RefObject<Webcam | null>;
  frameRef: React.RefObject<HTMLDivElement | null>;
  onLoadedMetadata: () => void;
  scaledPoints: Point[];
};

export function ScannerViewport({
  ready,
  state,
  webcamRef,
  frameRef,
  onLoadedMetadata,
  scaledPoints,
}: ScannerViewportProps): JSX.Element {
  return (
    <div className="relative w-full grow flex items-center justify-center">
      {!ready && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-neutral-950/95 gap-3">
          <div className="h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-neutral-400 animate-pulse">
            Initializing Computer Vision Engine...
          </p>
        </div>
      )}

      {ready && (
        <Webcam
          ref={webcamRef}
          audio={false}
          screenshotFormat="image/jpeg"
          videoConstraints={{
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          }}
          onLoadedMetadata={onLoadedMetadata}
          className="absolute inset-0 w-full h-full object-contain"
        />
      )}

      {scaledPoints.length > 0 && state !== "CAPTURED" && (
        <svg className="absolute inset-0 w-full h-full z-20 pointer-events-none">
          <polygon
            points={scaledPoints.map((point) => `${point.x},${point.y}`).join(" ")}
            className={`fill-none stroke-4 transition-all duration-150 ${
              state === "STABILIZING"
                ? "stroke-sky-400/90 [stroke-dasharray:6,6] animate-[dash_2s_linear_infinite]"
                : "stroke-emerald-400/90 shadow-[0_0_15px_rgba(52,211,153,0.5)]"
            }`}
          />
          {scaledPoints.map((point, index) => (
            <circle
              key={`${point.x}-${point.y}-${index}`}
              cx={point.x}
              cy={point.y}
              r={6}
              className={state === "STABILIZING" ? "fill-sky-400" : "fill-emerald-400"}
            />
          ))}
        </svg>
      )}

      {state !== "CAPTURED" && (
        <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center p-6">
          <div
            ref={frameRef}
            className={`w-full max-w-sm aspect-[1.58] border-2 transition-all duration-300 ${
              FRAME_STYLE_BY_STATE[state]
            } rounded-2xl shadow-[0_0_0_9999px_rgba(10,10,10,0.7)]`}
          />
        </div>
      )}
    </div>
  );
}