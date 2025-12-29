// utils.ts --- 汎用のユーティリティ関数
// Author: katahiromz
// License: MIT

// Android WebViewか？
export const isAndroidApp = typeof window.android !== 'undefined';

// insetsをエミュレートする
export const emulateInsets = () => {
  let custom = { top: 30, bottom: 30, left: 30, right: 30 };
  // デバイスプリセット
  const presets = {
    'iPhone X-13': { top: 44, bottom: 34, left: 0, right: 0 },
    'iPhone 14 Pro+': { top: 59, bottom: 34, left: 0, right: 0 },
    'iPhone 15 Pro': { top: 59, bottom: 34, left: 0, right: 0 },
    'Android': { top: 0, bottom: 24, left: 0, right: 0 },
    'iPad Pro': { top: 24, bottom: 20, left: 0, right: 0 },
    'なし': { top: 0, bottom: 0, left: 0, right: 0 },
    'カスタム': custom
  };
  // CSS変数を更新
  //const values = presets['カスタム'];
  const values = presets['なし'];
  document.documentElement.style.setProperty('--safe-inset-top', `${values.top}px`);
  document.documentElement.style.setProperty('--safe-inset-bottom', `${values.bottom}px`);
  document.documentElement.style.setProperty('--safe-inset-left', `${values.left}px`);
  document.documentElement.style.setProperty('--safe-inset-right', `${values.right}px`);
};

/**
 * ズーム倍率に応じた最大移動可能オフセットを計算する
 */
export const getMaxOffset = (videoWidth: number, videoHeight: number, zoom: number) => {
  const sourceWidth = videoWidth / zoom;
  const sourceHeight = videoHeight / zoom;
  return {
    x: (videoWidth - sourceWidth) / 2,
    y: (videoHeight - sourceHeight) / 2
  };
};

/**
 * ダウンロードファイル名の生成
 */
export const generateFileName = (prefix: 'video_' | 'photo_', extension: string): string => {
  // 日時文字列を取得
  const now = new Date();
  let timestamp = now.toLocaleDateString() + " " + now.toLocaleTimeString();
  // 空白文字やファイル名に使用できない文字を _ に置き換える
  timestamp = timestamp.replace(/[ :\.\\\/]/g, '_');
  console.assert(extension[0] == '.');
  return `${prefix}${timestamp}${extension}`;
};

/**
 * 秒数を HH:MM:SS 形式に変換
 */
export const formatTime = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};

/**
 * 画像の形式から拡張子へ（ドット付き）
 */
export const photoFormatToExtension = (format: string): string => {
  switch (format) {
  case 'image/png': return '.png';
  case 'image/tiff': return '.tif';
  case 'image/webp': return '.webp';
  case 'image/bmp': return '.bmp';
  case 'image/jpeg': default: return '.jpg';
  }
};

/**
 * 動画の形式から拡張子へ（ドット付き）
 */
export const videoFormatToExtension = (format: string): string => {
  if (format.includes('mp4')) return '.mp4';
  if (format.includes('webm')) return '.webm';
  return '.webm'; // default
};

/**
 * 音声を再生する
 */
export const playSound = (audio: HTMLAudioElement | null) => {
  if (!audio) {
    console.assert(false);
  }

  // 可能ならばシステム音量を変更する
  if (isAndroidApp)
    window.android?.onStartShutterSound();

  try {
    audio?.addEventListener('ended', (event) => { // 再生終了時
      // 可能ならばシステム音量を元に戻す
      if (isAndroidApp)
        window.android.onEndShutterSound();
    }, { once: true });
    // 再生位置をリセットしてから再生
    audio.currentTime = 0;
    audio.play();
  } catch (error) {
    console.warn('sound playback failed:', error);
  }
};

/**
 * 数値を区間内に制限する
 */
export const clamp = (minValue: number, value: number, maxValue: number) => {
  return Math.max(minValue, Math.min(value, maxValue));
};

// ファイルを保存する
export const saveMedia = (blob: Blob, fileName: string, mimeType: string, type: 'video' | 'photo' | 'audio') => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = fileName;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};

// ファイルを保存する(拡張版)
export const saveMediaEx = (blob: Blob, fileName: string, mimeType: string, type: 'video' | 'photo' | 'audio') => {
  if (!isAndroidApp)
    return saveMedia(blob, fileName, mimeType, type);
  const reader = new FileReader();
  reader.onloadend = () => {
    console.log("reader.onloadend");
    const result = reader.result;
    const base64data = result.substr(result.indexOf('base64,') + 7);
    // Kotlin側の関数を呼び出す
    try {
      window.android.saveMediaToGallery(base64data, fileName, mimeType, type);
      console.log(`Saved ${type}:`, fileName);
    } catch (error) {
      console.assert(false);
      console.error('android インタフェース呼び出しエラー:', error);
      saveMedia(blob, fileName);
    }
  };
  reader.readAsDataURL(blob); // BlobをBase64に変換
};

// polyfill based on https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
export const polyfillGetUserMedia = () => {
  if (typeof window === 'undefined') {
    return;
  }

  // Older browsers might not implement mediaDevices at all, so we set an empty object first
  if (navigator.mediaDevices === undefined) {
    (navigator as any).mediaDevices = {};
  }

  // Some browsers partially implement mediaDevices. We can't just assign an object
  // with getUserMedia as it would overwrite existing properties.
  // Here, we will just add the getUserMedia property if it's missing.
  if (navigator.mediaDevices.getUserMedia === undefined) {
    navigator.mediaDevices.getUserMedia = function(constraints) {
      // First get ahold of the legacy getUserMedia, if present
      const getUserMedia =
        navigator.getUserMedia ||
        navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia ||
        navigator.msGetUserMedia;

      // Some browsers just don't implement it - return a rejected promise with an error
      // to keep a consistent interface
      if (!getUserMedia) {
        return Promise.reject(
          new Error("getUserMedia is not implemented in this browser")
        );
      }

      // Otherwise, wrap the call to the old navigator.getUserMedia with a Promise
      return new Promise(function(resolve, reject) {
        getUserMedia.call(navigator, constraints, resolve, reject);
      });
    };
  }
};

// 現在の日時の文字列を取得する(ローカル日時)
export const getLocalDateTimeString = () => {
  let d = new Date();
  d = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
  let iso = d.toISOString();
  let yyyymmdd = iso.substring(0, 10);
  let hhmmss = iso.substring(11, 19);
  return yyyymmdd + ' ' + hhmmss;
};

// キャンバスを複製する
export const cloneCanvas = (oldCanvas: HTMLCanvasElement) => {
  let newCanvas = document.createElement('canvas');
  newCanvas.width = oldCanvas.width;
  newCanvas.height = oldCanvas.height;
  let ctx = newCanvas.getContext('2d');
  ctx?.drawImage(oldCanvas, 0, 0);
  return newCanvas;
};
