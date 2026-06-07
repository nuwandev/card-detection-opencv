import { useEffect, useRef, useState } from 'react';
import { processFrame } from '@/features/card-detection/utils/opencvProcessor';
import { CardDetectionConfig } from '@/features/card-detection/types';

export const useCardDetection = (
  videoRef: React.RefObject<HTMLVideoElement | null>,
  config: CardDetectionConfig
) => {
  const [isReady, setIsReady] = useState(false);
  const stabilityCounter = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;

    const runDetection = () => {
      if (!videoRef.current) return;
      
      const detected = processFrame(videoRef.current, config.areaThreshold || 10000);

      if (detected) {
        stabilityCounter.current++;
        if (stabilityCounter.current >= 6) {
          config.onCardDetected();
          stabilityCounter.current = 0; // Reset
        }
      } else {
        stabilityCounter.current = 0;
      }
    };

    intervalRef.current = setInterval(runDetection, 100); // 10 FPS

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [videoRef, config]);

  return { isReady };
};
