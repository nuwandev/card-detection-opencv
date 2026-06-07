'use client';

import React, { useEffect, useRef, useState } from 'react';
import Webcam from 'react-webcam';
import { loadOpenCV } from '@/lib/opencv/loader';
import { useCardDetection } from '@/features/card-detection/hooks/useCardDetection';
import { CardDetectionConfig } from '@/features/card-detection/types';

interface CameraDetectorProps extends CardDetectionConfig {}

export const CameraDetector: React.FC<CameraDetectorProps> = ({ onCardDetected, areaThreshold }) => {
  const webcamRef = useRef<Webcam>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cvReady, setCvReady] = useState(false);

  useEffect(() => {
    loadOpenCV().then(() => setCvReady(true));
  }, []);

  // Sync webcam's video ref
  useEffect(() => {
    if (webcamRef.current?.video) {
      videoRef.current = webcamRef.current.video;
    }
  }, [webcamRef.current?.video]);

  useCardDetection(videoRef, { onCardDetected, areaThreshold });

  if (!cvReady) return <div>Loading OpenCV...</div>;

  return (
    <Webcam
      ref={webcamRef}
      audio={false}
      videoConstraints={{ facingMode: 'environment' }}
      style={{ width: '100%', maxWidth: '640px' }}
    />
  );
};
