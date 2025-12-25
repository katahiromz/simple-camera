import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";

// Webcam03 コンポーネント
interface ScreenshotDimensions {
  width: number;
  height: number;
}

interface WebcamProps {
  audio?: boolean;
  audioConstraints?: MediaTrackConstraints;
  videoConstraints?: MediaTrackConstraints;
  onUserMedia?: (stream: MediaStream) => void;
  onUserMediaError?: (error: string | DOMException) => void;
  screenshotFormat?: "image/webp" | "image/png" | "image/jpeg";
  screenshotQuality?: number;
  mirrored?: boolean;
  forceScreenshotSourceSize?: boolean;
  minScreenshotWidth?: number;
  minScreenshotHeight?: number;
  imageSmoothing?: boolean;
  children?: (props: { getScreenshot: () => string | null }) => React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

interface WebcamCanvasHandle {
  getScreenshot: (dimensions?: ScreenshotDimensions) => string | null;
  getCanvas: (dimensions?: ScreenshotDimensions) => HTMLCanvasElement | null;
  video: HTMLVideoElement | null;
}

const Webcam03 = forwardRef<WebcamCanvasHandle, WebcamProps>(
  (
    {
      audio = false,
      audioConstraints,
      videoConstraints,
      onUserMedia = () => {},
      onUserMediaError = () => {},
      screenshotFormat = "image/webp",
      screenshotQuality = 0.92,
      mirrored = false,
      forceScreenshotSourceSize = false,
      minScreenshotWidth,
      minScreenshotHeight,
      imageSmoothing = true,
      children,
      style,
      className,
      ...rest
    },
    ref
  ) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [hasUserMedia, setHasUserMedia] = useState(false);

    const stopMediaStream = useCallback(() => {
      console.log('stopMediaStream');
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }, []);

    const handleSuccess = (stream) => {
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setHasUserMedia(true);
      onUserMedia(stream);
    };

    const requestUserMedia = useCallback(async () => {
      console.log('requestUserMedia');
      stopMediaStream();

      // 現在の制約を取得
      const baseVideoConstraints = typeof videoConstraints === 'object' ? videoConstraints : {};

      const constraints: MediaStreamConstraints = {
        video: videoConstraints || true,
        audio: audio ? (audioConstraints || true) : false,
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        handleSuccess(stream); // 成功
      } catch (err) {
        console.warn("First camera attempt failed, trying fallback:", err);

        // facingMode が指定されている場合、逆のモードでリトライ
        if (typeof baseVideoConstraints === 'object' && baseVideoConstraints.facingMode) {
          const currentMode = typeof baseVideoConstraints.facingMode === 'string' 
            ? baseVideoConstraints.facingMode 
            : (baseVideoConstraints.facingMode as any).ideal;

          const fallbackMode = currentMode === "user" ? "environment" : "user";
          
          const fallbackConstraints = {
            ...constraints,
            video: { ...baseVideoConstraints, facingMode: { ideal: fallbackMode } }
          };

          try {
            const fallbackStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
            handleSuccess(fallbackStream); // 成功
            return;
          } catch (fallbackErr) {
            console.error("Fallback camera attempt also failed:", fallbackErr);
          }
        }

        // 失敗
        setHasUserMedia(false);
        onUserMediaError(err as DOMException);
      }
    }, [audio, stopMediaStream, JSON.stringify(videoConstraints), JSON.stringify(audioConstraints)]);

    useEffect(() => {
      console.log('useEffect');
      requestUserMedia();
      return () => stopMediaStream();
    }, [requestUserMedia, stopMediaStream]);

    const getCanvas = useCallback((dimensions?: ScreenshotDimensions): HTMLCanvasElement | null => {
      console.log('getCanvas');
      const video = videoRef.current;
      if (!video || !hasUserMedia || !video.videoHeight) return null;

      const canvas = document.createElement("canvas");
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      const aspectRatio = videoWidth / videoHeight;

      let canvasWidth = dimensions?.width || videoWidth;
      let canvasHeight = dimensions?.height || videoHeight;

      if (!forceScreenshotSourceSize && !dimensions) {
        canvasWidth = minScreenshotWidth || video.clientWidth;
        canvasHeight = canvasWidth / aspectRatio;

        if (minScreenshotHeight && canvasHeight < minScreenshotHeight) {
          canvasHeight = minScreenshotHeight;
          canvasWidth = canvasHeight * aspectRatio;
        }
      }

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = imageSmoothing;
        if (mirrored) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (mirrored) {
          ctx.scale(-1, 1);
          ctx.translate(-canvas.width, 0);
        }
      }

      return canvas;
    }, [hasUserMedia, imageSmoothing, mirrored, minScreenshotWidth, minScreenshotHeight, forceScreenshotSourceSize]);

    const getScreenshot = useCallback((dimensions?: ScreenshotDimensions) => {
      console.log('getScreenshot');
      const canvas = getCanvas(dimensions);
      return canvas ? canvas.toDataURL(screenshotFormat, screenshotQuality) : null;
    }, [getCanvas, screenshotFormat, screenshotQuality]);

    useImperativeHandle(ref, () => ({
      getScreenshot,
      getCanvas,
      video: videoRef.current,
    }));

    const videoStyle: React.CSSProperties = {
      ...style,
      transform: `${style?.transform || ""} ${mirrored ? "scaleX(-1)" : ""}`.trim(),
    };

    return (
      <>
        <video
          autoPlay
          muted={!audio}
          playsInline
          ref={videoRef}
          style={videoStyle}
          className={className}
          {...rest}
        />
        {children?.({ getScreenshot })}
      </>
    );
  }
);

Webcam03.displayName = "Webcam03";

export default Webcam03;
