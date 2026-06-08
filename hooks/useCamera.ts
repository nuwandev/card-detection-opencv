"use client";

import { useEffect, useRef } from "react";

export const useCamera = () => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const start = async () => {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    };

    void start();

    return () => {
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return {
    videoRef,
  };
};