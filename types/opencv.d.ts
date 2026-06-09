declare global {
  interface Mat {
    delete(): void;
    rows: number;
    cols: number;
    data32S: Int32Array;
    doubleAt(i: number, j: number): number;
  }

  interface MatVector {
    delete(): void;
    size(): number;
    get(i: number): Mat;
    push_back(m: Mat): void;
  }

  interface Size {
    width: number;
    height: number;
  }

  type Scalar = object;

  interface Window {
    cv: {
      Mat: {
        new (): Mat;
        zeros(rows: number, cols: number, type: number): Mat;
      };
      MatVector: new () => MatVector;
      Size: new (w: number, h: number) => Size;
      Scalar: new (v1: number, v2?: number, v3?: number, v4?: number) => Scalar;
      cvtColor: (src: Mat, dst: Mat, code: number) => void;
      GaussianBlur: (src: Mat, dst: Mat, ksize: Size, sigma: number) => void;
      Canny: (src: Mat, dst: Mat, t1: number, t2: number) => void;
      findContours: (image: Mat, contours: MatVector, hierarchy: Mat, mode: number, method: number) => void;
      contourArea: (cnt: Mat) => number;
      arcLength: (cnt: Mat, closed: boolean) => number;
      approxPolyDP: (cnt: Mat, approx: Mat, epsilon: number, closed: boolean) => void;
      imread: (source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement) => Mat;
      meanStdDev: (src: Mat, mean: Mat, stdDev: Mat, mask: Mat) => void;
      bitwise_and: (src1: Mat, src2: Mat, dst: Mat, mask?: Mat) => void;
      countNonZero: (src: Mat) => number;
      fillPoly: (img: Mat, pts: MatVector, color: Scalar) => void;
      matFromArray: (rows: number, cols: number, type: number, array: number[]) => Mat;
      LUT: (src: Mat, table: Mat, dst: Mat) => void;
      CV_8U: number;
      CV_32FC4: number;
      CV_32SC2: number;
      COLOR_RGBA2GRAY: number;
      RETR_EXTERNAL: number;
      CHAIN_APPROX_SIMPLE: number;
      onRuntimeInitialized: () => void;
    };
  }
}

export {};
