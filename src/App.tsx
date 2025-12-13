import React, { useRef, useState, useEffect, useCallback } from 'react';
import './App.css';
import './i18n.ts';

// 国際化(i18n)
import { useTranslation } from 'react-i18next';

const IS_PRODUCTION = import.meta.env.MODE === 'production'; // 製品版か？

// アプリケーションのベースパスを取得
const BASE_URL = import.meta.env.BASE_URL;

// カメラのシャッター音。
const cameraShutterSoundUrl = `${BASE_URL}camera-shutter-sound.mp3`;
// ビデオ録画開始の音。
const videoStartedSoundUrl = `${BASE_URL}video-started.mp3`;
// ビデオ録画完了の音。
const videoCompletedSoundUrl = `${BASE_URL}video-completed.mp3`;

// Androidアプリ内で実行されているか確認
const isAndroidApp = typeof window.android !== 'undefined';

const MAX_RECORDING_SECONDS = 2 * 60 * 60; // 最大録画時間（2時間）

const VOLUME = 0.5; // 音量

// localStorageから保存されたカメラの向きを読み込むヘルパー関数
const loadFacingMode = () => {
  try {
    const savedMode = localStorage.getItem('cameraFacingMode');
    // 'environment' または 'user' であればそれを返し、そうでなければデフォルトの 'environment' を返す
    if (savedMode === 'environment' || savedMode === 'user') {
      return savedMode;
    }
  } catch (e) {
    console.log('カメラ向きの読み込みに失敗:', e);
  }
  return 'environment'; // デフォルトは背面カメラ
};

// localStorageにカメラの向きを保存するヘルパー関数
const saveFacingMode = (mode) => {
  try {
    localStorage.setItem('cameraFacingMode', mode);
    console.log('カメラ向きを保存しました:', mode);
  } catch (e) {
    console.warn('カメラ向きの保存に失敗:', e);
  }
};

/**
 * ビデオのレンダリングサイズとオフセットを計算
 * object-fit: cover の動作を再現
 */
const calculateVideoRenderMetrics = (video, displayWidth, displayHeight) => {
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  const videoAspect = videoWidth / videoHeight;
  const displayAspect = displayWidth / displayHeight;

  let renderWidth, renderHeight;
  let offsetX = 0, offsetY = 0;

  if (videoAspect > displayAspect) {
    // ビデオの方が横長 → 高さを基準にフィット
    renderHeight = displayHeight;
    renderWidth = displayHeight * videoAspect;
    offsetX = (displayWidth - renderWidth) / 2;
  } else {
    // ビデオの方が縦長 → 幅を基準にフィット
    renderWidth = displayWidth;
    renderHeight = displayWidth / videoAspect;
    offsetY = (displayHeight - renderHeight) / 2;
  }

  return { renderWidth, renderHeight, offsetX, offsetY };
};

/**
 * Canvasにズームとパンを適用してビデオを描画
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {HTMLVideoElement} video - Video element
 * @param {Object} options - 描画オプション
 */
const drawVideoWithZoomAndPan = (ctx, video, options) => {
  const {
    displayWidth,
    displayHeight,
    zoom,
    pan,
    isFrontCamera,
  } = options;

  // ビデオのレンダリングメトリクスを計算
  const { renderWidth, renderHeight, offsetX, offsetY } = 
    calculateVideoRenderMetrics(video, displayWidth, displayHeight);

  // Canvasの状態を保存
  ctx.save();

  // 前面カメラの場合は反転
  if (isFrontCamera) {
    ctx.translate(displayWidth, 0);
    ctx.scale(-1, 1);
  }

  // パンを適用(反転を考慮)
  const effectivePanX = isFrontCamera ? -pan.x : pan.x;
  ctx.translate(effectivePanX, pan.y);

  // ズームの中心を画面中央に設定
  ctx.translate(displayWidth / 2, displayHeight / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-displayWidth / 2, -displayHeight / 2);

  // ビデオを描画
  ctx.drawImage(video, offsetX, offsetY, renderWidth, renderHeight);

  // Canvasの状態を復元
  ctx.restore();
};

