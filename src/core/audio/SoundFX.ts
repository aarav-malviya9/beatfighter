/**
 * Procedural Web Audio Sound Effects & Battle Music Generator
 * High-budget anime combat sound design generated entirely in Web Audio API.
 * No external sound files or assets required.
 */

export class SoundFX {
  private static instance: SoundFX | null = null;
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // Procedural Battle Music Sequencer
  private isMusicPlaying: boolean = false;
  private musicInterval: number | null = null;
  private musicStep: number = 0;
  private bpm: number = 138;
  private analyzerNode: AnalyserNode | null = null;
  private exportDestination: MediaStreamAudioDestinationNode | null = null;

  private constructor() {
    // Lazy initialize on first user gesture
  }

  public static getInstance(): SoundFX {
    if (!SoundFX.instance) {
      SoundFX.instance = new SoundFX();
    }
    return SoundFX.instance;
  }

  public init(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.85;

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.65;
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.masterGain);

      this.analyzerNode = this.ctx.createAnalyser();
      this.analyzerNode.fftSize = 256;
      this.masterGain.connect(this.analyzerNode);
      this.analyzerNode.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
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

  public getMasterOutputNode(): AudioNode | null {
    return this.masterGain;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(muted ? 0 : 0.85, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.isMuted);
    return this.isMuted;
  }

  public getAnalyzerData(dataArray: Uint8Array): void {
    if (this.analyzerNode) {
      this.analyzerNode.getByteFrequencyData(dataArray as unknown as Uint8Array<ArrayBuffer>);
    }
  }

  // ---------------------------------------------------------------------------
  // PROCEDURAL SOUND EFFECTS ($10,000 Anime Sound Design)
  // ---------------------------------------------------------------------------

  /** Whoosh for sword / kick / punch swings */
  public playWhoosh(speed = 1): void {
    if (this.isMuted) return;
    const ctx = this.init();
    const t = ctx.currentTime;

    const bufferSize = ctx.sampleRate * 0.18;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400 * speed, t);
    filter.frequency.exponentialRampToValueAtTime(2200 * speed, t + 0.08);
    filter.frequency.exponentialRampToValueAtTime(300, t + 0.18);
    filter.Q.setValueAtTime(2.5, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.45, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    whiteNoise.connect(filter);
    filter.connect(gain);
    if (this.sfxGain) gain.connect(this.sfxGain);

    whiteNoise.start(t);
    whiteNoise.stop(t + 0.2);
  }

  /** Sharp metallic katana blade clash / parry ring */
  public playBladeClash(pitch = 1): void {
    if (this.isMuted) return;
    const ctx = this.init();
    const t = ctx.currentTime;

    // High metal ring oscillators
    const freqs = [1840 * pitch, 2760 * pitch, 4200 * pitch, 5600 * pitch];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq + (Math.random() - 0.5) * 40, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.94, t + 0.35);

      const amp = 0.3 / (idx + 1);
      gain.gain.setValueAtTime(amp, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38 + idx * 0.08);

