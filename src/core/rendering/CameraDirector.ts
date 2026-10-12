export interface CameraRequest {
  zoom?: number;
  shake?: number;
  slowMo?: number;
  duration?: number;
  wide?: boolean;
}

type CameraMode =
  | 'neutral'
  | 'impact'
  | 'powerup'
  | 'finisher'
  | 'aerial'
  | 'standoff'
  | 'counter'
  | 'beat'
  | 'custom';

interface CinematicPulse {
  mode: CameraMode;
  life: number;
  maxLife: number;
  zoom: number;
  shake: number;
  slowMo: number;
  wide: boolean;
  priority: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Event-driven cinematic camera with the same apply() transform contract as Camera.
 * App continues to call camera.addShake(...) on the renderer.camera reference.
 */
export class CameraDirector {
  public x = 0;
  public y = 0;
  public zoom = 1;
  public angle = 0;

  private targetX = 0;
  private targetY = 0;
  private targetZoom = 1;
  private targetAngle = 0;

  private shakeX = 0;
  private shakeY = 0;
  private shakeIntensity = 0;
  private shakeDecay = 0.9;

  private slowMoFactor = 1;
  private slowMoLife = 0;

  private mode: CameraMode = 'neutral';
  private pulses: CinematicPulse[] = [];

  private minZoom = 0.62;
  private maxZoom = 1.85;
  private safeMargin = 160;
  private lookAbove = 100;

  private viewW = 1280;
  private viewH = 720;

  public frame(
    p1x: number,
    p2x: number,
    p1y: number,
    p2y: number,
    intensity: number,
  ): void {
    const midX = (p1x + p2x) / 2;
    const midY = (p1y + p2y) / 2;
    const dist = Math.abs(p1x - p2x);
    const vert = Math.abs(p1y - p2y);

    this.targetX = midX;
    this.targetY = midY - this.lookAbove;

    // Distance-based framing with safe margins
    const spanX = dist + this.safeMargin * 2;
    const spanY = vert + this.safeMargin * 2.2;
    const fitZoomX = this.viewW / Math.max(220, spanX);
    const fitZoomY = this.viewH / Math.max(220, spanY);
    let desired = clamp(Math.min(fitZoomX, fitZoomY), this.minZoom, 1.25);

    if (dist < 150) desired = Math.max(desired, 1.15 + intensity * 0.08);
    else if (dist > 420) desired = Math.min(desired, 0.82);

    // Active cinematic pulse overrides
    const pulse = this.topPulse();
    if (pulse) {
      if (pulse.wide) {
        desired = Math.min(desired, 0.68);
      } else {
        desired = clamp(desired * pulse.zoom, this.minZoom, this.maxZoom);
      }
      this.mode = pulse.mode;
    } else {
      this.mode = 'neutral';
    }

    this.targetZoom = desired;

    // Slight intensity lean — never wild
    this.targetAngle = (intensity - 0.5) * 0.012 * (this.mode === 'finisher' ? 2 : 1);
  }

  public update(dt: number): void {
    const ease = 1 - Math.pow(0.01, dt);
    const zoomEase = 1 - Math.pow(0.04, dt);

    this.x += (this.targetX - this.x) * ease;
    this.y += (this.targetY - this.y) * ease;
    this.zoom += (this.targetZoom - this.zoom) * zoomEase * 0.85;
    this.angle += (this.targetAngle - this.angle) * ease * 0.6;

    // Controlled shake
    if (this.shakeIntensity > 0.08) {
      const capped = Math.min(this.shakeIntensity, 28);
      this.shakeX = (Math.random() - 0.5) * capped;
      this.shakeY = (Math.random() - 0.5) * capped * 0.85;
      this.shakeIntensity *= Math.pow(this.shakeDecay, dt * 60);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shakeIntensity = 0;
    }

    // Slow-mo decay
    if (this.slowMoLife > 0) {
      this.slowMoLife -= dt;
      if (this.slowMoLife <= 0) {
        this.slowMoLife = 0;
        this.slowMoFactor = 1;
      } else {
        this.slowMoFactor = lerp(this.slowMoFactor, 1, dt / (this.slowMoLife + 0.05));
      }
    } else {
      this.slowMoFactor = 1;
    }

    // Advance cinematic pulses
    for (const pulse of this.pulses) {
      pulse.life -= dt;
    }
    this.pulses = this.pulses.filter((p) => p.life > 0);

    // Soft return toward neutral angle
    if (!this.topPulse()) {
      this.targetAngle *= Math.pow(0.05, dt);
    }
  }

