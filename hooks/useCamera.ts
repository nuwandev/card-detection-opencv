"use client";

import { useRef } from "react";
import Webcam from "react-webcam";

/**
 * Hook providing access to the underlying webcam video element.
 */
export const useCamera = () => {
  const webcamRef = useRef<Webcam>(null);

  const getVideoElement = () => {
    return webcamRef.current?.video;
  };

  return {
    webcamRef,
    getVideoElement,
  };
};
