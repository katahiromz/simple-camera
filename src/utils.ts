// utils.ts
// 汎用のユーティリティ関数は utils.ts に分離

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
