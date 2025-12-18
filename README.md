# simple-camera by katahiromz

## 概要

Expo + React Native製のシンプルなカメラアプリです。Android、iOS、Webに対応しております。

`react-native-vision-camera`を使用したネイティブカメラ機能により、高品質な写真撮影と動画録画が可能です。

<p align="center">
  <img src="public/pwa-192x192.png" alt="[カメラ アイコン]" />　　
  <img src="img/screenshot.png" alt="[スクリーンショット]" />
</p>

## プラットフォーム

- **フレームワーク**: Expo SDK 54
- **カメラライブラリ**: react-native-vision-camera
- **ズーム機能**: ピンチジェスチャー + react-native-vision-camera zoom
- **対応プラットフォーム**: Android、iOS、Web

### 起動方法

```bash
npm start       # Expo開発サーバー起動
npm run android # Androidエミュレーターで起動
npm run ios     # iOSシミュレーターで起動（macOS のみ）
npm run web     # Metro bundlerでWeb版起動
```

### 必要な環境

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
  - ピンチジェスチャーによるズーム（0〜1の範囲）
  - ネイティブカメラ機能の活用

- **ネイティブカメラ機能**
  - デバイスのネイティブカメラAPIを使用
  - expo-media-libraryでギャラリーへの自動保存
  - 高品質な写真・動画キャプチャ
  - クロスプラットフォーム対応（Android、iOS、Web）

- **多言語対応**
  - 日本語・英語対応（i18next）

## 使い方

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

- **react-native-vision-camera**: ネイティブカメラ機能を提供
  - Cameraコンポーネントによるカメラ統合
  - 写真撮影と動画録画
  - フロント/リアカメラの切り替え
  - ネイティブズーム機能
  - カメラ権限の管理
  - 動画録画の一時停止/再開機能

- **expo-media-library**: メディアの保存と管理
  - ギャラリーへの写真・動画の自動保存
  - メディアライブラリ権限の管理

- **expo-av**: オーディオ再生機能
  - サウンドエフェクトの再生
  - オーディオ設定の管理

- **react-native-gesture-handler**: ジェスチャー認識
  - ピンチジェスチャーでのズーム制御

## 技術仕様

- **言語**: TypeScript
- **フレームワーク**: React 19 + React Native (Expo SDK 54)
- **ビルドツール**: Metro Bundler
- **カメラライブラリ**: react-native-vision-camera
- **メディア保存**: expo-media-library
- **オーディオ**: expo-av
- **ジェスチャー**: react-native-gesture-handler
- **ズーム**: react-native-vision-camera native zoom + pinch gesture
- **国際化**: i18next (日本語・英語対応)
- **スタイリング**: React Native StyleSheet
- **対応プラットフォーム**: Android、iOS、Web

## セットアップ手順

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