      osc.connect(gain);
      if (this.sfxGain) gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.45);
    });

    // Metallic transient click/scrape
    const noiseLen = ctx.sampleRate * 0.04;
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const out = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) out[i] = (Math.random() * 2 - 1) * Math.exp(-i / (noiseLen * 0.2));

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const nFilter = ctx.createBiquadFilter();
    nFilter.type = 'highpass';
    nFilter.frequency.setValueAtTime(3500, t);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.6, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    noise.connect(nFilter);
    nFilter.connect(nGain);
    if (this.sfxGain) nGain.connect(this.sfxGain);

    noise.start(t);
    noise.stop(t + 0.06);
  }

  /** Visceral flesh/bone impact hit with sub-bass punch */
  public playHit(heavy = false): void {
    if (this.isMuted) return;
    const ctx = this.init();
    const t = ctx.currentTime;

    // Sub-bass thud
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const startFreq = heavy ? 180 : 220;
    const endFreq = heavy ? 35 : 45;
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + (heavy ? 0.22 : 0.14));

    gain.gain.setValueAtTime(heavy ? 0.9 : 0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.28 : 0.16));

    osc.connect(gain);
    if (this.sfxGain) gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.3);

    // Punch transient noise
    const noiseLen = ctx.sampleRate * (heavy ? 0.08 : 0.05);
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const out = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) out[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(heavy ? 1200 : 1800, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + (heavy ? 0.08 : 0.05));

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(heavy ? 0.75 : 0.5, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.09 : 0.06));

    noise.connect(filter);
    filter.connect(nGain);
    if (this.sfxGain) nGain.connect(this.sfxGain);

    noise.start(t);
    noise.stop(t + 0.1);
  }

  /** Shing / katana unsheathe or razor blade cutting stroke */
  public playBladeSlash(): void {
    this.playWhoosh(1.4);
    if (this.isMuted) return;
    const ctx = this.init();
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(3200, t + 0.06);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.18);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2400, t);
    filter.Q.setValueAtTime(4.0, t);

    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.35, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

    osc.connect(filter);
    filter.connect(gain);
    if (this.sfxGain) gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.22);
  }

  /** Kunai / Shuriken whistle through air */
  public playProjectileThrow(): void {
    if (this.isMuted) return;
    const ctx = this.init();
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(2600, t + 0.12);
    osc.frequency.exponentialRampToValueAtTime(800, t + 0.25);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);

    osc.connect(gain);
    if (this.sfxGain) gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.28);
  }

  /** Legendary Judgment Cut / Dimensional Slash time-shatter sound */
  public playDimensionalSlash(): void {
    if (this.isMuted) return;
    const ctx = this.init();
    const t = ctx.currentTime;

    // 1. Blade Draw Click
    this.playBladeClash(1.3);

    // 2. High Eerie Laser Tension Charge
    const charge = ctx.createOscillator();
    const cGain = ctx.createGain();
    charge.type = 'sine';
    charge.frequency.setValueAtTime(3200, t);
    charge.frequency.exponentialRampToValueAtTime(450, t + 0.35);

    cGain.gain.setValueAtTime(0.4, t);
    cGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    charge.connect(cGain);
    if (this.sfxGain) cGain.connect(this.sfxGain);
    charge.start(t);
    charge.stop(t + 0.42);

    // 3. Delayed Multi-Shatter Explosion (at t + 0.45s)
    setTimeout(() => {
      if (this.isMuted) return;
      this.playHit(true);
      this.playBladeClash(0.85);

      // Deep Sub Drop
      const sub = ctx.createOscillator();
      const sGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(140, ctx.currentTime);
      sub.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + 0.6);

      sGain.gain.setValueAtTime(1.0, ctx.currentTime);
      sGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);

      sub.connect(sGain);
      if (this.sfxGain) sGain.connect(this.sfxGain);
      sub.start(ctx.currentTime);
      sub.stop(ctx.currentTime + 0.75);
    }, 380);
  }

  /** Sub-bass rumble on finisher moves */
  public playBassDrop(): void {
    if (this.isMuted) return;
    const ctx = this.init();
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.8);

    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);

    osc.connect(gain);
    if (this.sfxGain) gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.9);
  }

  // ---------------------------------------------------------------------------
  // BUILT-IN PROCEDURAL BATTLE SOUNDTRACK
  // Authentic Japanese Taiko Drums + Cyber Dark Synth Bassline
  // ---------------------------------------------------------------------------

  public isMusicActive(): boolean {
    return this.isMusicPlaying;
  }

  public startBattleMusic(): void {
    if (this.isMusicPlaying) return;
    this.init();
    this.isMusicPlaying = true;
    this.musicStep = 0;

    const stepDurationMs = (60 / this.bpm / 4) * 1000; // 16th notes
    this.musicInterval = window.setInterval(() => {
      this.tickBattleMusic();
    }, stepDurationMs);
  }

  public stopBattleMusic(): void {
    if (!this.isMusicPlaying) return;
    this.isMusicPlaying = false;
    if (this.musicInterval !== null) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  public toggleBattleMusic(): boolean {
    if (this.isMusicPlaying) {
      this.stopBattleMusic();
      return false;
    } else {
      this.startBattleMusic();
      return true;
    }
  }

  private tickBattleMusic(): void {
    if (this.isMuted || !this.ctx || this.ctx.state !== 'running') return;
    const step = this.musicStep % 32;
    this.musicStep++;

    const t = this.ctx.currentTime;

    // Heavy Taiko Kick drum on beats 0, 4, 8, 12, 16, 20, 24, 28 (and variations)
    const isKick = step % 8 === 0 || (step === 6 || step === 14 || step === 22 || step === 30);
    if (isKick) {
      this.synthTaikoKick(t, step % 8 === 0 ? 1.0 : 0.7);
    }

    // Snare / Rim clack on beats 4, 12, 20, 28
    const isSnare = step % 8 === 4;
    if (isSnare) {
      this.synthSnare(t);
    }

    // Hi-hat shakers on every other 16th note
    if (step % 2 === 0) {
      this.synthHiHat(t, step % 4 === 2 ? 0.35 : 0.18);
    }

    // Cyber Synth Bassline (D minor / Phrygian scale: D, Eb, F, G, A, Bb, C)
    const bassNotes = [
      73.42, 73.42, 73.42, 77.78, // D2, D2, D2, Eb2
      73.42, 73.42, 87.31, 82.41, // D2, D2, F2, E2
      73.42, 73.42, 73.42, 65.41, // D2, D2, D2, C2
      73.42, 77.78, 87.31, 98.00, // D2, Eb2, F2, G2
    ];
    if (step % 2 === 0) {
      const noteIdx = Math.floor(step / 2) % bassNotes.length;
      this.synthBassNote(t, bassNotes[noteIdx]);
    }
  }

  private synthTaikoKick(t: number, strength: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);

    gain.gain.setValueAtTime(0.85 * strength, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(gain);
    gain.connect(this.musicGain);

    osc.start(t);
    osc.stop(t + 0.24);
  }

  private synthSnare(t: number): void {
    if (!this.ctx || !this.musicGain) return;

    // Body
    const osc = this.ctx.createOscillator();
    const oGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.08);
    oGain.gain.setValueAtTime(0.4, t);
    oGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(oGain);
    oGain.connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.12);

    // Noise snap
    const len = this.ctx.sampleRate * 0.12;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1400, t);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(0.45, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(this.musicGain);

    noise.start(t);
    noise.stop(t + 0.15);
  }

  private synthHiHat(t: number, vol: number): void {
    if (!this.ctx || !this.musicGain) return;
    const len = this.ctx.sampleRate * 0.04;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(8000, t);
    filter.Q.setValueAtTime(6.0, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    noise.start(t);
    noise.stop(t + 0.05);
  }

  private synthBassNote(t: number, freq: number): void {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(650, t);
    filter.frequency.exponentialRampToValueAtTime(180, t + 0.12);
    filter.Q.setValueAtTime(3.5, t);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);

    osc.start(t);
    osc.stop(t + 0.16);
  }
}
