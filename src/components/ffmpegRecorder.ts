// ffmpegRecorder.ts - FFmpeg.wasm-based video recorder
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';

interface RecorderOptions {
  fps: number;
  audioBitrate?: string;
  videoBitrate?: string;
}

class FFmpegRecorder {
  private ffmpeg: FFmpeg;
  private isLoaded: boolean = false;
  private isRecording: boolean = false;
  private frames: Blob[] = [];
  private frameCount: number = 0;
  private audioChunks: Blob[] = [];
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private frameInterval: number | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private options: RecorderOptions;

  constructor() {
    this.ffmpeg = new FFmpeg();
  }

  // Load FFmpeg.wasm core
  async load(): Promise<void> {
    if (this.isLoaded) return;

    try {
      // Try to use CDN version first (works in most environments)
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
      
      try {
        await this.ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        this.isLoaded = true;
        console.log('FFmpeg loaded successfully from CDN');
        return;
      } catch (cdnError) {
        console.warn('Failed to load FFmpeg from CDN, trying alternative...', cdnError);
        
        // Fallback: Try jsdelivr CDN
        const altBaseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
        await this.ffmpeg.load({
          coreURL: await toBlobURL(`${altBaseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${altBaseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        this.isLoaded = true;
        console.log('FFmpeg loaded successfully from alternative CDN');
      }
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      throw new Error('Failed to initialize FFmpeg. This feature may not be available in your environment.');
    }
  }

  // Check if FFmpeg is loaded
  isFFmpegLoaded(): boolean {
    return this.isLoaded;
  }

  // Start recording
  async startRecording(
    canvas: HTMLCanvasElement,
    audioStream: MediaStream | null,
    options: RecorderOptions = { fps: 12 }
  ): Promise<void> {
    if (this.isRecording) {
      throw new Error('Already recording');
    }

    if (!this.isLoaded) {
      throw new Error('FFmpeg not loaded');
    }

    this.canvas = canvas;
    this.options = options;
    this.frames = [];
    this.frameCount = 0;
    this.audioChunks = [];
    this.isRecording = true;

    // Start capturing audio if available
    if (audioStream) {
      try {
        this.audioStream = audioStream;
        // Use WebM for audio capture as it's widely supported
        const mimeType = MediaRecorder.isTypeSupported('audio/webm; codecs=opus')
          ? 'audio/webm; codecs=opus'
          : 'audio/webm';
        
        this.mediaRecorder = new MediaRecorder(audioStream, { mimeType });
        
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };

        this.mediaRecorder.start(100); // Collect data every 100ms
        console.log('Audio recording started');
      } catch (error) {
        console.warn('Failed to start audio recording:', error);
        // Continue without audio
      }
    }

    // Start capturing frames
    const frameIntervalMs = 1000 / options.fps;
    this.frameInterval = window.setInterval(() => {
      this.captureFrame();
    }, frameIntervalMs);

    console.log('FFmpeg recording started');
  }

  // Capture a single frame from canvas
  private captureFrame(): void {
    if (!this.canvas || !this.isRecording) return;

    this.canvas.toBlob((blob) => {
      if (blob) {
        this.frames.push(blob);
        this.frameCount++;
      }
    }, 'image/jpeg', 0.9);
  }

  // Stop recording and encode video
  async stopRecording(): Promise<Blob> {
    if (!this.isRecording) {
      throw new Error('Not recording');
    }

    this.isRecording = false;

    // Stop frame capture
    if (this.frameInterval !== null) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }

    // Stop audio recording
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      
      // Wait for final audio chunks
      await new Promise<void>((resolve) => {
        if (this.mediaRecorder) {
          this.mediaRecorder.onstop = () => resolve();
        } else {
          resolve();
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 200)); // Buffer flush time
    }

    console.log(`Captured ${this.frameCount} frames and ${this.audioChunks.length} audio chunks`);

    // Encode video using FFmpeg
    try {
      return await this.encodeVideo();
    } catch (error) {
      console.error('Failed to encode video:', error);
      throw error;
    } finally {
      // Cleanup
      this.cleanup();
    }
  }

  // Encode video using FFmpeg
  private async encodeVideo(): Promise<Blob> {
    if (this.frames.length === 0) {
      throw new Error('No frames captured');
    }

    const hasAudio = this.audioChunks.length > 0;

    // Write frames to FFmpeg filesystem
    for (let i = 0; i < this.frames.length; i++) {
      const frameData = await fetchFile(this.frames[i]);
      await this.ffmpeg.writeFile(`frame${i.toString().padStart(5, '0')}.jpg`, frameData);
    }

    // Write audio to FFmpeg filesystem if available
    let audioFile = '';
    if (hasAudio) {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const audioData = await fetchFile(audioBlob);
      audioFile = 'audio.webm';
      await this.ffmpeg.writeFile(audioFile, audioData);
    }

    // Build FFmpeg command
    const fps = this.options.fps;
    const videoBitrate = this.options.videoBitrate || '2500k';
    const audioBitrate = this.options.audioBitrate || '128k';

    const args = [
      '-framerate', fps.toString(),
      '-pattern_type', 'glob',
      '-i', 'frame*.jpg',
    ];

    if (hasAudio) {
      args.push('-i', audioFile);
    }

    args.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-b:v', videoBitrate,
    );

    if (hasAudio) {
      args.push(
        '-c:a', 'aac',
        '-b:a', audioBitrate,
        '-shortest', // End when shortest stream ends
      );
    }

    args.push('output.mp4');

    console.log('FFmpeg command:', args.join(' '));

    // Execute FFmpeg
    await this.ffmpeg.exec(args);

    // Read output file
    const data = await this.ffmpeg.readFile('output.mp4');
    const blob = new Blob([data], { type: 'video/mp4' });

    console.log('Video encoded successfully, size:', blob.size);

    // Cleanup FFmpeg filesystem
    await this.cleanupFFmpegFiles();

    return blob;
  }

  // Cleanup FFmpeg filesystem
  private async cleanupFFmpegFiles(): Promise<void> {
    try {
      // Delete frame files
      for (let i = 0; i < this.frameCount; i++) {
        try {
          await this.ffmpeg.deleteFile(`frame${i.toString().padStart(5, '0')}.jpg`);
        } catch (e) {
          // Ignore errors
        }
      }

      // Delete audio file
      try {
        await this.ffmpeg.deleteFile('audio.webm');
      } catch (e) {
        // Ignore errors
      }

      // Delete output file
      try {
        await this.ffmpeg.deleteFile('output.mp4');
      } catch (e) {
        // Ignore errors
      }
    } catch (error) {
      console.warn('Error cleaning up FFmpeg files:', error);
    }
  }

  // Cleanup recording state
  private cleanup(): void {
    this.frames = [];
    this.frameCount = 0;
    this.audioChunks = [];
    this.canvas = null;
    
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
    
    this.mediaRecorder = null;
  }

  // Cancel recording without encoding
  async cancelRecording(): Promise<void> {
    if (!this.isRecording) return;

    this.isRecording = false;

    if (this.frameInterval !== null) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }

    this.cleanup();
    console.log('Recording cancelled');
  }
}

export default FFmpegRecorder;
