"use client";

// ─────────────────────────────────────────────────────────────────────────────
// app/(onboarding)/scan/page.tsx
//
// Extraction guide — each component/hook below is labelled with the file it
// should eventually live in. The logic is untouched; only UI + UX changed.
// ─────────────────────────────────────────────────────────────────────────────

import {
  JSX,
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import Webcam from "react-webcam";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Camera,
  CircleHelp,
  FlipHorizontal,
  ImageUp,
  Loader2,
  RotateCcw,
  Zap,
  ZapOff,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { useOpenCV } from "@/hooks/useOpenCV";
import { useCardDetection } from "@/hooks/useCardDetection";
import { useFrameLoop } from "@/lib/utils/useFrameLoop";
import { DEFAULT_DETECTOR_CONFIG } from "@/lib/detector";
import { cropCardFromCanvas } from "@/lib/utils/cropCard";
import { Point } from "@/types/geometry";
import { DetectionState } from "@/features/card-vision/types";

// ─── Types ────────────────────────────────────────────────────────────────────
// → types/scanner.ts

type CameraFacing = "user" | "environment";
type ScreenMode = "idle" | "processing" | "preview" | "error";
type CaptureSource = "auto" | "manual" | "gallery";

type FrameRect = { x: number; y: number; w: number; h: number };
type DisplayScale = { scale: number; offsetX: number; offsetY: number };

type CapturePreview = {
  source: CaptureSource;
  imageUrl: string;
  width: number;
  height: number;
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────
// → lib/utils/cameraCanvas.ts

function snapshotFrameCanvas(
  video: HTMLVideoElement,
  container: HTMLElement,
  frame: FrameRect,
): HTMLCanvasElement | null {
  const rect = container.getBoundingClientRect();
  const vAspect = video.videoWidth / video.videoHeight;
  const cAspect = rect.width / rect.height;

  let renderW: number, renderH: number;
  if (vAspect > cAspect) {
    renderH = rect.height;
    renderW = renderH * vAspect;
  } else {
    renderW = rect.width;
    renderH = renderW / vAspect;
  }

  const offX = (rect.width - renderW) / 2;
  const offY = (rect.height - renderH) / 2;
  const scX = video.videoWidth / renderW;
  const scY = video.videoHeight / renderH;

  const sx = Math.max(0, (frame.x - offX) * scX);
  const sy = Math.max(0, (frame.y - offY) * scY);
  const sw = Math.min(video.videoWidth - sx, frame.w * scX);
  const sh = Math.min(video.videoHeight - sy, frame.h * scY);
  if (sw <= 0 || sh <= 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw);
  canvas.height = Math.round(sh);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

function dataUrlToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("No 2d context"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = dataUrl;
  });
}

// ─── useDisplayScale ──────────────────────────────────────────────────────────
// → hooks/useDisplayScale.ts

function useDisplayScale(
  ready: boolean,
  webcamRef: React.RefObject<Webcam | null>,
  frameRef: React.RefObject<HTMLDivElement | null>,
): DisplayScale {
  const [ds, setDs] = useState<DisplayScale>({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  });

  const update = useCallback(() => {
    const video = webcamRef.current?.video ?? null;
    const cont = frameRef.current?.parentElement ?? null;
    if (!video || !cont || !video.videoWidth || !video.videoHeight) return;
    const { width: cW, height: cH } = cont.getBoundingClientRect();
    if (!cW || !cH) return;
    const scale = Math.max(video.videoWidth / cW, video.videoHeight / cH);
    setDs({
      scale,
      offsetX: (cW - video.videoWidth / scale) / 2,
      offsetY: (cH - video.videoHeight / scale) / 2,
    });
  }, [webcamRef, frameRef]);

  useEffect(() => {
    if (!ready) return;
    update();
    const v = webcamRef.current?.video ?? null;
    if (v) {
      v.addEventListener("loadedmetadata", update);
      v.addEventListener("playing", update);
      if (v.readyState >= 1) update();
    }
    window.addEventListener("resize", update);
    return () => {
      if (v) {
        v.removeEventListener("loadedmetadata", update);
        v.removeEventListener("playing", update);
      }
      window.removeEventListener("resize", update);
    };
  }, [ready, update, webcamRef]);

  return ds;
}

// ─── ScannerHeader ────────────────────────────────────────────────────────────
// → components/scanner/ScannerHeader.tsx

function ScannerHeader({
  onBack,
  onHelp,
  ready,
}: {
  onBack: () => void;
  onHelp: () => void;
  ready: boolean;
}): JSX.Element {
  return (
    <header className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between px-6 pt-6">
      <button
        onClick={onBack}
        aria-label="Back"
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/70 backdrop-blur-xl transition-colors duration-200 hover:bg-white/[0.08] hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      {/* Step indicator pill */}
      <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-1.5 backdrop-blur-xl">
        <span
          className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
            ready ? "bg-indigo-400" : "bg-white/20"
          }`}
        />
        <span className="text-[11px] font-medium tracking-wide text-slate-400">
          NIC · Front side
        </span>
      </div>

      <button
        onClick={onHelp}
        aria-label="Help"
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/70 backdrop-blur-xl transition-colors duration-200 hover:bg-white/[0.08] hover:text-white"
      >
        <CircleHelp className="h-4 w-4" />
      </button>
    </header>
  );
}

// ─── ScanInstruction ──────────────────────────────────────────────────────────
// → components/scanner/ScanInstruction.tsx

function ScanInstruction({ state }: { state: DetectionState }): JSX.Element {
  const content: Record<DetectionState, { title: string; sub: string }> = {
    READY: {
      title: "Scan your NIC",
      sub: "Place the front side of your NIC inside the frame",
    },
    INITIALIZING: { title: "Starting up…", sub: "Getting the scanner ready" },
    DETECTING: {
      title: "Scan your NIC",
      sub: "Place the front side of your NIC inside the frame",
    },
    STABILIZING: {
      title: "Hold steady",
      sub: "Keep the card still while we lock focus",
    },
    READY_TO_CAPTURE: { title: "Capturing…", sub: "Almost done, hold still" },
    CAPTURED: { title: "Card captured", sub: "Processing your document" },
    ERROR: {
      title: "Scan your NIC",
      sub: "Place the front side of your NIC inside the frame",
    },
  };

  const { title, sub } = content[state];

  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <AnimatePresence mode="wait">
        <motion.h1
          key={title}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="text-lg font-semibold tracking-tight text-white"
        >
          {title}
        </motion.h1>
      </AnimatePresence>
      <AnimatePresence mode="wait">
        <motion.p
          key={sub}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          className="text-sm leading-relaxed text-slate-400"
        >
          {sub}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

// ─── GuideCornerFrames ────────────────────────────────────────────────────────
// → components/scanner/GuideCornerFrames.tsx

function GuideCornerFrames({
  detectionState,
}: {
  detectionState: DetectionState;
}): JSX.Element {
  const cls =
    detectionState === "STABILIZING" || detectionState === "READY_TO_CAPTURE"
      ? "border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.35)]"
      : detectionState === "CAPTURED"
        ? "border-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.4)]"
        : "border-white/70";

  const corner = (pos: string) => (
    <div
      className={`absolute h-7 w-7 border-[2.5px] transition-all duration-300 ${pos} ${cls}`}
    />
  );

  return (
    <>
      {corner("left-0 top-0    border-r-0 border-b-0 rounded-tl-2xl")}
      {corner("right-0 top-0   border-l-0 border-b-0 rounded-tr-2xl")}
      {corner("left-0 bottom-0 border-r-0 border-t-0 rounded-bl-2xl")}
      {corner("right-0 bottom-0 border-l-0 border-t-0 rounded-br-2xl")}
    </>
  );
}

// ─── DetectionPolygon ─────────────────────────────────────────────────────────
// → components/scanner/DetectionPolygon.tsx

function DetectionPolygon({
  points,
  detectionState,
}: {
  points: Point[];
  detectionState: DetectionState;
}): JSX.Element | null {
  if (points.length === 0) return null;

  const isStabilizing = detectionState === "STABILIZING";
  const strokeClass = isStabilizing
    ? "stroke-indigo-400/80"
    : "stroke-emerald-400/80";

  return (
    <svg className="absolute inset-0 h-full w-full pointer-events-none">
      <polygon
        points={points.map((p) => `${p.x},${p.y}`).join(" ")}
        className={`fill-none stroke-[2.5] transition-all duration-150 ${strokeClass} ${
          isStabilizing ? "[stroke-dasharray:6,4]" : ""
        }`}
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={4}
          className={isStabilizing ? "fill-indigo-400" : "fill-emerald-400"}
        />
      ))}
    </svg>
  );
}

// ─── ProcessingOverlay ────────────────────────────────────────────────────────
// → components/scanner/ProcessingOverlay.tsx
// Shown during manual / gallery detection (async, may take 200-600ms on device)

function ProcessingOverlay(): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[9998] flex flex-col items-center justify-center bg-[#070A12]/80 backdrop-blur-sm"
    >
      <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      <p className="mt-3 text-sm text-slate-400">Processing…</p>
    </motion.div>
  );
}

// ─── PreviewPanel ─────────────────────────────────────────────────────────────
// → components/scanner/PreviewPanel.tsx

function PreviewPanel({
  preview,
  onValidate,
  onRetake,
}: {
  preview: CapturePreview;
  onValidate: (preview: CapturePreview) => void;
  onRetake: () => void;
}): JSX.Element {
  const sourceLabel =
    preview.source === "auto"
      ? "Auto-captured"
      : preview.source === "manual"
        ? "Manual capture"
        : "From gallery";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[9999] flex flex-col bg-[#070A12]"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <button
          onClick={onRetake}
          aria-label="Retake"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/70 transition-colors duration-200 hover:bg-white/[0.08]"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] font-medium tracking-wide text-emerald-300">
            {sourceLabel}
          </span>
        </div>

        {/* spacer */}
        <div className="h-10 w-10" />
      </div>

      {/* Card image */}
      <div className="flex flex-1 items-center justify-center px-6">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.08] shadow-[0_0_60px_rgba(99,102,241,0.1)]"
          style={{ aspectRatio: `${preview.width} / ${preview.height}` }}
        >
          <Image
            src={preview.imageUrl}
            alt="Captured card"
            fill
            priority
            unoptimized
            className="object-cover"
          />
          {/* inner ring */}
          <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.06] pointer-events-none" />
        </motion.div>
      </div>

      {/* Bottom sheet */}
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{
          duration: 0.3,
          delay: 0.1,
          ease: [0.25, 0.46, 0.45, 0.94],
        }}
        className="rounded-t-[28px] border-t border-white/[0.08] bg-white/[0.03] px-6 pb-10 pt-5 backdrop-blur-xl"
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" />

        <div className="mb-5 text-center">
          <p className="text-base font-semibold text-white">Looks good?</p>
          <p className="mt-1 text-sm text-slate-400">
            Make sure the card is fully visible and not blurry.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onRetake}
            className="h-12 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] text-sm font-medium text-white transition-colors duration-200 hover:bg-white/[0.08]"
          >
            Retake
          </button>
          <button
            onClick={() => onValidate(preview)}
            className="h-12 flex-1 rounded-xl bg-indigo-600 text-sm font-semibold text-white transition-colors duration-200 hover:bg-indigo-500"
          >
            Continue
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── ErrorSheet ───────────────────────────────────────────────────────────────
// → components/scanner/ErrorSheet.tsx

function ErrorSheet({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[9999] flex items-end justify-center px-4 pb-8 bg-[#070A12]/70 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-full max-w-sm rounded-[28px] border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur-xl"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <p className="text-center text-base font-semibold text-white">
          Card not detected
        </p>
        <p className="mt-2 text-center text-sm leading-relaxed text-slate-400">
          {message}
        </p>
        <button
          onClick={onRetry}
          className="mt-5 h-12 w-full rounded-xl bg-indigo-600 text-sm font-semibold text-white transition-colors duration-200 hover:bg-indigo-500"
        >
          Try again
        </button>
      </motion.div>
    </motion.div>
  );
}

// ─── CameraErrorView ──────────────────────────────────────────────────────────
// → components/scanner/CameraErrorView.tsx

function CameraErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): JSX.Element {
  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 text-center backdrop-blur-xl">
        <p className="text-sm font-semibold text-rose-400">
          Camera unavailable
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{message}</p>
        <button
          onClick={onRetry}
          className="mt-5 h-11 w-full rounded-xl bg-indigo-600 text-sm font-semibold text-white transition-colors duration-200 hover:bg-indigo-500"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

// ─── ControlButton ────────────────────────────────────────────────────────────
// → components/scanner/ControlButton.tsx

function ControlButton({
  onClick,
  disabled,
  active,
  label,
  children,
  primary = false,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  label: string;
  children: ReactNode;
  primary?: boolean;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-14 items-center justify-center rounded-xl border transition-colors duration-200 ${
        disabled
          ? "cursor-not-allowed border-white/[0.04] bg-white/[0.02] text-white/20"
          : primary
            ? "border-indigo-500/30 bg-indigo-600 text-white hover:bg-indigo-500"
            : active
              ? "border-indigo-500/30 bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/20"
              : "border-white/[0.08] bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

// ─── ControlBar ───────────────────────────────────────────────────────────────
// → components/scanner/ControlBar.tsx

function ControlBar({
  screenMode,
  isCameraReady,
  cvReady,
  torchOn,
  torchSupported,
  facing,
  detectionState,
  coverage,
  candidatesCount,
  onToggleTorch,
  onSwitchCamera,
  onManualCapture,
  onGalleryClick,
  onReset,
}: {
  screenMode: ScreenMode;
  isCameraReady: boolean;
  cvReady: boolean;
  torchOn: boolean;
  torchSupported: boolean;
  facing: CameraFacing;
  detectionState: DetectionState;
  coverage: number;
  candidatesCount: number;
  onToggleTorch: () => void;
  onSwitchCamera: () => void;
  onManualCapture: () => void;
  onGalleryClick: () => void;
  onReset: () => void;
}): JSX.Element {
  const isIdle = screenMode === "idle";
  const isProcessing = screenMode === "processing";
  const disabled = !isIdle || isProcessing;

  return (
    <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.04] p-4 backdrop-blur-xl">
      {/* Status row */}
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="text-[11px] font-medium text-slate-500">
          {detectionState === "STABILIZING"
            ? "Hold steady…"
            : detectionState === "READY_TO_CAPTURE"
              ? "Capturing…"
              : isProcessing
                ? "Processing…"
                : "Ready to scan"}
        </span>
        {coverage > 0 && (
          <span className="text-[11px] text-slate-500">
            {(coverage * 100).toFixed(0)}% coverage
          </span>
        )}
      </div>

      {/* Buttons */}
      <div className="grid grid-cols-5 gap-2">
        <ControlButton
          onClick={onToggleTorch}
          disabled={!torchSupported || disabled}
          active={torchOn}
          label="Toggle torch"
        >
          {torchOn ? (
            <Zap className="h-5 w-5" />
          ) : (
            <ZapOff className="h-5 w-5" />
          )}
        </ControlButton>

        <ControlButton
          onClick={onSwitchCamera}
          disabled={disabled}
          label={`Switch to ${facing === "environment" ? "front" : "back"} camera`}
        >
          <FlipHorizontal className="h-5 w-5" />
        </ControlButton>

        {/* Capture — primary / large feel */}
        <ControlButton
          onClick={onManualCapture}
          disabled={!isCameraReady || !cvReady || disabled}
          label="Capture card"
          primary
        >
          {isProcessing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
        </ControlButton>

        <ControlButton
          onClick={onGalleryClick}
          disabled={!cvReady || disabled}
          label="Upload from gallery"
        >
          <ImageUp className="h-5 w-5" />
        </ControlButton>

        <ControlButton onClick={onReset} label="Reset scanner">
          <RotateCcw className="h-5 w-5" />
        </ControlButton>
      </div>

      {/* Debug hint — remove in prod */}
      {process.env.NODE_ENV === "development" && (
        <p className="mt-3 text-center text-[10px] text-slate-600">
          {detectionState} · quads {candidatesCount}
        </p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
// app/(onboarding)/scan/page.tsx

export default function ScanPage(): JSX.Element {
  const router = useRouter();
  const { ready: cvReady, cv } = useOpenCV();

  const webcamRef = useRef<Webcam | null>(null);
  const scanFrameRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const torchStreamRef = useRef<MediaStream | null>(null);
  // Stable ref so the hook callback reads the latest mode without stale closure
  const screenModeRef = useRef<ScreenMode>("idle");

  const [facing, setFacing] = useState<CameraFacing>("environment");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [screenMode, setScreenMode] = useState<ScreenMode>("idle");
  const [capturedPreview, setCapturedPreview] = useState<CapturePreview | null>(
    null,
  );
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [frame, setFrame] = useState<FrameRect>({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    screenModeRef.current = screenMode;
  }, [screenMode]);

  // ── Preview helpers ───────────────────────────────────────────────────────

  const showPreview = useCallback((imageUrl: string, source: CaptureSource) => {
    const img = new window.Image();
    img.onload = () => {
      setCaptureError(null);
      setCapturedPreview({
        source,
        imageUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
      setScreenMode("preview");
    };
    img.src = imageUrl;
  }, []);

  const showError = useCallback((msg: string) => {
    setCaptureError(msg);
    setScreenMode("error");
  }, []);

  // ── Hook — detection, stability, auto-capture ─────────────────────────────

  const onDetectedStable = useCallback(
    (croppedDataUrl: string) => {
      if (screenModeRef.current !== "idle") return;
      showPreview(croppedDataUrl, "auto");
    },
    [showPreview],
  );

  const {
    state: detectionState,
    points,
    coverage,
    candidatesCount,
    process,
    resetDetection,
  } = useCardDetection(
    cv,
    webcamRef,
    scanFrameRef,
    DEFAULT_DETECTOR_CONFIG,
    onDetectedStable,
  );

  useFrameLoop(
    Boolean(cvReady && isCameraReady && screenMode === "idle"),
    process,
    24,
  );

  // ── Display scale (polygon overlay) ──────────────────────────────────────

  const displayScale = useDisplayScale(isCameraReady, webcamRef, scanFrameRef);
  const scaledPoints = useMemo<Point[]>(() => {
    if (!points) return [];
    return points.map((p) => ({
      x: p.x / displayScale.scale + displayScale.offsetX,
      y: p.y / displayScale.scale + displayScale.offsetY,
    }));
  }, [points, displayScale]);

  // ── Guide frame rect ──────────────────────────────────────────────────────

  const updateFrame = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const CARD_RATIO = 85.6 / 53.98;
    const maxW = width * 0.88;
    const maxH = height * 0.46;
    let w = maxW,
      h = w / CARD_RATIO;
    if (h > maxH) {
      h = maxH;
      w = h * CARD_RATIO;
    }
    setFrame({ x: (width - w) / 2, y: (height - h) / 2, w, h });
  }, []);

  useEffect(() => {
    updateFrame();
    const ob = new ResizeObserver(updateFrame);
    if (containerRef.current) ob.observe(containerRef.current);
    return () => ob.disconnect();
  }, [updateFrame]);

  // ── Torch probe ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        const caps = s
          .getVideoTracks()[0]
          .getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
        s.getTracks().forEach((t) => t.stop());
        if (!cancelled) setTorchSupported(Boolean(caps?.torch));
      } catch {
        if (!cancelled) setTorchSupported(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      torchStreamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  // ── Validation placeholder ────────────────────────────────────────────────

  const handleValidate = useCallback((preview: CapturePreview) => {
    // TODO: router.push("/onboarding/review") + pass imageUrl via state/store
    console.log("[scan] validate →", preview.source);
  }, []);

  // ── Shared reset ──────────────────────────────────────────────────────────

  const resetToIdle = useCallback(() => {
    setScreenMode("idle");
    setCapturedPreview(null);
    setCaptureError(null);
    setCameraError(null);
    resetDetection();
  }, [resetDetection]);

  // ── Manual capture ────────────────────────────────────────────────────────

  const captureFromCamera = useCallback(() => {
    if (screenMode !== "idle" || !cv) return;
    const video = webcamRef.current?.video as HTMLVideoElement | null;
    if (!video || !containerRef.current) return;

    setScreenMode("processing");

    // Run synchronously — cropCardFromCanvas is CPU-heavy but not truly async.
    // We set "processing" first so the UI reacts immediately, then run on the
    // next tick so the spinner actually renders before the main thread blocks.
    setTimeout(() => {
      try {
        const canvas = snapshotFrameCanvas(video, containerRef.current!, frame);
        if (!canvas) {
          showError("Couldn't read camera frame. Try again.");
          return;
        }
        const cropped = cropCardFromCanvas(cv, canvas);
        if (!cropped) {
          showError("Card not detected. Frame the card fully and try again.");
          return;
        }
        showPreview(cropped, "manual");
      } catch {
        showError("Something went wrong. Try again.");
      }
    }, 16);
  }, [cv, frame, screenMode, showError, showPreview]);

  // ── Gallery upload ────────────────────────────────────────────────────────

  const captureFromGallery = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (screenMode !== "idle") {
        e.target.value = "";
        return;
      }
      const file = e.target.files?.[0];
      if (!file || !cv) return;

      setScreenMode("processing");

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result;
        if (typeof dataUrl !== "string") {
          showError("Could not read the file.");
          return;
        }
        try {
          const canvas = await dataUrlToCanvas(dataUrl);
          const cropped = cropCardFromCanvas(cv, canvas);
          if (!cropped) {
            showError(
              "No card found. Make sure the card is fully visible in the photo.",
            );
            return;
          }
          showPreview(cropped, "gallery");
        } catch {
          showError("Could not read the image. Try a different file.");
        }
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [cv, screenMode, showError, showPreview],
  );

  // ── Camera controls ───────────────────────────────────────────────────────

  const handleCameraError = useCallback((err: string | DOMException) => {
    setCameraError(
      typeof err === "string"
        ? err
        : err.name === "NotAllowedError"
          ? "Camera permission denied. Allow access in your browser settings and try again."
          : err.name === "NotFoundError"
            ? "No camera found on this device."
            : "Unable to access camera.",
    );
    setIsCameraReady(false);
  }, []);

  const onBack = useCallback(() => {
    if (torchOn) {
      torchStreamRef.current?.getTracks().forEach((t) => t.stop());
      torchStreamRef.current = null;
      setTorchOn(false);
    }
    router.push("/onboarding/");
  }, [router, torchOn]);

  const toggleTorch = useCallback(async () => {
    if (!torchSupported || screenMode !== "idle") return;
    try {
      if (torchOn) {
        const track = torchStreamRef.current?.getVideoTracks()[0];
        try {
          await track?.applyConstraints({
            advanced: [{ torch: false }],
          } as unknown as MediaTrackConstraints);
        } finally {
          torchStreamRef.current?.getTracks().forEach((t) => t.stop());
        }
        torchStreamRef.current = null;
        setTorchOn(false);
      } else {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        await s.getVideoTracks()[0].applyConstraints({
          advanced: [{ torch: true }],
        } as unknown as MediaTrackConstraints);
        torchStreamRef.current = s;
        setTorchOn(true);
      }
    } catch (err) {
      console.error("[scan] torch:", err);
    }
  }, [screenMode, torchOn, torchSupported]);

  const switchCamera = useCallback(() => {
    if (screenMode !== "idle") return;
    if (torchOn) {
      torchStreamRef.current?.getTracks().forEach((t) => t.stop());
      torchStreamRef.current = null;
      setTorchOn(false);
    }
    setIsCameraReady(false);
    setFacing((p) => (p === "environment" ? "user" : "environment"));
  }, [screenMode, torchOn]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const frameReady = frame.w > 0;
  const showScanner = isCameraReady && !cameraError && frameReady;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main
      ref={containerRef}
      className="fixed inset-0 overflow-hidden bg-[#070A12] text-white"
    >
      <ScannerHeader
        onBack={onBack}
        onHelp={() => alert("Help coming soon.")}
        ready={cvReady}
      />

      {/* ── Camera layer ── */}
      <div className="absolute inset-0">
        {cameraError ? (
          <CameraErrorView
            message={cameraError}
            onRetry={() => {
              setCameraError(null);
              setIsCameraReady(false);
            }}
          />
        ) : (
          <>
            {/* Loading shimmer */}
            <AnimatePresence>
              {!isCameraReady && (
                <motion.div
                  key="cam-loading"
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                  className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#070A12]"
                >
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
                  <p className="text-sm text-slate-400">Starting camera…</p>
                </motion.div>
              )}
            </AnimatePresence>

            <Webcam
              ref={webcamRef}
              audio={false}
              mirrored={facing === "user"}
              screenshotFormat="image/jpeg"
              screenshotQuality={0.92}
              videoConstraints={{
                facingMode: facing,
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              }}
              onUserMedia={() => {
                setCameraError(null);
                setIsCameraReady(true);
              }}
              onUserMediaError={handleCameraError}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                isCameraReady ? "opacity-100" : "opacity-0"
              }`}
            />
          </>
        )}
      </div>

      {/* ── Cutout overlay ── */}
      {showScanner && (
        <svg
          className="absolute inset-0 z-10 h-full w-full pointer-events-none"
          preserveAspectRatio="none"
        >
          <defs>
            <mask id="card-cutout">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={frame.x}
                y={frame.y}
                width={frame.w}
                height={frame.h}
                rx="16"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(7,10,18,0.72)"
            mask="url(#card-cutout)"
          />
        </svg>
      )}

      {/* ── Scan frame ── */}
      {showScanner && (
        <div
          ref={scanFrameRef}
          className="absolute z-20"
          style={{
            left: frame.x,
            top: frame.y,
            width: frame.w,
            height: frame.h,
          }}
        >
          <DetectionPolygon
            points={scaledPoints}
            detectionState={detectionState}
          />
          <GuideCornerFrames detectionState={detectionState} />
        </div>
      )}

      {/* ── Main content (instruction + controls) ── */}
      {showScanner && (
        <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col gap-6 px-6 pb-8">
          {/* Instruction text sits just above the controls */}
          <ScanInstruction state={detectionState} />

          <ControlBar
            screenMode={screenMode}
            isCameraReady={isCameraReady}
            cvReady={cvReady}
            torchOn={torchOn}
            torchSupported={torchSupported}
            facing={facing}
            detectionState={detectionState}
            coverage={coverage}
            candidatesCount={candidatesCount}
            onToggleTorch={() => void toggleTorch()}
            onSwitchCamera={switchCamera}
            onManualCapture={captureFromCamera}
            onGalleryClick={() => fileInputRef.current?.click()}
            onReset={resetToIdle}
          />
        </div>
      )}

      {/* ── Modals (rendered at root to escape stacking contexts) ── */}
      <AnimatePresence>
        {screenMode === "processing" && <ProcessingOverlay key="processing" />}
      </AnimatePresence>

      <AnimatePresence>
        {capturedPreview && (
          <PreviewPanel
            key="preview"
            preview={capturedPreview}
            onValidate={handleValidate}
            onRetake={resetToIdle}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {screenMode === "error" && captureError && (
          <ErrorSheet
            key="error"
            message={captureError}
            onRetry={resetToIdle}
          />
        )}
      </AnimatePresence>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={captureFromGallery}
      />
    </main>
  );
}
