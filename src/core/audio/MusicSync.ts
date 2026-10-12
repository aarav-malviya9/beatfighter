import { type TrackAnalysis } from './MusicAnalyzer';

export type MusicPhase = 'CALM' | 'BUILDING' | 'DRIVING' | 'INTENSE' | 'CLIMAX';

export type AttackLevel = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'SPECIAL';

/** Energy curve sample rate used by MusicAnalyzer (10ms chunks). */
const ENERGY_HZ = 100;

/** Lookahead window (seconds) for drop / break detection. */
const SLOPE_WINDOW = 0.25;

export class MusicSync {
  private analysis: TrackAnalysis | null = null;

  constructor(analysis: TrackAnalysis | null = null) {
    this.analysis = analysis;
  }

  public setTrackAnalysis(analysis: TrackAnalysis | null): void {
    this.analysis = analysis;
  }

  public getAnalysis(): TrackAnalysis | null {
    return this.analysis;
  }

  /** Intensity 0–1 from energyCurve at 100Hz index = floor(time * 100). */
  public getIntensityAt(time: number): number {
    if (!this.analysis || this.analysis.energyCurve.length === 0) return 0;
    const idx = Math.floor(time * ENERGY_HZ);
    const clamped = Math.max(0, Math.min(idx, this.analysis.energyCurve.length - 1));
    const v = this.analysis.energyCurve[clamped];
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  }

  /** Next beat strictly after `time`, or null if none remain. */
  public getNextBeat(time: number): number | null {
    if (!this.analysis) return null;
    const beats = this.analysis.beats;
    // Binary search for first beat > time
    let lo = 0;
    let hi = beats.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (beats[mid] <= time) lo = mid + 1;
      else hi = mid;
    }
    return lo < beats.length ? beats[lo] : null;
  }

  public getPhase(time: number): MusicPhase {
    const intensity = this.getIntensityAt(time);
    if (intensity < 0.2) return 'CALM';
    if (intensity < 0.4) return 'BUILDING';
    if (intensity < 0.6) return 'DRIVING';
    if (intensity < 0.8) return 'INTENSE';
    return 'CLIMAX';
  }

  /**
   * Local rhythmic density in beats/second over a 1s window centered at `time`.
   * Pure function of analysis + time (seek-safe).
   */
  public getRhythmicDensity(time: number): number {
    if (!this.analysis || this.analysis.beats.length === 0) return 0;
    const half = 0.5;
    const from = time - half;
    const to = time + half;
    let count = 0;
    const beats = this.analysis.beats;
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      if (b < from) continue;
      if (b > to) break;
      count++;
    }
    return count; // window is 1 second → beats/sec
  }

  /** Beats in (from, to] — exclusive of from, inclusive of to. */
  public peekBeatsUntil(from: number, to: number): number[] {
    if (!this.analysis) return [];
    const out: number[] = [];
    const beats = this.analysis.beats;
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      if (b <= from) continue;
      if (b > to) break;
      out.push(b);
    }
    return out;
  }

  /** Map intensity (0–1) to preferred attack weight class. */
  public preferredAttackLevel(intensity: number): AttackLevel {
    const i = Math.max(0, Math.min(1, intensity));
    if (i < 0.25) return 'LIGHT';
    if (i < 0.5) return 'MEDIUM';
    if (i < 0.75) return 'HEAVY';
    return 'SPECIAL';
  }

  /** High local beat density favors multi-hit combos. */
  public shouldCombo(density: number): boolean {
    return density >= 2.0;
  }

  /**
   * Finisher when music is at climax, meter is charged, and opponent is low health.
   * All three gates must pass.
   */
  public shouldFinisher(time: number, meter: number, health: number): boolean {
    const phase = this.getPhase(time);
    const intensity = this.getIntensityAt(time);
    const climax =
      phase === 'CLIMAX' || intensity >= 0.8 || this.detectDrop(time);
    return climax && meter >= 0.85 && health <= 0.3;
  }

  /**
   * Drop: sharp intensity rise over a short window (build → hit).
   * Seek-safe: derived only from energyCurve around `time`.
   */
  public detectDrop(time: number): boolean {
    if (!this.analysis || this.analysis.energyCurve.length < 2) return false;
    const before = this.getIntensityAt(time - SLOPE_WINDOW);
    const now = this.getIntensityAt(time);
    const after = this.getIntensityAt(time + SLOPE_WINDOW);
    const rise = now - before;
    const sustain = after >= now - 0.05;
    return rise >= 0.22 && now >= 0.55 && sustain;
  }

  /**
   * Break: sharp intensity fall (quiet pocket after energy).
   */
  public isBreak(time: number): boolean {
    if (!this.analysis || this.analysis.energyCurve.length < 2) return false;
    const before = this.getIntensityAt(time - SLOPE_WINDOW);
    const now = this.getIntensityAt(time);
    const fall = before - now;
    return fall >= 0.2 && now <= 0.35 && before >= 0.45;
  }

  /** Energy slope (per second) at `time` via central difference. */
  public getEnergySlope(time: number): number {
    if (!this.analysis) return 0;
    const dt = 0.05;
    const a = this.getIntensityAt(time - dt);
    const b = this.getIntensityAt(time + dt);
    return (b - a) / (2 * dt);
  }
}
