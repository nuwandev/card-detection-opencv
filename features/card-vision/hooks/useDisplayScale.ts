import { useCallback, useEffect, useState, type RefObject } from "react";
import Webcam from "react-webcam";
import { getDisplayScale, type DisplayScale } from "@/lib/utils/canvasScale";

const INITIAL_SCALE: DisplayScale = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

export function useDisplayScale(
  ready: boolean,
  webcamRef: RefObject<Webcam | null>,
  frameRef: RefObject<HTMLDivElement | null>,
): DisplayScale {
  const [displayScale, setDisplayScale] = useState<DisplayScale>(INITIAL_SCALE);

  const updateScale = useCallback((): void => {
    const video = webcamRef.current?.video ?? null;
    const container = frameRef.current?.parentElement ?? null;

    if (!video || !container) return;

    setDisplayScale(getDisplayScale(video, container));
  }, [webcamRef, frameRef]);

  useEffect(() => {
    if (!ready) return;

    updateScale();

    const videoElement = webcamRef.current?.video ?? null;

    if (videoElement) {
      videoElement.addEventListener("loadedmetadata", updateScale);
      videoElement.addEventListener("playing", updateScale);

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
  }, [ready, updateScale, webcamRef]);

  return displayScale;
}