import { useCallback, useRef, useState, useEffect } from "react";
import { Point } from "../types/geometry";
import { detectDocument, DetectorConfig, DetectionMetrics, DEFAULT_DETECTOR_CONFIG } from "../lib/detector";
import { calculateArea, orderCorners } from "../lib/geometry";

const EMA_ALPHA = 0.5;
const MAX_MISSED_FRAMES = 5;

export type DetectionState = 'READY' | 'DETECTING' | 'STABILIZING' | 'READY_TO_CAPTURE' | 'CAPTURED' | 'ERROR';

function padQuad(pts: Point[], width: number, height: number, padding = 0.01): Point[] {
  const sumX = pts.reduce((sum, p) => sum + p.x, 0);
  const sumY = pts.reduce((sum, p) => sum + p.y, 0);
  const cx = sumX / 4;
  const cy = sumY / 4;

  return pts.map(p => {
    const px = cx + (p.x - cx) * (1.0 + padding);
    const py = cy + (p.y - cy) * (1.0 + padding);
    return {
      x: Math.max(0, Math.min(width - 1, px)),
      y: Math.max(0, Math.min(height - 1, py))
    };
  });
}

function fourPointTransform(cv: any, src: any, pts: Point[]): any {
  const widthTop = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
  const widthBottom = Math.hypot(pts[2].x - pts[3].x, pts[2].y - pts[3].y);
  const heightRight = Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y);
  const heightLeft = Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y);

  const detectedWidth = Math.max(widthTop, widthBottom);
  const detectedHeight = Math.max(heightRight, heightLeft);

  const OUT_LONG = 600;
  const OUT_SHORT = Math.round(OUT_LONG / 1.585);

  let outW = OUT_LONG;
  let outH = OUT_SHORT;
  if (detectedHeight > detectedWidth) {
    outW = OUT_SHORT;
    outH = OUT_LONG;
  }

  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    pts[0].x, pts[0].y,
    pts[1].x, pts[1].y,
    pts[2].x, pts[2].y,
    pts[3].x, pts[3].y
  ]);

  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    outW - 1, 0,
    outW - 1, outH - 1,
    0, outH - 1
  ]);

  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat();
  const dsize = new cv.Size(outW, outH);
  cv.warpPerspective(src, dst, M, dsize);

  srcTri.delete();
  dstTri.delete();
  M.delete();

  return dst;
}

/**
 * Hook managing the card detection lifecycle.
 * Accepts refs to the video (or Webcam component) and guide frame.
 */
