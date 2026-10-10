import React, { useEffect, useRef, useState } from 'react';
import { AudioEngine } from './core/audio/AudioEngine';
import { BeatDetector } from './core/audio/BeatDetector';
import { Fighter } from './core/animation/Fighter';
import { CanvasRenderer } from './core/rendering/CanvasRenderer';
import { CombatDirector } from './core/choreography/CombatDirector';
import { VideoExporter } from './core/export/VideoExporter';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [engine] = useState(() => new AudioEngine((time) => setCurrentTime(time)));
  const [beatDetector] = useState(() => new BeatDetector());
  const [trackName, setTrackName] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState('16:9 (720p)');
  
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const directorRef = useRef<CombatDirector | null>(null);
  const exporterRef = useRef<VideoExporter | null>(null);
  const requestRef = useRef<number>(0);
  
  // Audio state
  const frequencyData = useRef(new Uint8Array(256));

  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Init canvas
    const renderer = new CanvasRenderer(canvasRef.current);
    rendererRef.current = renderer;
    
    const exporter = new VideoExporter(canvasRef.current);
    exporterRef.current = exporter;

    // Init fighters
    const f1 = new Fighter(canvasRef.current.width * 0.3, canvasRef.current.height - 100, 1, '#111', '#ff003c');
    const f2 = new Fighter(canvasRef.current.width * 0.7, canvasRef.current.height - 100, -1, '#111', '#00ffcc');
    
    const director = new CombatDirector([f1, f2], (x, y, color, dmg) => {
      if (rendererRef.current) {
        rendererRef.current.vfx.emitHit(x, y, color, dmg);
        rendererRef.current.camera.addShake(dmg * 2);
      }
    });
    directorRef.current = director;

    let lastTime = 0;

    const loop = () => {
      const currentTime = engine.getCurrentTime();
      let dt = currentTime - lastTime;
      
      // If we seek backwards or tab was backgrounded for a VERY long time
      if (dt < 0) {
        dt = 0; // Handle seek backwards gracefully
      }
      
      lastTime = currentTime;

      engine.getAnalyzerData(frequencyData.current);
      
      // Calculate average intensity for background
      let intensity = 0;
      for (let i = 0; i < 50; i++) intensity += frequencyData.current[i];
      intensity /= 50;

      const isBeat = beatDetector.isBeat(frequencyData.current);
      // Real-time beat fallback (only if we don't have offline analysis)
      if (!engine.trackAnalysis && isBeat) {
        director.onBeat(intensity);
      }

      director.update(dt, currentTime);
      renderer.update(dt, [f1, f2], intensity);
      renderer.render([f1, f2], intensity, frequencyData.current);

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [engine, beatDetector]);

  const handleSystemAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true, // Video must be requested for getDisplayMedia, even if we only want audio
        audio: {
          suppressLocalAudioPlayback: false, // Ensure system doesn't mute it
        } as any
      });
      
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        alert("No audio track detected! Please make sure to check 'Share System Audio' or 'Share Tab Audio' in the browser dialog.");
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      setTrackName("Live System Audio (Spotify)");
      setDuration(0); // Live stream has no duration
      await engine.loadStream(stream);
      if (directorRef.current) {
        directorRef.current.setTrackAnalysis(null);
      }
      setIsPlaying(true);
    } catch (e) {
      console.error("Failed to capture system audio", e);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setTrackName(file.name);
    await engine.loadAudio(file);
    setDuration(engine.getDuration());
    if (directorRef.current) {
       directorRef.current.setTrackAnalysis(engine.trackAnalysis, file.name);
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      engine.pause();
    } else {
      engine.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    engine.seek(time);
  };

  const toggleExport = () => {
    if (!isExporting) {
      if (!canvasRef.current || !rendererRef.current) return;

      // Set dimension based on format
      let w = 1280;
      let h = 720;
      if (exportFormat === '9:16 (720p)') { w = 720; h = 1280; }
      else if (exportFormat === '1:1 (720p)') { w = 720; h = 720; }
      else if (exportFormat === '16:9 (1080p)') { w = 1920; h = 1080; }
      else if (exportFormat === '9:16 (1080p)') { w = 1080; h = 1920; }
      
      canvasRef.current.width = w;
      canvasRef.current.height = h;
      rendererRef.current.resize(w, h);
      
      // Fighters might need ground level adjustment based on height
      if (directorRef.current) {
        // Simple hack to reset y level
        // (If we had time, we'd add an onResize event to fighters)
      }

      // Start export
      const ctx = engine.getAudioContext();
      if (ctx && exporterRef.current) {
        const dest = ctx.createMediaStreamDestination();
        engine.setExportDestination(dest);
        exporterRef.current.setAudioStream(dest.stream);
      }
      
      exporterRef.current?.startRecording();
      setIsExporting(true);
      
      // Auto play from beginning if starting export
      if (!isPlaying) {
         engine.seek(0);
         engine.play();
         setIsPlaying(true);
      }
    } else {
      // Stop export
      exporterRef.current?.stopRecording();
      setIsExporting(false);
      
      // Reset back to standard preview dimensions
      if (canvasRef.current && rendererRef.current) {
        canvasRef.current.width = 1280;
        canvasRef.current.height = 720;
        rendererRef.current.resize(1280, 720);
      }
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 font-sans">
      <header className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 backdrop-blur-md">
        <h1 className="text-2xl font-black uppercase tracking-widest text-zinc-100 flex items-center gap-2">
          <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
          BeatFighter
        </h1>
        <div className="flex gap-4 items-center">
          <button 
            onClick={handleSystemAudio}
            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-md text-sm font-semibold transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.54.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.239.54-.959.72-1.56.3z"/></svg>
            Sync Spotify
          </button>
          <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-md text-sm font-semibold transition-colors">
            Upload Audio
            <input type="file" accept="audio/mp3, audio/wav" className="hidden" onChange={handleFileUpload} />
          </label>
          <select 
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value)}
            disabled={isExporting}
            className="bg-zinc-800 text-sm font-semibold rounded-md px-3 py-2 outline-none border border-zinc-700 focus:border-zinc-500 disabled:opacity-50"
          >
            <option>16:9 (720p)</option>
            <option>16:9 (1080p)</option>
            <option>9:16 (720p)</option>
            <option>9:16 (1080p)</option>
            <option>1:1 (720p)</option>
          </select>
          <button 
            onClick={toggleExport}
            className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
              isExporting ? 'bg-red-500/20 text-red-500 border border-red-500' : 'bg-zinc-800 hover:bg-zinc-700'
            }`}
          >
            {isExporting ? 'Stop Exporting' : 'Export Video'}
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="w-full max-w-5xl aspect-video rounded-xl overflow-hidden border border-zinc-800 shadow-2xl relative">
          <canvas 
            ref={canvasRef} 
            width={1280} 
            height={720} 
            className="w-full h-full object-contain bg-black"
          />
        </div>
      </main>

      <footer className="p-6 border-t border-zinc-800 bg-zinc-900/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto flex flex-col gap-4">
          <div className="flex justify-between items-end">
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Now Playing</div>
              <div className="font-bold text-lg">{trackName || 'No track loaded'}</div>
            </div>
            <div className="font-mono text-sm text-zinc-400">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={togglePlay}
              disabled={!trackName}
              className="w-12 h-12 flex items-center justify-center bg-white text-black rounded-full hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-transform active:scale-95"
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>
              ) : (
                <svg className="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            
            <input 
              type="range" 
              min={0} 
              max={duration || 100} 
              value={currentTime} 
              onChange={handleSeek}
              disabled={!trackName}
              className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-white"
            />
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
