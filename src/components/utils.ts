// utils.ts
// 汎用のユーティリティ関数は utils.ts に分離

export const isAndroidApp = typeof window.android !== 'undefined';

export interface RenderMetrics {
  renderWidth: number;
  renderHeight: number;
  offsetX: number;
  offsetY: number;
}

/**
 * 「object-fit: cover」または「object-fit: contain」の動作を再現し、描画サイズとオフセットを計算する
 */
export const calculateVideoRenderMetrics = (
  videoWidth: number,
  videoHeight: number,
  displayWidth: number,
  displayHeight: number,
  objectFit: 'cover' | 'contain'
): RenderMetrics => {
  // ゼロ割や不正な入力の可能性をチェック (0の場合、0を返して描画をスキップ)
  if (videoWidth === 0 || videoHeight === 0 || displayWidth === 0 || displayHeight === 0) {
    return { renderWidth: 0, renderHeight: 0, offsetX: 0, offsetY: 0 };
  }
  
  // 描画領域をカバーするために必要なX軸とY軸のスケール係数をそれぞれ計算
  // object-fit: cover は、画面全体を覆うために必要な最大スケール (Math.max) を採用
  const scaleX = displayWidth / videoWidth;
  const scaleY = displayHeight / videoHeight;
  
  const scale = (objectFit === 'cover') ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);
  
  // スケールを適用して、描画サイズを決定
  const renderWidth = videoWidth * scale;
  const renderHeight = videoHeight * scale;
  
  // オフセットを計算 (中央揃え)
  const offsetX = (displayWidth - renderWidth) / 2;
  const offsetY = (displayHeight - renderHeight) / 2;

  return { renderWidth, renderHeight, offsetX, offsetY };
};

/**
 * ズームされた映像の描画領域に基づいて、許容されるパンの最大オフセットを計算
 */
export const calculateMaxPanOffsets = (
  currentZoom: number,
  renderMetrics: RenderMetrics,
  displayWidth: number,
  displayHeight: number
) => {
  const zoomedRenderWidth = renderMetrics.renderWidth * currentZoom;
  const zoomedRenderHeight = renderMetrics.renderHeight * currentZoom;

  // MaxPan_x の計算
  const maxPanX = zoomedRenderWidth > displayWidth
    ? (zoomedRenderWidth - displayWidth) / 2
    : 0;

  // MaxPan_y の計算
  const maxPanY = zoomedRenderHeight > displayHeight
    ? (zoomedRenderHeight - displayHeight) / 2
    : 0;

  return { maxPanX, maxPanY };
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
export const saveFile = (blob: Blob, fileName: string, mimeType: string, isVideo: boolean) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = fileName;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
};

// ファイルを保存する(拡張版)
export const saveFileEx = (blob: Blob, fileName: string, mimeType: string, isVideo: boolean) => {
  if (!isAndroidApp)
    return saveFile(blob, fileName, mimeType, isVideo);
  const reader = new FileReader();
  reader.onloadend = () => {
    console.log("reader.onloadend");
    const result = reader.result;
    const base64data = result.substr(result.indexOf('base64,') + 7);
    // Kotlin側の関数を呼び出す
    try {
      window.android.saveMediaToGallery(base64data, fileName, mimeType, isVideo);
      if (isVideo)
        console.log('Saved video:', fileName);
      else
        console.log('Saved image:', fileName);
    } catch (error) {
      console.assert(false);
      console.error('android インタフェース呼び出しエラー:', error);
      saveFile(blob, fileName);
    }
  };
  reader.readAsDataURL(blob); // BlobをBase64に変換
};
