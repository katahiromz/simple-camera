import React, { useRef, useState, useEffect, useCallback } from 'react';
import './App.css';

const IS_PRODUCTION = import.meta.env.MODE === 'production'; // 製品版か？
const IS_JAPAN_OR_KOREA = true; // 日本か韓国か？ 判定が面倒臭いので常に仮定

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

function App() {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]); // 録画用チャンクデータ

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

  // オーディオ権限の状態を管理。状態: 'granted', 'denied', 'prompt'
  const [audioPermissionStatus, setAudioPermissionStatus] = useState('prompt'); 
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [forcedAudioMode, setForcedAudioMode] = useState(null); // null, true, false

  // カメラの権限の状態
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);

  // カメラの向き ('environment': 背面, 'user': 前面)
  const [facingMode, setFacingMode] = useState('environment');

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
    if (IS_JAPAN_OR_KOREA) { // 日本と韓国ではシャッタ―音を鳴らさなければならない。
      cameraShutterSoundRef.current = new Audio(cameraShutterSoundUrl);
      videoStartedSoundRef.current = new Audio(videoStartedSoundUrl);
      videoCompletedSoundRef.current = new Audio(videoCompletedSoundUrl);
    }
  }, [zoom, panOffset]);

  // カメラ権限を監視
  useEffect(() => {
    if (!navigator.permissions) return;

    let permissionStatus = null;

    const setupCameraPermissionListener = async () => {
      try {
        permissionStatus = await navigator.permissions.query({ name: 'camera' });

        // 初期状態を設定
        setCameraPermissionDenied(permissionStatus.state === 'denied');

        permissionStatus.onchange = async () => {
          console.log('カメラ権限が変更されました:', permissionStatus.state);
          setCameraPermissionDenied(permissionStatus.state === 'denied');

          // 権限が付与された場合、カメラを再起動
          if (permissionStatus.state === 'granted') {
            console.log('カメラ権限が付与されました。カメラを再起動します...');
            
            // 既存のストリームを停止
            if (stream) {
              stream.getTracks().forEach(track => track.stop());
            }
            
            try {
              // カメラを再要求
              const { mediaStream, actualFacingMode } = await requestCameraAndAudio(facingMode);
              setStream(mediaStream);
              setFacingMode(actualFacingMode);
              
              if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
              }
              
              console.log('カメラの再起動に成功しました');
            } catch (err) {
              console.error('カメラの再起動に失敗:', err);
            }
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
    // forcedAudioModeをlocalStorageから読み込む
    try {
      const savedAudioMode = localStorage.getItem('forcedAudioMode');
      if (savedAudioMode !== null) {
        setForcedAudioMode(savedAudioMode === 'true' ? true : savedAudioMode === 'false' ? false : null);
        console.log('保存されたマイク設定を読み込みました:', savedAudioMode);
      }
    } catch (e) {
      console.warn('マイク設定の読み込みに失敗:', e);
    }

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
    requestStoragePermission();
  }, []); // 初回マウント時のみ実行

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
  }, [isAndroidApp, forcedAudioMode]);

  // 権限変更を監視
  useEffect(() => {
    if (!navigator.permissions || isAndroidApp) return;

    let permissionStatus = null;

    const setupPermissionListener = async () => {
      try {
        permissionStatus = await navigator.permissions.query({ name: 'microphone' });
        
        permissionStatus.onchange = async () => {
          console.log('マイク権限が変更されました:', permissionStatus.state);
          
          // forcedAudioModeがnullの場合のみ、権限変更に反応
          if (forcedAudioMode === null) {
            // カメラを再起動
            if (stream) {
              stream.getTracks().forEach(track => track.stop());
            }
            
            try {
              const { mediaStream, actualFacingMode } = await requestCameraAndAudio(facingMode);
              setStream(mediaStream);
              setFacingMode(actualFacingMode);
              
              if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
              }
            } catch (err) {
              console.error('カメラの再起動に失敗:', err);
            }
          }
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
  }, [isAndroidApp, forcedAudioMode, facingMode, stream]);

  // カメラを要求する
  const requestCameraAndAudio = async (targetFacingMode, forcedAudio = null, retry = 0, fallbackToNoAudio = false) => {
    if (retry >= 2) {
      throw new Error('すべてのカメラで接続に失敗しました');
    }

    try {
      let enableAudio;
      if (forcedAudio !== null) { // forcedAudioが指定されている場合は優先
        enableAudio = forcedAudio !== 'denied';
      } else if (forcedAudioMode === true) { // forcedAudioModeがtrueの場合は強制的に有効化を試みる
        enableAudio = true;
      } else if (forcedAudioMode === false) { // forcedAudioModeがfalseの場合は強制的に無効化
        enableAudio = false;
      } else { // それ以外は権限に従う
        const audioPermission = await checkAudioPermission();
        enableAudio = audioPermission === 'granted';
      }

      // fallbackToNoAudioがtrueの場合は音声なしで試行
      if (fallbackToNoAudio) {
        enableAudio = false;
      }

      // メディアストリームを取得
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: targetFacingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: enableAudio
      });

      // 音声トラックの有無を確認
      const hasAudioTrack = enableAudio && mediaStream.getAudioTracks().length > 0;
      setIsAudioEnabled(hasAudioTrack);

      // 初回起動時以外でログを出力
      if (retry === 0 && forcedAudio !== null) {
        console.log('マイク設定が更新されました。新しい状態:', hasAudioTrack);
      }

      return { mediaStream, actualFacingMode: targetFacingMode };
    } catch (err) {
      console.error(`カメラアクセスエラー (${targetFacingMode}):`, err);

      // 音声関連のエラーで、まだ音声なしで試していない場合
      const enableAudio = forcedAudio !== null ? forcedAudio !== 'denied' : 
                          forcedAudioMode === true ? true : 
                          forcedAudioMode === false ? false : true;

      if (!fallbackToNoAudio && (
        err.name === 'NotAllowedError' || 
        err.name === 'PermissionDeniedError'))
      {
        console.log('音声なしでカメラアクセスを再試行します...');
        return requestCameraAndAudio(targetFacingMode, 'denied', retry, true);
      }

      // NotFoundError の場合は別のカメラを試す
      if (retry === 0 && err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
        const nextFacingMode = targetFacingMode === 'environment' ? 'user' : 'environment';
        console.log(`${targetFacingMode}カメラが見つかりません。${nextFacingMode}を試します...`);
        return requestCameraAndAudio(nextFacingMode, forcedAudio, retry + 1, fallbackToNoAudio);
      }

      if (retry > 0 && err.name === 'NotFoundError' || err.name === 'OverconstrainedError') {
        const nextFacingMode = targetFacingMode === 'environment' ? 'user' : 'environment';
        return requestCameraAndAudio(nextFacingMode, 'denied', retry + 1, true);
      }

      // その他のエラーは再スロー
      throw err;
    }
  };

  // 動画撮影のマイク設定を変更
  const modifyAudioSettingsOfVideo = async (forcedAudio = null) => {
    try {
      // 現在のストリームを停止
      if (stream) {
        console.log('既存のストリームを停止');
        stream.getTracks().forEach(track => track.stop());
      }

      const { mediaStream, actualFacingMode } = await requestCameraAndAudio(
        facingMode, 
        forcedAudio
      );

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

    // カメラをセットアップ
    const setupCamera = async () => {
      try {
        // 既存のストリームを停止
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }

        // カメラとマイクを要求
        const { mediaStream, actualFacingMode } = await requestCameraAndAudio(facingMode);

        // コンポーネントがアンマウントされていないか確認
        if (!isMounted) {
          mediaStream.getTracks().forEach(track => track.stop());
          return;
        }

        // ストリームを設定
        currentStream = mediaStream;
        setStream(mediaStream);
        setFacingMode(actualFacingMode);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        setZoom(1);
        setPanOffset({ x: 0, y: 0 });
      } catch (err) {
        console.error("カメラのセットアップに失敗しました:", err);

        if (isMounted) {
          let errorMessage = 'カメラへのアクセスに失敗しました';
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            errorMessage = 'カメラの使用が許可されていません。ブラウザの設定を確認してください。';
            setCameraPermissionDenied(true);
          } else if (err.name === 'NotFoundError') {
            errorMessage = '利用可能なカメラが見つかりませんでした。';
          } else if (err.name === 'NotReadableError') {
            errorMessage = 'カメラは他のアプリケーションで使用中です。';
          }
          
         // カメラ権限エラーの場合はアラートを表示しない（画面に表示されるため）
         if (err.name !== 'NotAllowedError' && err.name !== 'PermissionDeniedError') {
           alert(`${errorMessage}\n\nエラー詳細: ${err.name}`);
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
  }, [facingMode, checkAudioPermission]);

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
    // 必要な時にイベントリスナーを登録解除
    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleWheel, handleTouchStart, handleTouchMove, handleMouseDown, handleMouseMove, handleMouseUp]);

  // --- その他の関数 ---

  // カメラの切り替え
  const switchCamera = () => {
    if (isRecording) return;
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
  };

  // 日時付きのファイル名を取得する
  const getFileNameWithDateTime = (prefix = "photo_", extension = ".png", date = new Date()) => {
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

  // 写真撮影
  const takePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');

    if (IS_JAPAN_OR_KOREA) { // 日本と韓国ではシャッタ―音を鳴らさなければならない
      // 音の前に音量の保存と調整
      try {
        window.android.onStartShutterSound(VOLUME);
      } catch (e) {
        if (cameraShutterSoundRef.current)
          cameraShutterSoundRef.current.volume = VOLUME;
      }

      // シャッター音の再生
      cameraShutterSoundRef.current?.play().catch(e => console.error("シャッター音再生エラー:", e));

      // 音の後に音量の復元
      try {
        window.android.onEndShutterSound();
      } catch (e) {}
    }

    ctx.drawImage(videoRef.current, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) {
        console.error('画像のBlobの作成に失敗しました');
        return;
      }

      // 写真のファイル名
      const fileName = getFileNameWithDateTime("photo_", ".png");

      if (isAndroidApp) { // Androidアプリ内の場合
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result.split(',')[1];
          // AndroidネイティブのJavaScript Interfaceを呼び出してファイルを保存
          if (typeof window.android.saveImageToGallery === 'function') {
            try {
              window.android.saveImageToGallery(base64data, fileName);
              console.log('画像を保存しました:', fileName);
            } catch (e) {
              console.error('画像保存エラー:', e);
              // フォールバック: ダウンロードリンクを使用
              downloadFallback(blob, fileName);
            }
          } else {
            // メソッドが存在しない場合はフォールバック
            downloadFallback(blob, fileName);
          }
        };
        reader.readAsDataURL(blob);
      } else {
        // ブラウザの場合は通常のダウンロード
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
        alert(`動画をギャラリーに保存しました: ${fileName}`);
      } catch (error) {
        console.error('AndroidInterface 呼び出しエラー:', error);
        alert('動画の保存に失敗しました: ${error}');
      }
    };
    reader.readAsDataURL(blob); // BlobをBase64に変換
  };

  // 録画開始
  const startRecording = () => {
    if (!stream) return;
    chunksRef.current = []; // 録画用データをクリア

    // 既存のタイマーがあればクリア
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    setRecordingTime(0); // 録画時間をリセット

    // タイマーを開始
    const startTime = Date.now();
    timerIntervalRef.current = setInterval(() => {
        const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
        setRecordingTime(elapsedTime);

      // 経過時間が上限に達したら自動的に停止
      if (elapsedTime >= MAX_RECORDING_SECONDS) {
        stopRecording();
        alert(`録画時間が上限 (${formatTime(MAX_RECORDING_SECONDS)}) に達したため、自動的に停止しました。`);
      }
    }, 1000); // 1秒ごとに更新

    // メディアレコーダーを作成
    const options = { mimeType: 'video/webm; codecs=vp9' };
    try {
      mediaRecorderRef.current = new MediaRecorder(stream, options);
    } catch (e) {
      mediaRecorderRef.current = new MediaRecorder(stream);
    }

    // 必要な時に録画データを追加する
    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    // 録画を停止したときに、動画ファイルをダウンロード
    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/mp4' });
      // 写真のファイル名
      const fileName = getFileNameWithDateTime("video_", ".mp4");
      if (isAndroidApp) { // Androidアプリ内の場合?
        saveVideoToGallery(blob, fileName);
      } else { // ブラウザの場合
        downloadFallback(blob, fileName);
      }
    };

    // 録画開始
    mediaRecorderRef.current.start();
    setIsRecording(true);

    // 録画開始時に音を鳴らす
    if (IS_JAPAN_OR_KOREA) {
      // 音の前に音量の保存と調整
      try {
        window.android.onStartShutterSound(VOLUME);
      } catch (e) {
        if (videoStartedSoundRef.current)
          videoStartedSoundRef.current.volume = VOLUME;
      }

      // 録画完了音の再生
      videoStartedSoundRef.current?.play().catch(e => console.error("ビデオ録画開始音再生エラー:", e));

      // 音の後に音量の復元
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
    if (IS_JAPAN_OR_KOREA) {
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
            <div className="permission-error-title">カメラの権限がありません</div>
            <div className="permission-error-message">
              ブラウザの設定でカメラへのアクセスを許可してください
            </div>
          </div>
        </div>
      )}

      {/* ズーム倍率表示 */}
      <div className="zoom-controls">
        <span className="zoom-display">{(zoom * 100).toFixed(0) + '%'}</span>
        {zoom !== 1 && (
          <button className="btn reset-zoom-btn" onClick={resetZoomAndPan}>
            1:1
          </button>
        )}
      </div>

      {/* カメラ切り替えボタン (右上) */}
      <button
        className="btn switch-camera-btn"
        onClick={switchCamera}
        disabled={isRecording}
      >
        ↕
      </button>

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
            
            // forcedAudioModeを更新
            setForcedAudioMode(targetAudioEnabled);
            saveForcedAudioMode(targetAudioEnabled);

            try {
              await modifyAudioSettingsOfVideo(targetAudioEnabled ? 'granted' : 'denied');
            } catch (err) {
              // エラー時は元の状態を維持
              console.log('マイクの状態は変更されませんでした');
            }
          }}
          disabled={isRecording}
          title={
            isRecording
              ? '録画中はマイク設定を変更できません'
              : isAudioEnabled
                ? 'マイクが有効です（クリックで無効化）' 
                : 'マイクが無効です（クリックで有効化）'
          }
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

        {/* ★ 録画時間表示エリアの追加 */}
        {isRecording && (
          <div className="recording-time-display">
            {formatTime(recordingTime)}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;