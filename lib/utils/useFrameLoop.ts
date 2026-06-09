import { useEffect } from "react";

/**
 * Standard RAF loop for camera processing.
 * Isolates timing control from UI lifecycle.
 */
export function useFrameLoop(
  enabled: boolean,
  onFrame: () => void,
  fps: number = 24
) {
  useEffect(() => {
    if (!enabled) return;

    let frameId: number;
    let lastTime = 0;
    const interval = 1000 / fps;

    const loop = (time: number) => {
      if (time - lastTime >= interval) {
        onFrame();
        lastTime = time;
      }
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [enabled, onFrame, fps]);
}
