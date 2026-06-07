'use client';

import { CameraDetector } from '@/features/card-detection/components/CameraDetector';

export default function CardDetectionPage() {
  const handleCardDetected = () => {
    console.log('Card detected!');
    alert('Card detected!');
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">Card Detection</h1>
      <CameraDetector onCardDetected={handleCardDetected} />
    </div>
  );
}
