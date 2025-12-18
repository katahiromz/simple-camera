# simple-camera by katahiromz

## 概要

React製のシンプルなカメラアプリです。PWA、Web、Android、iOSに対応しております。

**新機能**: Expoフレームワークに移行し、`expo-camera`を使用したネイティブカメラ機能をサポートしています。

<p align="center">
  <img src="public/pwa-192x192.png" alt="[カメラ アイコン]" />　　
  <img src="img/screenshot.png" alt="[スクリーンショット]" />
</p>

## プラットフォーム

このアプリは2つのモードで動作します：

### 1. Web/PWA版（従来版）
- **ビルドツール**: Vite 7
- **カメラライブラリ**: react-webcam
- **ズーム機能**: react-zoom-pan-pinch
- **対応プラットフォーム**: Web ブラウザ、PWA

**起動方法**:
```bash
npm run dev    # 開発サーバー起動
npm run build  # プロダクションビルド
```

### 2. Expo/React Native版（新規）
- **フレームワーク**: Expo SDK 54
- **カメラライブラリ**: expo-camera
- **ズーム機能**: ピンチジェスチャー + expo-camera zoom
- **対応プラットフォーム**: Android、iOS、Web（Metro経由）

**起動方法**:
```bash
npm start      # Expo開発サーバー起動
npm run android # Androidエミュレーターで起動
npm run ios    # iOSシミュレーターで起動（macOS のみ）
npm run web    # Metro bundlerでWeb版起動
```

**必要な環境**:
- Node.js 18以上
- Android Studio（Android開発の場合）
- Xcode（iOS開発の場合、macOSのみ）
- Expo Go アプリ（実機でのテスト用）

## 機能

### 共通機能（Web版・Expo版）

- **写真撮影と録画**
  - 高品質な写真撮影
  - ビデオ録画（マイク音声付き）
  - 前面カメラ・背面カメラの切り替え
  - マイクのオン/オフ切り替え
  - 堅牢なエラー処理と権限管理

- **ズーム機能**
  - **Web版**: react-zoom-pan-pinchによる高度なズーム・パン
    - ピンチ操作、マウスホイール、ダブルクリックでズーム
    - スムーズなパン（移動）操作
  - **Expo版**: expo-cameraのネイティブズーム
    - ピンチジェスチャーによるズーム（0〜1の範囲）
    - ネイティブカメラ機能の活用

- **多言語対応**
  - 日本語・英語対応（i18next）

### Web/PWA版の追加機能

- **リアルタイム画像処理機能**
  - 明るさ、コントラスト、彩度、色相の調整
  - ぼかし効果
  - グレースケール、セピア、色反転フィルター
  - プリセットフィルター（鮮やか、クール、暖かい、白黒、ビンテージ、高コントラスト）
  - **リアルタイムプレビュー**: すべてのフィルターがライブビデオに即座に反映
  - **写真キャプチャ統合**: 保存される写真は画面表示と完全に一致（ズーム、パン、フィルターすべてを含む）
  - 設定の自動保存（localStorage）

- **録画の高度な機能**
  - 録画の一時停止/再開機能（MediaRecorder API）
  - 自動コーデック選択（VP9、VP8、H.264対応）

### Expo版の追加機能

- **ネイティブカメラ機能**
  - デバイスのネイティブカメラAPIを使用
  - expo-mediaライブラリでギャラリーへの自動保存
  - 高品質な写真・動画キャプチャ
  - クロスプラットフォーム対応（Android、iOS）

## 画像処理機能の使い方（Web/PWA版）

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
7. **重要**: 撮影した写真は、画面に表示されているとおりに保存されます（すべてのフィルター、ズーム、パン設定を含む）

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

#### Web/PWA版

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

#### Expo/React Native版

- **expo-camera**: ネイティブカメラ機能を提供
  - CameraViewコンポーネントによるカメラ統合
  - 写真撮影と動画録画
  - フロント/リアカメラの切り替え
  - ネイティブズーム機能（0〜1の範囲）
  - カメラ権限の管理

- **expo-media-library**: メディアの保存と管理
  - ギャラリーへの写真・動画の自動保存
  - メディアライブラリ権限の管理

- **expo-av**: オーディオ再生機能
  - サウンドエフェクトの再生
  - オーディオ設定の管理

- **react-native-gesture-handler**: ジェスチャー認識
  - ピンチジェスチャーでのズーム制御

## 録画機能の詳細（Web/PWA版）

### ビデオとオーディオの録画サポート

simple-cameraのWeb版は、以下の機能を備えた堅牢な録画機能を提供します：

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

### Web/PWA版

- **言語**: TypeScript
- **フレームワーク**: React 19
- **ビルドツール**: Vite 7
- **カメラライブラリ**: react-webcam
- **ズーム・パンライブラリ**: react-zoom-pan-pinch
- **画像処理**: CSS Filters (ライブプレビュー) + Canvas Filters (写真キャプチャ)
  - ライブビデオストリームにはCSSフィルターをリアルタイムで適用
  - 写真キャプチャ時にはCanvasコンテキストフィルターで同一の処理を適用
  - ズーム、パン、フィルターすべてを統合してキャプチャ
- **録画**: MediaRecorder API with MediaStream Capture
- **コーデック検出**: カスタム実装（VP9、VP8、H.264対応）
- **国際化**: i18next (日本語・英語対応)
- **アイコン**: lucide-react
- **レスポンシブ対応**: CSS Media Queries

### Expo/React Native版

- **言語**: TypeScript
- **フレームワーク**: React 19 + React Native (Expo SDK 54)
- **ビルドツール**: Metro Bundler
- **カメラライブラリ**: expo-camera
- **メディア保存**: expo-media-library
- **オーディオ**: expo-av
- **ジェスチャー**: react-native-gesture-handler
- **ズーム**: expo-camera native zoom + pinch gesture
- **国際化**: i18next (日本語・英語対応)
- **スタイリング**: React Native StyleSheet
- **対応プラットフォーム**: Android、iOS

## セットアップ手順

### Web/PWA版の開発

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# プロダクションビルド
npm run build
```

### Expo版の開発

```bash
# 依存関係のインストール
npm install

# Expo開発サーバーの起動
npm start

# Androidエミュレーターで起動
npm run android

# iOSシミュレーターで起動（macOS のみ）
npm run ios

# Metro bundlerでWeb版起動
npm run web
```

### Expo Goでのテスト

1. スマートフォンにExpo Goアプリをインストール
2. `npm start`でQRコードを表示
3. Expo GoアプリでQRコードをスキャン
4. アプリが起動

## ライセンス

- MIT

## 連絡先

- 片山博文MZ <katayama.hirofumi.mz@gmail.com>