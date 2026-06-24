"use client";

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
import {
  ArrowLeft,
  Camera,
  CircleHelp,
  FlipHorizontal,
  ImageUp,
  RotateCcw,
  Sparkles,
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

// ─── Types ────────────────────────────────────────────────────────────────────

type CameraFacing = "user" | "environment";
type ScreenMode = "idle" | "preview" | "error";
type CaptureSource = "auto" | "manual" | "gallery";

type FrameRect = { x: number; y: number; w: number; h: number };
type DisplayScale = { scale: number; offsetX: number; offsetY: number };

type CapturePreview = {
  source: CaptureSource;
  imageUrl: string;
  width: number;
  height: number;
};

// ─── snapshotFrameCanvas ──────────────────────────────────────────────────────
//
// Crops the guide-frame region out of the live video into a canvas.
// Used by manual capture; gallery decodes from file directly.

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

// ─── Display scale hook ───────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

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
    <header className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between px-4 py-4 sm:px-6">
      <button
        onClick={onBack}
        aria-label="Back"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/85 backdrop-blur-md transition-colors hover:bg-white/10"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-2 backdrop-blur-md">
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <div className="flex flex-col leading-none">
          <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/70">
            NIC · front side
          </span>
          <span className="text-[10px] text-white/40">
            {ready ? "OpenCV ready" : "Loading vision"}
          </span>
        </div>
      </div>
      <button
        onClick={onHelp}
        aria-label="Help"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/85 backdrop-blur-md transition-colors hover:bg-white/10"
      >
        <CircleHelp className="h-5 w-5" />
      </button>
    </header>
  );
}

function StatusPill({ text }: { text: string }): JSX.Element {
  return (
    <div className="rounded-full border border-white/10 bg-black/55 px-4 py-1.5 text-[10px] font-mono uppercase tracking-[0.24em] text-white/65 backdrop-blur-md">
      {text}
    </div>
  );
}

