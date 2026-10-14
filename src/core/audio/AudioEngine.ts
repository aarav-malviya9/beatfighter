import { MusicAnalyzer, type TrackAnalysis } from './MusicAnalyzer';

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private analyzer: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private buffer: AudioBuffer | null = null;
  private isPlaying = false;
  private startTime = 0;
  private pausedTime = 0;

  private onTimeUpdate: (time: number) => void;
  private onEndedCallback?: () => void;
  private onErrorCallback?: (err: Error) => void;
  private animationFrameId = 0;
  public trackAnalysis: TrackAnalysis | null = null;

  private streamSource: MediaStreamAudioSourceNode | null = null;
  private activeMediaStream: MediaStream | null = null;
  private exportDestination: MediaStreamAudioDestinationNode | null = null;

  constructor(
    onTimeUpdate: (time: number) => void,
    onEnded?: () => void,
    onError?: (err: Error) => void,
  ) {
    this.onTimeUpdate = onTimeUpdate;
    this.onEndedCallback = onEnded;
    this.onErrorCallback = onError;
  }

  private ensureContext(): AudioContext {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtx();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    if (!this.masterGain && this.audioContext) {
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 1.0;
      this.masterGain.connect(this.audioContext.destination);
    }
    return this.audioContext;
  }

  public async loadAudio(file: File): Promise<void> {
    try {
      // 1. Stop and disconnect any existing playback
      this.stopCurrentPlayback();
      const ctx = this.ensureContext();

      const arrayBuffer = await file.arrayBuffer();
      this.buffer = await ctx.decodeAudioData(arrayBuffer);

      // Offline analysis
      this.trackAnalysis = await MusicAnalyzer.analyze(this.buffer);

      // Setup analyzer node
      if (this.analyzer) {
        this.analyzer.disconnect();
      }
      this.analyzer = ctx.createAnalyser();
      this.analyzer.fftSize = 256;
      this.analyzer.connect(this.masterGain || ctx.destination);

      this.pausedTime = 0;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('AudioEngine.loadAudio error:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      }
      throw error;
    }
  }

  public async loadStream(stream: MediaStream): Promise<void> {
    try {
      this.stopCurrentPlayback();
      const ctx = this.ensureContext();

      this.activeMediaStream = stream;

      if (this.analyzer) {
        this.analyzer.disconnect();
      }
      this.analyzer = ctx.createAnalyser();
      this.analyzer.fftSize = 256;

      this.streamSource = ctx.createMediaStreamSource(stream);
      this.streamSource.connect(this.analyzer);
      this.analyzer.connect(this.masterGain || ctx.destination);

      if (this.exportDestination && this.masterGain) {
        this.masterGain.connect(this.exportDestination);
      }

      this.buffer = null;
      this.trackAnalysis = null;
      this.pausedTime = 0;
      this.isPlaying = true;
      this.startTime = ctx.currentTime;
      this.loop();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('AudioEngine.loadStream error:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      }
      throw error;
    }
  }

  public play(): void {
    if (!this.audioContext || (!this.buffer && !this.streamSource) || this.isPlaying) return;
    const ctx = this.ensureContext();

    if (this.buffer) {
      // Disconnect existing source if any
      if (this.source) {
        try { this.source.stop(); } catch { /* ignore */ }
        this.source.disconnect();
        this.source = null;
      }

      this.source = ctx.createBufferSource();
      this.source.buffer = this.buffer;

      // Handle track end event
      this.source.onended = () => {
        if (this.isPlaying) {
          this.isPlaying = false;
          this.pausedTime = this.buffer ? this.buffer.duration : 0;
          this.onTimeUpdate(this.pausedTime);
          cancelAnimationFrame(this.animationFrameId);
          if (this.onEndedCallback) {
            this.onEndedCallback();
          }
        }
      };

      if (this.analyzer) {
        this.source.connect(this.analyzer);
      } else if (this.masterGain) {
        this.source.connect(this.masterGain);
      } else {
        this.source.connect(ctx.destination);
      }

      const offset = Math.min(this.pausedTime, this.buffer.duration);
      this.source.start(0, offset);
      this.startTime = ctx.currentTime - offset;
    }

    this.isPlaying = true;
    this.loop();
  }

  public pause(): void {
    if (!this.isPlaying || !this.audioContext) return;

    if (this.source) {
      try { this.source.stop(); } catch { /* ignore */ }
      this.source.disconnect();
      this.source = null;
    }

    if (this.buffer) {
      this.pausedTime = Math.min(
        this.audioContext.currentTime - this.startTime,
        this.buffer.duration,
      );
    } else {
      this.pausedTime = this.audioContext.currentTime - this.startTime;
    }

    this.isPlaying = false;
    cancelAnimationFrame(this.animationFrameId);
  }

  public stop(): void {
    this.pause();
    this.pausedTime = 0;
    this.onTimeUpdate(0);
  }

  public seek(time: number): void {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) {
      this.pause();
    }
    const maxDur = this.getDuration();
    this.pausedTime = Math.max(0, maxDur > 0 ? Math.min(time, maxDur) : time);
    if (wasPlaying) {
      this.play();
    }
    this.onTimeUpdate(this.pausedTime);
  }

  public getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  public getMasterOutputNode(): AudioNode | null {
    return this.masterGain;
  }

  public setExportDestination(dest: MediaStreamAudioDestinationNode | null): void {
    if (this.exportDestination && this.masterGain) {
      try { this.masterGain.disconnect(this.exportDestination); } catch { /* ignore */ }
    }
    this.exportDestination = dest;
    if (this.masterGain && dest) {
      this.masterGain.connect(dest);
    }
  }

  public getAnalyzerData(dataArray: Uint8Array): void {
    if (this.analyzer) {
      this.analyzer.getByteFrequencyData(dataArray as unknown as Uint8Array<ArrayBuffer>);
    }
  }

  public getDuration(): number {
    return this.buffer ? this.buffer.duration : 0;
  }

  public getCurrentTime(): number {
    if (!this.audioContext) return 0;
    if (this.isPlaying) {
      const elapsed = this.audioContext.currentTime - this.startTime;
      if (this.buffer && elapsed >= this.buffer.duration) {
        return this.buffer.duration;
      }
      return elapsed;
    }
    return this.pausedTime;
  }

  public getBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  public isTrackPlaying(): boolean {
    return this.isPlaying;
  }

  private stopCurrentPlayback(): void {
    this.pause();

    if (this.activeMediaStream) {
      this.activeMediaStream.getTracks().forEach((track) => track.stop());
      this.activeMediaStream = null;
    }

    if (this.streamSource) {
      this.streamSource.disconnect();
      this.streamSource = null;
    }

    this.buffer = null;
    this.trackAnalysis = null;
    this.pausedTime = 0;
  }

  private loop = (): void => {
    if (this.isPlaying) {
      this.onTimeUpdate(this.getCurrentTime());
      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  };
}
