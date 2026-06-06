"use client";

import type { DetectionStatus } from "@/lib/opencv/types";

interface StatusBadgeProps {
  status: DetectionStatus;
  confidence: number;
}

const STATUS_CONFIG: Record
  DetectionStatus,
  { label: string; bg: string; dot: string }
> = {
  idle: {
    label: "Initializing…",
    bg: "bg-gray-800/80",
    dot: "bg-gray-400",
  },
  detecting: {
    label: "Scanning…",
    bg: "bg-gray-800/80",
    dot: "bg-yellow-400 animate-pulse",
  },
  detected: {
    label: "Card Detected",
    bg: "bg-green-900/80",
    dot: "bg-green-400",
  },
  not_detected: {
    label: "No Card Found",
    bg: "bg-gray-800/80",
    dot: "bg-red-400",
  },
};

export function StatusBadge({ status, confidence }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];

  return (
    <div
      className={`
        flex items-center gap-2 px-4 py-2 rounded-full
        backdrop-blur-md border border-white/10
        text-white text-sm font-medium
        transition-all duration-300
        ${cfg.bg}
      `}
    >
      <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
      <span>{cfg.label}</span>
      {status === "detected" && (
        <span className="text-green-300 text-xs ml-1">
          {Math.round(confidence * 100)}%
        </span>
      )}
    </div>
  );
}