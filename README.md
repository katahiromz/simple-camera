# simple-camera by katahiromz

## 概要

React+Vita製のシンプルなカメラアプリです。PWAとAndroidに対応しております。

<p align="center">
  <img src="public/pwa-192x192.png" alt="[カメラ アイコン]" />　　
  <img src="img/screenshot.png" alt="[スクリーンショット]" />
</p>

## 機能

- 写真撮影と録画
- ピンチ操作または「Ctrl+ホイール」によるズーム
- ズーム時に二本指またはマウスの中央ボタンで表示位置の移動が可能
- 前面カメラ・背面カメラの切り替えが可能
- **リアルタイム画像処理機能** (新機能)
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

// onImageProcess コールバックで使用
const customImageProcess = (data: userImageProcessData) => {
  const { ctx, canvas, video, x, y, width, height, zoom, pan } = data;
  
  // カスタムフィルターを適用
  const customParams: ImageProcessingParams = {
    brightness: 20,
    contrast: 15,
    saturation: 10,
    // ... その他のパラメータ
  };
  
  applyCSSFilters(ctx, customParams);
  
  // 画像を描画
  ctx.drawImage(video, x, y, width, height);
};
```

## 技術仕様

- **言語**: TypeScript
- **フレームワーク**: React 19
- **ビルドツール**: Vite 7
- **画像処理**: Canvas API + CSS Filters
- **国際化**: i18next (日本語・英語対応)
- **アイコン**: lucide-react
- **レスポンシブ対応**: CSS Media Queries

## ライセンス

- MIT

## 連絡先

- 片山博文MZ <katayama.hirofumi.mz@gmail.com>