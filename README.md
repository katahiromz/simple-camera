# simple-camera by katahiromz

## 概要

React+Vita製のシンプルなカメラアプリです。PWAとAndroidに対応しております。

<p align="center">
  <img src="public/pwa-192x192.png" alt="[カメラ アイコン]" />　　
  <img src="img/screenshot.png" alt="[スクリーンショット]" />
</p>

## 機能

- **写真撮影と録画**
  - **高品質ビデオ録画**（マイク音声付き）
  - **録画の一時停止/再開機能**（MediaRecorder API）
  - **自動コーデック選択**（VP9、VP8、H.264対応）
  - **堅牢なエラー処理**（録画状態管理）
- **ズーム・パン機能** (react-zoom-pan-pinch)
  - ピンチ操作によるズーム
  - マウスホイールでのズーム
  - ダブルクリックでズーム
  - スムーズなパン（移動）操作
- **カメラコントロール** (react-webcam)
  - 前面カメラ・背面カメラの切り替え
  - 高品質な写真撮影
  - ビデオストリームのキャプチャ
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

カメラ機能を別のプロジェクトで使用する場合:

```typescript
import SimpleCamera from './components/SimpleCamera';

function MyApp() {
  return (
    <SimpleCamera 
      audio={true}
      showTakePhoto={true}
      showMic={true}
      showRecord={true}
      showControls={true}
      photoQuality={0.92}
      soundEffect={true}
      showStatus={true}
      showTimer={true}
    />
  );
}
```

### 使用しているライブラリ

新しい実装では、以下のライブラリを使用しています：

- **react-webcam**: カメラアクセスと写真撮影機能を提供
  - Webcamコンポーネントによる簡単なカメラ統合
  - 高品質な写真撮影（screenshotメソッド）
  - ビデオストリームへの直接アクセス
  - フロント/リアカメラの切り替え対応

- **react-zoom-pan-pinch**: スムーズなズーム・パン機能を提供
  - マウスホイールでのズーム（`wheel.step: 0.1`）
  - ピンチジェスチャーでのズーム（`pinch.step: 5`）
  - ダブルクリックでズームイン/アウト
  - スムーズなパン（ドラッグ）操作
  - ズーム範囲: 1倍～4倍

- **MediaRecorder API**: ビデオ録画とオーディオキャプチャ（ブラウザ標準API）
  - Webcamストリームからの録画
  - オーディオトラックの統合
  - 一時停止/再開機能

## 録画機能の詳細

### ビデオとオーディオの録画サポート

simple-cameraは、以下の機能を備えた堅牢な録画機能を提供します：

- **ビデオ録画**: 高品質なビデオ録画（react-webcamストリームからのキャプチャ）
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
- **オーディオ設定**:
  - エコーキャンセレーション: 有効
  - ノイズ抑制: 有効
  - サンプルレート: 48kHz

## 技術仕様

- **言語**: TypeScript
- **フレームワーク**: React 19
- **ビルドツール**: Vite 7
- **カメラライブラリ**: react-webcam
- **ズーム・パンライブラリ**: react-zoom-pan-pinch
- **画像処理**: CSS Filters
- **録画**: MediaRecorder API with MediaStream Capture
- **コーデック検出**: カスタム実装（VP9、VP8、H.264対応）
- **国際化**: i18next (日本語・英語対応)
- **アイコン**: lucide-react
- **レスポンシブ対応**: CSS Media Queries

## ライセンス

- MIT

## 連絡先

- 片山博文MZ <katayama.hirofumi.mz@gmail.com>