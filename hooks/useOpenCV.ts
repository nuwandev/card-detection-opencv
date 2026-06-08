"use client";

import { useEffect, useState } from "react";

export const useOpenCV = () => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.cv) {
      setReady(true);
      return;
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

  return ready;
};
