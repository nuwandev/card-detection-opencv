declare global {
  interface Window {
    cv: {
      Mat: new () => any;
      MatVector: new () => any;
      Size: new (w: number, h: number) => any;
      Scalar: new (v: number) => any;
      cvtColor: (src: any, dst: any, code: number) => void;
      GaussianBlur: (src: any, dst: any, ksize: any, sigma: number) => void;
      Canny: (src: any, dst: any, t1: number, t2: number) => void;
      findContours: (image: any, contours: any, hierarchy: any, mode: number, method: number) => void;
      contourArea: (cnt: any) => number;
      arcLength: (cnt: any, closed: boolean) => number;
      approxPolyDP: (cnt: any, approx: any, epsilon: number, closed: boolean) => void;
      imread: (canvas: HTMLCanvasElement) => any;
      meanStdDev: (src: any, mean: any, stdDev: any, mask: any) => void;
      bitwise_and: (src1: any, src2: any, dst: any, mask?: any) => void;
      countNonZero: (src: any) => number;
      fillPoly: (img: any, pts: any, color: any) => void;
      matFromArray: (rows: number, cols: number, type: number, array: number[]) => any;
      LUT: (src: any, table: any, dst: any) => void;
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