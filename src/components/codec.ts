// codec.ts --- コーデックサポートの検出と管理
/**
 * MediaRecorder用のコーデックサポートをチェックする
 * @param {string} codec - チェックするコーデック
 * @returns {boolean} - コーデックがサポートされているかどうか
 */
export function checkRecordingCodecSupport(codec: string): boolean {
  if (typeof MediaRecorder === 'undefined') return false;
  return MediaRecorder.isTypeSupported(codec);
}

/**
 * ビデオ再生用のコーデックサポートをチェックする
 * @param {string} codec - チェックするコーデック
 * @returns {boolean} - コーデックがサポートされているかどうか
 */
export function checkVideoCodecPlaybackSupport(codec: string): boolean {
  const video = document.createElement('video');
  const canPlay = video.canPlayType(codec);
  return canPlay === 'maybe' || canPlay === 'probably' ? true : false;
}

/**
 * オーディオ再生用のコーデックサポートをチェックする
 * @param {string} codec - チェックするコーデック
 * @returns {boolean} - コーデックがサポートされているかどうか
 */
export function checkAudioCodecPlaybackSupport(codec: string): boolean {
  const audio = document.createElement('audio');
  const canPlay = audio.canPlayType(codec);
  return canPlay === 'maybe' || canPlay === 'probably' ? true : false;
}

type MediaType = 'audio' | 'video';

const audioContainers: ReadonlyArray<string> = [
  'ogg',
  'aac',
  'flac',
  'wav',
  'mp4',
];
const videoContainers: ReadonlyArray<string> = [
  'webm',
  'mp4',
  'x-matroska',
  '3gpp',
  '3gpp2',
  '3gp2',
  'quicktime',
  'mpeg',
];
const audioCodecs: ReadonlyArray<string> = ['opus', 'pcm', 'aac', 'mp4a'];
const videoCodecs: ReadonlyArray<string> = [
  'vp9',
  'vp8',
  'avc1',
  'av1',
  'h265',
  'h.264',
  'h264',
  'mpeg',
];

type SupportedMedia = {
  mimeType: string[];
  codec: string[];
  container: string[];
};

function getSupportedMediaFormats(
  containers: ReadonlyArray<string>,
  codecs: ReadonlyArray<string>,
  type: MediaType
): SupportedMedia {
  return containers.reduce<SupportedMedia>(
    (acc, container) => {
      codecs.forEach((codec) => {
        const mimeType = `${type}/${container};codecs=${codec}`;
        if (
          typeof MediaRecorder !== 'undefined' &&
          MediaRecorder.isTypeSupported(mimeType)
        ) {
          acc.mimeType.push(mimeType);
          acc.codec.push(codec);
          acc.container.push(container);
        }
      });
      return acc;
    },
    { mimeType: [], codec: [], container: [] }
  );
}

export const supportedAudioCodecs = getSupportedMediaFormats(
  audioContainers,
  audioCodecs,
  'audio'
);

export const supportedVideoCodecs = getSupportedMediaFormats(
  videoContainers,
  videoCodecs,
  'video'
);

// デフォルトコーデックを安全に構築
const videoContainer = supportedVideoCodecs.container[0] || 'webm';
const videoCodec = supportedVideoCodecs.codec[0] || 'vp8';
const audioCodec = supportedAudioCodecs?.codec?.[0];

export const defaultCodec = videoContainer && videoCodec
  ? `video/${videoContainer};codecs=${videoCodec}${audioCodec ? `,${audioCodec}` : ''}`
  : 'video/webm'; // 最終的なフォールバック

/**
 * 最適なコーデックを選択する
 * コーデック候補のリストから、サポートされている最初のコーデックを返す
 * @param {string[]} candidates - コーデック候補のリスト
 * @returns {string} - サポートされているコーデック、またはデフォルトコーデック
 */
export function selectBestCodec(candidates: string[]): string {
  for (const codec of candidates) {
    if (checkRecordingCodecSupport(codec)) {
      return codec;
    }
  }
  // フォールバック: デフォルトコーデックを返す
  return defaultCodec || 'video/webm'; // 追加の安全性チェック
}

/**
 * 推奨されるコーデック候補のリスト（優先度順）
 */
export const recommendedCodecs = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=h264,opus',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4;codecs=h264,aac',
  'video/mp4',
];
