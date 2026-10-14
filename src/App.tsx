import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AudioEngine } from './core/audio/AudioEngine';
import { BeatDetector } from './core/audio/BeatDetector';
import { Fighter, type WeaponType, type HeadgearType } from './core/animation/Fighter';
import { CanvasRenderer } from './core/rendering/CanvasRenderer';
import { CombatDirector } from './core/choreography/CombatDirector';
import { VideoExporter } from './core/export/VideoExporter';
import { SoundFX } from './core/audio/SoundFX';
import { SimulationClock } from './core/rendering/SimulationClock';
import type { ArenaType } from './core/rendering/ArenaSystem';

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [engine] = useState(() => new AudioEngine((time) => setCurrentTime(time)));
  const [beatDetector] = useState(() => new BeatDetector());
  const [trackName, setTrackName] = useState<string>('Shadow Ninja Showdown (Built-in Battle Beat)');
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState('16:9 (720p)');

  // Sound & Battle Music State
  const [isBattleMusicOn, setIsBattleMusicOn] = useState(true);
  const [isSoundMuted, setIsSoundMuted] = useState(false);

  // Arena & Ninja Gear Customization
  const [arena, setArena] = useState<ArenaType>('celestial_temple');
  const [p1Weapon, setP1Weapon] = useState<WeaponType>('katana');
  const [p1Hat, setP1Hat] = useState<HeadgearType>('straw_hat');
  const [p2Weapon, setP2Weapon] = useState<WeaponType>('scythe');
  const [p2Hat, setP2Hat] = useState<HeadgearType>('ninja_headband');

  // Control Mode: Auto Movie vs Interactive Player 1
  const [isPlayerMode, setIsPlayerMode] = useState(false);

  const rendererRef = useRef<CanvasRenderer | null>(null);
  const directorRef = useRef<CombatDirector | null>(null);
  const exporterRef = useRef<VideoExporter | null>(null);
  const requestRef = useRef<number>(0);
  const fightersRef = useRef<[Fighter, Fighter] | null>(null);

  // Audio frequency buffer
  const frequencyData = useRef(new Uint8Array(256));

  useEffect(() => {
    if (!canvasRef.current) return;

    // Init renderer
    const renderer = new CanvasRenderer(canvasRef.current);
    renderer.setArena(arena);
    rendererRef.current = renderer;

    const exporter = new VideoExporter(canvasRef.current);
    exporterRef.current = exporter;

    // Init fighters with high-budget Ninja Gear
    const groundLevel = canvasRef.current.height - 100;
    const f1 = new Fighter(canvasRef.current.width * 0.32, groundLevel, 1, '#08080f', '#ff1a4a');
    f1.setStyle('crimson');
    f1.weapon = p1Weapon;
    f1.headgear = p1Hat;

    const f2 = new Fighter(canvasRef.current.width * 0.68, groundLevel, -1, '#060a14', '#00e5ff');
    f2.setStyle('celestial');
    f2.weapon = p2Weapon;
    f2.headgear = p2Hat;

    fightersRef.current = [f1, f2];

    const director = new CombatDirector(
      [f1, f2],
      (x, y, color, dmg) => {
        if (rendererRef.current) {
          rendererRef.current.vfx.emitHit(x, y, color, dmg);
          rendererRef.current.camera.addShake(dmg * 2.2);
        }
      },
      renderer.camera,
      renderer,
    );
    directorRef.current = director;

    // Start built-in procedural battle music on first interaction
    const sound = SoundFX.getInstance();
    if (isBattleMusicOn) {
      sound.startBattleMusic();
    }

    let lastPerfTime = performance.now();

    const loop = (timestamp: number) => {
      let dt = (timestamp - lastPerfTime) / 1000;
      if (dt > 0.06 || dt <= 0) dt = 0.016; // Smooth clamp so simulation never freezes
      lastPerfTime = timestamp;

      // Shared simulation clock: handles hit-stop freezes and global slow-motion
      const clock = SimulationClock.getInstance();
      const { simDt, rawDt } = clock.update(dt);

      // Update frequency analysis
      if (engine.getCurrentTime() > 0 && engine.getBuffer()) {
        engine.getAnalyzerData(frequencyData.current);
      } else {
        sound.getAnalyzerData(frequencyData.current);
      }

      // Calculate audio intensity
      let intensity = 0;
      for (let i = 0; i < 40; i++) intensity += frequencyData.current[i];
      intensity /= 40;

      // Real-time beat trigger
      const isBeat = beatDetector.isBeat(frequencyData.current);
      if (!engine.trackAnalysis && isBeat) {
        director.onBeat(intensity);
      }

      // Independent continuous physics & choreography update:
      // simDt drives fighter animation and combat (freezes on hit-stop, scales with slow-mo)
      // rawDt drives camera shake and screen effects
      const curTime = engine.getCurrentTime();
      director.update(simDt, curTime);
      renderer.update(rawDt, [f1, f2], intensity);
      renderer.render([f1, f2], intensity, frequencyData.current);

      requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      sound.stopBattleMusic();
    };
  }, []);

  // Update gear dynamically when state changes
  useEffect(() => {
    if (fightersRef.current) {
      fightersRef.current[0].weapon = p1Weapon;
      fightersRef.current[0].headgear = p1Hat;
      fightersRef.current[1].weapon = p2Weapon;
      fightersRef.current[1].headgear = p2Hat;
    }
  }, [p1Weapon, p1Hat, p2Weapon, p2Hat]);

  // Update arena dynamically
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setArena(arena);
    }
  }, [arena]);

  // Update player control mode
  useEffect(() => {
    if (directorRef.current) {
      directorRef.current.isPlayerControlled = isPlayerMode;
    }
  }, [isPlayerMode]);

  // Keyboard controls for Player 1
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle fullscreen on F
      if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement && canvasRef.current) {
          canvasRef.current.requestFullscreen?.();
        } else if (document.fullscreenElement) {
          document.exitFullscreen?.();
        }
      }

      if (!directorRef.current) return;
      const key = e.key.toLowerCase();

      // Controls work both in player mode and as immediate triggers
      if (key === 'a' || e.key === 'ArrowLeft') {
        directorRef.current.handlePlayerInput('left');
      } else if (key === 'd' || e.key === 'ArrowRight') {
        directorRef.current.handlePlayerInput('right');
      } else if (key === 'w' || e.key === 'ArrowUp') {
        directorRef.current.handlePlayerInput('jump');
      } else if (key === 's' || e.key === 'ArrowDown') {
        directorRef.current.handlePlayerInput('duck');
      } else if (key === 'j') {
        directorRef.current.handlePlayerInput('light');
      } else if (key === 'k') {
        directorRef.current.handlePlayerInput('heavy');
      } else if (key === 'l') {
        directorRef.current.handlePlayerInput('special');
      } else if (key === ' ') {
        e.preventDefault();
        directorRef.current.handlePlayerInput('dodge');
      } else if (key === 't') {
        directorRef.current.handlePlayerInput('throw');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handlePlayerAction = useCallback((act: 'left' | 'right' | 'light' | 'heavy' | 'special' | 'dodge' | 'jump' | 'throw') => {
    if (directorRef.current) {
      directorRef.current.handlePlayerInput(act);
    }
  }, []);

  const toggleBattleMusic = () => {
    const sound = SoundFX.getInstance();
    const active = sound.toggleBattleMusic();
    setIsBattleMusicOn(active);
  };

  const toggleSoundMute = () => {
    const sound = SoundFX.getInstance();
    const muted = sound.toggleMute();
    setIsSoundMuted(muted);
  };

  const handleSystemAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: { suppressLocalAudioPlayback: false } as any,
      });

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        alert("No audio track detected! Please check 'Share System Audio' in the browser dialog.");
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      setTrackName('Live System Audio (Spotify)');
      setDuration(0);
      SoundFX.getInstance().stopBattleMusic();
      setIsBattleMusicOn(false);

      await engine.loadStream(stream);
      if (directorRef.current) {
        directorRef.current.setTrackAnalysis(null);
      }
      setIsPlaying(true);
    } catch (e) {
      console.error('Failed to capture system audio', e);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setTrackName(file.name);
    SoundFX.getInstance().stopBattleMusic();
    setIsBattleMusicOn(false);

    await engine.loadAudio(file);
    setDuration(engine.getDuration());
    if (directorRef.current) {
      directorRef.current.setTrackAnalysis(engine.trackAnalysis, file.name);
    }
    engine.play();
    setIsPlaying(true);
  };

  const togglePlay = () => {
    if (isPlaying) {
      engine.pause();
      SoundFX.getInstance().stopBattleMusic();
      setIsBattleMusicOn(false);
    } else {
      if (engine.getBuffer()) {
        engine.play();
      } else {
        SoundFX.getInstance().startBattleMusic();
        setIsBattleMusicOn(true);
      }
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

      let w = 1280;
      let h = 720;
      if (exportFormat === '9:16 (720p)') { w = 720; h = 1280; }
      else if (exportFormat === '1:1 (720p)') { w = 720; h = 720; }
      else if (exportFormat === '16:9 (1080p)') { w = 1920; h = 1080; }
      else if (exportFormat === '9:16 (1080p)') { w = 1080; h = 1920; }

      canvasRef.current.width = w;
      canvasRef.current.height = h;
      rendererRef.current.resize(w, h);

      const ctx = engine.getAudioContext() || SoundFX.getInstance().init();
      if (ctx && exporterRef.current) {
        const dest = ctx.createMediaStreamDestination();
        engine.setExportDestination(dest);
        SoundFX.getInstance().setExportDestination(dest);
        exporterRef.current.setAudioStream(dest.stream);
      }

      exporterRef.current?.startRecording();
      setIsExporting(true);

      if (!isPlaying) {
        engine.seek(0);
        engine.play();
        setIsPlaying(true);
      }
    } else {
      exporterRef.current?.stopRecording();
      setIsExporting(false);
      engine.setExportDestination(null);
      SoundFX.getInstance().setExportDestination(null);

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
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 font-sans select-none overflow-hidden">
      {/* Top Header & Customization Bar */}
      <header className="px-4 py-2.5 border-b border-zinc-800 flex flex-wrap justify-between items-center bg-zinc-900/80 backdrop-blur-md gap-3 z-20">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black uppercase tracking-widest text-zinc-100 flex items-center gap-2">
            <span className="w-3 h-3 bg-red-600 rounded-full animate-ping"></span>
            BeatFighter <span className="text-xs px-2 py-0.5 bg-red-600/30 text-red-400 border border-red-500/40 rounded">SHADOW SHINOBI</span>
          </h1>

          {/* Mode Switch: Cinema vs Play */}
          <button
            onClick={() => setIsPlayerMode(!isPlayerMode)}
            className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              isPlayerMode
                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30 scale-105'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
            }`}
          >
            {isPlayerMode ? '🎮 Playing as P1' : '🎬 Cinema Mode'}
          </button>
        </div>

        {/* Gear & Arena Customization Selectors */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Arena */}
          <div className="flex items-center bg-zinc-800/80 rounded-md px-2 py-1 border border-zinc-700">
            <span className="text-zinc-400 mr-1.5">Arena:</span>
            <select
              value={arena}
              onChange={(e) => setArena(e.target.value as ArenaType)}
              className="bg-transparent text-zinc-200 outline-none cursor-pointer font-semibold"
            >
              <option value="celestial_temple">Celestial Temple</option>
              <option value="moonlit">Moonlit Forest</option>
              <option value="fractured">Fractured Void</option>
              <option value="cosmic">Cosmic Abyss</option>
            </select>
          </div>

          {/* P1 Weapon */}
          <div className="flex items-center bg-zinc-800/80 rounded-md px-2 py-1 border border-red-900/50">
            <span className="text-red-400 font-bold mr-1.5">P1:</span>
            <select
              value={p1Weapon}
              onChange={(e) => setP1Weapon(e.target.value as WeaponType)}
              className="bg-transparent text-zinc-200 outline-none cursor-pointer font-semibold mr-2"
            >
              <option value="katana">Katana</option>
              <option value="dual_blades">Dual Blades</option>
              <option value="scythe">Scythe</option>
              <option value="fists">Fists</option>
            </select>
            <select
              value={p1Hat}
              onChange={(e) => setP1Hat(e.target.value as HeadgearType)}
              className="bg-transparent text-zinc-300 outline-none cursor-pointer text-[11px]"
            >
              <option value="straw_hat">Straw Hat</option>
              <option value="ninja_headband">Headband</option>
              <option value="demon_mask">Demon Mask</option>
              <option value="none">No Hat</option>
            </select>
          </div>

          {/* P2 Weapon */}
          <div className="flex items-center bg-zinc-800/80 rounded-md px-2 py-1 border border-cyan-900/50">
            <span className="text-cyan-400 font-bold mr-1.5">P2:</span>
            <select
              value={p2Weapon}
              onChange={(e) => setP2Weapon(e.target.value as WeaponType)}
              className="bg-transparent text-zinc-200 outline-none cursor-pointer font-semibold mr-2"
            >
              <option value="scythe">Scythe</option>
              <option value="katana">Katana</option>
              <option value="dual_blades">Dual Blades</option>
              <option value="fists">Fists</option>
            </select>
            <select
              value={p2Hat}
              onChange={(e) => setP2Hat(e.target.value as HeadgearType)}
              className="bg-transparent text-zinc-300 outline-none cursor-pointer text-[11px]"
            >
              <option value="ninja_headband">Headband</option>
              <option value="straw_hat">Straw Hat</option>
              <option value="demon_mask">Demon Mask</option>
              <option value="none">No Hat</option>
            </select>
          </div>
        </div>

        {/* Audio & Export Actions */}
        <div className="flex items-center gap-2">
          {/* Battle Beat Toggle */}
          <button
            onClick={toggleBattleMusic}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
              isBattleMusicOn
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
            title="Toggle Built-in Anime Battle Beat Soundtrack"
          >
            <span>🥁</span>
            {isBattleMusicOn ? 'Battle Beat ON' : 'Battle Beat OFF'}
          </button>

          {/* Sound Mute */}
          <button
            onClick={toggleSoundMute}
            className={`p-1.5 rounded-md text-xs transition-colors ${
              isSoundMuted ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
            }`}
            title="Toggle SFX Mute"
          >
            {isSoundMuted ? '🔇' : '🔊'}
          </button>

          <button
            onClick={handleSystemAudio}
            className="bg-emerald-700 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1.5"
            title="Capture Shared Audio / System Audio (e.g. Spotify, YouTube, or browser tab)"
          >
            <span>🎙️</span>
            Capture Audio
          </button>

          <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors">
            Upload MP3
            <input type="file" accept="audio/mp3, audio/wav" className="hidden" onChange={handleFileUpload} />
          </label>

          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value)}
            disabled={isExporting}
            className="bg-zinc-800 text-xs font-semibold rounded-md px-2 py-1 outline-none border border-zinc-700 disabled:opacity-50"
          >
            <option>16:9 (720p)</option>
            <option>16:9 (1080p)</option>
            <option>9:16 (720p)</option>
            <option>1:1 (720p)</option>
          </select>

          <button
            onClick={toggleExport}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              isExporting ? 'bg-red-500/20 text-red-500 border border-red-500' : 'bg-zinc-800 hover:bg-zinc-700'
            }`}
          >
            {isExporting ? 'Stop Rec' : 'Export'}
          </button>
        </div>
      </header>

      {/* Main Canvas Viewport */}
      <main className="flex-1 flex flex-col items-center justify-center p-2 relative overflow-hidden bg-black">
        <div className="w-full h-full max-w-6xl aspect-video rounded-xl overflow-hidden border border-zinc-800 shadow-2xl relative flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="w-full h-full object-contain bg-black cursor-crosshair"
          />

          {/* Quick Interactive Combat Touch/Click Controls Overlay */}
          <div className="absolute bottom-4 left-4 right-4 flex justify-between pointer-events-none z-10 opacity-90 hover:opacity-100 transition-opacity">
            {/* Movement Buttons */}
            <div className="flex gap-2 pointer-events-auto">
              <button
                onMouseDown={() => handlePlayerAction('left')}
                className="w-11 h-11 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg font-black active:scale-90 flex items-center justify-center backdrop-blur shadow-md"
                title="Move Left (A)"
              >
                ◀
              </button>
              <button
                onMouseDown={() => handlePlayerAction('right')}
                className="w-11 h-11 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg font-black active:scale-90 flex items-center justify-center backdrop-blur shadow-md"
                title="Move Right (D)"
              >
                ▶
              </button>
              <button
                onMouseDown={() => handlePlayerAction('jump')}
                className="w-11 h-11 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-lg font-black active:scale-90 flex items-center justify-center backdrop-blur shadow-md"
                title="Aerial Jump (W)"
              >
                ▲
              </button>
              <button
                onMouseDown={() => handlePlayerAction('dodge')}
                className="px-3 h-11 bg-zinc-900/80 hover:bg-zinc-800 text-emerald-400 border border-zinc-700 rounded-lg font-bold text-xs active:scale-90 flex items-center justify-center backdrop-blur shadow-md"
                title="Parry / Dodge Roll (Space)"
              >
                PARRY
              </button>
            </div>

            {/* Combat Strike Buttons */}
            <div className="flex gap-2 pointer-events-auto">
              <button
                onMouseDown={() => handlePlayerAction('light')}
                className="px-3.5 h-11 bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-700/60 rounded-lg font-bold text-xs active:scale-90 flex items-center justify-center backdrop-blur shadow-lg shadow-red-950/40"
                title="Light Combo (J)"
              >
                STRIKE (J)
              </button>
              <button
                onMouseDown={() => handlePlayerAction('heavy')}
                className="px-3.5 h-11 bg-orange-950/80 hover:bg-orange-900 text-orange-200 border border-orange-700/60 rounded-lg font-bold text-xs active:scale-90 flex items-center justify-center backdrop-blur shadow-lg shadow-orange-950/40"
                title="Heavy Kick (K)"
              >
                HEAVY (K)
              </button>
              <button
                onMouseDown={() => handlePlayerAction('throw')}
                className="px-3 h-11 bg-zinc-900/80 hover:bg-zinc-800 text-yellow-300 border border-zinc-700 rounded-lg font-bold text-xs active:scale-90 flex items-center justify-center backdrop-blur shadow-md"
                title="Throw Kunai (T)"
              >
                KUNAI (T)
              </button>
              <button
                onMouseDown={() => handlePlayerAction('special')}
                className="px-4 h-11 bg-gradient-to-r from-red-600 to-purple-600 hover:from-red-500 hover:to-purple-500 text-white border border-red-400 rounded-lg font-black text-xs active:scale-90 flex items-center justify-center backdrop-blur shadow-xl shadow-red-600/30 animate-pulse"
                title="Dimensional Judgment Cut (L)"
              >
                DIMENSIONAL CUT (L)
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Audio & Status Bar */}
      <footer className="px-6 py-2 border-t border-zinc-800 bg-zinc-900/90 backdrop-blur-md flex flex-col gap-1.5 z-20">
        <div className="max-w-6xl mx-auto w-full flex justify-between items-center text-xs">
          <div className="flex items-center gap-3">
            <span className="text-zinc-500 font-semibold uppercase tracking-wider">Soundtrack:</span>
            <span className="font-bold text-zinc-200 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${isBattleMusicOn || isPlaying ? 'bg-emerald-400 animate-ping' : 'bg-zinc-600'}`}></span>
              {trackName}
            </span>
          </div>

          <div className="flex items-center gap-4 text-zinc-400 font-mono">
            <span>Controls: [WASD] Move/Jump &bull; [J] Strike &bull; [K] Heavy &bull; [L] Special &bull; [Space] Parry &bull; [T] Kunai &bull; [F] Fullscreen</span>
            <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
          </div>
        </div>

        {duration > 0 && (
          <div className="max-w-6xl mx-auto w-full flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="w-7 h-7 flex items-center justify-center bg-white text-black rounded-full hover:bg-zinc-200 transition-transform active:scale-95"
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-500"
            />
          </div>
        )}
      </footer>
    </div>
  );
}

export default App;
