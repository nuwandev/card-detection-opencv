"use client";

import { useRef } from "react";
import Webcam from "react-webcam";

export const useCamera = () => {
  const webcamRef = useRef<Webcam>(null);

  // Helper to access the underlying HTMLVideoElement
  const getVideoElement = () => {
    return webcamRef.current?.video;
  };

  return {
    webcamRef,
    getVideoElement,
  };
};
