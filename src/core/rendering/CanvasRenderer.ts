import { Fighter } from '../animation/Fighter';
import { ArenaSystem, type ArenaType } from './ArenaSystem';
import { CameraDirector } from './CameraDirector';
import { VFXEngine, type VFXQuality } from './VFXEngine';

interface GroundCrack {
  x: number;
  y: number;
  segments: { x1: number; y1: number; x2: number; y2: number; width: number }[];
  life: number;
  maxLife: number;
  color: string;
  glowColor: string;
}

interface GroundDust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
}

interface BackgroundEnergyRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

interface ComboState {
  count: number;
  timer: number;
  scale: number;
  damage: number;
  attackerIndex: number;
}

interface FighterHealthTracking {
  current: number;
  lag: number;
  lastDamageTime: number;
}

interface CombatCallout {
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  scale: number;
  angle: number;
  life: number;
  maxLife: number;
  isCritical: boolean;
}

interface DimensionalCutLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
}

interface DimensionalSlashEffect {
  active: boolean;
  timer: number;
  duration: number;
  x: number;
  y: number;
  color: string;
  lines: DimensionalCutLine[];
  exploded: boolean;
}

interface ClashSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private time = 0;

  /** Cinematic camera — same addShake / apply surface App already uses. */
  public camera: CameraDirector;
  public vfx: VFXEngine;
  public arena: ArenaSystem;

  // Ground plane effects
  private groundCracks: GroundCrack[] = [];
  private groundDust: GroundDust[] = [];
  private prevFighterPositions: { x: number; y: number }[] = [];
  private groundBaseline: number = 0;

  // Atmospheric lighting & energy
  private energyRings: BackgroundEnergyRing[] = [];
  private lastRingSpawnTime = 0;

  // Hit impact presentation
  private hitstopTimer = 0;
  private impactFlashTimer = 0;
  private impactFocalPoint: { x: number; y: number } = { x: 0, y: 0 };
  private zoomLinesAlpha = 0;
  private chromaticAberration = 0;

  // Cinematic letterbox
  private letterboxAmount = 0;

  // UI & Combo tracking
  private healthTracking: FighterHealthTracking[] = [];
  private comboState: ComboState = {
    count: 0,
    timer: 0,
    scale: 1,
    damage: 0,
    attackerIndex: 0,
  };

  // Manga Combat Callouts & Dimensional Effects
  private combatCallouts: CombatCallout[] = [];
  private dimensionalSlash: DimensionalSlashEffect | null = null;
  private clashSparks: ClashSpark[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.width = canvas.width;
    this.height = canvas.height;
    this.groundBaseline = this.height - 100;
    this.camera = new CameraDirector();
    this.camera.setViewSize(this.width, this.height);
    this.vfx = new VFXEngine();
    this.arena = new ArenaSystem('celestial_temple');
  }

  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.width = width;
    this.height = height;
    this.groundBaseline = height - 100;
    this.camera.setViewSize(width, height);
  }

  public setArena(type: ArenaType): void {
    this.arena.setArena(type);
  }

  public setVfxQuality(quality: VFXQuality): void {
    this.vfx.setQuality(quality);
  }

  public update(dt: number, fighters: Fighter[], intensity: number): void {
    const music = Math.min(Math.max(intensity / 255, 0), 1);

    // Hitstop logic: freeze simulation for major hits
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      if (this.hitstopTimer > 0) {
        // Freeze time during impact frames
        return;
      }
    }

    const scaledDt = dt * this.camera.getTimeScale();
    this.time += scaledDt;

    // Detect ground baseline dynamically from fighters
    if (fighters.length > 0) {
      const detectedGround = (fighters[0] as unknown as { groundY?: number }).groundY ?? fighters[0].y;
      if (detectedGround && !isNaN(detectedGround)) {
        this.groundBaseline = detectedGround;
      }
    }

    // Camera framing
    if (fighters.length >= 2) {
      this.camera.frame(
        fighters[0].x,
        fighters[1].x,
        fighters[0].y,
        fighters[1].y,
        music,
      );
    } else if (fighters.length === 1) {
      this.camera.frame(
        fighters[0].x,
        fighters[0].x,
        fighters[0].y,
        fighters[0].y,
        music,
      );
    }

    this.camera.update(scaledDt);
    this.arena.update(scaledDt, music);
    this.vfx.update(scaledDt);

    // Update ground cracks
    for (let i = this.groundCracks.length - 1; i >= 0; i--) {
      const crack = this.groundCracks[i];
      crack.life -= scaledDt;
      if (crack.life <= 0) {
        this.groundCracks.splice(i, 1);
      }
    }

    // Update dust particles
    for (let i = this.groundDust.length - 1; i >= 0; i--) {
      const dust = this.groundDust[i];
      dust.life -= scaledDt;
      dust.x += dust.vx * scaledDt;
      dust.y += dust.vy * scaledDt;
      dust.vy += 80 * scaledDt; // Slight gravity/settling
      dust.vx *= Math.max(0, 1 - 4 * scaledDt);
      dust.size += 15 * scaledDt;
      dust.alpha = (dust.life / dust.maxLife) * 0.45;
      if (dust.life <= 0) {
        this.groundDust.splice(i, 1);
      }
    }

    // Update background energy rings
    for (let i = this.energyRings.length - 1; i >= 0; i--) {
      const ring = this.energyRings[i];
      ring.life -= scaledDt;
      const progress = 1 - ring.life / ring.maxLife;
      ring.radius = ring.maxRadius * Math.pow(progress, 0.7);
      if (ring.life <= 0) {
        this.energyRings.splice(i, 1);
      }
    }

    // Track fighter movement & spawn dust puffs
    for (let i = 0; i < fighters.length; i++) {
      const f = fighters[i];
      const prev = this.prevFighterPositions[i];
      if (prev) {
        const dx = f.x - prev.x;
        const dy = f.y - prev.y;
        const speed = Math.sqrt(dx * dx + dy * dy) / Math.max(0.001, scaledDt);

        // Movement dust when running/dashing near ground
        const onGround = Math.abs(f.y - this.groundBaseline) < 15;
        if (onGround && speed > 220 && Math.random() < 0.45) {
          this.spawnGroundDust(
            f.x - Math.sign(dx || f.direction) * (15 + Math.random() * 10),
            this.groundBaseline - 4,
            -Math.sign(dx || f.direction) * (40 + Math.random() * 50),
            -15 - Math.random() * 25,
            f.eyeColor,
          );
        }

        // Landing dust impact
        if (prev.y < this.groundBaseline - 10 && onGround && dy > 0) {
          for (let k = 0; k < 6; k++) {
            const dir = (k % 2 === 0 ? 1 : -1) * (1 + Math.random() * 1.5);
            this.spawnGroundDust(
              f.x + dir * 12,
              this.groundBaseline - 2,
              dir * (60 + Math.random() * 60),
              -25 - Math.random() * 30,
              f.eyeColor,
            );
          }
        }
      }
      this.prevFighterPositions[i] = { x: f.x, y: f.y };
    }

    // Health & combo hit tracking
    this.updateCombatTelemetry(scaledDt, fighters);

    // Letterbox interpolation
    const isCinematicMove = fighters.some((f) => this.isSpecialMoveActive(f)) ||
      this.camera.getMode() === 'finisher' ||
      this.camera.getMode() === 'counter';
    const targetLetterbox = isCinematicMove ? 1 : 0;
    this.letterboxAmount += (targetLetterbox - this.letterboxAmount) * Math.min(1, scaledDt * 6);

    // Decay impact effects
    if (this.zoomLinesAlpha > 0) {
      this.zoomLinesAlpha = Math.max(0, this.zoomLinesAlpha - scaledDt * 3.5);
    }
    if (this.chromaticAberration > 0) {
      this.chromaticAberration = Math.max(0, this.chromaticAberration - scaledDt * 5);
    }
    if (this.impactFlashTimer > 0) {
      this.impactFlashTimer -= scaledDt;
    }

    // Update Manga Combat Callouts
    for (let i = this.combatCallouts.length - 1; i >= 0; i--) {
      const c = this.combatCallouts[i];
      c.life -= scaledDt;
      c.y -= 28 * scaledDt;
      c.alpha = Math.max(0, c.life / c.maxLife);
      if (c.life <= 0) {
        this.combatCallouts.splice(i, 1);
      }
    }

    // Update Sword Clash Sparks
    for (let i = this.clashSparks.length - 1; i >= 0; i--) {
      const s = this.clashSparks[i];
      s.life -= scaledDt;
      s.x += s.vx * scaledDt;
      s.y += s.vy * scaledDt;
      s.vy += 450 * scaledDt;
      if (s.life <= 0) {
        this.clashSparks.splice(i, 1);
      }
    }

    // Update Dimensional Slash / Judgment Cut Sequence
    if (this.dimensionalSlash) {
      this.dimensionalSlash.timer -= scaledDt;
      if (this.dimensionalSlash.timer <= 0.12 && !this.dimensionalSlash.exploded) {
        this.dimensionalSlash.exploded = true;
        this.vfx.flashScreen(0.95);
        this.vfx.emitShockwave(this.dimensionalSlash.x, this.dimensionalSlash.y, this.dimensionalSlash.color, 1.4);
        this.camera.onFinisher();
        this.camera.addShake(22);
      }
      if (this.dimensionalSlash.timer <= 0) {
        this.dimensionalSlash = null;
      }
    }
  }

  public addCombatCallout(
    x: number,
    y: number,
    text: string,
    color: string = '#ff0055',
    isCritical: boolean = false,
  ): void {
    if (this.combatCallouts.length > 8) this.combatCallouts.shift();
    this.combatCallouts.push({
      x,
      y: y - 20,
      text,
      color,
      alpha: 1,
      scale: isCritical ? 1.6 : 1.2,
      angle: (Math.random() - 0.5) * 0.25,
      life: 0.9,
      maxLife: 0.9,
      isCritical,
    });
  }

  public triggerSwordClash(x: number, y: number): void {
    for (let i = 0; i < 32; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 320;
      this.clashSparks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        life: 0.25 + Math.random() * 0.25,
        maxLife: 0.5,
        color: Math.random() < 0.6 ? '#ffffff' : '#ffd700',
        size: 1.5 + Math.random() * 2,
      });
    }
    this.camera.onCounter();
    this.camera.addShake(8);
  }

  public triggerDimensionalSlash(x: number, y: number, color: string): void {
    const lines: DimensionalCutLine[] = [];
    const count = 12;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI + (Math.random() - 0.5) * 0.3;
      const len = 900;
      lines.push({
        x1: x - Math.cos(angle) * len,
        y1: y - Math.sin(angle) * len,
        x2: x + Math.cos(angle) * len,
        y2: y + Math.sin(angle) * len,
        color: Math.random() < 0.5 ? '#ffffff' : color,
        width: 2 + Math.random() * 3,
      });
    }

    this.dimensionalSlash = {
      active: true,
      timer: 0.45,
      duration: 0.45,
      x,
      y,
      color,
      lines,
      exploded: false,
    };

    this.hitstopTimer = 0.35;
    this.camera.onFinisher();
  }

  public render(
    fighters: Fighter[],
    bgIntensity: number = 0,
    frequencyData?: Uint8Array,
  ): void {
    const music = Math.min(Math.max(bgIntensity / 255, 0), 1);
    const ctx = this.ctx;

    // Audio frequency bands
    let bass = 0;
    let mid = 0;
    let treble = 0;
    if (frequencyData && frequencyData.length >= 64) {
      for (let i = 0; i < 12; i++) bass += frequencyData[i];
      bass = bass / (12 * 255);
      for (let i = 12; i < 36; i++) mid += frequencyData[i];
      mid = mid / (24 * 255);
      for (let i = 36; i < 64; i++) treble += frequencyData[i];
      treble = treble / (28 * 255);
    } else {
      bass = music;
      mid = music * 0.8;
      treble = music * 0.6;
    }

    // Spawn energy waves on heavy bass beat
    if (bass > 0.62 && this.time - this.lastRingSpawnTime > 0.28) {
      this.lastRingSpawnTime = this.time;
      const spawnX = fighters.length >= 2 ? (fighters[0].x + fighters[1].x) / 2 : this.width / 2;
      const spawnY = this.groundBaseline - 90;
      this.energyRings.push({
        x: spawnX,
        y: spawnY,
        radius: 10,
        maxRadius: 750,
        life: 0.85,
        maxLife: 0.85,
        color: fighters[0]?.eyeColor ?? '#ff0055',
        width: 3 + bass * 4,
      });
    }

    // 1) Clear Screen
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#030306';
    ctx.fillRect(0, 0, this.width, this.height);

    // 2) Arena background (screen-space parallax using camera state)
    this.arena.drawBackground(
      ctx,
      this.camera.x,
      this.camera.y,
      this.camera.zoom,
      this.width,
      this.height,
      this.time,
    );

    // Background Energy Waves & Cosmic Audio Aurora (Screen Space)
    this.drawBackgroundEnergyWaves(ctx, music, bass, mid);

    // Soft volumetric music wash
    if (music > 0.02) {
      const gradient = ctx.createRadialGradient(
        this.width / 2,
        this.height,
        0,
        this.width / 2,
        this.height,
        this.height,
      );
      gradient.addColorStop(0, `rgba(45, 30, 68, ${0.16 * music})`);
      gradient.addColorStop(0.5, `rgba(20, 15, 35, ${0.08 * music})`);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // 3) Volumetric Light Shafts (Screen Space)
    this.drawVolumetricLightShafts(ctx, music, mid);

    ctx.save();

    // 4) Apply Camera Transformation
    this.camera.apply(ctx, this.width, this.height);

    // Background VFX (particles & auras)
    this.vfx.drawBackground(ctx);

    // Expanding Energy Rings (World Space)
    this.drawWorldEnergyRings(ctx);

    // Ground Reflections (Mirrored fighters below ground line)
    this.drawGroundReflections(ctx, fighters, music);

    // Ambient Occlusion contact shadows
    this.drawAmbientOcclusion(ctx, fighters);

    // Dramatic Ground Plane (Grid, Sheen, Cracks)
    this.drawDramaticGround(ctx, music, bass);

    // Heat Distortion Aura Shimmer behind attacking fighters
    this.drawHeatDistortionAura(ctx, fighters);

    // Ground Dust Particles
    this.drawGroundDust(ctx);

    // 5) Render Fighters
    for (const fighter of fighters) {
      // Dynamic Rim Light Glow
      this.drawFighterRimLighting(ctx, fighter);
      fighter.draw(ctx);
    }

    // Sword Clash Sparks
    this.drawClashSparks(ctx);

    // 6) Foreground VFX
    this.vfx.drawForeground(ctx);

    // 7) Foreground Arena details
    this.arena.drawForeground(
      ctx,
      this.camera.x,
      this.camera.y,
      this.camera.zoom,
      this.width,
      this.height,
      this.time,
    );

    ctx.restore();

    // 8) Screen Space Post-Processing & Cinematic Overlays
    const flash = this.vfx.consumeScreenFlash();
    if (flash > 0.001) {
      this.onScreenFlashTriggered(flash, fighters);
    }

    // Radial Anime Action Zoom Lines
    if (this.zoomLinesAlpha > 0.01) {
      this.drawRadialZoomLines(ctx);
    }

    // Flash Overlay (Impact / Screen Flash)
    if (flash > 0.001) {
      this.drawScreenFlash(ctx, flash);
    }

    // Impact Frame Desaturation / Inversion
    if (this.impactFlashTimer > 0) {
      this.drawImpactDesaturationFrame(ctx);
    }

    // Chromatic Aberration Edge Fringe
    if (this.chromaticAberration > 0.01) {
      this.drawChromaticAberration(ctx);
    }

    // Color Grading Overlay
    this.drawColorGradingOverlay(ctx, music, fighters);

    // Edge Vignette
    this.drawVignette(ctx, music);

    // Cinematic Letterbox Widescreen Bars
    if (this.letterboxAmount > 0.001) {
      this.drawCinematicLetterbox(ctx);
    }

    // Health & Combo HUD
    this.drawCombatHUD(ctx, fighters);

    // Dimensional Slash Screen-space Lines
    if (this.dimensionalSlash) {
      this.drawDimensionalSlashScreen(ctx);
    }

    // Manga Combat Callouts
    this.drawCombatCallouts(ctx);
  }

  // ---------------------------------------------------------------------------
  // 1. Dramatic Ground Plane
  // ---------------------------------------------------------------------------

  private drawGroundReflections(
    ctx: CanvasRenderingContext2D,
    fighters: Fighter[],
    music: number,
  ): void {
    if (fighters.length === 0) return;
    const groundY = this.groundBaseline;

    ctx.save();
    // Clip reflections strictly below the ground line
    ctx.beginPath();
    ctx.rect(-3000, groundY, 6000, 1500);
    ctx.clip();

    // Mirror fighters vertically across ground line with subtle perspective compression
    ctx.translate(0, groundY);
    ctx.scale(1, -0.68);
    ctx.translate(0, -groundY);

    // Subtle wave wobble for liquid reflection
    const wobble = Math.sin(this.time * 4) * 1.5;
    ctx.translate(wobble, 0);

    const baseAlpha = 0.22 + music * 0.1;
    ctx.globalAlpha = baseAlpha;

    for (const fighter of fighters) {
      fighter.draw(ctx);
    }

    ctx.restore();

    // Glossy reflection sheen and deep distance falloff over reflections
    ctx.save();
    const fadeGrad = ctx.createLinearGradient(0, groundY, 0, groundY + 240);
    fadeGrad.addColorStop(0, 'rgba(3, 4, 8, 0.45)');
    fadeGrad.addColorStop(0.35, 'rgba(3, 4, 8, 0.82)');
    fadeGrad.addColorStop(1, 'rgba(3, 4, 8, 0.98)');
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(-3000, groundY, 6000, 500);
    ctx.restore();
  }

  private drawDramaticGround(
    ctx: CanvasRenderingContext2D,
    music: number,
    bass: number,
  ): void {
    const groundY = this.groundBaseline;

    ctx.save();

    // Ground Base Fill
    ctx.fillStyle = 'rgba(5, 7, 12, 0.95)';
    ctx.fillRect(-3000, groundY, 6000, 1200);

    // Glowing Perspective Grid Lines (Depth into ground)
    const gridAlpha = 0.06 + music * 0.14 + bass * 0.18;
    ctx.lineWidth = 1.2;

    // Receding horizontal floor grid lines
    const gridDepthLevels = 8;
    for (let i = 1; i <= gridDepthLevels; i++) {
      const progress = i / gridDepthLevels;
      const depthY = groundY + Math.pow(progress, 1.8) * 260;
      const alpha = gridAlpha * (1 - progress * 0.7);

      ctx.strokeStyle = `rgba(130, 170, 240, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(-3000, depthY);
      ctx.lineTo(3000, depthY);
      ctx.stroke();
    }

    // Perspective ray lines extending forward from horizon
    const rayCount = 14;
    const raySpan = 2200;
    const originX = 0;
    for (let i = -rayCount; i <= rayCount; i++) {
      const targetX = originX + (i / rayCount) * raySpan * 1.5;
      const startX = originX + (i / rayCount) * 180;
      ctx.strokeStyle = `rgba(110, 140, 210, ${gridAlpha * 0.55})`;
      ctx.beginPath();
      ctx.moveTo(startX, groundY);
      ctx.lineTo(targetX, groundY + 280);
      ctx.stroke();
    }

    // Ground Cracks
    this.drawGroundCracks(ctx);

    // Primary Ground Impact Horizon Line (Razor-sharp glowing edge)
    const lineIntensity = 0.45 + music * 0.4 + bass * 0.25;
    const edgeGrad = ctx.createLinearGradient(-1500, groundY, 1500, groundY);
    edgeGrad.addColorStop(0, 'rgba(100, 140, 220, 0)');
    edgeGrad.addColorStop(0.3, `rgba(180, 210, 255, ${lineIntensity * 0.6})`);
    edgeGrad.addColorStop(0.5, `rgba(255, 255, 255, ${lineIntensity})`);
    edgeGrad.addColorStop(0.7, `rgba(180, 210, 255, ${lineIntensity * 0.6})`);
    edgeGrad.addColorStop(1, 'rgba(100, 140, 220, 0)');

    ctx.strokeStyle = edgeGrad;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#88c0ff';
    ctx.shadowBlur = 12 * lineIntensity;
    ctx.beginPath();
    ctx.moveTo(-3000, groundY);
    ctx.lineTo(3000, groundY);
    ctx.stroke();

    // Specular Sheen Band just under the ground line
    ctx.shadowBlur = 0;
    const sheen = ctx.createLinearGradient(0, groundY, 0, groundY + 45);
    sheen.addColorStop(0, `rgba(220, 235, 255, ${0.15 + music * 0.15})`);
    sheen.addColorStop(0.3, `rgba(120, 170, 240, ${0.06 + music * 0.08})`);
    sheen.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(-3000, groundY, 6000, 45);

    ctx.restore();
  }

  private drawGroundCracks(ctx: CanvasRenderingContext2D): void {
    if (this.groundCracks.length === 0) return;

    ctx.save();
    for (const crack of this.groundCracks) {
      const progress = crack.life / crack.maxLife;
      const alpha = Math.min(1, progress * 1.4);

      // Core glow
      ctx.shadowColor = crack.glowColor;
      ctx.shadowBlur = 10 * progress;
      ctx.strokeStyle = crack.color;
      ctx.lineWidth = 2.2 * progress;

      for (const seg of crack.segments) {
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      }

      // Hot molten fissure core
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.75})`;
      ctx.lineWidth = 1;
      for (const seg of crack.segments) {
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private spawnGroundCrack(
    x: number,
    y: number,
    color: string,
    scale = 1,
  ): void {
    const segments: GroundCrack['segments'] = [];
    const branchCount = Math.floor(4 + Math.random() * 3);

    for (let b = 0; b < branchCount; b++) {
      let cx = x + (Math.random() - 0.5) * 10;
      let cy = y;
      const dirX = (Math.random() - 0.5) * 2;
      const totalLen = (35 + Math.random() * 45) * scale;
      const steps = 4 + Math.floor(Math.random() * 3);
      const stepLen = totalLen / steps;

      for (let s = 0; s < steps; s++) {
        const nx = cx + dirX * stepLen + (Math.random() - 0.5) * 12;
        const ny = cy + Math.random() * (stepLen * 0.45);
        segments.push({
          x1: cx,
          y1: cy,
          x2: nx,
          y2: ny,
          width: Math.max(1, (steps - s) * 0.8),
        });
        cx = nx;
        cy = ny;
      }
    }

    this.groundCracks.push({
      x,
      y,
      segments,
      life: 1.6,
      maxLife: 1.6,
      color,
      glowColor: color,
    });
  }

  private spawnGroundDust(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: string,
  ): void {
    if (this.groundDust.length > 60) return;
    this.groundDust.push({
      x,
      y,
      vx,
      vy,
      size: 5 + Math.random() * 8,
      alpha: 0.45,
      life: 0.45 + Math.random() * 0.35,
      maxLife: 0.8,
      color,
    });
  }

  private drawGroundDust(ctx: CanvasRenderingContext2D): void {
    if (this.groundDust.length === 0) return;
    ctx.save();
    for (const dust of this.groundDust) {
      ctx.fillStyle = `rgba(190, 195, 215, ${dust.alpha})`;
      ctx.beginPath();
      ctx.arc(dust.x, dust.y, dust.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // 2. Atmospheric Lighting
  // ---------------------------------------------------------------------------

  private drawVolumetricLightShafts(
    ctx: CanvasRenderingContext2D,
    music: number,
    mid: number,
  ): void {
    const shaftCount = 5;
    const baseAngle = 0.38 + Math.sin(this.time * 0.5) * 0.05;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (let i = 0; i < shaftCount; i++) {
      const offsetFactor = (i - (shaftCount - 1) / 2) / shaftCount;
      const drift = Math.sin(this.time * 0.7 + i * 1.5) * 60;
      const originX = this.width * 0.5 + offsetFactor * (this.width * 0.85) + drift;
      const originY = -50;

      const shaftWidth = (90 + i * 25) * (1 + mid * 0.3);
      const shaftAlpha = (0.035 + Math.sin(this.time * 1.2 + i * 2) * 0.015 + music * 0.04);

      const targetX = originX + Math.tan(baseAngle) * (this.height + 100);
      const targetY = this.height + 50;

      const shaftGrad = ctx.createLinearGradient(originX, originY, targetX, targetY);
      shaftGrad.addColorStop(0, `rgba(180, 205, 255, ${shaftAlpha * 1.8})`);
      shaftGrad.addColorStop(0.4, `rgba(140, 175, 235, ${shaftAlpha})`);
      shaftGrad.addColorStop(1, 'rgba(40, 60, 110, 0)');

      ctx.fillStyle = shaftGrad;
      ctx.beginPath();
      ctx.moveTo(originX - shaftWidth * 0.4, originY);
      ctx.lineTo(originX + shaftWidth * 0.4, originY);
      ctx.lineTo(targetX + shaftWidth * 0.9, targetY);
      ctx.lineTo(targetX - shaftWidth * 0.9, targetY);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  private drawFighterRimLighting(
    ctx: CanvasRenderingContext2D,
    fighter: Fighter,
  ): void {
    const cx = fighter.x;
    const cy = fighter.y - fighter.height * 0.5;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Aura halo
    const auraRad = fighter.height * 0.65;
    const halo = ctx.createRadialGradient(cx, cy, 10, cx, cy, auraRad);
    halo.addColorStop(0, hexToRgba(fighter.eyeColor, 0.24));
    halo.addColorStop(0.5, hexToRgba(fighter.eyeColor, 0.08));
    halo.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, auraRad, 0, Math.PI * 2);
    ctx.fill();

    // Directional rim accent edge
    const rimOffsetX = -fighter.direction * 14;
    const rimGrad = ctx.createRadialGradient(
      cx + rimOffsetX,
      cy - 10,
      5,
      cx + rimOffsetX,
      cy - 10,
      45,
    );
    rimGrad.addColorStop(0, hexToRgba(fighter.eyeColor, 0.4));
    rimGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rimGrad;
    ctx.beginPath();
    ctx.arc(cx + rimOffsetX, cy - 10, 45, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawAmbientOcclusion(
    ctx: CanvasRenderingContext2D,
    fighters: Fighter[],
  ): void {
    const groundY = this.groundBaseline;

    ctx.save();
    for (const f of fighters) {
      const heightAboveGround = Math.max(0, groundY - f.y);
      const elevationFraction = Math.min(1, heightAboveGround / 250);
      const shadowScale = Math.max(0.25, 1 - elevationFraction * 0.7);
      const shadowAlpha = (0.55 - elevationFraction * 0.4);

      const radX = 45 * shadowScale;
      const radY = 12 * shadowScale;

      const aoGrad = ctx.createRadialGradient(f.x, groundY, 0, f.x, groundY, radX);
      aoGrad.addColorStop(0, `rgba(0, 0, 0, ${shadowAlpha})`);
      aoGrad.addColorStop(0.6, `rgba(0, 0, 0, ${shadowAlpha * 0.4})`);
      aoGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = aoGrad;
      ctx.beginPath();
      ctx.ellipse(f.x, groundY, radX, radY, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // 3. Hit Impact Presentation
  // ---------------------------------------------------------------------------

  private onScreenFlashTriggered(flash: number, fighters: Fighter[]): void {
    this.zoomLinesAlpha = Math.min(1, flash * 1.5);
    this.chromaticAberration = Math.min(1, flash * 1.2);

    if (fighters.length >= 2) {
      this.impactFocalPoint = {
        x: (fighters[0].x + fighters[1].x) / 2,
        y: (fighters[0].y + fighters[1].y) / 2 - 40,
      };
    } else {
      this.impactFocalPoint = { x: this.width / 2, y: this.height / 2 };
    }

    // Heavy flash causes 2-frame impact frame desaturation
    if (flash > 0.4) {
      this.impactFlashTimer = 0.045; // ~2-3 frames at 60fps
    }
  }

  private drawRadialZoomLines(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Convert world focal point to screen coords using camera state
    const dx = this.impactFocalPoint.x - this.camera.x;
    const dy = this.impactFocalPoint.y - this.camera.y;
    const cx = this.width * 0.5 + dx * this.camera.zoom;
    const cy = this.height * 0.5 + dy * this.camera.zoom;

    const lineCount = 42;
    const innerRadius = 90 + (1 - this.zoomLinesAlpha) * 40;
    const maxScreenRadius = Math.max(this.width, this.height);

    ctx.fillStyle = `rgba(255, 255, 255, ${this.zoomLinesAlpha * 0.75})`;

    for (let i = 0; i < lineCount; i++) {
      const angle = (i / lineCount) * Math.PI * 2 + (Math.sin(i * 12.5) * 0.05);
      const innerDist = innerRadius + (Math.sin(i * 7.7) * 25);
      const outerDist = maxScreenRadius;
      const thickness = (1.5 + (i % 3) * 1.8) * this.zoomLinesAlpha;
      const halfAngle = 0.012 * thickness;

      const p1x = cx + Math.cos(angle - halfAngle) * innerDist;
      const p1y = cy + Math.sin(angle - halfAngle) * innerDist;
      const p2x = cx + Math.cos(angle) * outerDist;
      const p2y = cy + Math.sin(angle) * outerDist;
      const p3x = cx + Math.cos(angle + halfAngle) * innerDist;
      const p3y = cy + Math.sin(angle + halfAngle) * innerDist;

      ctx.beginPath();
      ctx.moveTo(p1x, p1y);
      ctx.lineTo(p2x, p2y);
      ctx.lineTo(p3x, p3y);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  private drawScreenFlash(ctx: CanvasRenderingContext2D, flash: number): void {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'screen';
    const g = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.45,
      0,
      this.width * 0.5,
      this.height * 0.45,
      this.width * 0.65,
    );
    g.addColorStop(0, `rgba(255,255,255,${flash * 0.9})`);
    g.addColorStop(0.4, `rgba(230,240,255,${flash * 0.45})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  private drawImpactDesaturationFrame(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Manga-style high-contrast negative punch
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // 4. Cinematic Letterbox
  // ---------------------------------------------------------------------------

  private isSpecialMoveActive(fighter: Fighter): boolean {
    const moveId = (fighter.currentMoveId ?? '').toLowerCase();
    const state = (fighter.state ?? '').toLowerCase();
    return (
      moveId.includes('finisher') ||
      moveId.includes('storm') ||
      moveId.includes('rush') ||
      moveId.includes('slam') ||
      moveId.includes('launch') ||
      moveId.includes('dragon') ||
      moveId.includes('super') ||
      moveId.includes('ultimate') ||
      state.includes('special') ||
      state.includes('finisher')
    );
  }

  private drawCinematicLetterbox(ctx: CanvasRenderingContext2D): void {
    const barHeight = this.height * 0.125 * this.letterboxAmount;
    if (barHeight <= 0.5) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Matte black bars
    ctx.fillStyle = '#010103';
    ctx.fillRect(0, 0, this.width, barHeight);
    ctx.fillRect(0, this.height - barHeight, this.width, barHeight);

    // Golden/Neon edge pinstripes
    const pinstripeAlpha = 0.55 * this.letterboxAmount;
    ctx.strokeStyle = `rgba(255, 215, 80, ${pinstripeAlpha})`;
    ctx.lineWidth = 1.5;

    // Top edge line
    ctx.beginPath();
    ctx.moveTo(0, barHeight);
    ctx.lineTo(this.width, barHeight);
    ctx.stroke();

    // Bottom edge line
    ctx.beginPath();
    ctx.moveTo(0, this.height - barHeight);
    ctx.lineTo(this.width, this.height - barHeight);
    ctx.stroke();

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // 5. Background Energy Waves
  // ---------------------------------------------------------------------------

  private drawBackgroundEnergyWaves(
    ctx: CanvasRenderingContext2D,
    music: number,
    bass: number,
    mid: number,
  ): void {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'screen';

    // Flowing sinusoidal energy ribbons
    const ribbonCount = 3;
    for (let r = 0; r < ribbonCount; r++) {
      const baseY = this.height * (0.35 + r * 0.18);
      const amp = (18 + r * 8) * (1 + bass * 0.7);
      const freq = 0.003 + r * 0.0015;
      const speed = this.time * (1.2 + r * 0.4);

      ctx.beginPath();
      ctx.moveTo(0, baseY);

      for (let x = 0; x <= this.width; x += 25) {
        const y = baseY + Math.sin(x * freq + speed) * amp + Math.cos(x * freq * 0.5 - speed * 0.7) * (amp * 0.5);
        ctx.lineTo(x, y);
      }

      const ribbonAlpha = (0.04 + mid * 0.06 + music * 0.04);
      const rHue = r === 0 ? 'rgba(70, 120, 240,' : r === 1 ? 'rgba(160, 80, 240,' : 'rgba(240, 60, 120,';
      ctx.strokeStyle = `${rHue}${ribbonAlpha})`;
      ctx.lineWidth = 14 + r * 6;
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawWorldEnergyRings(ctx: CanvasRenderingContext2D): void {
    if (this.energyRings.length === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const ring of this.energyRings) {
      const progress = 1 - ring.life / ring.maxLife;
      const alpha = (1 - progress) * 0.45;

      ctx.strokeStyle = hexToRgba(ring.color, alpha);
      ctx.lineWidth = ring.width * (1 - progress * 0.5);
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // 6. Post-Processing Effects
  // ---------------------------------------------------------------------------

  private drawHeatDistortionAura(
    ctx: CanvasRenderingContext2D,
    fighters: Fighter[],
  ): void {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const fighter of fighters) {
      const isPowerMove = this.isSpecialMoveActive(fighter) ||
        (fighter.isHitActive && fighter.currentMove && fighter.currentMove.damage > 20);

      if (!isPowerMove) continue;

      const cx = fighter.x;
      const cy = fighter.y - fighter.height * 0.5;
      const pulse = Math.sin(this.time * 18) * 6;

      ctx.strokeStyle = hexToRgba(fighter.eyeColor, 0.28);
      ctx.lineWidth = 3;

      // Concentric heat distortion ripples
      for (let r = 1; r <= 3; r++) {
        const rad = fighter.height * 0.55 + r * 22 + pulse;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rad * 0.8, rad * 1.1, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private drawChromaticAberration(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'screen';

    const offset = Math.min(18, this.chromaticAberration * 14);
    const alpha = this.chromaticAberration * 0.28;

    // Red fringe border
    ctx.strokeStyle = `rgba(255, 0, 50, ${alpha})`;
    ctx.lineWidth = offset;
    ctx.strokeRect(-offset, -offset, this.width + offset * 2, this.height + offset * 2);

    // Cyan fringe border
    ctx.strokeStyle = `rgba(0, 220, 255, ${alpha})`;
    ctx.lineWidth = offset * 0.8;
    ctx.strokeRect(offset, offset, this.width - offset * 2, this.height - offset * 2);

    ctx.restore();
  }

  private drawVignette(ctx: CanvasRenderingContext2D, music: number): void {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const cx = this.width / 2;
    const cy = this.height / 2;
    const innerRad = Math.min(this.width, this.height) * 0.38;
    const outerRad = Math.max(this.width, this.height) * 0.72;

    const vigGrad = ctx.createRadialGradient(cx, cy, innerRad, cx, cy, outerRad);
    vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vigGrad.addColorStop(0.7, `rgba(2, 3, 6, ${0.4 + music * 0.15})`);
    vigGrad.addColorStop(1, `rgba(1, 2, 4, ${0.82 + music * 0.1})`);

    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.restore();
  }

  private drawColorGradingOverlay(
    ctx: CanvasRenderingContext2D,
    music: number,
    fighters: Fighter[],
  ): void {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Dramatic Crimson Danger Tint when any fighter is below 25% health
    const isCritical = fighters.some((f) => f.health < 25);
    if (isCritical) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgba(60, 15, 25, 0.18)';
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // High intensity dark fantasy contrast grading
    if (music > 0.4) {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = `rgba(30, 45, 80, ${(music - 0.4) * 0.22})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // 7. Health & Combo UI
  // ---------------------------------------------------------------------------

  private updateCombatTelemetry(dt: number, fighters: Fighter[]): void {
    // Initialize or resize telemetry trackers
    while (this.healthTracking.length < fighters.length) {
      const idx = this.healthTracking.length;
      this.healthTracking.push({
        current: fighters[idx]?.health ?? 100,
        lag: fighters[idx]?.health ?? 100,
        lastDamageTime: 0,
      });
    }

    for (let i = 0; i < fighters.length; i++) {
      const f = fighters[i];
      const track = this.healthTracking[i];
      const currentHealth = Math.max(0, f.health);

      // Detect hit damage taken
      if (currentHealth < track.current) {
        const dmg = track.current - currentHealth;
        track.lastDamageTime = this.time;

        // Opponent attacker index
        const attackerIdx = i === 0 ? 1 : 0;
        this.registerComboHit(attackerIdx, dmg);

        // Spawn heavy impact effects on victim
        if (dmg >= 8) {
          this.hitstopTimer = 0.045; // 2-3 frames hitstop crunch!
          this.spawnGroundCrack(f.x, this.groundBaseline, f.eyeColor, Math.min(2, dmg / 10));
          this.vfx.flashScreen(0.4 + Math.min(0.5, dmg / 30));
        }
      }

      track.current = currentHealth;

      // Smooth damage lag catchup
      if (track.lag > track.current) {
        const lagDelay = this.time - track.lastDamageTime;
        if (lagDelay > 0.45) {
          track.lag = Math.max(track.current, track.lag - 35 * dt);
        }
      } else {
        track.lag = track.current;
      }
    }

    // Update active combo timer
    if (this.comboState.timer > 0) {
      this.comboState.timer -= dt;
      this.comboState.scale = Math.max(1, this.comboState.scale - dt * 4);
      if (this.comboState.timer <= 0) {
        this.comboState.count = 0;
        this.comboState.damage = 0;
      }
    }
  }

  private registerComboHit(attackerIdx: number, damage: number): void {
    if (this.comboState.attackerIndex !== attackerIdx || this.comboState.timer <= 0) {
      this.comboState.count = 1;
      this.comboState.damage = damage;
      this.comboState.attackerIndex = attackerIdx;
    } else {
      this.comboState.count += 1;
      this.comboState.damage += damage;
    }
    this.comboState.timer = 1.75;
    this.comboState.scale = 1.45; // Punchy hit bounce
  }

  private drawCombatHUD(
    ctx: CanvasRenderingContext2D,
    fighters: Fighter[],
  ): void {
    if (fighters.length < 2) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const f1 = fighters[0];
    const f2 = fighters[1];
    const track1 = this.healthTracking[0] ?? { current: f1.health, lag: f1.health };
    const track2 = this.healthTracking[1] ?? { current: f2.health, lag: f2.health };

    const hudMargin = 38;
    const barW = Math.min(340, this.width * 0.36);
    const barH = 16;
    const hudY = 32;

    // P1 Health Bar (Top Left)
    this.drawHealthBar(ctx, hudMargin, hudY, barW, barH, f1, track1, false);

    // P2 Health Bar (Top Right)
    this.drawHealthBar(ctx, this.width - hudMargin - barW, hudY, barW, barH, f2, track2, true);

    // Center Versus Badge
    const vsX = this.width / 2;
    const vsY = hudY + barH / 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '900 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 8;
    ctx.fillText('VS', vsX, vsY);
    ctx.shadowBlur = 0;

    // Combo Counter Display
    if (this.comboState.count >= 2 && this.comboState.timer > 0) {
      this.drawComboCounter(ctx, fighters);
    }

    ctx.restore();
  }

  private drawHealthBar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    fighter: Fighter,
    track: FighterHealthTracking,
    mirrored: boolean,
  ): void {
    const healthFrac = Math.max(0, Math.min(1, track.current / 100));
    const lagFrac = Math.max(0, Math.min(1, track.lag / 100));

    // Fighter Name / Style Banner
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = mirrored ? 'right' : 'left';
    ctx.textBaseline = 'bottom';
    const name = fighter.style.toUpperCase();
    ctx.shadowColor = fighter.eyeColor;
    ctx.shadowBlur = 6;
    ctx.fillText(name, mirrored ? x + w : x, y - 6);
    ctx.shadowBlur = 0;

    // Outer Background Box
    ctx.fillStyle = 'rgba(8, 10, 16, 0.85)';
    ctx.fillRect(x, y, w, h);

    // Damage Lag Bar (Red catchup fill)
    ctx.fillStyle = 'rgba(230, 50, 60, 0.75)';
    if (!mirrored) {
      ctx.fillRect(x, y, w * lagFrac, h);
    } else {
      ctx.fillRect(x + w * (1 - lagFrac), y, w * lagFrac, h);
    }

    // Active Health Gradient Fill
    const barGrad = ctx.createLinearGradient(x, y, x + w, y);
    if (!mirrored) {
      barGrad.addColorStop(0, fighter.eyeColor);
      barGrad.addColorStop(1, '#ffffff');
      ctx.fillStyle = barGrad;
      ctx.fillRect(x, y, w * healthFrac, h);
    } else {
      barGrad.addColorStop(0, '#ffffff');
      barGrad.addColorStop(1, fighter.eyeColor);
      ctx.fillStyle = barGrad;
      ctx.fillRect(x + w * (1 - healthFrac), y, w * healthFrac, h);
    }

    // Border Frame
    ctx.strokeStyle = 'rgba(200, 220, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
  }

  private drawComboCounter(
    ctx: CanvasRenderingContext2D,
    fighters: Fighter[],
  ): void {
    const isP1 = this.comboState.attackerIndex === 0;
    const attacker = fighters[this.comboState.attackerIndex] ?? fighters[0];
    const comboX = isP1 ? 80 : this.width - 80;
    const comboY = 125;
    const scale = this.comboState.scale;
    const alpha = Math.min(1, this.comboState.timer * 2);

    ctx.save();
    ctx.translate(comboX, comboY);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;

    // Number
    ctx.font = '900 48px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = isP1 ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = attacker.eyeColor;
    ctx.shadowBlur = 16;
    ctx.fillText(`${this.comboState.count}`, 0, 0);

    // HITS Label
    ctx.font = '800 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = attacker.eyeColor;
    ctx.shadowBlur = 8;
    ctx.fillText('HITS', isP1 ? 65 : -65, 0);

    // Rating Subtitle
    let rating = 'BRUTAL';
    if (this.comboState.count >= 10) rating = 'ANNIHILATION!';
    else if (this.comboState.count >= 7) rating = 'SAVAGE!';
    else if (this.comboState.count >= 4) rating = 'SUPERIOR';

    ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.shadowBlur = 4;
    ctx.fillText(rating, 0, 28);

    ctx.restore();
  }

  private drawCombatCallouts(ctx: CanvasRenderingContext2D): void {
    if (this.combatCallouts.length === 0) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    for (const callout of this.combatCallouts) {
      const screenX = this.width * 0.5 + (callout.x - this.camera.x) * this.camera.zoom;
      const screenY = this.height * 0.5 + (callout.y - this.camera.y) * this.camera.zoom;

      ctx.save();
      ctx.translate(screenX, screenY);
      ctx.rotate(callout.angle);
      ctx.scale(callout.scale, callout.scale);
      ctx.globalAlpha = callout.alpha;

      ctx.font = '900 24px "Impact", "Arial Black", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.shadowColor = callout.color;
      ctx.shadowBlur = callout.isCritical ? 24 : 14;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 6;
      ctx.strokeText(callout.text, 0, 0);

      const textGrad = ctx.createLinearGradient(0, -12, 0, 12);
      textGrad.addColorStop(0, '#ffffff');
      textGrad.addColorStop(0.4, callout.color);
      textGrad.addColorStop(1, '#ffffff');
      ctx.fillStyle = textGrad;
      ctx.fillText(callout.text, 0, 0);

      ctx.restore();
    }
    ctx.restore();
  }

  private drawDimensionalSlashScreen(ctx: CanvasRenderingContext2D): void {
    if (!this.dimensionalSlash) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const progress = 1 - this.dimensionalSlash.timer / this.dimensionalSlash.duration;

    if (progress < 0.75) {
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = `rgba(255, 255, 255, ${0.45 * (1 - progress * 0.5)})`;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.globalCompositeOperation = 'source-over';
    }

    for (const line of this.dimensionalSlash.lines) {
      const sx1 = this.width * 0.5 + (line.x1 - this.camera.x) * this.camera.zoom;
      const sy1 = this.height * 0.5 + (line.y1 - this.camera.y) * this.camera.zoom;
      const sx2 = this.width * 0.5 + (line.x2 - this.camera.x) * this.camera.zoom;
      const sy2 = this.height * 0.5 + (line.y2 - this.camera.y) * this.camera.zoom;

      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.width * (progress < 0.75 ? 3 : 1.5);
      ctx.shadowColor = line.color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = line.width * 0.6;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawClashSparks(ctx: CanvasRenderingContext2D): void {
    if (this.clashSparks.length === 0) return;

    ctx.save();
    for (const s of this.clashSparks) {
      const alpha = s.life / s.maxLife;
      ctx.fillStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 10;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// -----------------------------------------------------------------------------
// Helper Utilities
// -----------------------------------------------------------------------------

function hexToRgba(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  if (hex.startsWith('rgba')) {
    return hex.replace(/[\d.]+\)$/g, `${a})`);
  }
  if (hex.startsWith('#')) {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    }
    return `rgba(${r},${g},${b},${a})`;
  }
  return `rgba(255,255,255,${a})`;
}
