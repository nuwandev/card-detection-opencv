export const processFrame = (
  image: HTMLVideoElement | HTMLCanvasElement,
  areaThreshold: number = 10000
): boolean => {
  const cv = (window as any).cv;
  if (!cv) return false;

  let src = cv.imread(image);
  let gray = new cv.Mat();
  let blur = new cv.Mat();
  let canny = new cv.Mat();
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();

  // Convert to grayscale
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  // Gaussian blur to reduce noise
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);

  // Canny edge detection
  cv.Canny(blur, canny, 50, 150);

  // Find contours
  cv.findContours(canny, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let found = false;
  let maxArea = 0;

  // Iterate over contours to find the largest rectangular one
  for (let i = 0; i < contours.size(); ++i) {
    let cnt = contours.get(i);
    let area = cv.contourArea(cnt);
    
    if (area > areaThreshold && area > maxArea) {
      let peri = cv.arcLength(cnt, true);
      let approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

      if (approx.rows === 4) {
        maxArea = area;
        found = true;
      }
      approx.delete();
    }
  }

  // Cleanup
  src.delete();
  gray.delete();
  blur.delete();
  canny.delete();
  contours.delete();
  hierarchy.delete();

  return found;
};
