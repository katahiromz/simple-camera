import React, { useRef, useState, useCallback } from 'react';
import './Webcam03Controls.css';

/* lucide-reactのアイコンを使用: https://lucide.dev/icons/ */
import { Camera, Video, Square, AlertCircle, SwitchCamera, Settings } from 'lucide-react';

// 国際化(i18n)
import './i18n.ts';
import { useTranslation } from 'react-i18next';

const SHOW_TAKE_PHOTO = true; // 写真撮影ボタンを表示するか？
const SHOW_RECORDING = true; // 録画開始・録画停止ボタンを表示するか？
const SHOW_CAMERA_SWITCH = true; // カメラ切り替えボタンを表示するか？

// Controls コンポーネント
interface Camera03ControlsProps {
  isRecording: boolean; // 録画中か？
  takePhoto: () => void; // 写真を撮る
  startRecording: () => void; // 録画を開始
  stopRecording: () => void; // 録画を停止
  toggleCamera: () => void; // カメラの切り替え
  showTakePhoto: boolean; // 写真撮影ボタンを表示するか？
  showRecording: boolean; // 録画開始・録画停止ボタンを表示するか？
  showCameraSwitch: boolean; // カメラ切り替えボタンを表示するか？
};

// カメラCamera03のコントロール パネル (Camera03Controls) 本体
const Camera03Controls: React.FC<Camera03ControlsProps> = ({
  isRecording,
  takePhoto,
  startRecording,
  stopRecording,
  toggleCamera,
  showTakePhoto,
  showRecording,
  showCameraSwitch,
}) => {
  const { t } = useTranslation(); // 翻訳用
  return (
    <div style={{
        position: 'absolute',
        bottom: '8px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '20px',
        zIndex: 10
      }}
      aria-label={t('camera_container_2')}
    >
      {/* カメラ切り替え(前面・背面)ボタン */}
      {SHOW_CAMERA_SWITCH && showCameraSwitch && (
        <button
          onClick={toggleCamera}
          disabled={isRecording}
          className="webcam03-button webcam03-button-camera-switch"
          title={t('camera_switch_camera')}
          aria-label={t('camera_switch_camera')}
        >
          <SwitchCamera size={30} color="black" />
        </button>
      )}

      {/* 写真撮影ボタン */}
      {SHOW_TAKE_PHOTO && showTakePhoto && (
        <button
          onClick={takePhoto}
          disabled={isRecording}
          className="webcam03-button webcam03-button-take-photo"
          title={t('camera_take_photo')}
          aria-label={t('camera_take_photo')}
        >
          <Camera size={30} color="black" />
        </button>
      )}

      {/* 録画開始・録画停止ボタン */}
      {SHOW_RECORDING && showRecording && !isRecording ? (
        <button
          onClick={startRecording}
          className="webcam03-button webcam03-button-start-recording"
          aria-label={t('camera_start_recording')}
          title={t('camera_start_recording')}
        >
          <Video size={30} color="black" />
        </button>
      ) : (
        <button
          onClick={stopRecording}
          className="webcam03-button webcam03-button-stop-recording"
          aria-label={t('camera_stop_recording')}
          title={t('camera_stop_recording')}
        >
          <Square size={30} color="white" />
        </button>
      )}
    </div>
  );
};

export default Camera03Controls;
