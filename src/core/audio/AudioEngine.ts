import { MusicAnalyzer, type TrackAnalysis } from './MusicAnalyzer';

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private analyzer: AnalyserNode | null = null;
  private buffer: AudioBuffer | null = null;
  private isPlaying = false;
  private startTime = 0;
  private pausedTime = 0;

  private onTimeUpdate: (time: number) => void;
  private animationFrameId = 0;
  public trackAnalysis: TrackAnalysis | null = null;

  constructor(onTimeUpdate: (time: number) => void) {
    this.onTimeUpdate = onTimeUpdate;
  }

  public async loadAudio(file: File): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const arrayBuffer = await file.arrayBuffer();
    this.buffer = await this.audioContext.decodeAudioData(arrayBuffer);
    
    // Analyze offline
    this.trackAnalysis = await MusicAnalyzer.analyze(this.buffer);
    
    if (this.analyzer) this.analyzer.disconnect();
    this.analyzer = this.audioContext.createAnalyser();
    this.analyzer.fftSize = 256;
    this.analyzer.connect(this.audioContext.destination);

    this.pausedTime = 0;
  }

  private streamSource: MediaStreamAudioSourceNode | null = null;

  public async loadStream(stream: MediaStream): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    if (this.analyzer) this.analyzer.disconnect();
    this.analyzer = this.audioContext.createAnalyser();
    this.analyzer.fftSize = 256;
    
    this.streamSource = this.audioContext.createMediaStreamSource(stream);
    this.streamSource.connect(this.analyzer);

    this.isPlaying = true;
    this.loop();
  }

  public play() {
    if (!this.audioContext || (!this.buffer && !this.streamSource) || this.isPlaying) return;

    if (this.buffer) {
      this.source = this.audioContext.createBufferSource();
      this.source.buffer = this.buffer;
      
      if (this.analyzer) {
        this.source.connect(this.analyzer);
      } else {
        this.source.connect(this.audioContext.destination);
      }
      
      if (this.exportDestination) {
        this.source.connect(this.exportDestination);
      }
      
      this.source.start(0, this.pausedTime);
      this.startTime = this.audioContext.currentTime - this.pausedTime;
    }

    this.isPlaying = true;
    this.loop();
  }

  private exportDestination: MediaStreamAudioDestinationNode | null = null;
  
  public getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  public setExportDestination(dest: MediaStreamAudioDestinationNode) {
    this.exportDestination = dest;
    if (this.source) {
      this.source.connect(dest);
    }
    if (this.streamSource) {
      this.streamSource.connect(dest);
    }
  }

  public pause() {
    if (!this.isPlaying || !this.audioContext) return;
    
    if (this.source) {
      this.source.stop();
      this.source.disconnect();
      this.source = null;
    }
    // For streams, we just let it keep capturing but stop our animation loop
    
    this.pausedTime = this.audioContext.currentTime - this.startTime;
    this.isPlaying = false;
    cancelAnimationFrame(this.animationFrameId);
  }

  public seek(time: number) {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();
    this.pausedTime = time;
    if (wasPlaying) this.play();
    this.onTimeUpdate(time);
  }

  public getAnalyzerData(dataArray: Uint8Array) {
    if (this.analyzer) {
      this.analyzer.getByteFrequencyData(dataArray as any);
    }
  }

  public getDuration(): number {
    return this.buffer ? this.buffer.duration : 0;
  }

  public getCurrentTime(): number {
    if (!this.audioContext) return 0;
    return this.isPlaying ? this.audioContext.currentTime - this.startTime : this.pausedTime;
  }

  private loop = () => {
    if (this.isPlaying) {
      this.onTimeUpdate(this.getCurrentTime());
      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  }

  public getBuffer(): AudioBuffer | null {
    return this.buffer;
  }
}
