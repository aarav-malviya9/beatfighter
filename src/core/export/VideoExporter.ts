export class VideoExporter {
  private canvas: HTMLCanvasElement;
  private audioStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private chosenMimeType: string = 'video/webm';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  public setAudioStream(stream: MediaStream) {
    this.audioStream = stream;
  }

  public startRecording() {
    this.chunks = [];
    const canvasStream = this.canvas.captureStream(60); // 60fps

    let combinedStream = canvasStream;
    if (this.audioStream) {
      const audioTracks = this.audioStream.getAudioTracks();
      if (audioTracks.length > 0) {
        combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...audioTracks,
        ]);
      }
    }

    const candidateTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4',
    ];

    let selectedType = '';
    if (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function') {
      for (const t of candidateTypes) {
        if (MediaRecorder.isTypeSupported(t)) {
          selectedType = t;
          break;
        }
      }
    }

    try {
      if (selectedType) {
        this.chosenMimeType = selectedType;
        this.recorder = new MediaRecorder(combinedStream, {
          mimeType: selectedType,
          videoBitsPerSecond: 8000000,
        });
      } else {
        this.recorder = new MediaRecorder(combinedStream);
        this.chosenMimeType = this.recorder.mimeType || 'video/webm';
      }
    } catch (e) {
      console.warn('Selected mime type recording failed, falling back to default MediaRecorder', e);
      try {
        this.recorder = new MediaRecorder(combinedStream);
        this.chosenMimeType = this.recorder.mimeType || 'video/webm';
      } catch (e2) {
        console.error('Fatal: MediaRecorder could not be created', e2);
        return;
      }
    }

    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.recorder.onstop = () => {
      this.downloadVideo();
    };

    this.recorder.start(250); // Emit chunks every 250ms
  }

  public stopRecording() {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
  }

  private downloadVideo() {
    if (this.chunks.length === 0) return;

    const mime = this.chosenMimeType || this.recorder?.mimeType || 'video/webm';
    const isMp4 = mime.includes('mp4');
    const ext = isMp4 ? 'mp4' : 'webm';

    const blob = new Blob(this.chunks, { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `beatfighter-${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 150);
  }
}
