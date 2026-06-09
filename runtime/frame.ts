export const frameToMat = (
  cv: any, 
  video: HTMLVideoElement, 
  canvas: HTMLCanvasElement, 
  roi?: { x: number; y: number; width: number; height: number }
): any | null => {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  // Synchronize canvas size
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  // Capture frame to canvas
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Convert to OpenCV Mat
  const fullMat = cv.imread(canvas);

  if (!roi) return fullMat;

  // Apply ROI crop
  const rect = new cv.Rect(roi.x, roi.y, roi.width, roi.height);
  const croppedMat = fullMat.roi(rect);
  
  // Cleanup original
  fullMat.delete();
  
  return croppedMat;
};
