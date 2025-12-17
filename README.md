# simple-camera by katahiromz

## 概要

React+Vita製のシンプルなカメラアプリです。PWAとAndroidに対応しております。

<p align="center">
  <img src="public/pwa-192x192.png" alt="[カメラ アイコン]" />　　
  <img src="img/screenshot.png" alt="[スクリーンショット]" />
</p>

## 機能

- 写真撮影と録画
  - **高品質ビデオ録画**（マイク音声付き）
  - **録画の一時停止/再開機能**（MediaRecorder API）
  - **自動コーデック選択**（VP9、VP8、H.264対応）
  - **堅牢なエラー処理**（録画状態管理）
- ピンチ操作または「Ctrl+ホイール」によるズーム
- ズーム時に二本指またはマウスの中央ボタンで表示位置の移動が可能
- 前面カメラ・背面カメラの切り替えが可能
- **リアルタイム画像処理機能**
  - 明るさ、コントラスト、彩度、色相の調整
  - ぼかし効果
  - グレースケール、セピア、色反転フィルター
  - プリセットフィルター（鮮やか、クール、暖かい、白黒、ビンテージ、高コントラスト）
  - レスポンシブデザイン対応（デスクトップ、タブレット、モバイル）
  - 設定の自動保存（localStorage）

## 画像処理機能の使い方

### 基本的な使用方法

1. カメラが起動したら、画面右上（モバイルでは下部）の設定アイコンをタップ
2. 画像処理コントロールパネルが開きます
3. 「調整」タブで各種パラメータを調整:
   - **明るさ**: -100 ～ +100 (画像の明度を調整)
   - **コントラスト**: -100 ～ +100 (明暗の差を調整)
   - **彩度**: -100 ～ +100 (色の鮮やかさを調整)
   - **色相**: 0 ～ 360度 (色合いを回転)
   - **ぼかし**: 0 ～ 10px (ぼかし効果の強さ)
4. チェックボックスで特殊効果を適用:
   - **グレースケール**: 白黒表示
   - **セピア**: ビンテージ風の茶色い色調
   - **反転**: 色を反転
5. 「プリセット」タブでワンタッチフィルター適用
6. 「初期値に戻す」ボタンで全ての設定をリセット

### TypeScriptでの統合方法

画像処理機能を別のプロジェクトで使用する場合:

```typescript
import AdvancedCamera from './components/AdvancedCamera';
import ImageProcessingControls from './components/ImageProcessingControls';
import { ImageProcessingParams } from './components/ImageProcessingUtils';

function MyApp() {
  return (
    <AdvancedCamera 
      showControls={true}
      // その他のプロパティ...
    />
  );
}
```

### カスタム画像処理の実装

独自の画像処理ロジックを追加する場合:

```typescript
import { 
  applyCSSFilters, 
  ImageProcessingParams 
} from './components/ImageProcessingUtils';

// userImageProcessData インターフェース
interface userImageProcessData {
  canvas: HTMLCanvasElement;           // キャンバス要素
  video: HTMLVideoElement | null;      // ビデオ要素（またはnull）
  dummyImage: HTMLImageElement | null; // ダミー画像（またはnull）
  ctx: CanvasRenderingContext2D;       // 2D描画コンテキスト
  x: number;                           // 転送先X座標
  y: number;                           // 転送先Y座標
  width: number;                       // 転送先の幅
  height: number;                      // 転送先の高さ
  zoom: number;                        // ズーム倍率 (1.0～4.0)
  pan: { x: number, y: number };       // パン（平行移動量）
}

// onImageProcess コールバックで使用
const customImageProcess = (data: userImageProcessData) => {
  const { ctx, canvas, video, x, y, width, height, zoom, pan } = data;
  
  // カスタムフィルターを適用
  const customParams: ImageProcessingParams = {
    brightness: 20,
    contrast: 15,
    saturation: 10,
    hue: 0,
    blur: 0,
    sharpen: 0,
    grayscale: false,
    sepia: false,
    invert: false,
  };
  
  applyCSSFilters(ctx, customParams);
  
  // 画像を描画
  ctx.drawImage(video, x, y, width, height);
};
```

## 録画機能の詳細

### ビデオとオーディオの録画サポート

simple-cameraは、以下の機能を備えた堅牢な録画機能を提供します：

- **ビデオ録画**: 高品質なビデオ録画（キャンバスからのストリームキャプチャ）
- **オーディオ録画**: マイク音声のキャプチャとビデオへの統合
- **一時停止/再開**: 録画の一時停止と再開（MediaRecorder.pause/resume APIを使用）
- **コーデックの自動選択**: ブラウザがサポートする最適なコーデックを自動検出
- **エラー処理**: 録画中の問題を適切に処理

### サポートされるコーデック

録画機能は、以下のコーデックをサポートしています（優先度順）：

1. `video/webm;codecs=vp9,opus` - VP9 + Opus（最高品質）
2. `video/webm;codecs=vp8,opus` - VP8 + Opus（広くサポート）
3. `video/webm;codecs=vp8` - VP8のみ
4. `video/webm` - WebMコンテナのデフォルト
5. `video/mp4;codecs=h264,aac` - H.264 + AAC（Safari用）
6. `video/mp4;codecs=avc1,mp4a` - AVC1 + MP4A
7. `video/mp4` - MP4コンテナのデフォルト

ブラウザがサポートしていない場合、最適なフォールバックコーデックが自動的に選択されます。

### 録画設定

- **ビデオビットレート**: モバイル端末では2.5Mbps、デスクトップではブラウザのデフォルト
- **オーディオビットレート**: 128kbps
- **フレームレート**: 録画中は12fps（パフォーマンス最適化）
- **オーディオ設定**:
  - エコーキャンセレーション: 有効
  - ノイズ抑制: 有効
  - サンプルレート: 48kHz

## 技術仕様

- **言語**: TypeScript
- **フレームワーク**: React 19
- **ビルドツール**: Vite 7
- **画像処理**: Canvas API + CSS Filters
- **録画**: MediaRecorder API with Canvas Stream Capture
- **コーデック検出**: カスタム実装（react-record-webcamを参考）
- **国際化**: i18next (日本語・英語対応)
- **アイコン**: lucide-react
- **レスポンシブ対応**: CSS Media Queries

## ライセンス

- MIT

## 連絡先

- 片山博文MZ <katayama.hirofumi.mz@gmail.com>