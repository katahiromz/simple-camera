# Video Recording Improvements for Android WebView

## 概要 (Overview)

このドキュメントは、Android WebViewでの動画録画に関する改善点をまとめたものです。録画した動画ファイルが不正で再生できない問題を解決するために実装された変更について説明します。

This document summarizes improvements made to video recording in Android WebView. It explains the changes implemented to fix issues where recorded video files were corrupt and unplayable.

## 問題点 (Problem Statement)

録画した動画ファイルが以下の問題を抱えていました：
- 動画ファイルが破損していて再生できない
- MediaRecorderの設定が不適切
- データのフラッシュ処理が欠落
- エラーハンドリングとログが不十分

The recorded video files had the following issues:
- Video files were corrupt and unplayable
- Improper MediaRecorder configuration
- Missing data flush handling
- Insufficient error handling and logging

## 実装した改善 (Implemented Improvements)

### 1. MediaRecorderの適切な初期化 (Proper MediaRecorder Initialization)

#### MIMEタイプの明示的な指定 (Explicit MIME Type Specification)

```typescript
// Before: Default codec selection with no logging
const mimeType = getSupportedMimeType();

// After: Enhanced codec selection with validation and logging
const getSupportedMimeType = (): string => {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=h264,aac',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
  ];

  console.log('Checking MediaRecorder codec support...');
  
  for (const type of types) {
    try {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log('✓ Supported:', type);
        return type;
      } else {
        console.log('✗ Not supported:', type);
      }
    } catch (error) {
      console.error('Error checking codec support:', type, error);
    }
  }

  console.warn('No preferred codec supported, using default video/webm');
  return 'video/webm';
};
```

**利点 (Benefits):**
- 利用可能なコーデックを優先順位順にチェック
- サポート状況を詳細にログ出力
- エラーハンドリングを追加

- Checks available codecs in priority order
- Detailed logging of support status
- Added error handling

### 2. データフラッシュとBlob化の改善 (Improved Data Flush and Blob Creation)

#### onstopイベントでの適切な処理 (Proper Handling in onstop Event)

```typescript
mediaRecorderRef.current.onstop = () => {
  console.log('Recording stopped. Total chunks:', recordedChunksRef.current.length);
  
  // Validate that we have data chunks
  if (recordedChunksRef.current.length === 0) {
    console.error('No data chunks recorded');
    setRecordingStatus('idle');
    return;
  }

  // Create blob with proper mimeType for consistency
  const blob = new Blob(recordedChunksRef.current, { type: mimeType });
  console.log('Video blob created:', blob.size, 'bytes, type:', blob.type);
  
  // Validate blob size
  if (blob.size === 0) {
    console.error('Recording failed: empty blob');
    setRecordingStatus('idle');
    return;
  }

  const filename = generateFileName('video-', getExtensionFromMimeType(mimeType));
  saveBlobToGalleryOrDownload(blob, filename, mimeType, true);

  playSound(videoCompleteAudioRef);
  setRecordingStatus('idle');
  
  // Clean up recorded chunks
  recordedChunksRef.current = [];
};
```

**改善点 (Improvements):**
- データチャンクの存在を検証
- Blobサイズの検証を追加
- 記録されたチャンクの適切なクリーンアップ
- 詳細なログ出力

- Validates existence of data chunks
- Added blob size validation
- Proper cleanup of recorded chunks
- Detailed logging

### 3. エラーハンドリングの強化 (Enhanced Error Handling)

#### onerrorイベントハンドラの追加 (Added onerror Event Handler)

```typescript
mediaRecorderRef.current.onerror = (event: Event) => {
  console.error('MediaRecorder error:', event);
  setRecordingStatus('idle');
};
```

#### try-catchブロックの追加 (Added try-catch Blocks)

```typescript
const stopRecording = useCallback(() => {
  if (mediaRecorderRef.current && (recordingStatus === 'recording' || recordingStatus === 'paused')) {
    setRecordingStatus('stopping');
    
    try {
      mediaRecorderRef.current.stop();
      console.log('MediaRecorder.stop() called');
    } catch (error) {
      console.error('Error stopping MediaRecorder:', error);
      setRecordingStatus('idle');
    }
  }
}, [recordingStatus]);
```

### 4. Android側の保存処理改善 (Improved Android Save Operations)

#### データ検証の追加 (Added Data Validation)