export const useCardDetection = (
  cv: Window['cv'] | null,
  videoRef: React.RefObject<HTMLVideoElement | { video: HTMLVideoElement | null } | null>,
  frameRef: React.RefObject<HTMLElement | null>,
  config: DetectorConfig = DEFAULT_DETECTOR_CONFIG,
  onDetectedStable?: (dataUrl: string) => void
) => {
  const [state, setState] = useState<DetectionState>('READY');
  const [points, setPoints] = useState<Point[] | null>(null);
  const [coverage, setCoverage] = useState<number>(0);
  const [capturedCard, setCapturedCard] = useState<string | null>(null);
  const [lastMetrics, setLastMetrics] = useState<DetectionMetrics | null>(null);
  const [secondBestScore, setSecondBestScore] = useState<number>(Infinity);
  const [candidatesCount, setCandidatesCount] = useState<number>(0);
  
  const missedFrames = useRef(0);
  const stabilityStartTime = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (typeof document !== "undefined" && !canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
  }, []);

  const getCroppedFrame = useCallback(() => {
    const current = videoRef.current;
    const video = (current && 'video' in current) ? current.video : current;
    const frame = frameRef.current;
    if (!cv || !video || !(video instanceof HTMLVideoElement) || !frame || !video.videoWidth || !canvasRef.current) return null;

    const container = frame.parentElement;
    if (!container) return null;
    
    const { width: containerW, height: containerH } = container.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const scaleX = video.videoWidth / containerW;
    const scaleY = video.videoHeight / containerH;
    const scale = Math.max(scaleX, scaleY);

    const renderedW = video.videoWidth / scale;
    const renderedH = video.videoHeight / scale;
    const offsetX = (containerW - renderedW) / 2;
    const offsetY = (containerH - renderedH) / 2;

    const frameX = frameRect.left - containerRect.left;
    const frameY = frameRect.top - containerRect.top;

    // Calculate bounding box crop and clamp within video dimensions to prevent out-of-bounds Canvas drawing errors
    const rawX = (frameX - offsetX) * scale;
    const rawY = (frameY - offsetY) * scale;
    const rawW = frameRect.width * scale;
    const rawH = frameRect.height * scale;

    const srcX = Math.max(0, Math.min(video.videoWidth, rawX));
    const srcY = Math.max(0, Math.min(video.videoHeight, rawY));
    const srcW = Math.max(0, Math.min(video.videoWidth - srcX, rawW));
    const srcH = Math.max(0, Math.min(video.videoHeight - srcY, rawH));

    const analysisCanvas = canvasRef.current;
    analysisCanvas.width = srcW;
    analysisCanvas.height = srcH;
    const ctx = analysisCanvas.getContext('2d');
    if (!ctx || srcW <= 0 || srcH <= 0) return null;

    ctx.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

    return {
        mat: cv.imread(analysisCanvas),
        offset: { x: srcX, y: srcY },
        roiArea: srcW * srcH
    };
  }, [cv, videoRef, frameRef]);

  const resetDetection = useCallback(() => {
    setCapturedCard(null);
    setPoints(null);
    setCoverage(0);
    setState('DETECTING');
    setLastMetrics(null);
    setSecondBestScore(Infinity);
    setCandidatesCount(0);
    missedFrames.current = 0;
    stabilityStartTime.current = null;
  }, []);

  const process = useCallback(() => {
    if (!cv || !videoRef.current) {
      if (!cv && state !== 'ERROR') setState('ERROR');
      return;
    }

    if (capturedCard) return; // Freeze processing if we already captured a card

    const cropped = getCroppedFrame();
    if (!cropped) return;
    const { mat, offset, roiArea } = cropped;

    try {
      const { best, secondBestScore: sbs, allCandidates, rawBest } = detectDocument(cv, mat, config);
      setSecondBestScore(sbs);
      setCandidatesCount(allCandidates.length);

      if (rawBest) {
        setLastMetrics(rawBest.metrics);
      } else {
        setLastMetrics(null);
      }

      if (best) {
        const detected = best.points;
        missedFrames.current = 0;
        
        // Handle stability logic
        if (state !== 'STABILIZING' && state !== 'READY_TO_CAPTURE') {
          setState('STABILIZING');
          stabilityStartTime.current = Date.now();
        } else if (state === 'STABILIZING' && stabilityStartTime.current) {
          if (Date.now() - stabilityStartTime.current >= 1500) {
            setState('READY_TO_CAPTURE');
            
            // Perform auto-capture perspective crop
            const paddedPts = padQuad(detected, mat.cols, mat.rows, 0.01);
            const croppedMat = fourPointTransform(cv, mat, paddedPts);
            
            const tempCanvas = document.createElement("canvas");
            (cv as any).imshow(tempCanvas, croppedMat);
            const dataUrl = tempCanvas.toDataURL("image/jpeg", 0.95);
            
            croppedMat.delete();
            setCapturedCard(dataUrl);
            setState('CAPTURED');
            
            if (onDetectedStable) {
              onDetectedStable(dataUrl);
            }
          }
        }
        
        const cardArea = calculateArea(detected);
        setCoverage(cardArea / roiArea);

        const globalPoints = detected.map(p => ({ x: p.x + offset.x, y: p.y + offset.y }));

        if (points) {
          setPoints(globalPoints.map((p, i) => ({
            x: p.x * EMA_ALPHA + points[i].x * (1 - EMA_ALPHA),
            y: p.y * EMA_ALPHA + points[i].y * (1 - EMA_ALPHA),
          })));
        } else {
          setPoints(globalPoints);
        }
      } else {
        missedFrames.current += 1;
        setCoverage(0);
        if (missedFrames.current >= MAX_MISSED_FRAMES) {
          setPoints(null);
          setState('DETECTING');
          stabilityStartTime.current = null;
        }
      }
    } catch (e) {
      console.error("Frame processing error:", e);
      missedFrames.current += 1;
      setCoverage(0);
      if (missedFrames.current >= MAX_MISSED_FRAMES) {
        setPoints(null);
        setState('DETECTING');
        stabilityStartTime.current = null;
      }
    } finally {
      mat.delete();
    }
  }, [cv, videoRef, points, state, getCroppedFrame, onDetectedStable, capturedCard, config]);

  useEffect(() => {
    if (videoRef.current && state === 'READY') {
      setState('DETECTING');
    }
  }, [videoRef, state]);

  return {
    state,
    points,
    coverage,
    capturedCard,
    lastMetrics,
    secondBestScore,
    candidatesCount,
    process,
    resetDetection
  };
};

