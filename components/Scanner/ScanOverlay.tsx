"use client";

import { forwardRef } from "react";
import type { DetectionStatus } from "@/lib/opencv/types";

interface ScanOverlayProps {
  status: DetectionStatus;
}

/**
 * Renders:
 * 1. A darkened vignette around the scan zone
 * 2. Corner bracket markers at the 4 corners of the scan zone
 * 3. A transparent canvas for OpenCV to draw detected rectangle outlines
 */
export const ScanOverlay = forwardRef<HTMLCanvasElement, ScanOverlayProps>(
  function ScanOverlay({ status }, canvasRef) {
    const isDetected = status === "detected";
    const cornerColor = isDetected ? "border-green-400" : "border-white";
    const transition = "transition-colors duration-300";

    return (
      <div className="absolute inset-0 pointer-events-none">
        {/* Full-size canvas for OpenCV drawing — must match video dimensions */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          // Actual pixel dimensions set programmatically in useCardDetection
        />

        {/* Scan zone overlay: darken outside the center box */}
        {/* We use a CSS clip approach: 4 dark panels around center */}
        <div className="absolute inset-0 flex flex-col">
          {/* Top strip */}
          <div className="flex-1 bg-black/50" />

          <div className="flex" style={{ height: "60%" }}>
            {/* Left strip */}
            <div className="w-[10%] bg-black/50" />

            {/* CENTER SCAN ZONE */}
            <div className="flex-1 relative">
              {/* Corner brackets — top-left */}
              <div
                className={`absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 rounded-tl-md ${cornerColor} ${transition}`}
              />
              {/* top-right */}
              <div
                className={`absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 rounded-tr-md ${cornerColor} ${transition}`}
              />
              {/* bottom-left */}
              <div
                className={`absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 rounded-bl-md ${cornerColor} ${transition}`}
              />
              {/* bottom-right */}
              <div
                className={`absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 rounded-br-md ${cornerColor} ${transition}`}
              />

              {/* Animated scanning line when not detected */}
              {status === "detecting" && (
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-white/80 to-transparent animate-scan" />
              )}

              {/* Green fill flash on detection */}
              {isDetected && (
                <div className="absolute inset-0 bg-green-400/10 rounded-sm animate-pulse" />
              )}
            </div>

            {/* Right strip */}
            <div className="w-[10%] bg-black/50" />
          </div>

          {/* Bottom strip */}
          <div className="flex-1 bg-black/50" />
        </div>
      </div>
    );
  },
);
