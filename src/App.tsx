// App.tsx --- アプリのTypeScriptソース
import React, { useRef, useState, useEffect, useCallback } from 'react';
import CanvasWithWebcam03 from './components/CanvasWithWebcam03';
import { isAndroidApp, emulateInsets } from './utils.ts';
import { saveFile, saveFileEx } from './components/utils.ts';
import './App.css';

const IS_PRODUCTION = import.meta.env.MODE === 'production'; // 製品版か？
const SHOW_CONFIG = true; // 設定ボタンを表示するか？
const ENABLE_CONFIG = true; // 設定を有効にするか？

// アプリケーションのベースパスを取得
const BASE_URL = import.meta.env.BASE_URL;

// ダミー画像
const dummyImageUrl = `${BASE_URL}dummy.jpg`;
const USE_DUMMY_IMAGE = false;

// 音声のURL
const shutterSoundUrl = `${BASE_URL}ac-camera-shutter-sound.mp3`;
const videoStartSoundUrl = `${BASE_URL}ac-video-started.mp3`;
const videoCompleteSoundUrl = `${BASE_URL}ac-video-completed.mp3`;

if (!IS_PRODUCTION) { // 本番環境ではない場合、
  emulateInsets(); // insetsをエミュレートする
}

// 設定をする
const doConfig = () => {
  if (!ENABLE_CONFIG)
    return;
  alert('Simple Camera 1.0.0 by katahiromz');
};

// アプリ
function App() {
  const canvasWithCamera = useRef(null);

  useEffect(() => {
    //console.log(canvasWithCamera.current.canvas);
    //canvasWithCamera.current.setZoomRatio(2);
    //console.log(canvasWithCamera.current.getZoomRatio());
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

  // キーボード操作を可能にする
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch(event.key) {
      case '+': // ズームイン
      case ';': // (日本語キーボード対応用)
        if (!event.ctrlKey && !event.altKey) { // CtrlキーやAltキーが押されていない？
          event.preventDefault();
          canvasWithCamera.current?.zoomIn(); // ズームイン
        }
        break;
      case '-': // ズームアウト
        if (!event.ctrlKey && !event.altKey) { // CtrlキーやAltキーが押されていない？
          event.preventDefault();
          canvasWithCamera.current?.zoomOut(); // ズームアウト
        }
        break;
      case ' ': // スペース キー
        if (!event.ctrlKey && !event.altKey) { // CtrlキーやAltキーが押されていない？
          event.preventDefault();
          canvasWithCamera.current?.takePhoto(); // 写真撮影
        }
        break;
      case 'Enter': // Enterキー
        if (!event.ctrlKey && !event.altKey) { // CtrlキーやAltキーが押されていない？
          event.preventDefault();
          // 録画開始・録画停止を切り替える
          if (canvasWithCamera.current?.isRecording()) {
            canvasWithCamera.current?.stopRecording();
          } else {
            canvasWithCamera.current?.startRecording();
          }
        }
        break;
      // パン操作 (矢印)
      case 'ArrowUp':
        event.preventDefault();
        canvasWithCamera.current?.panUp();
        break;
      case 'ArrowDown':
        event.preventDefault();
        canvasWithCamera.current?.panDown();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        canvasWithCamera.current?.panRight();
        break;
      case 'ArrowRight':
        event.preventDefault();
        canvasWithCamera.current?.panLeft();
        break;
      default:
        //console.log(event.key);
        break;
      }
    };

    document.body.addEventListener('keydown', handleKeyDown);
    return () => document.body.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <CanvasWithWebcam03
      ref={canvasWithCamera}
      style={{ width: '100%', height: '100%' }}
      shutterSoundUrl={shutterSoundUrl}
      videoStartSoundUrl={videoStartSoundUrl}
      videoCompleteSoundUrl={videoCompleteSoundUrl}
      downloadFile={isAndroidApp ? saveFileEx : saveFile}
      eventTarget={document.body}
      autoMirror={true}
      dummyImageSrc={ USE_DUMMY_IMAGE ? dummyImageUrl : null }
      showConfig={SHOW_CONFIG}
      doConfig={doConfig}
    />
  );
}

export default App;