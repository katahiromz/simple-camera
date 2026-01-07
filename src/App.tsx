// App.tsx --- アプリのTypeScriptソース
// Author: katahiromz
// License: MIT
import React, { useRef, useState, useEffect, useCallback } from 'react';
import CanvasWithWebcam03 from './components/CanvasWithWebcam03';
import { isAndroidApp, emulateInsets, saveMedia, saveMediaEx, polyfillGetUserMedia } from './libs/utils';
import './App.css';

const IS_PRODUCTION = import.meta.env.MODE === 'production'; // 製品版か？
const SHOW_CONFIG = true; // 設定ボタンを表示するか？
const ENABLE_CONFIG = true; // 設定を有効にするか？

// 国際化(i18n)
import './libs/i18n';
import { useTranslation } from 'react-i18next';

// アプリケーションのベースパスを取得
const BASE_URL = import.meta.env.BASE_URL;

const ENABLE_KEYS = true; // キーボード操作するか？

// ダミー画像
const dummyImageUrl = `${BASE_URL}example-qr-code.png`;
//const dummyImageUrl = `${BASE_URL}dummy.jpg`;
const USE_DUMMY_IMAGE = false;
//const USE_DUMMY_IMAGE = true;

// 音声のURL
const shutterSoundUrl = `${BASE_URL}ac-camera-shutter-sound.mp3`;
const videoStartSoundUrl = `${BASE_URL}ac-video-started.mp3`;
const videoCompleteSoundUrl = `${BASE_URL}ac-video-completed.mp3`;

if (!IS_PRODUCTION) { // 本番環境ではない場合、
  emulateInsets(); // insetsをエミュレートする
}

// 古いブラウザのサポート(必要か？)
polyfillGetUserMedia();

// アプリ
function App() {
  const { t } = useTranslation(); // 翻訳用
  const canvasWithCamera = useRef<React.ElementRef<typeof CanvasWithWebcam03>>(null);

  // 設定をする
  const doConfig = () => {
    if (!ENABLE_CONFIG)
      return;
    alert(t('camera_app_info'));
  };

  useEffect(() => {
    //console.log(canvasWithCamera.current.canvas);
    //canvasWithCamera.current.setZoomRatio(2);
    //console.log(canvasWithCamera.current.getZoomRatio());
  }, []);

  // 物理の音量ボタンを押されたら撮影
  useEffect(() => {
    // ハンドラ関数の定義
    const handlePhysicalVolumeButton = (e: any) => {
      // Android側から CustomEvent("PhysicalVolumeButton", { detail: ... }) で送られてくることを想定
      const { volumeType } = e.detail || {};
      console.log(`Volume: ${volumeType}`);

      // 音量ボタンでシャッターを切るなど
      canvasWithCamera.current?.takePhoto();
    };

    // イベントリスナーの登録
    window.addEventListener('PhysicalVolumeButton', handlePhysicalVolumeButton, { passive: false });

    // クリーンアップ（コンポーネント消滅時に解除）
    return () => {
      window.removeEventListener('PhysicalVolumeButton', handlePhysicalVolumeButton);
    };
  }, []); // 初回マウント時のみ実行

  useEffect(() => {
    // Android側から呼ばれるグローバル関数を定義
    if ((window as any).onPhysicalVolumeButton) {
      (window as any).onPhysicalVolumeButton = () => {
        canvasWithCamera.current?.takePhoto();
      };
    }
    // コンポーネントがアンマウントされる時にクリーンアップ
    return () => {
      delete (window as any).onPhysicalVolumeButton;
    };
  }, []);

  // キーボード操作を可能にする
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!ENABLE_KEYS) return;
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

  // メッセージを処理する
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      switch (e.data) {
      case 'go_back': // Android標準の「戻る」ボタンをサポートする。
        if (window.android) {
          e.preventDefault(); // イベントのデフォルトの処理をスキップ。
          // 可能ならばアプリを閉じる(完全に終了する訳ではない)
          try { window.android.finishApp(); } catch (err) { }
        }
        break;
      case 'onAppResume': // Androidアプリ再開時の処理を行う。
        if (window.android) {
          e.preventDefault(); // イベントのデフォルトの処理をスキップ。
          canvasWithCamera.current?.onAppResume();
        }
        break;
      default:
        console.log(e.data);
        break;
      }
    };

    window.addEventListener('message', onMessage, { passive: false });
    return () => {
      window.removeEventListener('message', onMessage);
    }
  }, []);

  return (
    <CanvasWithWebcam03
      ref={canvasWithCamera}
      width="100%"
      height="100%"
      shutterSoundUrl={shutterSoundUrl}
      videoStartSoundUrl={videoStartSoundUrl}
      videoCompleteSoundUrl={videoCompleteSoundUrl}
      downloadFile={isAndroidApp ? saveMediaEx : saveMedia}
      eventTarget={document.body}
      autoMirror={false}
      dummyImageSrc={ USE_DUMMY_IMAGE ? dummyImageUrl : null }
      showConfig={SHOW_CONFIG}
      doConfig={doConfig}
      aria-label={t('camera_app')}
    />
  );
}

export default App;