import type { DetectionState } from "../types";

export const STATUS_TEXT: Record<DetectionState, string> = {
  READY: "Starting camera...",
  INITIALIZING: "Initializing...",
  DETECTING: "Align card within the frame",
  STABILIZING: "Hold steady...",
  READY_TO_CAPTURE: "Autocapturing...",
  CAPTURED: "Card captured successfully!",
  ERROR: "Camera or detection error",
};

export const FRAME_STYLE_BY_STATE: Record<DetectionState, string> = {
  READY: "border-white/20",
  INITIALIZING: "border-white/30",
  DETECTING: "border-white/30",
  STABILIZING: "border-sky-400 shadow-[0_0_30px_rgba(56,189,248,0.2)]",
  READY_TO_CAPTURE: "border-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.4)]",
  CAPTURED: "border-white/30",
  ERROR: "border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.25)]",
};

export const STATUS_DOT_BY_STATE: Record<DetectionState, string> = {
  READY: "bg-neutral-500",
  INITIALIZING: "bg-amber-400 animate-pulse",
  DETECTING: "bg-amber-400",
  STABILIZING: "bg-sky-400 animate-ping",
  READY_TO_CAPTURE: "bg-emerald-400",
  CAPTURED: "bg-emerald-400",
  ERROR: "bg-rose-500",
};

export function getStatusText(state: DetectionState): string {
  return STATUS_TEXT[state];
}
