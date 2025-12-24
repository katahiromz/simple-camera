// App.tsx --- アプリのTypeScriptソース
import React, { useRef, useState, useEffect, useCallback } from 'react';
import CanvasWithWebcam03 from './components/canvas-with-webcam03';
import { isAndroidApp, emulateInsets } from './utils.ts';
import { saveFile, saveFileEx } from './components/utils.ts';
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
    console.log(canvasWithCamera.current.getZoomRatio());
  }, []);

  // 物理の音量ボタンを押されたら撮影
  useEffect(() => {
    // Android側から呼ばれるグローバル関数を定義
    (window as any).onPhysicalVolumeButton = () => {
      canvasWithCamera.current?.takePhoto();
    };
    // コンポーネントがアンマウントされる時にクリーンアップ
    return () => {
      delete (window as any).onPhysicalVolumeButton;
    };
  }, []);

  return (
    <CanvasWithWebcam03
      ref={canvasWithCamera}
      shutterSoundUrl={shutterSoundUrl}
      videoStartSoundUrl={videoStartSoundUrl}
      videoCompleteSoundUrl={videoCompleteSoundUrl}
      downloadFile={isAndroidApp ? saveFileEx : saveFile}
      eventTarget={document.body}
    />
  );
}

export default App;