function ControlButton({
  onClick,
  disabled,
  active,
  label,
  children,
  accent = false,
}: {
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  label: string;
  children: ReactNode;
  accent?: boolean;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex h-12 items-center justify-center rounded-2xl border transition-colors ${
        disabled
          ? "cursor-not-allowed border-white/5 bg-white/5 text-white/25"
          : accent
            ? "border-emerald-400/20 bg-emerald-500 text-black hover:bg-emerald-400"
            : active
              ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20"
              : "border-white/10 bg-white/5 text-white/85 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function GuideCornerFrames({ detected }: { detected: boolean }): JSX.Element {
  const cls = detected
    ? "border-emerald-400/90 shadow-[0_0_12px_rgba(52,211,153,0.35)]"
    : "border-white/70";
  return (
    <>
      <div
        className={`absolute left-0 top-0    h-7 w-7 border-l-[3px] border-t-[3px] rounded-tl-xl ${cls}`}
      />
      <div
        className={`absolute right-0 top-0   h-7 w-7 border-r-[3px] border-t-[3px] rounded-tr-xl ${cls}`}
      />
      <div
        className={`absolute left-0 bottom-0 h-7 w-7 border-l-[3px] border-b-[3px] rounded-bl-xl ${cls}`}
      />
      <div
        className={`absolute right-0 bottom-0 h-7 w-7 border-r-[3px] border-b-[3px] rounded-br-xl ${cls}`}
      />
    </>
  );
}

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
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black/80 backdrop-blur-sm">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <button
          onClick={onRetake}
          aria-label="Close preview"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-300">
            {sourceLabel}
          </span>
        </div>

        {/* spacer keeps badge centred */}
        <div className="h-9 w-9" />
      </div>

      {/* Card image */}
      <div className="flex flex-1 items-center justify-center px-6 py-2">
        <div
          className="relative w-full max-w-sm rounded-2xl overflow-hidden border border-white/10 shadow-[0_0_60px_rgba(52,211,153,0.12)]"
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
          <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/5 pointer-events-none" />
        </div>
      </div>

      {/* Bottom sheet */}
      <div className="rounded-t-3xl border-t border-white/10 bg-neutral-950/95 px-4 pb-8 pt-4 backdrop-blur-xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" />
        <p className="mb-4 text-center text-xs text-white/40">
          Confirm the card is fully visible and not blurry before continuing.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onRetake}
            className="h-12 flex-1 rounded-2xl border border-white/10 bg-white/5 text-sm font-medium text-white hover:bg-white/10 transition-colors"
          >
            Retake
          </button>
          <button
            onClick={() => onValidate(preview)}
            className="h-12 flex-1 rounded-2xl bg-emerald-500 text-sm font-semibold text-black hover:bg-emerald-400 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function ErrorOverlay({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): JSX.Element {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 px-6 text-center">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-neutral-950 p-6 shadow-2xl backdrop-blur-xl">
        <p className="text-sm font-semibold text-rose-300">Card not detected</p>
        <p className="mt-2 text-sm text-white/60">{message}</p>
        <button
          onClick={onRetry}
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
        >
          <RotateCcw className="h-4 w-4" /> Try again
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProdTestPage(): JSX.Element {
  const router = useRouter();
  const { ready: cvReady, cv } = useOpenCV();

  const webcamRef = useRef<Webcam | null>(null);
  const scanFrameRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const torchStreamRef = useRef<MediaStream | null>(null);
  // Stable ref so the hook callback (created once at mount) can always read the
  // latest screenMode without it being a closure dependency.
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
  // Pure UI: accept a cropped dataUrl (already produced by hook or cropCardFromCanvas)
  // and show the preview. No detection logic here.

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

  // ── Hook — owns detection, stability, auto-capture timing, and crop ───────
  //
  // onDetectedStable receives an already-cropped dataUrl from the hook.
  // The page just shows it. No re-detection, no second transform.

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

  // ── Display scale (SVG overlay points) ────────────────────────────────────

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
    const maxW = width * 0.88,
      maxH = height * 0.5;
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
    (async () => {
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

  // ── Validation ───────────────────────────────────────────────────────────
  // TODO: replace body with navigation / OCR / API call.

  const handleValidate = useCallback((preview: CapturePreview) => {
    console.log(
      "[prod-test] validate →",
      preview.source,
      preview.imageUrl.slice(0, 40),
    );
    // e.g. router.push("/onboarding/review") and pass imageUrl via state/store
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
  // Snapshot the guide-frame region → run cropCardFromCanvas → showPreview.

  const captureFromCamera = useCallback(() => {
    if (screenMode !== "idle" || !cv) return;
    const video = webcamRef.current?.video as HTMLVideoElement | null;
    if (!video || !containerRef.current) return;

    const canvas = snapshotFrameCanvas(video, containerRef.current, frame);
    if (!canvas) return;

    const cropped = cropCardFromCanvas(cv, canvas);
    if (!cropped) {
      showError("Card not detected. Frame the card fully and try again.");
      return;
    }
    showPreview(cropped, "manual");
  }, [cv, frame, screenMode, showError, showPreview]);

  // ── Gallery upload ────────────────────────────────────────────────────────
  // Decode file → canvas → cropCardFromCanvas → showPreview.

  const captureFromGallery = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (screenMode !== "idle") {
        e.target.value = "";
        return;
      }
      const file = e.target.files?.[0];
      if (!file || !cv) return;

      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result;
        if (typeof dataUrl !== "string") return;
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
          ? "Camera permission denied. Allow access and try again."
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
      console.error("[prod-test] torch:", err);
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

  // ── Derived label ─────────────────────────────────────────────────────────

  const scanLabel = (() => {
    if (screenMode === "preview") return "Preview ready";
    if (screenMode === "error") return "Card not detected";
    if (cameraError) return "Camera error";
    if (detectionState === "STABILIZING") return "Hold steady...";
    if (detectionState === "READY_TO_CAPTURE") return "Capturing...";
    if (detectionState === "ERROR") return "Detector error";
    return "NIC · front side";
  })();

  const frameReady = frame.w > 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <main
      ref={containerRef}
      className="fixed inset-0 overflow-hidden bg-neutral-950 text-white"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black via-neutral-950 to-black" />

      <ScannerHeader
        onBack={onBack}
        onHelp={() => alert("Help placeholder.")}
        ready={cvReady}
      />

      {/* Camera layer */}
      <div className="absolute inset-0">
        {cameraError ? (
          <div className="flex h-full w-full items-center justify-center px-6 text-center">
            <div className="max-w-sm rounded-3xl border border-white/10 bg-black/60 p-6 shadow-2xl backdrop-blur-xl">
              <p className="text-sm font-semibold text-rose-300">
                Camera unavailable
              </p>
              <p className="mt-2 text-sm text-white/60">{cameraError}</p>
              <button
                onClick={() => {
                  setCameraError(null);
                  setIsCameraReady(false);
                }}
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10"
              >
                <RotateCcw className="h-4 w-4" /> Try again
              </button>
            </div>
          </div>
        ) : (
          <>
            {!isCameraReady && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-emerald-400" />
                  <p className="text-sm text-white/55">
                    Initializing camera...
                  </p>
                </div>
              </div>
            )}
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
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${isCameraReady ? "opacity-100" : "opacity-0"}`}
            />
          </>
        )}
      </div>

      {/* Cutout overlay */}
      {frameReady && isCameraReady && !cameraError && (
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
                rx="10"
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(0,0,0,0.58)"
            mask="url(#card-cutout)"
          />
        </svg>
      )}

      {/* Scan frame */}
      {frameReady && isCameraReady && !cameraError && (
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
          <div className="absolute inset-0 overflow-hidden rounded-[10px]">
            {screenMode === "idle" && (
              <div className="absolute left-0 right-0 h-px bg-linear-to-r from-transparent via-indigo-400 to-transparent opacity-80 animate-scan-line" />
            )}
          </div>

          <div className="absolute inset-0 flex items-end justify-center pb-3">
            <StatusPill text={scanLabel} />
          </div>

          {scaledPoints.length > 0 && screenMode === "idle" && (
            <svg className="absolute inset-0 h-full w-full pointer-events-none">
              <polygon
                points={scaledPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                className={`fill-none stroke-[4] ${
                  detectionState === "STABILIZING"
                    ? "stroke-sky-400/90 [stroke-dasharray:7,7]"
                    : "stroke-emerald-400/90"
                }`}
              />
              {scaledPoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={5.5}
                  className={
                    detectionState === "STABILIZING"
                      ? "fill-sky-400"
                      : "fill-emerald-400"
                  }
                />
              ))}
            </svg>
          )}

          <div className="absolute inset-0 overflow-hidden rounded-[10px]">
            <GuideCornerFrames detected={detectionState !== "DETECTING"} />
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="absolute inset-x-0 bottom-0 z-30 px-4 pb-4 sm:px-6 sm:pb-6">
        <div className="mx-auto max-w-xl rounded-3xl border border-white/10 bg-black/55 p-3 shadow-2xl backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/45">
              Camera Controls
            </span>
            <span className="text-[10px] text-white/45">
              {screenMode === "preview" ? "Preview open" : "Live scanning"}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-2">
            <ControlButton
              onClick={() => void toggleTorch()}
              disabled={!torchSupported || screenMode !== "idle"}
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
              onClick={switchCamera}
              disabled={screenMode !== "idle"}
              label="Switch camera"
            >
              <FlipHorizontal className="h-5 w-5" />
            </ControlButton>
            <ControlButton
              onClick={captureFromCamera}
              disabled={!isCameraReady || !cv || screenMode !== "idle"}
              label="Manual capture"
              accent
            >
              <Camera className="h-5 w-5" />
            </ControlButton>
            <ControlButton
              onClick={() => fileInputRef.current?.click()}
              disabled={!cv || screenMode !== "idle"}
              label="Upload from gallery"
            >
              <ImageUp className="h-5 w-5" />
            </ControlButton>
            <ControlButton onClick={resetToIdle} label="Reset scanner">
              <RotateCcw className="h-5 w-5" />
            </ControlButton>
          </div>

          <div className="mt-3 flex items-center justify-between px-1 text-[10px] text-white/45">
            <span>{detectionState}</span>
            <span>
              Quads: {candidatesCount} · Coverage: {(coverage * 100).toFixed(0)}
              %
            </span>
          </div>

          {capturedPreview && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/60">
              <Sparkles className="h-4 w-4 text-emerald-400" />
              Preview captured · {capturedPreview.source}
            </div>
          )}
        </div>
      </footer>

      {/* Preview modal — rendered at page root so it covers everything */}
      {capturedPreview && (
        <PreviewPanel
          preview={capturedPreview}
          onValidate={handleValidate}
          onRetake={resetToIdle}
        />
      )}

      {screenMode === "error" && captureError && (
        <ErrorOverlay message={captureError} onRetry={resetToIdle} />
      )}

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
