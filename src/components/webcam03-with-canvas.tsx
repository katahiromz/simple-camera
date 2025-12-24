// webcam03-with-canvas.tsx
import React, { useRef, useState, useCallback, useEffect, useMemo, forwardRef } from 'react';
import Webcam03 from './webcam03';
import Webcam03Controls from './webcam03-controls';
import { PermissionManager, PermissionStatusValue } from './permission-watcher';

const isAndroidApp = typeof window.android !== 'undefined';

interface Props {
  shutterSoundUrl: string | null;
  videoStartSoundUrl: string | null;
  videoCompleteSoundUrl: string | null;
};

interface Handle {};

// 音声を再生する
const playSound = (audio: HTMLAudioElement | null) => {
  if (!audio) {
    console.assert(false);
  }
  // 可能ならばシステム音量を変更する
  if (isAndroidApp)
    window.android?.onStartShutterSound();

  try {
    audio?.addEventListener('ended', (event) => { // 再生終了時
      // 可能ならばシステム音量を元に戻す
      if (isAndroidApp)
        window.android.onEndShutterSound();
    }, { once: true });
    // 再生位置をリセットしてから再生
    audio.currentTime = 0;
    audio.play();
  } catch (error) {
    console.warn('sound playback failed:', error);
  }
};

const Webcam03WithCanvas = forwardRef<Handle, Props>((
  {
    shutterSoundUrl = null,
    videoStartSoundUrl = null,
    videoCompleteSoundUrl = null,
  },
  ref
) => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);

  // --- 権限状態の管理 ---
  const [cameraPermission, setCameraPermission] = useState<PermissionStatusValue>('prompt');
  const [micPermission, setMicPermission] = useState<PermissionStatusValue>('prompt');
  // マイクを有効にするかどうかのフラグ
  const [isMicEnabled, setIsMicEnabled] = useState(true);

  // シャッター音など
  const shutterAudioRef = useRef<HTMLAudioElement | null>(null); // シャッター音の Audio オブジェクト
  const videoStartAudioRef = useRef<HTMLAudioElement | null>(null); // 動画録画開始音の Audio オブジェクト
  const videoCompleteAudioRef = useRef<HTMLAudioElement | null>(null); // 動画録画完了音の Audio オブジェクト

  // シャッター音などの初期化
  useEffect(() => {
    try {
      // シャッター音
      if (shutterSoundUrl) {
        shutterAudioRef.current = new Audio(shutterSoundUrl);
        shutterAudioRef.current.load();
      }
    } catch (error) {
      console.error('Failed to initialize shutter audio:', error);
    }
    return () => {
      shutterAudioRef.current = null;
    };
  }, [shutterSoundUrl]);
  useEffect(() => {
    try {
      // ビデオ録画開始音
      if (videoStartSoundUrl) {
        videoStartAudioRef.current = new Audio(videoStartSoundUrl);
        videoStartAudioRef.current.load();
      }
    } catch (error) {
      console.error('Failed to initialize shutter audio:', error);
    }
    return () => {
      videoStartAudioRef.current = null;
    };
  }, []);
  useEffect(() => {
    try {
      // ビデオ録画完了音
      if (videoCompleteSoundUrl) {
        videoCompleteAudioRef.current = new Audio(videoCompleteSoundUrl);
        videoCompleteAudioRef.current.load();
      }
    } catch (error) {
      console.error('Failed to initialize shutter audio:', error);
    }
    return () => {
      videoCompleteAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    // インスタンスの生成
    const cameraManager = new PermissionManager('camera' as PermissionName);
    const micManager = new PermissionManager('microphone' as PermissionName);

    // 購読開始
    const unsubscribeCamera = cameraManager.subscribe((status) => {
      setCameraPermission(status);
      if (status === 'denied') {
        setError("カメラの使用が拒否されています。ブラウザの設定から許可してください。");
      }
    });

    const unsubscribeMic = micManager.subscribe((status) => {
      setMicPermission(status);
      // マイクが拒否されている場合は強制的に無効化
      setIsMicEnabled(status !== 'denied');
    });

    return () => {
      unsubscribeCamera();
      unsubscribeMic();
    };
  }, []);

  const render = useCallback(() => {
    if (webcamRef.current?.video && canvasRef.current) {
      const video = webcamRef.current.video;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (ctx && video.readyState === video.HAVE_ENOUGH_DATA) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (canvas.width > 2 && canvas.height > 2) {
          // 円を描画
          ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(canvas.width / 4, canvas.height / 3, 80, 0, Math.PI * 2);
          ctx.stroke();
          
          // 四角形を描画
          ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
          ctx.lineWidth = 5;
          ctx.strokeRect(canvas.width / 2, canvas.height / 2, 150, 150);
        }
      }
    }
    animationRef.current = requestAnimationFrame(render);
  }, []);

  useEffect(() => {
    render();
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [render]);

  const takePhoto = useCallback(() => {
    console.log('takePhoto');
    if (!canvasRef.current) {
      console.error("Canvas not ready");
      return;
    }

    // シャッター音再生
    playSound(shutterAudioRef.current);

    try {
      const imageSrc = canvasRef.current.toDataURL('image/webp', 1.0);
      const link = document.createElement('a');
      link.href = imageSrc;
      link.download = `photo_${Date.now()}.webp`;
      link.click();
      console.log("Photo taken");
    } catch (err) {
      console.error("Failed to take photo:", err);
      setError("写真撮影に失敗しました");
    }
  }, []);

  // --- 録画開始機能 ---
  const startRecording = useCallback(() => {
    console.log('startRecording');
    if (!canvasRef.current) return;

    playSound(videoStartAudioRef.current);

    chunksRef.current = [];
    // Canvasからストリームを取得 (30fps)
    const stream = canvasRef.current.captureStream(30);
    
    // 必要に応じてWebcamからの音声トラックを追加
    if (isMicEnabled && webcamRef.current?.video?.srcObject) {
      const audioTracks = (webcamRef.current.video.srcObject as MediaStream).getAudioTracks();
      audioTracks.forEach(track => stream.addTrack(track));
    }

    const options = { mimeType: 'video/webm; codecs=vp9' };
    const mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      console.log('onstop');
      playSound(videoCompleteAudioRef.current);
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `video_${Date.now()}.webm`;
      link.click();
      URL.revokeObjectURL(url);
    };

    mediaRecorder.start();
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
  }, []);

  // --- 録画停止機能 ---
  const stopRecording = useCallback(() => {
    console.log('stopRecording');
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  return (
    <div style={{ 
      position: 'relative', 
      width: '100%', 
      height: '100vh',
      backgroundColor: '#000',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {/* 権限エラーまたはその他のエラー表示 */}
      {(cameraPermission === 'denied') && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '10px 20px',
          backgroundColor: 'rgba(244, 67, 54, 0.9)',
          color: 'white',
          borderRadius: '5px',
          zIndex: 20,
          textAlign: 'center'
        }}>
          カメラのアクセス権限が必要です。設定を確認してください。
        </div>
      )}

      <canvas 
        ref={canvasRef} 
        style={{ 
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain'
        }} 
      />
      
      {/* カメラ権限が拒否されていない場合のみWebcamを起動 */}
      {cameraPermission !== 'denied' && (
        <Webcam03 
          ref={webcamRef}
          audio={isMicEnabled}
          muted={true}
          style={{
            position: 'absolute',
            top: '0',
            left: '0',
            width: '1px', 
            height: '1px',
            opacity: 0,
            pointerEvents: 'none',
            overflow: 'hidden'
          }}
        >
          {() => (
            <Webcam03Controls
              isRecording={isRecording}
              takePhoto={takePhoto}
              startRecording={startRecording}
              stopRecording={stopRecording}
            />
          )}
        </Webcam03>
      )}
    </div>
  );
});

export default Webcam03WithCanvas;