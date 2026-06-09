export const frameToMat = (cv: any, video: HTMLVideoElement, canvas: HTMLCanvasElement): any | null => {
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
  return cv.imread(canvas);
};