// アプリ
function App() {
  const { t } = useTranslation(); // 翻訳
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]); // 録画用チャンクデータ

  // アプリケーションの開始時にロケールを判定するように修正
  const getIsJapanOrKorea = () => {
    if (typeof window !== 'undefined' && navigator.language) {
      const lang = navigator.language.toLowerCase();
      return lang.includes('ja') || lang.includes('ko');
    }
    return false;
  };

  // 状態管理
  const [stream, setStream] = useState(null); // ストリーム
  const [isRecording, setIsRecording] = useState(false); // 録画中か？
  const [zoom, setZoom] = useState(1); // ズーム倍率
  const [capabilities] = useState({ min: 1, max: 8 }); // ズーム倍率などのカメラの能力
  const [recordingTime, setRecordingTime] = useState(0); // 録画時間 (秒)
  const timerIntervalRef = useRef(null); // タイマーID
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 }); // X, Yオフセット (CSS適用用)
  const panStartRef = useRef({ x: 0, y: 0 }); // パン開始時の座標
  const panOffsetRef = useRef(panOffset); // 最新の panOffset を保持

  // マイク権限変更を検知し、メインのuseEffectをトリガーするためのキー
  const [micPermissionChangedKey, setMicPermissionChangedKey] = useState(0);

  // オーディオ権限の状態を管理。状態: 'granted', 'denied', 'prompt'
  const [audioPermissionStatus, setAudioPermissionStatus] = useState('prompt');
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [forcedAudioMode, setForcedAudioMode] = useState(null); // null, true, false

  // カメラの権限の状態
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);

  // カメラの向き ('environment': 背面, 'user': 前面)
  const [facingMode, setFacingMode] = useState(loadFacingMode());

  // 画面サイズ変更を検知するための状態
  const [screenSizeKey, setScreenSizeKey] = useState(0);

  const touchDistanceRef = useRef(null); // タッチ操作関連
  const zoomRef = useRef(zoom); // ズーム倍率参照

  const isDraggingRef = useRef(false); // マウスドラッグ中かどうか
  const dragStartMousePosRef = useRef({ x: 0, y: 0 }); // ドラッグ開始時のマウス座標

  const cameraShutterSoundRef = useRef(null); // シャッター音参照
  const videoStartedSoundRef = useRef(null); // 録画開始の音
  const videoCompletedSoundRef = useRef(null); // 録画完了の音

  useEffect(() => {
    zoomRef.current = zoom;
    panOffsetRef.current = panOffset;
    if (getIsJapanOrKorea) { // 日本と韓国ではシャッタ―音を鳴らさなければならない。
      cameraShutterSoundRef.current = new Audio(cameraShutterSoundUrl);
      videoStartedSoundRef.current = new Audio(videoStartedSoundUrl);
      videoCompletedSoundRef.current = new Audio(videoCompletedSoundUrl);
    }
  }, [zoom, panOffset]);

  // facingModeが変更されたらlocalStorageに保存する
  useEffect(() => {
    saveFacingMode(facingMode);
  }, [facingMode]);

  // カメラ権限を監視
  useEffect(() => {
    if (!navigator.permissions) return;

    let permissionStatus = null;

    const setupCameraPermissionListener = async () => {
      try {
        permissionStatus = await navigator.permissions.query({ name: 'camera' });

        if (permissionStatus.state === 'denied') {
          setCameraPermissionDenied(true);
        }

        permissionStatus.onchange = async () => {
          console.log('カメラ権限が変更されました:', permissionStatus.state);
          if (permissionStatus.state === 'denied') {
            setCameraPermissionDenied(true);
          } else if (permissionStatus.state === 'granted') {
            setCameraPermissionDenied(false);
            // 権限が許可されたらカメラを再起動
            console.log('カメラ権限が許可されました。カメラを再起動します...');
            setMicPermissionChangedKey(prev => prev + 1);
          }
        };
      } catch (error) {
        console.error('カメラ権限監視のセットアップに失敗:', error);
      }
    };

    setupCameraPermissionListener();

    return () => {
      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, []);

  // 初回のみストレージ権限を要求
  useEffect(() => {
    // マイク設定を読み込む
    const loadAudioSettings = () => {
      try {
        const savedAudioMode = localStorage.getItem('forcedAudioMode');
        console.log('localStorage から読み込んだ値:', savedAudioMode);
        
        if (savedAudioMode !== null) {
          const parsedMode = savedAudioMode === 'true' ? true : savedAudioMode === 'false' ? false : null;
          setForcedAudioMode(parsedMode);
          console.log('保存されたマイク設定を適用しました:', parsedMode);
        } else {
          console.log('保存されたマイク設定がありません');
        }
      } catch (error) {
        console.error('マイク設定の読み込みに失敗:', error);
      }
    };

    const requestStoragePermission = async () => {
      if (isAndroidApp && typeof window.android.requestStoragePermission === 'function') {
        try {
          await window.android.requestStoragePermission();
          console.log('ストレージ権限の要求が完了しました');
        } catch (e) {
          console.warn('ストレージ権限の要求に失敗:', e);
        }
      }
    };

    loadAudioSettings();
    requestStoragePermission();
  }, []);

  // --- カメラアクセスロジック ---

  // 音声の権限をチェックする
  const checkAudioPermission = useCallback(async () => {
    if (!navigator.permissions || isAndroidApp) {
      return 'granted';
    }

    try {
      const result = await navigator.permissions.query({ name: 'microphone' });
      return result.state;
    } catch (error) {
      console.error('マイク権限のチェック中にエラーが発生しました:', error);
      return 'denied';
    }
  }, []);

  // 権限変更を監視 (マイク)
  useEffect(() => {
    if (!navigator.permissions || isAndroidApp) return;

    let permissionStatus = null;

    const setupPermissionListener = async () => {
      try {
        permissionStatus = await navigator.permissions.query({ name: 'microphone' });

        permissionStatus.onchange = async () => {
          console.log('マイク権限が変更されました:', permissionStatus.state);
          console.log('カメラを再起動します');
          // 直接再起動する代わりに、キーを更新してメインのuseEffectをトリガーする
          setMicPermissionChangedKey(prev => prev + 1);
        };
      } catch (error) {
        console.error('権限監視のセットアップに失敗:', error);
      }
    };

    setupPermissionListener();

    return () => {
      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, [isAndroidApp]);

  // メディア制約の候補を作成します
  const getMediaConstraintCandidates = async (targetFacingMode, forcedAudio) => {
    const pixelRatio = window.devicePixelRatio || 1;
    const screenWidth = window.screen.width * pixelRatio;
    const screenHeight = window.screen.height * pixelRatio;
    const isPortrait = window.innerHeight > window.innerWidth;

    let idealWidth, idealHeight;
    if (isPortrait) {
      idealWidth = Math.min(screenWidth, screenHeight);
      idealHeight = Math.max(screenWidth, screenHeight);
    } else {
      idealWidth = Math.max(screenWidth, screenHeight);
      idealHeight = Math.min(screenWidth, screenHeight);
    }

    console.log('要求する解像度:', idealWidth, 'x', idealHeight, '(画面:', isPortrait ? '縦' : '横', ')');

    let audioPermission;
    if (forcedAudio === null || forcedAudio === undefined) {
      audioPermission = await checkAudioPermission();
    } else if (forcedAudio === 'granted' || forcedAudio === true) {
      audioPermission = 'granted';
    } else if (forcedAudio === 'denied' || forcedAudio === false) {
      audioPermission = 'denied';
    } else {
      console.warn('予期しない forcedAudio の値:', forcedAudio);
      audioPermission = await checkAudioPermission();
    }

    const enableAudio = audioPermission === 'granted' || audioPermission === 'prompt';
    const oppositeFacingMode = targetFacingMode === 'user' ? 'environment' : 'user';

    // より包括的な候補リストを作成
    const candidates = [
      // 1. 理想的な解像度 + 指定したfacingMode (exact指定なし)
      {
        video: {
          facingMode: targetFacingMode,
          width: { ideal: idealWidth },
          height: { ideal: idealHeight }
        },
        audio: enableAudio
      },
      // 2. 理想的な解像度 + 反対のfacingMode
      {
        video: {
          facingMode: oppositeFacingMode,
          width: { ideal: idealWidth },
          height: { ideal: idealHeight }
        },
        audio: enableAudio
      },
      // 3. facingModeのみ指定（解像度は自動）
      {
        video: {
          facingMode: targetFacingMode
        },
        audio: enableAudio
      },
      // 4. 反対のfacingModeのみ指定
      {
        video: {
          facingMode: oppositeFacingMode
        },
        audio: enableAudio
      },
      // 5. facingModeを理想値として指定（より柔軟）
      {
        video: {
          facingMode: { ideal: targetFacingMode },
          width: { ideal: idealWidth },
          height: { ideal: idealHeight }
        },
        audio: enableAudio
      },
      // 6. 任意のカメラ + 理想的な解像度
      {
        video: {
          width: { ideal: idealWidth },
          height: { ideal: idealHeight }
        },
        audio: enableAudio
      },
      // 7. 完全に制約なし（最後の手段）
      {
        video: true,
        audio: enableAudio
      }
    ];

    // audio なしの候補も追加（マイク権限が原因の場合のフォールバック）
    if (enableAudio) {
      candidates.push(
        {
          video: {
            facingMode: targetFacingMode,
            width: { ideal: idealWidth },
            height: { ideal: idealHeight }
          },
          audio: false
        },
        {
          video: {
            facingMode: oppositeFacingMode,
            width: { ideal: idealWidth },
            height: { ideal: idealHeight }
          },
          audio: false
        },
        {
          video: {
            facingMode: targetFacingMode
          },
          audio: false
        },
        {
          video: true,
          audio: false
        }
      );
    }

    return candidates;
  };

  // カメラを要求する
  const requestCameraAndAudio = async (targetFacingMode, forcedAudio = null) => {
    // メディア制約の候補を取得
    const candidates = await getMediaConstraintCandidates(targetFacingMode, forcedAudioMode);
    let needRetryAudioFalse = false;
    let lastError = null;

    // それぞれの候補を試す
    for (let i = 0; i < candidates.length; ++i) {
      const candidate = candidates[i];
      try {
        console.log(`候補 ${i + 1}/${candidates.length} を試行中:`, candidate);

        // メディアストリームを取得
        const mediaStream = await navigator.mediaDevices.getUserMedia(candidate);

        // 音声トラックの有無を確認
        const hasAudioTrack = candidate.audio && mediaStream.getAudioTracks().length > 0;
        setIsAudioEnabled(hasAudioTrack);

        // 実際に取得できたカメラの向きを確認
        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings();
          console.log('実際のカメラ設定:', settings);
          
          // facingModeが期待と異なる場合でも成功とみなす
          const actualFacing = settings.facingMode || targetFacingMode;
          return { mediaStream, actualFacingMode: actualFacing };
        }

        return { mediaStream, actualFacingMode: targetFacingMode };
      } catch (error) {
        console.log(error);
        lastError = error;
        if (
          (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') &&
          candidate.audio === true
        ) {
          needRetryAudioFalse = true;
        }
      }
    }

    // --- マイク拒否時の再試行 ---
    if (needRetryAudioFalse) {
      console.log('マイク拒否 → audio:false で再試行');

      for (let i = 0; i < candidates.length; ++i) {
        const baseCandidate = candidates[i];
        const candidate = { ...baseCandidate, audio: false };
        try {
          console.log(`音声なし候補 ${i + 1} を試行中:`, candidate);

          // メディアストリームを取得
          const mediaStream = await navigator.mediaDevices.getUserMedia(candidate);

          setIsAudioEnabled(false);

          const videoTrack = mediaStream.getVideoTracks()[0];
          if (videoTrack) {
            const settings = videoTrack.getSettings();
            console.log('実際のカメラ設定(音声なし):', settings);
            const actualFacing = settings.facingMode || targetFacingMode;
            return { mediaStream, actualFacingMode: actualFacing };
          }

          return { mediaStream, actualFacingMode: targetFacingMode };
        } catch (error) {
          console.warn(`音声なし候補 ${i + 1} 失敗:`, error.name, error.message);
          lastError = error;
        }
      }
    }

    // 全ての候補が失敗
    console.error(
      '全ての getUserMedia 候補が失敗しました',
      {
        facingMode: targetFacingMode,
        lastErrorName: lastError?.name,
        lastErrorMessage: lastError?.message,
        totalCandidates: candidates.length,
      }
    );
    throw lastError ?? new Error('getUserMedia failed');
  };

  // 動画撮影のマイク設定を変更
  const modifyAudioSettingsOfVideo = async (forcedAudio = null) => {
    try {
      // 現在のストリームを停止
      if (stream) {
        console.log('既存のストリームを停止');
        stream.getTracks().forEach(track => track.stop());
      }

      const { mediaStream, actualFacingMode } = await requestCameraAndAudio(facingMode, forcedAudio);

      setStream(mediaStream);
      setFacingMode(actualFacingMode);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      return true;
    } catch (error) {
      console.error('マイク設定の変更に失敗:', error);
      throw error;
    }
  };

  // 画面サイズ変更の監視
  useEffect(() => {
    let resizeTimeout = null;
    let lastOrientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';

    const handleResize = () => {
      // 録画中は何もしない
      if (isRecording) {
        console.log('録画中のため画面サイズ変更を無視します');
        return;
      }

      // debounce: 500ms待ってから実行
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      resizeTimeout = setTimeout(() => {
        const currentOrientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
        
        // 画面の向きが変わった場合のみカメラを再起動
        if (currentOrientation !== lastOrientation) {
          console.log('画面の向きが変更されました:', lastOrientation, '->', currentOrientation);
          lastOrientation = currentOrientation;
          setScreenSizeKey(prev => prev + 1);
        }
      }, 500);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
    };
  }, [isRecording]);

  // forcedAudioModeをlocalStorageに保存
  const saveForcedAudioMode = useCallback((mode) => {
    try {
      if (mode === null) {
        localStorage.removeItem('forcedAudioMode');
       } else {
        localStorage.setItem('forcedAudioMode', mode.toString());
      }
      console.log('マイク設定を保存しました:', mode);
    } catch (e) {
      console.warn('マイク設定の保存に失敗:', e);
    }
  }, []);

  useEffect(() => {
    let currentStream = null;
    let isMounted = true;

    const setupCamera = async () => {
      try {
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }

        try {
          // 利用可能なデバイスを確認
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(device => device.kind === 'videoinput');
          console.log('利用可能なカメラデバイス:', videoDevices);

          if (videoDevices.length === 0) {
            console.error('カメラデバイスが見つかりません');
            return;
          }
        } catch (enumError) {
          console.warn('デバイス列挙エラー:', enumError);
          // enumerateDevices が失敗しても続行
        }

        const { mediaStream, actualFacingMode } = await requestCameraAndAudio(facingMode);

        if (!isMounted) {
          mediaStream.getTracks().forEach(track => track.stop());
          return;
        }

        // カメラアクセスに成功したら、権限拒否状態をクリア
        setCameraPermissionDenied(false);

        currentStream = mediaStream;
        setStream(mediaStream);
        setFacingMode(actualFacingMode);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        setZoom(1);
        setPanOffset({ x: 0, y: 0 });
      } catch (error) {
        console.error("カメラのセットアップに失敗しました:", error);

        if (isMounted) {
          let errorMessage = t('alert_access_failed');
          let shouldShowCameraDenied = false; // カメラ権限エラー表示のフラグ

          // 実際の権限拒否エラー（カメラかマイク）
          if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            errorMessage = t('alert_camera_permission_needed');
            shouldShowCameraDenied = true;
          } else if (error.name === 'NotFoundError') {
            // デバイスが見つからないエラー
            errorMessage = t('alert_camera_not_found');
            console.warn('カメラデバイスが見つかりません。後で再試行できます。');
          } else if (error.name === 'NotReadableError') {
            // カメラが他のアプリで使用中のエラー
            errorMessage = t('alert_camera_in_use');
            console.warn('カメラが使用中です。他のアプリを閉じてから再試行してください。');
          } else if (error.name === 'OverconstrainedError') {
            console.warn('カメラの制約を満たせません:', error);
            shouldShowCameraDenied = false;
          } else {
            console.error('予期しないエラー:', error);
            shouldShowCameraDenied = false;
          }

          // 権限拒否エラーの場合のみ、永続的なエラー画面を表示する
          setCameraPermissionDenied(shouldShowCameraDenied); 

          if (!shouldShowCameraDenied && errorMessage !== t('alert_access_failed')) {
            console.warn('エラーが発生しましたが、ユーザーは後で再試行できます');
          }
        }
      }
    };

    setupCamera();

    return () => {
      isMounted = false;
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [facingMode, micPermissionChangedKey, forcedAudioMode, screenSizeKey]);

  // ズーム適用関数
  const applyZoom = useCallback((newZoom) => {
    // newZoom が数値でない場合は安全側に倒す
    const numericZoom = Number(newZoom);
    if (Number.isNaN(numericZoom)) return capabilities.min;
    const { min, max } = capabilities;
    const clampedZoom = Math.max(min, Math.min(numericZoom, max));
    return clampedZoom;
  }, [capabilities]);

  // ホイール操作 (Ctrl + ホイール)
  const handleWheel = useCallback((e) => {
    if (e.ctrlKey) {
      e.preventDefault(); // デフォルト動作を防止
      const sensitivity = 0.3; // 感度調整用定数
      const delta = (e.deltaY > 0) ? -sensitivity : sensitivity; // ズーム倍率の差分
      const targetZoom = zoomRef.current + delta; // ズーム倍率の候補
      const clampedZoom = applyZoom(targetZoom); // 制限されたズーム倍率

      if (clampedZoom <= 1.0) { // ズームが100%以下なら
        setPanOffset({ x: 0, y: 0 }); // パンをゼロにリセット
      } else {
        // ズーム変更時にパンオフセットを新しい範囲内に制限
        const containerWidth = containerRef.current.clientWidth;
        const containerHeight = containerRef.current.clientHeight;
        const maxPanX = (clampedZoom - 1) * containerWidth / 2;
        const maxPanY = (clampedZoom - 1) * containerHeight / 2;

        const currentPan = panOffsetRef.current;
        const newOffsetX = Math.max(-maxPanX, Math.min(currentPan.x, maxPanX));
        const newOffsetY = Math.max(-maxPanY, Math.min(currentPan.y, maxPanY));

        setPanOffset({ x: newOffsetX, y: newOffsetY });
      }

      setZoom(clampedZoom); // ズーム倍率を更新
    }
  }, [applyZoom]);

  // ピンチ操作用の距離計算
  const getDistance = (touches) => {
    return Math.hypot(
      touches[0].pageX - touches[1].pageX,
      touches[0].pageY - touches[1].pageY
    );
  };

  // ピンチ操作 (タッチイベント)
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      e.preventDefault(); // デフォルト動作を防止
      touchDistanceRef.current = getDistance(e.touches); // 距離を計算

      // パン開始位置を記録。二本の指の中点座標を計算
      const centerX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
      const centerY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
      panStartRef.current = {
        x: centerX - panOffsetRef.current.x, // 初期オフセットを考慮した開始点
        y: centerY - panOffsetRef.current.y
      };
    }
  }, []);

  // ピンチ操作 (タッチムーブ)
  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2) {
      e.preventDefault(); // デフォルト動作を防止

      const newDistance = getDistance(e.touches); // 距離を計算

      if (touchDistanceRef.current) { // タッチ距離情報があれば
        // --- ズーム処理 ---
        const distanceDiff = newDistance - touchDistanceRef.current;
        const zoomFactor = distanceDiff * 0.01;
        const targetZoom = zoomRef.current + zoomFactor;
        const clampedZoom = applyZoom(targetZoom);
        touchDistanceRef.current = newDistance; // 次の動きのために距離を更新
        setZoom(clampedZoom); // ステートを更新
        // --- ズーム処理ここまで ---

        // --- パン処理 (ズーム中も並行して行う) ---
        if (clampedZoom <= 1.0) { // ズームが1.0以下？
          setPanOffset({ x: 0, y: 0 }); // パンをリセット
        } else {
          // 二本の指の中点座標を計算
          const centerX = (e.touches[0].pageX + e.touches[1].pageX) / 2;
          const centerY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
          // 移動量
          let newOffsetX = centerX - panStartRef.current.x;
          let newOffsetY = centerY - panStartRef.current.y;
          // コンテナのサイズ
          const containerWidth = containerRef.current.clientWidth;
          const containerHeight = containerRef.current.clientHeight;
          // ズームによるはみ出し量の半分が最大移動距離となる
          const maxPanX = (clampedZoom - 1) * containerWidth / 2;
          const maxPanY = (clampedZoom - 1) * containerHeight / 2;
          // 新しいパン オフセット
          newOffsetX = Math.max(-maxPanX, Math.min(newOffsetX, maxPanX));
          newOffsetY = Math.max(-maxPanY, Math.min(newOffsetY, maxPanY));
          setPanOffset({ x: newOffsetX, y: newOffsetY });
        }
        // --- パン処理ここまで ---
      }
    }
  }, [applyZoom, zoomRef, panStartRef]);

  // --- マウスドラッグ操作 ---
  const handleMouseDown = useCallback((e) => {
    // 中央ボタン (1) でドラッグを開始し、かつズームされている場合のみ許可
    if (e.button !== 1 || zoomRef.current <= 1.0) return;

    e.preventDefault(); // デフォルト動作を防止
    isDraggingRef.current = true; // ドラッグ中にする

    // ドラッグ開始時のマウス座標を記録
    dragStartMousePosRef.current = { x: e.pageX, y: e.pageY };

    // ドラッグ開始時の映像オフセットを記録
    panStartRef.current = panOffsetRef.current;
  }, []);

  // マウスが動いた
  const handleMouseMove = useCallback((e) => {
    if (!isDraggingRef.current || zoomRef.current <= 1.0) {
      if (zoomRef.current <= 1.0 && (panOffsetRef.current.x !== 0 || panOffsetRef.current.y !== 0)) {
        setPanOffset({ x: 0, y: 0 });
      }
      return;
    }

    e.preventDefault(); // デフォルト動作を防止

    // マウス移動量
    const dx = e.pageX - dragStartMousePosRef.current.x;
    const dy = e.pageY - dragStartMousePosRef.current.y;
    // 前回のオフセット(panStartRef)に移動量を加算
    let newOffsetX = panStartRef.current.x + dx;
    let newOffsetY = panStartRef.current.y + dy;
    // パンの範囲を制限するロジック (タッチ操作と共通)
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    // パンの最大値
    const maxPanX = (zoomRef.current - 1) * containerWidth / 2;
    const maxPanY = (zoomRef.current - 1) * containerHeight / 2;
    // 制限済みパン
    newOffsetX = Math.max(-maxPanX, Math.min(newOffsetX, maxPanX));
    newOffsetY = Math.max(-maxPanY, Math.min(newOffsetY, maxPanY));

    setPanOffset({ x: newOffsetX, y: newOffsetY });
  }, []); // Refのみに依存するため、依存配列は空で安定

  // マウスボタンが上がった
  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
    }
  }, []);

  // ズーム倍率とパンをリセットする
  const resetZoomAndPan = useCallback(() => {
    setZoom(applyZoom(1));
    setPanOffset({ x: 0, y: 0 });
  }, [applyZoom]);

  // ボタンキーが押された
  const handleVolumeButton = (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      takePhoto(); // 写真の撮影
    }
  };

  // --- useEffect によるリスナー登録 ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // イベントリスナーを登録（passiveはfalse）
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('mousedown', handleMouseDown, { passive: false });
    container.addEventListener('mousemove', handleMouseMove, { passive: false });
    container.addEventListener('mouseup', handleMouseUp, { passive: false });
    window.addEventListener('keydown', handleVolumeButton, { passive: false });
    // 必要な時にイベントリスナーを登録解除
    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleVolumeButton);
    };
  }, [handleWheel, handleTouchStart, handleTouchMove, handleMouseDown, handleMouseMove, handleMouseUp]);

  // --- その他の関数 ---

  // カメラの切り替え
  const switchCamera = () => {
    if (isRecording) return;
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  // 日時付きのファイル名を取得する
  const getFileNameWithDateTime = (prefix = t('text_photo') + '_', extension = '.png', date = new Date()) => {
    const dateTimeString = new Date().toLocaleString();
    // ファイル名に好ましくない文字は置き換える
    const fileName = `${prefix}${dateTimeString.replace(/[\\\/:. ]/g, '-')}${extension}`;
    return fileName;
  };

  // フォールバック用のダウンロード関数
  const downloadFallback = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  // 写真撮影（ズーム・パン適用版）
  const takePhoto = () => {
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    
    // キャンバスのサイズを画面表示領域のサイズに設定
    const displayWidth = containerRef.current.clientWidth;
    const displayHeight = containerRef.current.clientHeight;
    
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    
    const ctx = canvas.getContext('2d');
    
    // 日本と韓国ではシャッター音を鳴らす
    if (getIsJapanOrKorea()) {
      try {
        window.android.onStartShutterSound(VOLUME);
      } catch (e) {
        if (cameraShutterSoundRef.current)
          cameraShutterSoundRef.current.volume = VOLUME;
      }
      
      cameraShutterSoundRef.current?.play().catch(error => 
        console.error("シャッター音再生エラー:", error)
      );
      
      try {
        window.android.onEndShutterSound();
      } catch (e) {}
    }
    
    // ヘルパー関数を使ってビデオを描画
    drawVideoWithZoomAndPan(ctx, video, {
      displayWidth,
      displayHeight,
      zoom: zoomRef.current,
      pan: panOffsetRef.current,
      isFrontCamera: facingMode === 'user',
    });
    
    // Blobに変換して保存
    canvas.toBlob((blob) => {
      if (!blob) {
        console.error('画像のBlobの作成に失敗しました');
        return;
      }
      
      const fileName = getFileNameWithDateTime(t('text_photo') + '_', ".png");
      
      if (isAndroidApp) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result.split(',')[1];
          if (typeof window.android.saveImageToGallery === 'function') {
            try {
              window.android.saveImageToGallery(base64data, fileName);
              console.log('画像を保存しました:', fileName);
            } catch (e) {
              console.error('画像保存エラー:', e);
              downloadFallback(blob, fileName);
            }
          } else {
            downloadFallback(blob, fileName);
          }
        };
        reader.readAsDataURL(blob);
      } else {
        downloadFallback(blob, fileName);
      }
    }, 'image/png');
  };

  // 録画の開始／停止
  const toggleRecording = () => {
    if (isRecording) {
      // 停止
      stopRecording();
    } else {
      // 開始
      startRecording();
    }
  };

  // ビデオをギャラリーに保存(Android専用)
  const saveVideoToGallery = (blob, fileName) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      // Base64エンコードされた文字列（データURI）を取得
      const base64Data = reader.result.split(',')[1];
      // Kotlin側の関数を呼び出す
      try {
        window.android.saveVideoToGallery(base64Data, fileName);
        console.log('保存完了:' + fileName);
        alert(t('alert_video_saved'));
      } catch (error) {
        console.error('android インタフェース呼び出しエラー:', error);
        alert(t('alert_save_video_failed', { error: error }));
      }
    };
    reader.readAsDataURL(blob); // BlobをBase64に変換
  };

  // 録画開始(Canvas経由でズーム・パン適用)
  const startRecording = () => {
    if (!stream) return;
    chunksRef.current = [];

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    setRecordingTime(0);

    // タイマーを開始
    const startTime = Date.now();
    timerIntervalRef.current = setInterval(() => {
      const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
      setRecordingTime(elapsedTime);

      if (elapsedTime >= MAX_RECORDING_SECONDS) {
        stopRecording();
        alert(t('alert_recording_max_time', { max_time: formatTime(MAX_RECORDING_SECONDS) }));
      }
    }, 1000);

    // Canvasを作成してビデオをリアルタイムで描画
    const canvas = document.createElement('canvas');
    const displayWidth = containerRef.current.clientWidth;
    const displayHeight = containerRef.current.clientHeight;
    
    canvas.width = displayWidth;
    canvas.height = displayHeight;
    
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    const video = videoRef.current;

    // フレーム描画関数(ヘルパー関数を使用)
    const drawFrame = () => {
      if (!video || video.paused || video.ended) return;

      // ヘルパー関数を使ってビデオを描画
      drawVideoWithZoomAndPan(ctx, video, {
        displayWidth,
        displayHeight,
        zoom: zoomRef.current,
        pan: panOffsetRef.current,
        isFrontCamera: facingMode === 'user',
      });

      // 録画中は継続的に描画
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        requestAnimationFrame(drawFrame);
      }
    };

    // Canvasから新しいストリームを取得
    const fps = 30;
    const canvasStream = canvas.captureStream(fps);
    
    // 元のストリームから音声トラックを追加
    const audioTracks = stream.getAudioTracks();
    audioTracks.forEach(track => {
      canvasStream.addTrack(track);
    });

    // MIMEタイプの選択
    const availableMimeTypes = [
      'video/webm; codecs=vp9',
      'video/webm; codecs=vp8',
      'video/webm',
      'video/mp4',
    ];

    let options = {}, extension = '.webm';
    let selectedMimeType = '';
    
    for (const mimeType of availableMimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        options = { mimeType: mimeType };
        selectedMimeType = mimeType;
        extension = (mimeType.indexOf('webm') !== -1) ? '.webm' : '.mp4';
        break;
      }
    }

    try {
      if (selectedMimeType) {
        mediaRecorderRef.current = new MediaRecorder(canvasStream, options);
      } else {
        mediaRecorderRef.current = new MediaRecorder(canvasStream);
      }
      console.log('MediaRecorder MIME Type:', mediaRecorderRef.current.mimeType);
    } catch (e) {
      console.error('MediaRecorderの作成に失敗しました:', e);
      return;
    }

    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { 
        type: mediaRecorderRef.current.mimeType.split(';')[0] || 'video/mp4' 
      });
      const fileName = getFileNameWithDateTime(t('text_video') + '_', extension);
      
      if (isAndroidApp) {
        saveVideoToGallery(blob, fileName);
      } else {
        downloadFallback(blob, fileName);
      }
    };

    // 録画開始
    mediaRecorderRef.current.start();
    setIsRecording(true);

    // フレーム描画を開始
    drawFrame();

    // 録画開始音を鳴らす
    if (getIsJapanOrKorea()) {
      try {
        window.android.onStartShutterSound(VOLUME);
      } catch (e) {
        if (videoStartedSoundRef.current)
          videoStartedSoundRef.current.volume = VOLUME;
      }

      videoStartedSoundRef.current?.play().catch(e => 
        console.error("ビデオ録画開始音再生エラー:", e)
      );

      try {
        window.android.onEndShutterSound();
      } catch (e) {}
    }
  };

  // 録画停止
  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    // タイマーを停止
    if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
    }
    setRecordingTime(0); // 録画時間をリセット

    // 録画完了時に音を鳴らす
    if (getIsJapanOrKorea) {
      // 音の前に音量の保存と調整
      try {
        window.android.onStartShutterSound(VOLUME);
      } catch (e) {
        if (videoCompletedSoundRef.current)
          videoCompletedSoundRef.current.volume = VOLUME;
      }

      // 録画完了音の再生
      videoCompletedSoundRef.current?.play().catch(e => console.error("ビデオ録画完了音再生エラー:", e));

      // 音の後に音量の復元
      try {
        window.android.onEndShutterSound();
      } catch (e) {}
    }
  };

  // 録画時間を "MM:SS" 形式にフォーマットする関数
  const formatTime = (totalSeconds) => {
    const hours = Math.floor(totalSeconds / 3600); // 時間を計算
    const remainingSeconds = totalSeconds % 3600;
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const pad = (num) => num.toString().padStart(2, '0');

    if (hours > 0) {
      // 1時間以上の場合: H:MM:SS (例: 1:05:30)
      return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    } else {
      // 1時間未満の場合: MM:SS (例: 05:30)
      return `${pad(minutes)}:${pad(seconds)}`;
    }
  };

  let micTitleKey;
  if (isRecording) {
    micTitleKey = 'button_mic_recording_title';
  } else if (isAudioEnabled) {
    micTitleKey = 'button_mic_enabled_title';
  } else {
    micTitleKey = 'button_mic_denied_title';
  }

  return (
    <div
      ref={containerRef}
      className="camera-container"
    >
      {/* ビデオ */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`video-feed ${facingMode === 'user' ? 'mirrored' : ''}`}
        style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})` }}
      />

      {/* カメラ権限エラー表示 */}
      {cameraPermissionDenied && (
        <div className="permission-error">
          <div className="permission-error-content">
            <div className="permission-error-icon">📷🚫</div>
            <div className="permission-error-title">{t('permission_denied_title')}</div>
            <div className="permission-error-message">
              {t('permission_denied_message')}
            </div>
          </div>
        </div>
      )}

      {/* ズーム倍率表示 */}
      <div className="zoom-controls">
        <span className="zoom-display">{(zoom * 100).toFixed(0) + '%'}</span>
        {zoom !== 1 && (
          <button className="btn reset-zoom-btn" onClick={resetZoomAndPan}>
            {t('button_reset_zoom')}
          </button>
        )}
      </div>

      {/* カメラ切り替えボタン (右上) */}
      <button
        className="btn switch-camera-btn"
        onClick={switchCamera}
        disabled={isRecording}
      >
        {t('button_switch_camera')}
      </button>

      {/* ★ 録画時間表示エリアの追加 */}
      {isRecording && (
        <div className="recording-time-display">
          {formatTime(recordingTime)}
        </div>
      )}

      {/* コントロール */}
      <div className="controls">
        {/* マイクボタン */}
        <button
          className={`btn mic-btn ${isAudioEnabled ? 'enabled' : 'denied'}`}
          onClick={async () => {
            console.log('マイクボタンがクリックされました');
            if (isRecording) {
              console.log('録画中のためスキップ');
              return;
            }

            // 現在の音声トラックの状態を確認
            const currentlyHasAudio = isAudioEnabled;
            console.log('現在の音声状態:', currentlyHasAudio);

            // 音声を反転
            const targetAudioEnabled = !currentlyHasAudio;
            console.log('目標の音声状態:', targetAudioEnabled);

            // 先に状態を保存
            setForcedAudioMode(targetAudioEnabled);
            saveForcedAudioMode(targetAudioEnabled);

            try {
              await modifyAudioSettingsOfVideo(targetAudioEnabled ? 'granted' : 'denied');
              console.log('マイクの状態変更が成功しました');
            } catch (error) {
              console.error('マイク設定の変更に失敗:', error);
              // エラー時は元の状態に戻す
              setForcedAudioMode(currentlyHasAudio);
              saveForcedAudioMode(currentlyHasAudio);
              console.log('マイクの状態を元に戻しました');
            }
          }}
          disabled={isRecording}
          title={t(micTitleKey)}
        >
          {isAudioEnabled ? '🎤' : '🎤🚫'}
        </button>

        {/* 写真ボタン */}
        <button className="btn photo-btn" onClick={takePhoto} disabled={isRecording}>
          📷
        </button>

        {/* 録画ボタン */}
        <button
          className={`btn video-btn ${isRecording ? 'recording' : ''}`}
          onClick={toggleRecording}
        >
          {isRecording ? '⏹' : '🎥'}
        </button>
      </div>
    </div>
  );
}

export default App;