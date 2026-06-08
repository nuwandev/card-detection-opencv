"use client";

import { useEffect, useRef } from "react";

import { useOpenCV } from "@/hooks/useOpenCV";
import { useCamera } from "@/hooks/useCamera";

export default function Home() {
  const cvReady = useOpenCV();

  const { videoRef } = useCamera();

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!cvReady) return;

    let frameId = 0;

    const processFrame = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) {
        frameId = requestAnimationFrame(processFrame);
        return;
      }

      if (video.readyState < 2) {
        frameId = requestAnimationFrame(processFrame);
        return;
      }

      const cv = window.cv;

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        frameId = requestAnimationFrame(processFrame);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      ctx.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
      );

      const src = cv.imread(canvas);

      const gray = new cv.Mat();
      const edges = new cv.Mat();

      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();

      try {
        cv.cvtColor(
          src,
          gray,
          cv.COLOR_RGBA2GRAY
        );

        cv.GaussianBlur(
          gray,
          gray,
          new cv.Size(5, 5),
          0
        );

        cv.Canny(
          gray,
          edges,
          75,
          200
        );

        cv.findContours(
          edges,
          contours,
          hierarchy,
          cv.RETR_LIST,
          cv.CHAIN_APPROX_SIMPLE
        );

        let largestArea = 0;
        let largestQuad: any = null;

        for (let i = 0; i < contours.size(); i++) {
          const contour = contours.get(i);

          const perimeter = cv.arcLength(
            contour,
            true
          );

          const approx = new cv.Mat();

          cv.approxPolyDP(
            contour,
            approx,
            0.02 * perimeter,
            true
          );

          if (approx.rows === 4) {
            const area =
              cv.contourArea(contour);

            if (area > largestArea) {
              largestArea = area;

              if (largestQuad) {
                largestQuad.delete();
              }

              largestQuad = approx.clone();
            }
          }

          contour.delete();
          approx.delete();
        }

        if (largestQuad) {
          const color = new cv.Scalar(
            0,
            255,
            0,
            255
          );

          const quadVector =
            new cv.MatVector();

          quadVector.push_back(largestQuad);

          cv.polylines(
            src,
            quadVector,
            true,
            color,
            5
          );

          quadVector.delete();
          largestQuad.delete();
        }

        cv.imshow(canvas, src);
      } finally {
        src.delete();

        gray.delete();
        edges.delete();

        contours.delete();
        hierarchy.delete();
      }

      frameId = requestAnimationFrame(
        processFrame
      );
    };

    processFrame();

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [cvReady, videoRef]);

  return (
    <main className="relative h-screen w-screen bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="hidden"
      />

      <canvas
        ref={canvasRef}
        className="h-full w-full object-cover"
      />
    </main>
  );
}