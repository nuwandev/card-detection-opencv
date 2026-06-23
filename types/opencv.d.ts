declare global {
  // ─── Core matrix types ────────────────────────────────────────────────────────

  interface Mat {
    delete(): void;
    rows: number;
    cols: number;
    /** Raw pixel data as 32-bit signed integers (used for point arrays). */
    data32S: Int32Array;
    /** Raw pixel data as unsigned bytes. */
    data: Uint8Array;
    clone(): Mat;
    copyTo(dst: Mat): void;
    doubleAt(i: number, j: number): number;
  }

  interface MatVector {
    delete(): void;
    size(): number;
    get(i: number): Mat;
    push_back(m: Mat): void;
  }

  // ─── Geometry types ───────────────────────────────────────────────────────────

  interface Size {
    width: number;
    height: number;
  }

  interface Point2f {
    x: number;
    y: number;
  }

  interface RotatedRect {
    center: Point2f;
    size: Size;
    /** Angle in degrees. */
    angle: number;
  }

  type Scalar = object;

  // ─── CLAHE (Contrast Limited Adaptive Histogram Equalisation) ─────────────────

  interface CLAHE {
    apply(src: Mat, dst: Mat): void;
    delete(): void;
  }

  // ─── Window cv namespace ──────────────────────────────────────────────────────

  interface Window {
    cv: OpenCV;
  }

  interface OpenCV {
    // ── Constructors ────────────────────────────────────────────────────────────
    Mat: {
      new (): Mat;
      zeros(rows: number, cols: number, type: number): Mat;
    };
    MatVector: new () => MatVector;
    Size: new (w: number, h: number) => Size;
    Scalar: new (v1: number, v2?: number, v3?: number, v4?: number) => Scalar;
    CLAHE: new (clipLimit: number, tileGridSize: Size) => CLAHE;

    // ── I/O ─────────────────────────────────────────────────────────────────────
    imread(
      source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement,
    ): Mat;
    imshow(canvas: HTMLCanvasElement | string, mat: Mat): void;

    // ── Colour conversion ───────────────────────────────────────────────────────
    cvtColor(src: Mat, dst: Mat, code: number): void;

    // ── Blurring / filtering ────────────────────────────────────────────────────
    GaussianBlur(src: Mat, dst: Mat, ksize: Size, sigma: number): void;

    // ── Morphology ──────────────────────────────────────────────────────────────
    getStructuringElement(shape: number, ksize: Size): Mat;
    morphologyEx(src: Mat, dst: Mat, op: number, kernel: Mat): void;

    // ── Thresholding / masking ──────────────────────────────────────────────────
    inRange(src: Mat, lowerb: Mat, upperb: Mat, dst: Mat): void;

    // ── Edge detection ──────────────────────────────────────────────────────────
    Canny(src: Mat, dst: Mat, t1: number, t2: number): void;

    // ── Contour analysis ────────────────────────────────────────────────────────
    findContours(
      image: Mat,
      contours: MatVector,
      hierarchy: Mat,
      mode: number,
      method: number,
    ): void;
    contourArea(cnt: Mat): number;
    arcLength(cnt: Mat, closed: boolean): number;
    approxPolyDP(cnt: Mat, approx: Mat, epsilon: number, closed: boolean): void;
    minAreaRect(cnt: Mat): RotatedRect;
    fillPoly(img: Mat, pts: MatVector, color: Scalar): void;

    // ── Per-pixel ops ───────────────────────────────────────────────────────────
    bitwise_and(src1: Mat, src2: Mat, dst: Mat, mask?: Mat): void;
    bitwise_or(src1: Mat, src2: Mat, dst: Mat, mask?: Mat): void;
    LUT(src: Mat, table: Mat, dst: Mat): void;

    // ── Stats ───────────────────────────────────────────────────────────────────
    meanStdDev(src: Mat, mean: Mat, stdDev: Mat, mask: Mat): void;
    countNonZero(src: Mat): number;

    // ── Perspective transform ────────────────────────────────────────────────────
    getPerspectiveTransform(src: Mat, dst: Mat): Mat;
    warpPerspective(src: Mat, dst: Mat, M: Mat, dsize: Size): void;

    // ── Array helpers ───────────────────────────────────────────────────────────
    matFromArray(
      rows: number,
      cols: number,
      type: number,
      array: number[],
    ): Mat;

    // ── Type constants ──────────────────────────────────────────────────────────
    CV_8U: number;
    CV_32FC2: number;
    CV_32FC4: number;
    CV_32SC2: number;

    // ── Colour conversion codes ─────────────────────────────────────────────────
    COLOR_RGBA2GRAY: number;
    COLOR_RGBA2RGB: number;
    COLOR_RGB2HSV: number;

    // ── Morphology shape constants ──────────────────────────────────────────────
    MORPH_RECT: number;
    MORPH_CLOSE: number;
    MORPH_OPEN: number;

    // ── Contour retrieval mode constants ────────────────────────────────────────
    RETR_EXTERNAL: number;
    RETR_LIST: number;

    // ── Contour approximation method constants ───────────────────────────────────
    CHAIN_APPROX_SIMPLE: number;

    // ── Runtime ─────────────────────────────────────────────────────────────────
    onRuntimeInitialized: () => void;
  }
}

export {};
