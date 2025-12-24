// App.tsx --- アプリのTypeScriptソース
import React, { useRef, useState, useEffect, useCallback } from 'react';
import CanvasWithWebcam03 from './components/canvas-with-webcam03';
import { emulateInsets } from './utils.ts';
import './App.css';

// 製品版か？
const IS_PRODUCTION = import.meta.env.MODE === 'production';

// アプリケーションのベースパスを取得
const BASE_URL = import.meta.env.BASE_URL;

// 音声のURL
const shutterSoundUrl = `${BASE_URL}ac-camera-shutter-sound.mp3`;
const videoStartSoundUrl = `${BASE_URL}ac-video-started.mp3`;
const videoCompleteSoundUrl = `${BASE_URL}ac-video-completed.mp3`;

if (!IS_PRODUCTION) { // 本番環境ではない場合、
  emulateInsets(); // insetsをエミュレートする
}

// アプリ
function App() {
  const canvasWithCamera = useRef(null);

  useEffect(() => {
    console.log(canvasWithCamera.current.canvas);
    canvasWithCamera.current.setZoomRatio(2);
  }, []);

  return (
    <CanvasWithWebcam03
      ref={canvasWithCamera}
      shutterSoundUrl={shutterSoundUrl}
      videoStartSoundUrl={videoStartSoundUrl}
      videoCompleteSoundUrl={videoCompleteSoundUrl}
    />
  );
}

export default App;