```kotlin
val videoBytes = android.util.Base64.decode(pureBase64, android.util.Base64.DEFAULT)

// Validate video data size
if (videoBytes.isEmpty()) {
    Timber.e("Video data is empty")
    currentActivity.runOnUiThread {
        currentActivity.showToast("Failed to save video: empty data", SHORT_TOAST)
    }
    return false
}

Timber.i("Saving video: ${videoBytes.size} bytes, mimeType: $mimeType")
```

#### flush()の追加 (Added flush() Calls)

```kotlin
uri?.let {
    currentActivity.contentResolver.openOutputStream(it)?.use { outputStream ->
        outputStream.write(videoBytes)
        outputStream.flush()  // Ensure data is written to disk
    }
    
    // Clear PENDING flag after write completion
    val updateValues = android.content.ContentValues().apply {
        put(android.provider.MediaStore.Video.Media.IS_PENDING, 0)
    }
    currentActivity.contentResolver.update(it, updateValues, null, null)
    
    Timber.i("Video saved successfully to MediaStore: $it")
    
    true
}
```

**改善点 (Improvements):**
- 空データのチェック
- flush()によるデータの確実な書き込み
- 詳細なログ出力
- エラー時のユーザーへの通知

- Empty data check
- Ensures data is written with flush()
- Detailed logging
- User notification on error

### 5. リソース管理の改善 (Improved Resource Management)

#### アンマウント時のクリーンアップ (Cleanup on Unmount)

```typescript
// Cleanup MediaRecorder on unmount
useEffect(() => {
  return () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
        console.log('MediaRecorder stopped on unmount');
      } catch (error) {
        console.error('Error stopping MediaRecorder on unmount:', error);
      }
    }
  };
}, []);
```

## 動画録画の正しい使い方 (Proper Video Recording Usage)

### 録画開始 (Start Recording)

1. MediaRecorderが利用可能なコーデックを自動検出
2. 適切なビットレートとオーディオ設定を適用
3. データチャンクを100msごとに取得

1. MediaRecorder automatically detects available codec
2. Applies appropriate bitrate and audio settings
3. Requests data chunks every 100ms

### 録画停止 (Stop Recording)

1. MediaRecorder.stop()を呼び出し
2. onstopイベントでデータを検証
3. Blobを作成して保存
4. リソースをクリーンアップ

1. Call MediaRecorder.stop()
2. Validate data in onstop event
3. Create blob and save
4. Clean up resources

## デバッグとログ (Debugging and Logging)

### コンソールログの確認 (Check Console Logs)

録画プロセス中に以下のログが出力されます：

The following logs are output during the recording process:

```
Checking MediaRecorder codec support...
✓ Supported: video/webm;codecs=vp9,opus
Selected MIME type for recording: video/webm;codecs=vp9,opus
Recording started with mimeType: video/webm;codecs=vp9,opus
Data chunk received: 12345 bytes
Recording stopped. Total chunks: 25
Video blob created: 308625 bytes, type: video/webm;codecs=vp9,opus
```

### Androidログの確認 (Check Android Logs)

Timberを使用したログが出力されます：

Logs are output using Timber:

```
I/MyWebChromeClient: Saving video: 308625 bytes, mimeType: video/webm
I/MyWebChromeClient: Video saved successfully to MediaStore: content://media/external/video/media/123
```

## トラブルシューティング (Troubleshooting)

### 動画が空の場合 (If Video is Empty)

1. コンソールログで "No data chunks recorded" を確認
2. カメラとマイクの権限を確認
3. MediaRecorderがサポートされているか確認

1. Check console log for "No data chunks recorded"
2. Verify camera and microphone permissions
3. Confirm MediaRecorder is supported

### コーデックがサポートされていない場合 (If Codec is Not Supported)

1. コンソールログでサポート状況を確認
2. フォールバックコーデック（video/webm）が使用される
3. ブラウザのアップデートを検討

1. Check console log for support status
2. Fallback codec (video/webm) will be used
3. Consider updating browser

## 結論 (Conclusion)

これらの改善により、Android WebViewでの動画録画が以下の点で強化されました：

These improvements have enhanced video recording in Android WebView in the following ways:

- ✅ 適切なMIMEタイプとコーデックの指定
- ✅ データフラッシュ処理の追加
- ✅ 包括的なエラーハンドリング
- ✅ 詳細なデバッグログ
- ✅ リソースの適切な管理

- ✅ Proper MIME type and codec specification
- ✅ Added data flush handling
- ✅ Comprehensive error handling
- ✅ Detailed debug logging
- ✅ Proper resource management

これにより、録画した動画ファイルが破損せず、正常に再生できるようになります。

This ensures that recorded video files are not corrupted and can be played back properly.
