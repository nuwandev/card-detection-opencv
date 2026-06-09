# Integration Guide

Follow this guide to integrate the card detection functionality into your project.

## 1. Prerequisites
- **Dependencies**: Ensure `react-webcam` is installed in your project.
- **OpenCV.js**: You must have `opencv.js` in your `public/` folder.

## 2. Copy Required Files
Copy the following modules into your project structure:

- `hooks/useCamera.ts`
- `hooks/useCardDetection.ts`
- `hooks/useOpenCV.ts`
- `lib/detector.ts`
- `runtime/frame.ts`
- `types/geometry.ts`
- `utils/geometry.ts`

## 3. Implementation Steps

1.  **Initialize OpenCV**:
    ```typescript
    const { ready, cv } = useOpenCV();
    ```

2.  **Setup Camera**:
    ```typescript
    const { webcamRef } = useCamera();
    // ... in JSX
    <Webcam ref={webcamRef} />
    ```

3.  **Orchestrate Detection**:
    ```typescript
    const { state, points, process } = useCardDetection(cv, webcamRef.current?.video || null);

    useEffect(() => {
      if (!ready || !cv) return;
      // Implement your animation frame loop here calling `process()`
    }, [ready, cv, process]);
    ```

4.  **UI Feedback**:
    Use the `state` returned by `useCardDetection` to update your component's styling and instructional text (e.g., changing border color on `DETECTED`).
