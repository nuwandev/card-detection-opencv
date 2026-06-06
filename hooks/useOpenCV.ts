"use client";

import { useEffect, useState } from "react";

export type OpenCVStatus = "loading" | "ready" | "error";

const OPENCV_CDN_URL = "https://docs.opencv.org/4.10.0/opencv.js";

export function useOpenCV(): { status: OpenCVStatus } {
  const [status, setStatus] = useState<OpenCVStatus>("loading");

  useEffect(() => {
    // Already loaded by a previous mount
    if (typeof window !== "undefined" && (window as any).cv?.Mat) {
      setStatus("ready");
      return;
    }

    const existingScript = document.getElementById("opencv-script");
    if (existingScript) {
      // Script tag already injected, wait for it
      const check = setInterval(() => {
        if ((window as any).cv?.Mat) {
          setStatus("ready");
          clearInterval(check);
        }
      }, 100);
      return () => clearInterval(check);
    }

    const script = document.createElement("script");
    script.id = "opencv-script";
    script.src = OPENCV_CDN_URL;
    script.async = true;

    script.onload = () => {
      // cv may still be initializing its WASM runtime
      const waitForRuntime = setInterval(() => {
        if ((window as any).cv?.Mat) {
          setStatus("ready");
          clearInterval(waitForRuntime);
        }
      }, 100);
    };

    script.onerror = () => {
      console.error("[useOpenCV] Failed to load opencv.js from CDN");
      setStatus("error");
    };

    document.head.appendChild(script);
  }, []);

  return { status };
}
