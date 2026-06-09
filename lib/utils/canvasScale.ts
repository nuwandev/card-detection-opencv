export interface DisplayScale {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Calculates the scale and offset for mapping video coordinates to display coordinates
 * when the video is rendered with object-fit: cover (or similar "fit and center" math).
 */
export function getDisplayScale(
  video: HTMLVideoElement | null,
  container: HTMLElement | null
): DisplayScale {
  if (!video || !container || !video.videoWidth) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }

  const { width: containerW, height: containerH } = container.getBoundingClientRect();
  
  // Math for object-fit: cover mapping
  const scale = Math.max(video.videoWidth / containerW, video.videoHeight / containerH);
  
  const renderedW = video.videoWidth / scale;
  const renderedH = video.videoHeight / scale;
  const offsetX = (containerW - renderedW) / 2;
  const offsetY = (containerH - renderedH) / 2;
  
  return { scale, offsetX, offsetY };
}

/**
 * Scales an array of points from video coordinate space to display coordinate space.
 */
export function scalePoints(
  points: { x: number; y: number }[] | null,
  displayScale: DisplayScale
) {
  if (!points) return null;
  
  const { scale, offsetX, offsetY } = displayScale;
  return points.map(p => ({ 
    x: (p.x / scale) + offsetX, 
    y: (p.y / scale) + offsetY 
  }));
}
