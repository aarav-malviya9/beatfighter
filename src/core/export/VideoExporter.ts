export class VideoExporter {
  private canvas: HTMLCanvasElement;
  private audioStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

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
           ...audioTracks
         ]);
       }
    }

    try {
      this.recorder = new MediaRecorder(combinedStream, {
        mimeType: 'video/webm;codecs=vp9,opus'
      });
    } catch (e) {
      console.warn("VP9/Opus failed, trying default webm", e);
      try {
        this.recorder = new MediaRecorder(combinedStream, {
          mimeType: 'video/webm'
        });
      } catch (e2) {
         console.warn("Webm failed, trying mp4", e2);
         this.recorder = new MediaRecorder(combinedStream);
      }
    }

    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };

    this.recorder.onstop = () => {
      this.downloadVideo();
    };

    this.recorder.start();
  }

  public stopRecording() {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
  }

  private downloadVideo() {
    const blob = new Blob(this.chunks, { type: this.recorder?.mimeType || 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `beatfighter-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }
}
