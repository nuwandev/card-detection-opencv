/**
 * Captures the current video frame from the video element and converts it
 * into an OpenCV matrix (Mat) for processing.
 */
export const frameToMat = (cv: any, video: HTMLVideoElement, canvas: HTMLCanvasElement): any | null => {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");

  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  return cv.imread(canvas);
};
