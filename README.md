English | [Japanese](README_ja.md)

---

# Simple Camera (PWA & Android Hybrid)

A high-performance camera web application built with React 19 and Vite 7. In addition to functioning as a PWA, it features advanced integration as an Android native app.

<p align="center">
<img src="public/pwa-192x192.png" alt="[Camera Icon]" height="192" />　　
<img src="img/screenshot.png" alt="[Screenshot]" height="192" />
</p>

## 🌟 Key Features

* **Advanced Camera Controls**: Photo capture, video recording (WebM), real-time zoom, and pan operations.
* **QR Code Analysis**: Fast scanning functionality using `zxing-wasm`.
* **Android Native Integration**:
* **Physical Button Support**: Use volume buttons as a shutter.
* **Inset Support**: Safe area design considering Android notches and system bars.
* **Vibration**: Haptic feedback during capture.


* **Internationalization (i18n)**: Supports Japanese and English with automatic switching based on OS settings.
* **Coordinate Transformation**: Accurate coordinate mapping between canvas drawings and video footage.

## 🛠 Tech Stack

### Frontend (Web)

* **Framework**: React 19 (TypeScript)
* **Build Tool**: Vite 7
* **PWA**: `vite-plugin-pwa` (Offline support via Service Worker)
* **Libraries**:
    * `lucide-react` (Icons)
    * `i18next` (Multilingual support)
    * `zxing-wasm` (Code analysis)
    * `@fix-webm-duration/fix` (Repair duration of recorded data)

### Backend (Android Native)

* **Language**: Kotlin 1.9
* **UI**: WebView (Secure local loading via WebViewAssetLoader)

## 🚀 Development and Build

### Web Setup

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build (After building, files are automatically copied to the Android assets folder)
npm run build

```

### Android Setup

1. After running `npm run build`, confirm that files are generated in `app/src/main/assets/camera`.
2. Open the `android` folder in Android Studio.
3. Build and run.

## 📁 Project Structure (Main Parts)

```text
src/
├── components/           # UI Components (Webcam, Controls, Canvas)
├── libs/                 # Utilities, Permission Mgmt, i18n, Device Mgmt
├── App.tsx               # App entry point & message handling
android/
├── app/src/main/assets/  # Destination for Web build artifacts
└── app/src/main/java/... # Kotlin native implementation (WebViewClient, ChromeClient)

```

## 📝 License

* MIT License

## 👤 Developer

* **Hirofumi Katayama MZ** (katahiromz)
* [katayama.hirofumi.mz@gmail.com](mailto:katayama.hirofumi.mz@gmail.com)
