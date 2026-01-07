// Type definitions for Android WebView bridge
interface AndroidBridge {
  finishApp(): void;
  onStartRecording(): void;
  onStopRecording(): void;
  openAppSettings(): void;
  openURL(url: string): void;
  saveMediaToGallery(base64data: string, fileName: string, mimeType: string, type: string): void;
  onStartShutterSound(): void;
  onEndShutterSound(): void;
}

interface Window {
  android?: AndroidBridge;
}
