"use client";

import { useEffect, useState } from "react";

/**
 * Hook to asynchronously load and initialize the OpenCV.js library.
 */
export const useOpenCV = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.cv) {
      const timeout = setTimeout(() => setReady(true), 0);
      return () => clearTimeout(timeout);
    }

    const script = document.createElement("script");

    script.src = "/opencv.js";
    script.async = true;

    script.onload = () => {
      window.cv.onRuntimeInitialized = () => {
        setReady(true);
      };
    };

    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  return { ready, cv: typeof window !== "undefined" ? window.cv : null };
};
