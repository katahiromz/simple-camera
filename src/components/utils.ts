// utils.ts
// 汎用のユーティリティ関数は utils.ts に分離

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
  timestamp = timestamp.replace(/[:\.\\\/]/g, '_');
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
 * Android WebView環境かどうかを判定
 */
export const isAndroidWebView = (): boolean => {
  return typeof (window as any).android !== 'undefined' && 
         typeof (window as any).android.saveImageToGallery === 'function';
};

/**
 * Android環境でギャラリーに画像を保存
 * @param base64Data Base64エンコードされた画像データ（data:image/jpeg;base64,プレフィックスなし）
 * @param filename ファイル名
 * @param mimeType MIMEタイプ（例: 'image/jpeg'）
 * @returns 保存成功時はtrue、失敗時はfalse
 */
export const saveImageToAndroidGallery = (
  base64Data: string, 
  filename: string, 
  mimeType: string = 'image/jpeg'
): boolean => {
  if (!isAndroidWebView()) {
    console.warn('Not in Android WebView environment');
    return false;
  }
  
  try {
    // data:image/jpeg;base64, プレフィックスを除去
    const pureBase64 = base64Data.includes(',') 
      ? base64Data.substring(base64Data.indexOf(',') + 1) 
      : base64Data;
    
    return (window as any).android.saveImageToGallery(pureBase64, filename, mimeType);
  } catch (error) {
    console.error('Failed to save image to Android gallery:', error);
    return false;
  }
};

/**
 * Android環境でギャラリーに動画を保存（ArrayBuffer使用）
 * @param arrayBuffer ArrayBufferとして渡される動画データ
 * @param filename ファイル名
 * @param mimeType MIMEタイプ（例: 'video/webm'）
 * @returns 保存成功時はtrue、失敗時はfalse
 */
export const saveVideoToAndroidGalleryFromArrayBuffer = (
  arrayBuffer: ArrayBuffer,
  filename: string,
  mimeType: string = 'video/webm'
): boolean => {
  if (!isAndroidWebView()) {
    console.warn('Not in Android WebView environment');
    return false;
  }
  
  try {
    // ArrayBufferをUint8Arrayに変換
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Uint8Arrayを16進文字列に変換してAndroidに渡す
    // Base64よりも確実で、カンマ区切りよりも効率的
    let hexString = '';
    for (let i = 0; i < uint8Array.length; i++) {
      const hex = uint8Array[i].toString(16).padStart(2, '0');
      hexString += hex;
    }
    
    console.log(`Converting ArrayBuffer (${arrayBuffer.byteLength} bytes) to hex string (${hexString.length} chars)`);
    
    return (window as any).android.saveVideoToGalleryFromHex(hexString, filename, mimeType);
  } catch (error) {
    console.error('Failed to save video to Android gallery from ArrayBuffer:', error);
    return false;
  }
};

/**
 * Android環境でギャラリーに動画を保存（Base64フォールバック）
 * @param base64Data Base64エンコードされた動画データ
 * @param filename ファイル名
 * @param mimeType MIMEタイプ（例: 'video/webm'）
 * @returns 保存成功時はtrue、失敗時はfalse
 */
export const saveVideoToAndroidGallery = (
  base64Data: string, 
  filename: string, 
  mimeType: string = 'video/webm'
): boolean => {
  if (!isAndroidWebView()) {
    console.warn('Not in Android WebView environment');
    return false;
  }
  
  try {
    return (window as any).android.saveVideoToGallery(base64Data, filename, mimeType);
  } catch (error) {
    console.error('Failed to save video to Android gallery:', error);
    return false;
  }
};

/**
 * ブラウザでBlobをダウンロード
 * @param blob ダウンロードするBlob
 * @param filename ファイル名
 */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

/**
 * BlobをAndroid環境ではギャラリーに保存、それ以外ではダウンロード
 * @param blob 保存するBlob
 * @param filename ファイル名
 * @param mimeType MIMEタイプ
 * @param isVideo 動画かどうか（true: 動画, false: 画像）
 */
export const saveBlobToGalleryOrDownload = (
  blob: Blob,
  filename: string,
  mimeType: string,
  isVideo: boolean = false
): void => {
  if (isAndroidWebView()) {
    if (isVideo) {
      // 動画の場合: ArrayBufferを使用してBase64エンコーディングを回避
      const reader = new FileReader();
      reader.onloadend = () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        
        // まずArrayBuffer/Hexメソッドを試す（新しい実装）
        const hasNewMethod = typeof (window as any).android.saveVideoToGalleryFromHex === 'function';
        let success = false;
        
        if (hasNewMethod) {
          console.log('Using ArrayBuffer/Hex method for video save');
          success = saveVideoToGalleryFromArrayBuffer(arrayBuffer, filename, mimeType);
        }
        
        // 新しいメソッドが利用できない場合、または失敗した場合はBase64にフォールバック
        if (!hasNewMethod || !success) {
          console.log('Falling back to Base64 method for video save');
          const uint8Array = new Uint8Array(arrayBuffer);
          let binary = '';
          const len = uint8Array.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uint8Array[i]);
          }
          const base64data = 'data:' + mimeType + ';base64,' + btoa(binary);
          success = saveVideoToAndroidGallery(base64data, filename, mimeType);
        }
        
        if (!success) {
          console.error('Failed to save video to Android gallery');
          // フォールバック: 通常のダウンロード
          downloadBlob(blob, filename);
        }
      };
      
      reader.onerror = () => {
        console.error('Failed to read Blob as ArrayBuffer');
        downloadBlob(blob, filename);
      };
      
      reader.readAsArrayBuffer(blob);
    } else {
      // 画像の場合: 従来のBase64メソッドを使用
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = reader.result as string;
        const success = saveImageToAndroidGallery(base64data, filename, mimeType);
        
        if (!success) {
          console.error('Failed to save image to Android gallery');
          // フォールバック: 通常のダウンロード
          downloadBlob(blob, filename);
        }
      };
      
      reader.onerror = () => {
        console.error('Failed to read Blob as DataURL');
        downloadBlob(blob, filename);
      };
      
      reader.readAsDataURL(blob);
    }
  } else {
    // 通常のブラウザ環境ではダウンロード
    downloadBlob(blob, filename);
  }
};