  /** Same transform contract as Camera.apply */
  public apply(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    this.viewW = width;
    this.viewH = height;
    ctx.translate(width / 2, height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.rotate(this.angle);
    ctx.translate(-this.x + this.shakeX, -this.y + this.shakeY);
  }

  // ---------------------------------------------------------------------------
  // Event hooks
  // ---------------------------------------------------------------------------

  public onImpact(force = 1, _direction = 0): void {
    const f = clamp(force, 0, 1.5);
    this.pushPulse({
      mode: 'impact',
      life: 0.35 + f * 0.15,
      maxLife: 0.35 + f * 0.15,
      zoom: 1.08 + f * 0.12,
      shake: 6 + f * 14,
      slowMo: f > 0.85 ? 0.55 : 1,
      wide: false,
      priority: 3,
    });
    this.addShake(6 + f * 14);
    if (f > 0.85) this.applySlowMo(0.55, 0.18);
  }

  public onPowerUp(_x?: number, _y?: number): void {
    this.pushPulse({
      mode: 'powerup',
      life: 0.7,
      maxLife: 0.7,
      zoom: 0.88,
      shake: 3,
      slowMo: 0.45,
      wide: true,
      priority: 2,
    });
    this.applySlowMo(0.45, 0.55);
    this.addShake(3);
  }

  public onFinisher(): void {
    this.pushPulse({
      mode: 'finisher',
      life: 1.1,
      maxLife: 1.1,
      zoom: 1.45,
      shake: 12,
      slowMo: 0.22,
      wide: false,
      priority: 5,
    });
    this.applySlowMo(0.22, 0.9);
    this.addShake(12);
  }

  public onAerial(): void {
    this.pushPulse({
      mode: 'aerial',
      life: 0.55,
      maxLife: 0.55,
      zoom: 0.75,
      shake: 0,
      slowMo: 1,
      wide: true,
      priority: 2,
    });
  }

  public onStandoff(): void {
    this.pushPulse({
      mode: 'standoff',
      life: 0.5,
      maxLife: 0.5,
      zoom: 1.18,
      shake: 0,
      slowMo: 0.7,
      wide: false,
      priority: 2,
    });
    this.applySlowMo(0.7, 0.35);
  }

  public onCounter(): void {
    this.pushPulse({
      mode: 'counter',
      life: 0.4,
      maxLife: 0.4,
      zoom: 1.32,
      shake: 8,
      slowMo: 0.4,
      wide: false,
      priority: 4,
    });
    this.applySlowMo(0.4, 0.28);
    this.addShake(8);
  }

  public onBeat(intensity = 0.5): void {
    const i = clamp(intensity, 0, 1);
    if (this.mode === 'finisher' || this.mode === 'counter') return;
    this.pushPulse({
      mode: 'beat',
      life: 0.12,
      maxLife: 0.12,
      zoom: 1 + i * 0.04,
      shake: i * 3,
      slowMo: 1,
      wide: false,
      priority: 1,
    });
    if (i > 0.55) this.addShake(i * 3);
  }

  public requestCamera(opts: CameraRequest): void {
    const duration = opts.duration ?? 0.45;
    this.pushPulse({
      mode: 'custom',
      life: duration,
      maxLife: duration,
      zoom: opts.zoom ?? 1,
      shake: (opts.shake ?? 0) * 20,
      slowMo: opts.slowMo ?? 1,
      wide: !!opts.wide,
      priority: 3,
    });
    if (opts.shake) this.addShake(opts.shake * 20);
    if (opts.slowMo !== undefined && opts.slowMo < 1) {
      this.applySlowMo(opts.slowMo, duration * 0.85);
    }
  }

  public addShake(amount: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, Math.min(32, amount));
  }

  public getTimeScale(): number {
    return this.slowMoLife > 0 ? clamp(this.slowMoFactor, 0.08, 1) : 1;
  }

  public getMode(): CameraMode {
    return this.mode;
  }

  public setViewSize(width: number, height: number): void {
    this.viewW = width;
    this.viewH = height;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private pushPulse(pulse: CinematicPulse): void {
    // Drop lower-priority pulses when a high-priority cinematic fires
    if (pulse.priority >= 4) {
      this.pulses = this.pulses.filter((p) => p.priority >= pulse.priority - 1);
    }
    this.pulses.push(pulse);
  }

  private topPulse(): CinematicPulse | null {
    if (this.pulses.length === 0) return null;
    let best = this.pulses[0];
    for (let i = 1; i < this.pulses.length; i++) {
      if (this.pulses[i].priority > best.priority) best = this.pulses[i];
    }
    return best;
  }

  private applySlowMo(factor: number, duration: number): void {
    this.slowMoFactor = clamp(factor, 0.08, 1);
    this.slowMoLife = Math.max(this.slowMoLife, duration);
  }
}
