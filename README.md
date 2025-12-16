# simple-camera by katahiromz

## 概要

React+Vita製のシンプルなカメラアプリです。PWAとAndroidに対応しております。

<img src="public/pwa-192x192.png" alt="[カメラ アイコン]" />

## 機能

- 写真撮影と録画
- ピンチ操作または「Ctrl+ホイール」によるズーム
- ズーム時に二本指またはマウスの中央ボタンで表示位置の移動が可能
- 前面カメラ・背面カメラの切り替えが可能

## 開発環境

開発環境（`import.meta.env.MODE !== 'production'`）では、実際のカメラデバイスの代わりに `public/dummy.jpg` がダミー画像として使用されます。これにより、カメラが利用できない環境でも UI の動作確認が可能です。

- ダミー画像使用時もズーム・パン操作は通常通り動作します
- カメラ切り替えボタンは無効化されます
- `dummyImageSrc` プロパティでカスタムダミー画像のパスを指定可能です（デフォルト: `/dummy.jpg`）

## ライセンス

- MIT

## 連絡先

- 片山博文MZ <katayama.hirofumi.mz@gmail.com>