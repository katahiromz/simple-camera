// SimpleCamera-Native.tsx --- React Native camera implementation using expo-camera
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import { CameraView, CameraType, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { Audio } from 'expo-av';
import { useTranslation } from 'react-i18next';

// Icons (using text for now, could use react-native-vector-icons)
const Icons = {
  Camera: () => <Text style={styles.iconText}>📷</Text>,
  SwitchCamera: () => <Text style={styles.iconText}>🔄</Text>,
  Mic: () => <Text style={styles.iconText}>🎤</Text>,
  MicOff: () => <Text style={styles.iconText}>🔇</Text>,
  Video: () => <Text style={styles.iconText}>🎥</Text>,
  Square: () => <Text style={styles.iconText}>⏹️</Text>,
  Pause: () => <Text style={styles.iconText}>⏸️</Text>,
};

// Camera status
type CameraStatus = 'initializing' | 'ready' | 'noPermission' | 'noDevice';
type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopping';

interface SimpleCameraProps {
  audio?: boolean;
  showTakePhoto?: boolean;
  showMic?: boolean;
  showRecord?: boolean;
  showControls?: boolean;
  photoQuality?: number;
  soundEffect?: boolean;
  showStatus?: boolean;
  showTimer?: boolean;
}

const SimpleCamera: React.FC<SimpleCameraProps> = ({
  audio = true,
  showTakePhoto = true,
  showMic = true,
  showRecord = true,
  showControls = true,
  photoQuality = 0.92,
  soundEffect = true,
  showStatus = true,
  showTimer = true,
}) => {
  const { t } = useTranslation();

  // Refs
  const cameraRef = useRef<CameraView>(null);
  const recordingRef = useRef<any>(null);

  // Permissions
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [mediaLibraryPermission, setMediaLibraryPermission] = useState<any>(null);

  // State
  const [status, setStatus] = useState<CameraStatus>('initializing');
  const [facing, setFacing] = useState<CameraType>('back');
  const [micEnabled, setMicEnabled] = useState(audio);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [zoom, setZoom] = useState(0);

  // Audio refs for sound effects
  const shutterSoundRef = useRef<Audio.Sound | null>(null);
  const videoStartSoundRef = useRef<Audio.Sound | null>(null);
  const videoCompleteSoundRef = useRef<Audio.Sound | null>(null);

  // Initialize permissions
  useEffect(() => {
    (async () => {
      // Request camera permission
      if (!cameraPermission?.granted) {
        await requestCameraPermission();
      }

      // Request microphone permission if audio is enabled
      if (audio && !micPermission?.granted) {
        await requestMicPermission();
      }

      // Request media library permission
      const { status } = await MediaLibrary.requestPermissionsAsync();
      setMediaLibraryPermission(status);

      // Check final status
      if (cameraPermission?.granted) {
        setStatus('ready');
      } else if (cameraPermission?.canAskAgain === false) {
        setStatus('noPermission');
      }
    })();
  }, []);

  // Load sound effects
  useEffect(() => {
    if (soundEffect) {
      (async () => {
        try {
          // In a real implementation, you would load actual sound files
          // For now, we'll just prepare the audio system
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
          });
        } catch (error) {
          console.error('Error loading sound effects:', error);
        }
      })();
    }

    return () => {
      // Cleanup sound effects
      shutterSoundRef.current?.unloadAsync();
      videoStartSoundRef.current?.unloadAsync();
      videoCompleteSoundRef.current?.unloadAsync();
    };
  }, [soundEffect]);

  // Recording timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (recordingStatus === 'recording') {
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else if (recordingStatus === 'idle') {
      setRecordingTime(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [recordingStatus]);

  // Format time for timer display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Play sound effect
  const playSound = useCallback(async (soundRef: React.RefObject<Audio.Sound>) => {
    if (soundEffect && soundRef.current) {
      try {
        await soundRef.current.replayAsync();
      } catch (error) {
        console.error('Error playing sound:', error);
      }
    }
  }, [soundEffect]);

  // Capture photo
  const capturePhoto = useCallback(async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: photoQuality,
        skipProcessing: false,
      });

      if (photo) {
        // Save to media library
        if (mediaLibraryPermission === 'granted') {
          await MediaLibrary.saveToLibraryAsync(photo.uri);
          Alert.alert(t('success'), t('photoSaved'));
        } else {
          Alert.alert(t('error'), t('noMediaLibraryPermission'));
        }

        // Play shutter sound
        playSound(shutterSoundRef);
      }
    } catch (error) {
      console.error('Error capturing photo:', error);
      Alert.alert(t('error'), t('photoCaptureFailed'));
    }
  }, [photoQuality, mediaLibraryPermission, playSound, t]);

  // Toggle camera facing
  const toggleCameraFacing = useCallback(() => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  }, []);

  // Toggle microphone
  const toggleMic = useCallback(() => {
    setMicEnabled((prev) => !prev);
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    if (!cameraRef.current) return;

    try {
      setRecordingStatus('recording');
      const recording = await cameraRef.current.recordAsync({
        mute: !micEnabled,
      });

      recordingRef.current = recording;
      playSound(videoStartSoundRef);
    } catch (error) {
      console.error('Error starting recording:', error);
      Alert.alert(t('error'), t('recordingStartFailed'));
      setRecordingStatus('idle');
    }
  }, [micEnabled, playSound, t]);

  // Stop recording
  const stopRecording = useCallback(async () => {
    if (!cameraRef.current || !recordingRef.current) return;

    try {
      setRecordingStatus('stopping');
      cameraRef.current.stopRecording();

      const video = recordingRef.current;
      
      if (video && video.uri) {
        // Save to media library
        if (mediaLibraryPermission === 'granted') {
          await MediaLibrary.saveToLibraryAsync(video.uri);
          Alert.alert(t('success'), t('videoSaved'));
        } else {
          Alert.alert(t('error'), t('noMediaLibraryPermission'));
        }

        playSound(videoCompleteSoundRef);
      }

      recordingRef.current = null;
      setRecordingStatus('idle');
    } catch (error) {
      console.error('Error stopping recording:', error);
      Alert.alert(t('error'), t('recordingStopFailed'));
      setRecordingStatus('idle');
    }
  }, [mediaLibraryPermission, playSound, t]);

  // Pause recording (not directly supported by expo-camera, would need custom implementation)
  const pauseRecording = useCallback(() => {
    Alert.alert(t('info'), t('pauseNotSupported'));
  }, [t]);

  // Resume recording (not directly supported by expo-camera, would need custom implementation)
  const resumeRecording = useCallback(() => {
    Alert.alert(t('info'), t('resumeNotSupported'));
  }, [t]);

  // Handle permission errors
  if (!cameraPermission) {
    return (
      <View style={styles.container}>
        <Text style={styles.statusText}>{t('initializing')}</Text>
      </View>
    );
  }

  if (!cameraPermission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.statusText}>{t('noPermission')}</Text>
        <TouchableOpacity style={styles.button} onPress={requestCameraPermission}>
          <Text style={styles.buttonText}>{t('grantPermission')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        zoom={zoom}
        enableTorch={false}
      >
        {/* Status display */}
        {showStatus && status !== 'ready' && (
          <View style={styles.statusOverlay}>
            {status === 'initializing' && <Text style={styles.statusText}>{t('initializing')}</Text>}
            {status === 'noPermission' && <Text style={styles.statusText}>{t('noPermission')}</Text>}
            {status === 'noDevice' && <Text style={styles.statusText}>{t('noDevice')}</Text>}
          </View>
        )}

        {/* Recording timer */}
        {showTimer && recordingStatus !== 'idle' && (
          <View style={styles.recordingTimer}>
            <View style={styles.recordingIndicator} />
            <Text style={styles.timerText}>{formatTime(recordingTime)}</Text>
          </View>
        )}

        {/* Controls */}
        {showControls && status === 'ready' && (
          <View style={styles.controls}>
            <View style={styles.controlButtons}>
              {/* Switch camera button */}
              <TouchableOpacity
                style={[styles.controlButton, recordingStatus !== 'idle' && styles.disabledButton]}
                onPress={toggleCameraFacing}
                disabled={recordingStatus !== 'idle'}
              >
                <Icons.SwitchCamera />
              </TouchableOpacity>

              {/* Mic toggle button */}
              {showMic && (
                <TouchableOpacity
                  style={[
                    styles.controlButton,
                    micEnabled && styles.activeButton,
                    recordingStatus !== 'idle' && styles.disabledButton,
                  ]}
                  onPress={toggleMic}
                  disabled={recordingStatus !== 'idle'}
                >
                  {micEnabled ? <Icons.Mic /> : <Icons.MicOff />}
                </TouchableOpacity>
              )}

              {/* Capture photo button */}
              {showTakePhoto && (
                <TouchableOpacity
                  style={[
                    styles.controlButton,
                    styles.captureButton,
                    recordingStatus !== 'idle' && styles.disabledButton,
                  ]}
                  onPress={capturePhoto}
                  disabled={recordingStatus !== 'idle'}
                >
                  <Icons.Camera />
                </TouchableOpacity>
              )}

              {/* Video recording buttons */}
              {showRecord && (
                <>
                  {recordingStatus === 'idle' && (
                    <TouchableOpacity
                      style={[styles.controlButton, styles.recordButton]}
                      onPress={startRecording}
                    >
                      <Icons.Video />
                    </TouchableOpacity>
                  )}
                  {recordingStatus === 'recording' && (
                    <>
                      <TouchableOpacity
                        style={[styles.controlButton, styles.stopButton]}
                        onPress={stopRecording}
                      >
                        <Icons.Square />
                      </TouchableOpacity>
                    </>
                  )}
                  {recordingStatus === 'paused' && (
                    <>
                      <TouchableOpacity
                        style={[styles.controlButton, styles.resumeButton]}
                        onPress={resumeRecording}
                      >
                        <Icons.Video />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.controlButton, styles.stopButton]}
                        onPress={stopRecording}
                      >
                        <Icons.Square />
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}
            </View>
          </View>
        )}
      </CameraView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  statusOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  statusText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
  },
  recordingTimer: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  recordingIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ff0000',
    marginRight: 8,
  },
  timerText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
  },
  controlButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
  },
  recordButton: {
    backgroundColor: 'rgba(255, 0, 0, 0.5)',
  },
  stopButton: {
    backgroundColor: 'rgba(255, 0, 0, 0.7)',
  },
  pauseButton: {
    backgroundColor: 'rgba(255, 165, 0, 0.5)',
  },
  resumeButton: {
    backgroundColor: 'rgba(0, 255, 0, 0.5)',
  },
  activeButton: {
    backgroundColor: 'rgba(0, 255, 0, 0.3)',
  },
  disabledButton: {
    opacity: 0.3,
  },
  button: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  iconText: {
    fontSize: 24,
  },
});

export default SimpleCamera;
