# Real-time Card Scanner

This project provides a robust, browser-based computer vision solution to detect and track rectangular documents (like ID cards) in real-time using **Next.js**, **React**, and **OpenCV.js**.

## Key Features

- **Stateful Detection Loop**: An explicit state machine (`READY`, `DETECTING`, `DETECTED`, `ERROR`) handles the detection lifecycle and provides real-time UI feedback.
- **Coordinate Smoothing**: Implements Exponential Moving Average (EMA) to reduce visual jitter of detected document corners.
- **Robust Pipeline**: Optimized OpenCV.js pipeline featuring Gaussian blur, Canny edge detection, and contour analysis for reliable document identification.

## Architecture

The project is modularly structured to decouple image processing from the UI:

- **Hooks**: Orchestrate the camera (`useCamera`), OpenCV initialization (`useOpenCV`), and the detection lifecycle (`useCardDetection`).
- **Lib**: Contains the core computer vision logic (`lib/detector.ts`).
- **Runtime**: Handles efficient frame capture to OpenCV matrices (`runtime/frame.ts`).

## Getting Started

1. Ensure `opencv.js` is available in the `public/` directory.
2. Install dependencies: `pnpm install`.
3. Run: `pnpm dev`.
