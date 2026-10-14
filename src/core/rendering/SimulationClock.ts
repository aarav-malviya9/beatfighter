/**
 * SimulationClock
 * Centralized, shared simulation clock that coordinates:
 * 1. Global time scaling (slow-motion effects) across fighters, physics, animation, and choreography.
 * 2. Hit-stop (freezing the combat simulation for a readable impact window without affecting rendering/camera shake).
 * 3. Clean recovery without sudden position jumps or timeline desynchronization.
 */

export class SimulationClock {
  private static instance: SimulationClock | null = null;

  private timeScale: number = 1.0;
  private targetTimeScale: number = 1.0;
  private timeScaleEaseSpeed: number = 8.0;

  private hitstopTimer: number = 0;
  private hitstopDuration: number = 0;

  // Track total elapsed simulation time (advances with simDt)
  private totalSimTime: number = 0;

  public static getInstance(): SimulationClock {
    if (!SimulationClock.instance) {
      SimulationClock.instance = new SimulationClock();
    }
    return SimulationClock.instance;
  }

  /**
   * Update clock with real wall-clock delta time (seconds).
   * Returns:
   * - simDt: scaled delta time to pass to physics, animation, and combat (0 when in hitstop)
   * - rawDt: unscaled delta time for camera, UI, and particle dissipation
   * - isFrozen: true if in hitstop
   * - timeScale: current global time scale (0.0 to 1.0)
   */
  public update(rawDt: number): {
    simDt: number;
    rawDt: number;
    isFrozen: boolean;
    timeScale: number;
  } {
    // Clamp rawDt to avoid extreme tab-switch jumps
    const clampedRawDt = Math.max(0, Math.min(0.066, rawDt));

    // Smoothly interpolate timeScale towards targetTimeScale
    this.timeScale += (this.targetTimeScale - this.timeScale) * Math.min(1.0, clampedRawDt * this.timeScaleEaseSpeed);

    // Hit-stop takes absolute precedence over simulation motion
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= clampedRawDt;
      return {
        simDt: 0,
        rawDt: clampedRawDt,
        isFrozen: true,
        timeScale: 0,
      };
    }

    const simDt = clampedRawDt * this.timeScale;
    this.totalSimTime += simDt;

    return {
      simDt,
      rawDt: clampedRawDt,
      isFrozen: false,
      timeScale: this.timeScale,
    };
  }

  /** Trigger hit-stop freeze frame for impacts (in real seconds, e.g. 0.05 - 0.18s) */
  public triggerHitstop(duration: number): void {
    // Only extend if new duration is longer
    this.hitstopTimer = Math.max(this.hitstopTimer, Math.min(0.35, duration));
    this.hitstopDuration = this.hitstopTimer;
  }

  /** Request slow motion (e.g. 0.25x for 0.4s) */
  public requestSlowMo(scale: number, duration: number = 0.5): void {
    this.targetTimeScale = Math.max(0.05, Math.min(1.0, scale));
    // Automatically revert to 1.0 after duration
    setTimeout(() => {
      this.targetTimeScale = 1.0;
    }, duration * 1000);
  }

  public setTimeScale(scale: number, immediate = false): void {
    this.targetTimeScale = Math.max(0.05, Math.min(2.0, scale));
    if (immediate) {
      this.timeScale = this.targetTimeScale;
    }
  }

  public getTimeScale(): number {
    return this.timeScale;
  }

  public isHitstopActive(): boolean {
    return this.hitstopTimer > 0;
  }

  public getHitstopProgress(): number {
    if (this.hitstopDuration <= 0) return 0;
    return 1 - Math.max(0, this.hitstopTimer) / this.hitstopDuration;
  }

  public getSimTime(): number {
    return this.totalSimTime;
  }

  public reset(): void {
    this.timeScale = 1.0;
    this.targetTimeScale = 1.0;
    this.hitstopTimer = 0;
    this.hitstopDuration = 0;
  }
}
