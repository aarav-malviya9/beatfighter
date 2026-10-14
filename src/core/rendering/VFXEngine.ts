export type VFXQuality = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  active: boolean;
  kind: ParticleKind;
  angle: number;
  spin: number;
  gravity: number;
  drag: number;
  stretch: number;
  alpha: number;
}

type ParticleKind =
  | 'spark'
  | 'dust'
  | 'speedline'
  | 'glow'
  | 'ribbon'
  | 'slash'
  | 'sphere'
  | 'arc'
  | 'flash';

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  thickness: number;
  color: string;
  active: boolean;
  life: number;
  maxLife: number;
  rings: number;
}

interface SlashTrail {
  active: boolean;
  x: number;
  y: number;
  angle: number;
  length: number;
  width: number;
  color: string;
  life: number;
  maxLife: number;
  crescent: number;
}

interface Ribbon {
  active: boolean;
  points: { x: number; y: number }[];
  color: string;
  width: number;
  life: number;
  maxLife: number;
  curl: number;
  speed: number;
  angle: number;
  ox: number;
  oy: number;
}

interface EnergySphere {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
  pulse: number;
}

interface ElectricArc {
  active: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  life: number;
  maxLife: number;
  segments: number;
  jitter: number;
  seed: number;
}

interface Afterimage {
  active: boolean;
  x: number;
  y: number;
  facing: number;
  color: string;
  life: number;
  maxLife: number;
  height: number;
  alpha: number;
}

interface QualityProfile {
  particleBudget: number;
  shockwaveBudget: number;
  bgCount: number;
  slashBudget: number;
  ribbonBudget: number;
  sphereBudget: number;
  arcBudget: number;
  afterimageBudget: number;
  emitScale: number;
  drawBg: boolean;
  drawArcs: boolean;
  drawRibbons: boolean;
  drawAfterimages: boolean;
  drawSpeedLines: boolean;
}

const QUALITY: Record<VFXQuality, QualityProfile> = {
  LOW: {
    particleBudget: 120,
    shockwaveBudget: 4,
    bgCount: 40,
    slashBudget: 4,
    ribbonBudget: 2,
    sphereBudget: 2,
    arcBudget: 2,
    afterimageBudget: 4,
    emitScale: 0.35,
    drawBg: true,
    drawArcs: false,
    drawRibbons: false,
    drawAfterimages: false,
    drawSpeedLines: false,
  },
  MEDIUM: {
    particleBudget: 280,
    shockwaveBudget: 8,
    bgCount: 90,
    slashBudget: 8,
    ribbonBudget: 6,
    sphereBudget: 4,
    arcBudget: 4,
    afterimageBudget: 8,
    emitScale: 0.65,
    drawBg: true,
    drawArcs: true,
    drawRibbons: true,
    drawAfterimages: true,
    drawSpeedLines: true,
  },
  HIGH: {
    particleBudget: 600,
    shockwaveBudget: 14,
    bgCount: 160,
    slashBudget: 14,
    ribbonBudget: 12,
    sphereBudget: 8,
    arcBudget: 8,
    afterimageBudget: 16,
    emitScale: 1,
    drawBg: true,
    drawArcs: true,
    drawRibbons: true,
    drawAfterimages: true,
    drawSpeedLines: true,
  },
  ULTRA: {
    particleBudget: 1000,
    shockwaveBudget: 20,
    bgCount: 240,
    slashBudget: 20,
    ribbonBudget: 18,
    sphereBudget: 12,
    arcBudget: 14,
    afterimageBudget: 24,
    emitScale: 1.35,
    drawBg: true,
    drawArcs: true,
    drawRibbons: true,
    drawAfterimages: true,
    drawSpeedLines: true,
  },
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function hexToRgb(color: string): { r: number; g: number; b: number } {
  const c = color.trim();
  if (c.startsWith('#')) {
    const h = c.slice(1);
    const full = h.length === 3 ? h.split('').map((ch) => ch + ch).join('') : h;
    const n = parseInt(full.slice(0, 6), 16);
    if (!Number.isNaN(n)) {
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
  }
  const m = c.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3] };
  return { r: 220, g: 220, b: 230 };
}

function rgba(color: string, a: number): string {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r},${g},${b},${clamp01(a)})`;
}

function softAccent(color: string): string {
  const { r, g, b } = hexToRgb(color);
  // Pull toward silver / soft violet so effects stay dark-fantasy, not neon
  return `rgb(${Math.round(r * 0.55 + 140)},${Math.round(g * 0.55 + 130)},${Math.round(b * 0.55 + 150)})`;
}

export class VFXEngine {
  private particles: Particle[] = [];
  private shockwaves: Shockwave[] = [];
  private bgParticles: Particle[] = [];
  private slashes: SlashTrail[] = [];
  private ribbons: Ribbon[] = [];
  private spheres: EnergySphere[] = [];
  private arcs: ElectricArc[] = [];
  private afterimages: Afterimage[] = [];

  private quality: VFXQuality = 'HIGH';
  private intensityMul = 1;
  private screenFlash = 0;
  private time = 0;

  constructor(poolSize = 1000) {
    this.rebuildPools(poolSize);
    this.setQuality('HIGH');
  }

  // ---------------------------------------------------------------------------
  // Quality / intensity
  // ---------------------------------------------------------------------------

  public setQuality(quality: VFXQuality): void {
    this.quality = quality;
    const profile = QUALITY[quality];
    this.ensurePool(this.particles, profile.particleBudget, () => this.makeParticle());
    this.ensurePool(this.shockwaves, profile.shockwaveBudget, () => this.makeShockwave());
    this.ensurePool(this.slashes, profile.slashBudget, () => this.makeSlash());
    this.ensurePool(this.ribbons, profile.ribbonBudget, () => this.makeRibbon());
    this.ensurePool(this.spheres, profile.sphereBudget, () => this.makeSphere());
    this.ensurePool(this.arcs, profile.arcBudget, () => this.makeArc());
    this.ensurePool(this.afterimages, profile.afterimageBudget, () => this.makeAfterimage());
    this.rebuildBg(profile.bgCount);
  }

  public setIntensityMultiplier(mul: number): void {
    this.intensityMul = Math.max(0, mul);
  }

  public flashScreen(amount = 0.55): void {
    this.screenFlash = Math.max(this.screenFlash, clamp01(amount * this.intensityMul));
  }

  /** Returns current flash alpha and clears it (for screen-space overlay). */
  public consumeScreenFlash(): number {
    const v = this.screenFlash;
    this.screenFlash = 0;
    return v;
  }

  // ---------------------------------------------------------------------------
  // Emitters — keep emitHit signature for App compatibility
  // ---------------------------------------------------------------------------

  public emitHit(x: number, y: number, color: string, intensity: number = 1): void {
    const i = this.scaled(intensity);
    const accent = softAccent(color);
    const profile = QUALITY[this.quality];

    // White flash frame
    this.spawnParticles(x, y, Math.floor(4 * i), {
      kind: 'flash',
      color: '#ffffff',
      size: 6 + 8 * i,
      speed: 40,
      life: 0.06 + 0.04 * i,
      gravity: 0,
      drag: 0.2,
      spread: Math.PI * 2,
    });

    // Directional burst sparks
    this.spawnParticles(x, y, Math.floor(18 * i * profile.emitScale), {
      kind: 'spark',
      color: accent,
      size: 2.5 + 2 * i,
      speed: 220 * i + 80,
      life: 0.18 + 0.2 * i,
      gravity: 420,
      drag: 0.12,
      spread: Math.PI * 2,
      stretch: 2.2,
    });

    // Radial speed lines
    if (profile.drawSpeedLines) {
      this.spawnParticles(x, y, Math.floor(10 * i * profile.emitScale), {
        kind: 'speedline',
        color: '#e8e8f0',
        size: 1.2,
        speed: 380 * i + 120,
        life: 0.12 + 0.08 * i,
        gravity: 0,
        drag: 0.05,
        spread: Math.PI * 2,
        stretch: 8 + 6 * i,
      });
    }

    // Expanding shockwave rings
    if (i > 0.35) {
      this.emitShockwave(x, y, accent, i);
    }

    // Ground dust
    this.emitDust(x, y + 18, Math.floor(10 * i * profile.emitScale), 0.7 * i);

    if (i > 0.75) {
      this.flashScreen(0.25 + 0.35 * (i - 0.75));
    }
  }

  public emitSlash(
    x: number,
    y: number,
    angle: number,
    color: string,
    intensity: number = 1,
  ): void {
    const i = this.scaled(intensity);
    const accent = softAccent(color);
    const slash = this.acquire(this.slashes);
    if (slash) {
      slash.active = true;
      slash.x = x;
      slash.y = y;
      slash.angle = angle;
      slash.length = 70 + 90 * i;
      slash.width = 8 + 14 * i;
      slash.color = accent;
      slash.maxLife = 0.18 + 0.12 * i;
      slash.life = slash.maxLife;
      slash.crescent = 0.65 + 0.25 * i;
    }

    // Charged limb glow sparks along the arc
    const count = Math.floor(8 * i * QUALITY[this.quality].emitScale);
    for (let n = 0; n < count; n++) {
      const t = n / Math.max(1, count - 1);
      const a = angle - 0.9 + t * 1.8;
      const px = x + Math.cos(a) * (40 + 50 * i) * t;
      const py = y + Math.sin(a) * (40 + 50 * i) * t;
      this.spawnOne(px, py, {
        kind: 'glow',
        color: accent,
        size: 3 + 3 * i,
        speed: 40,
        life: 0.2,
        gravity: -40,
        drag: 0.3,
        spread: 0.4,
        angleBias: a,
      });
    }

    if (QUALITY[this.quality].drawRibbons) {
      this.emitRibbon(x, y, angle, accent, i);
    }
  }

  public emitShockwave(x: number, y: number, color: string, intensity: number = 1): void {
    const i = this.scaled(intensity);
    const accent = softAccent(color);
    const rings = i > 1.2 ? 3 : i > 0.7 ? 2 : 1;
    for (let r = 0; r < rings; r++) {
      const s = this.acquire(this.shockwaves);
      if (!s) break;
      s.active = true;
      s.x = x;
      s.y = y;
      s.radius = 8 + r * 12;
      s.maxRadius = (90 + 110 * i) * (1 + r * 0.22);
      s.thickness = (9 + 8 * i) / (1 + r * 0.5);
      s.color = r === 0 ? '#ffffff' : accent;
      s.maxLife = 0.35 + 0.15 * i;
      s.life = s.maxLife;
      s.rings = rings;
    }
  }

  public emitArc(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    intensity: number = 1,
  ): void {
    if (!QUALITY[this.quality].drawArcs) return;
    const i = this.scaled(intensity);
    const accent = softAccent(color);
    const arc = this.acquire(this.arcs);
    if (!arc) return;
    arc.active = true;
    arc.x1 = x1;
    arc.y1 = y1;
    arc.x2 = x2;
    arc.y2 = y2;
    arc.color = accent;
    arc.maxLife = 0.12 + 0.1 * i;
    arc.life = arc.maxLife;
    arc.segments = Math.floor(5 + 6 * i);
    arc.jitter = 6 + 14 * i;
    arc.seed = Math.random() * 1000;
  }

  public emitEnergy(x: number, y: number, color: string, intensity: number = 1): void {
    const i = this.scaled(intensity);
    const accent = softAccent(color);

    const sphere = this.acquire(this.spheres);
    if (sphere) {
      sphere.active = true;
      sphere.x = x;
      sphere.y = y;
      sphere.radius = 4;
      sphere.maxRadius = 18 + 28 * i;
      sphere.color = accent;
      sphere.maxLife = 0.35 + 0.25 * i;
      sphere.life = sphere.maxLife;
      sphere.pulse = Math.random() * Math.PI * 2;
    }

    this.spawnParticles(x, y, Math.floor(12 * i * QUALITY[this.quality].emitScale), {
      kind: 'sphere',
      color: accent,
      size: 2 + 2 * i,
      speed: 60 + 80 * i,
      life: 0.3 + 0.2 * i,
      gravity: -60,
      drag: 0.4,
      spread: Math.PI * 2,
    });

    // Soft limb glow halo
    this.spawnParticles(x, y, Math.floor(4 * i), {
      kind: 'glow',
      color: accent,
      size: 10 + 12 * i,
      speed: 10,
      life: 0.25,
      gravity: 0,
      drag: 0.5,
      spread: Math.PI * 2,
    });
  }

  public emitDust(x: number, y: number, count: number = 12, intensity: number = 1): void {
    const i = this.scaled(intensity);
    const n = Math.floor(count * QUALITY[this.quality].emitScale);
    this.spawnParticles(x, y, n, {
      kind: 'dust',
      color: 'rgba(120,118,130,1)',
      size: 2 + 3 * i,
      speed: 40 + 70 * i,
      life: 0.4 + 0.35 * i,
      gravity: 180,
      drag: 0.55,
      spread: Math.PI * 0.85,
      angleBias: -Math.PI / 2,
    });
  }

  public emitMoveVFX(
    vfx: {
      type: 'slash' | 'burst' | 'shockwave' | 'arc' | 'energy' | 'launch' | 'slam' | 'spark';
      color: string;
      intensity: number;
      radius?: number;
    },
    x: number,
    y: number,
    dir: 1 | -1,
    damage: number = 0,
  ): void {
    const intensity = Math.min(1.5, Math.max(0.3, vfx.intensity * (1 + damage / 60)));
    const col = vfx.color || '#ffffff';

    switch (vfx.type) {
      case 'slash': {
        const angle = dir > 0 ? 0.2 : Math.PI - 0.2;
        this.emitSlash(x, y, angle, col, intensity);
        break;
      }
      case 'spark': {
        this.spawnParticles(x, y, Math.floor(14 * intensity), {
          kind: 'spark',
          color: col,
          size: 2.5 + intensity * 2,
          speed: 240 * intensity + 60,
          life: 0.18 + 0.1 * intensity,
          gravity: 350,
          drag: 0.1,
          spread: Math.PI * 0.9,
          angleBias: dir > 0 ? 0 : Math.PI,
          stretch: 2.5,
        });
        break;
      }
      case 'arc': {
        const x2 = x + dir * (60 + 40 * intensity);
        const y2 = y + (Math.random() - 0.5) * 30;
        this.emitArc(x, y, x2, y2, col, intensity);
        this.emitSlash(x, y, dir > 0 ? 0.5 : Math.PI - 0.5, col, intensity * 0.8);
        break;
      }
      case 'energy': {
        this.emitEnergy(x, y, col, intensity);
        this.emitShockwave(x, y, col, intensity * 0.7);
        break;
      }
      case 'launch': {
        this.emitShockwave(x, y + 10, col, intensity * 0.8);
        this.spawnParticles(x, y, Math.floor(16 * intensity), {
          kind: 'speedline',
          color: col,
          size: 2,
          speed: 450 * intensity,
          life: 0.22,
          gravity: -200,
          drag: 0.05,
          spread: 0.5,
          angleBias: -Math.PI / 2,
          stretch: 12,
        });
        break;
      }
      case 'slam': {
        this.emitShockwave(x, y, col, intensity * 1.3);
        this.emitDust(x, y, Math.floor(25 * intensity), intensity);
        this.spawnParticles(x, y - 5, Math.floor(16 * intensity), {
          kind: 'spark',
          color: '#ffffff',
          size: 3,
          speed: 320 * intensity,
          life: 0.28,
          gravity: 500,
          drag: 0.08,
          spread: Math.PI,
          angleBias: -Math.PI / 2,
          stretch: 3,
        });
        break;
      }
      case 'shockwave': {
        this.emitShockwave(x, y, col, intensity);
        break;
      }
      case 'burst':
      default: {
        this.emitHit(x, y, col, intensity);
        break;
      }
    }
  }

  public addAfterimage(
    x: number,
    y: number,
    facing: number = 1,
    color: string = '#c8c8d8',
    height: number = 150,
  ): void {
    if (!QUALITY[this.quality].drawAfterimages) return;
    const img = this.acquire(this.afterimages);
    if (!img) return;
    img.active = true;
    img.x = x;
    img.y = y;
    img.facing = facing >= 0 ? 1 : -1;
    img.color = softAccent(color);
    img.height = height;
    img.maxLife = 0.28;
    img.life = img.maxLife;
    img.alpha = 0.45 * this.intensityMul;
  }

  // ---------------------------------------------------------------------------
  // Update / draw
  // ---------------------------------------------------------------------------

  public update(dt: number): void {
    this.time += dt;
    if (this.screenFlash > 0) {
      this.screenFlash = Math.max(0, this.screenFlash - dt * 3.5);
    }

    for (const p of this.particles) {
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      const damp = Math.pow(Math.max(0.01, 1 - p.drag), dt * 60);
      p.vx *= damp;
      p.vy *= damp;
      p.angle += p.spin * dt;
      p.life -= dt;
      if (p.life <= 0) p.active = false;
    }

    for (const s of this.shockwaves) {
      if (!s.active) continue;
      const t = 1 - s.life / s.maxLife;
      s.radius += (s.maxRadius - s.radius) * (1 - Math.pow(0.002, dt));
      s.thickness *= Math.pow(0.08, dt);
      s.life -= dt;
      if (s.life <= 0 || s.thickness < 0.35 || t > 0.98) s.active = false;
    }

    for (const slash of this.slashes) {
      if (!slash.active) continue;
      slash.life -= dt;
      slash.width *= Math.pow(0.05, dt);
      if (slash.life <= 0) slash.active = false;
    }

    for (const ribbon of this.ribbons) {
      if (!ribbon.active) continue;
      ribbon.life -= dt;
      const progress = 1 - ribbon.life / ribbon.maxLife;
      const a = ribbon.angle + Math.sin(progress * Math.PI * ribbon.curl) * 0.8;
      const last = ribbon.points[ribbon.points.length - 1];
      if (last) {
        ribbon.points.push({
          x: last.x + Math.cos(a) * ribbon.speed * dt,
          y: last.y + Math.sin(a) * ribbon.speed * dt,
        });
        if (ribbon.points.length > 18) ribbon.points.shift();
      }
      if (ribbon.life <= 0) ribbon.active = false;
    }

    for (const sphere of this.spheres) {
      if (!sphere.active) continue;
      sphere.life -= dt;
      const t = 1 - sphere.life / sphere.maxLife;
      sphere.radius = sphere.maxRadius * Math.sin(Math.min(1, t * 1.4) * Math.PI);
      sphere.pulse += dt * 8;
      if (sphere.life <= 0) sphere.active = false;
    }

    for (const arc of this.arcs) {
      if (!arc.active) continue;
      arc.life -= dt;
      arc.seed += dt * 40;
      if (arc.life <= 0) arc.active = false;
    }

    for (const img of this.afterimages) {
      if (!img.active) continue;
      img.life -= dt;
      if (img.life <= 0) img.active = false;
    }

    for (const p of this.bgParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 8 * dt;
      p.life = 0.35 + 0.45 * Math.sin(this.time * 0.7 + p.x * 0.01);
      if (p.y < -600) {
        p.y = 900;
        p.x = Math.random() * 2400 - 600;
        p.vy = (Math.random() - 0.5) * 8 - 4;
      }
      if (p.x < -1200) p.x = 2200;
      if (p.x > 2200) p.x = -1200;
    }
  }

  public drawBackground(ctx: CanvasRenderingContext2D): void {
    if (!QUALITY[this.quality].drawBg) return;
    ctx.save();
    for (const p of this.bgParticles) {
      const a = 0.08 + 0.18 * (p.life || 0.5);
      ctx.fillStyle = rgba('#c8c8d4', a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  public drawForeground(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // Afterimages (behind impact FX)
    if (QUALITY[this.quality].drawAfterimages) {
      for (const img of this.afterimages) {
        if (!img.active) continue;
        const t = img.life / img.maxLife;
        ctx.globalAlpha = img.alpha * t;
        ctx.fillStyle = img.color;
        ctx.beginPath();
        const w = 28;
        const h = img.height;
        ctx.ellipse(img.x, img.y - h * 0.45, w * 0.35, h * 0.48, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = img.alpha * t * 0.5;
        ctx.fillRect(img.x - 6 * img.facing, img.y - h * 0.85, 12 * img.facing, h * 0.55);
      }
    }

    // Shockwaves
    for (const s of this.shockwaves) {
      if (!s.active) continue;
      const t = s.life / s.maxLife;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(0.5, s.thickness);
      ctx.strokeStyle = rgba(s.color, 0.15 + 0.65 * t);
      ctx.stroke();
      if (s.rings > 1) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * 0.72, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(0.4, s.thickness * 0.45);
        ctx.strokeStyle = rgba('#ffffff', 0.1 + 0.35 * t);
        ctx.stroke();
      }
    }

    // Crescent slash trails
    for (const slash of this.slashes) {
      if (!slash.active) continue;
      const t = slash.life / slash.maxLife;
      ctx.save();
      ctx.translate(slash.x, slash.y);
      ctx.rotate(slash.angle);
      ctx.globalAlpha = t;
      const grd = ctx.createLinearGradient(-slash.length * 0.2, 0, slash.length, 0);
      grd.addColorStop(0, rgba(slash.color, 0));
      grd.addColorStop(0.35, rgba('#ffffff', 0.85));
      grd.addColorStop(0.7, rgba(slash.color, 0.7));
      grd.addColorStop(1, rgba(slash.color, 0));
      ctx.strokeStyle = grd;
      ctx.lineWidth = slash.width * t;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, slash.length * slash.crescent, -0.95, 0.95);
      ctx.stroke();
      ctx.restore();
    }

    // Curved ribbons
    if (QUALITY[this.quality].drawRibbons) {
      for (const ribbon of this.ribbons) {
        if (!ribbon.active || ribbon.points.length < 2) continue;
        const t = ribbon.life / ribbon.maxLife;
        ctx.beginPath();
        ctx.moveTo(ribbon.points[0].x, ribbon.points[0].y);
        for (let i = 1; i < ribbon.points.length; i++) {
          ctx.lineTo(ribbon.points[i].x, ribbon.points[i].y);
        }
        ctx.strokeStyle = rgba(ribbon.color, 0.15 + 0.55 * t);
        ctx.lineWidth = ribbon.width * t;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    }

    // Energy spheres
    for (const sphere of this.spheres) {
      if (!sphere.active) continue;
      const t = sphere.life / sphere.maxLife;
      const pulse = 1 + Math.sin(sphere.pulse) * 0.08;
      const r = Math.max(1, sphere.radius * pulse);
      const g = ctx.createRadialGradient(sphere.x, sphere.y, 0, sphere.x, sphere.y, r);
      g.addColorStop(0, rgba('#ffffff', 0.55 * t));
      g.addColorStop(0.45, rgba(sphere.color, 0.35 * t));
      g.addColorStop(1, rgba(sphere.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sphere.x, sphere.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Electric arcs
    if (QUALITY[this.quality].drawArcs) {
      for (const arc of this.arcs) {
        if (!arc.active) continue;
        const t = arc.life / arc.maxLife;
        ctx.strokeStyle = rgba(arc.color, 0.25 + 0.55 * t);
        ctx.lineWidth = 1.2 + 1.5 * t;
        ctx.beginPath();
        ctx.moveTo(arc.x1, arc.y1);
        const segs = arc.segments;
        for (let i = 1; i <= segs; i++) {
          const u = i / segs;
          const bx = arc.x1 + (arc.x2 - arc.x1) * u;
          const by = arc.y1 + (arc.y2 - arc.y1) * u;
          const nx = -(arc.y2 - arc.y1);
          const ny = arc.x2 - arc.x1;
          const len = Math.hypot(nx, ny) || 1;
          const j =
            Math.sin(arc.seed + i * 2.7) * arc.jitter * (1 - Math.abs(u - 0.5) * 1.2);
          ctx.lineTo(bx + (nx / len) * j, by + (ny / len) * j);
        }
        ctx.stroke();
        ctx.strokeStyle = rgba('#ffffff', 0.2 * t);
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }

    // Particles
    for (const p of this.particles) {
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, t * p.alpha);
      if (p.kind === 'speedline') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.stretch * 0.5, -p.size * 0.5, p.stretch * t, p.size);
        ctx.restore();
      } else if (p.kind === 'slash' || p.kind === 'ribbon') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * (1 + p.stretch * 0.5), p.size * 0.5, p.angle, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'glow' || p.kind === 'flash') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        g.addColorStop(0, rgba('#ffffff', 0.8 * t));
        g.addColorStop(0.4, rgba(p.color, 0.35 * t));
        g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'dust') {
        ctx.fillStyle = rgba('#9a98a4', 0.35 * t);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.7 + 0.6 * (1 - t)), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        if (p.stretch > 1.1) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.atan2(p.vy, p.vx));
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size * p.stretch * 0.55, p.size * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private scaled(intensity: number): number {
    return Math.max(0, intensity) * this.intensityMul * QUALITY[this.quality].emitScale;
  }

  private emitRibbon(x: number, y: number, angle: number, color: string, i: number): void {
    const ribbon = this.acquire(this.ribbons);
    if (!ribbon) return;
    ribbon.active = true;
    ribbon.ox = x;
    ribbon.oy = y;
    ribbon.angle = angle;
    ribbon.color = color;
    ribbon.width = 3 + 5 * i;
    ribbon.maxLife = 0.28 + 0.15 * i;
    ribbon.life = ribbon.maxLife;
    ribbon.curl = 1.5 + i;
    ribbon.speed = 220 + 180 * i;
    ribbon.points = [{ x, y }];
  }

  private spawnParticles(
    x: number,
    y: number,
    count: number,
    opts: {
      kind: ParticleKind;
      color: string;
      size: number;
      speed: number;
      life: number;
      gravity: number;
      drag: number;
      spread: number;
      stretch?: number;
      angleBias?: number;
    },
  ): void {
    let emitted = 0;
    for (const p of this.particles) {
      if (p.active) continue;
      this.activateParticle(p, x, y, opts);
      emitted++;
      if (emitted >= count) break;
    }
  }

  private spawnOne(
    x: number,
    y: number,
    opts: {
      kind: ParticleKind;
      color: string;
      size: number;
      speed: number;
      life: number;
      gravity: number;
      drag: number;
      spread: number;
      stretch?: number;
      angleBias?: number;
    },
  ): void {
    const p = this.acquire(this.particles);
    if (p) this.activateParticle(p, x, y, opts);
  }

  private activateParticle(
    p: Particle,
    x: number,
    y: number,
    opts: {
      kind: ParticleKind;
      color: string;
      size: number;
      speed: number;
      life: number;
      gravity: number;
      drag: number;
      spread: number;
      stretch?: number;
      angleBias?: number;
    },
  ): void {
    const bias = opts.angleBias ?? 0;
    const angle = bias + (Math.random() - 0.5) * opts.spread;
    const speed = opts.speed * (0.45 + Math.random() * 0.7);
    p.active = true;
    p.kind = opts.kind;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.maxLife = opts.life * (0.7 + Math.random() * 0.5);
    p.life = p.maxLife;
    p.color = opts.color;
    p.size = opts.size * (0.7 + Math.random() * 0.6);
    p.angle = angle;
    p.spin = (Math.random() - 0.5) * 6;
    p.gravity = opts.gravity;
    p.drag = opts.drag;
    p.stretch = opts.stretch ?? 1;
    p.alpha = 1;
  }

  private acquire<T extends { active: boolean }>(pool: T[]): T | null {
    for (const item of pool) {
      if (!item.active) return item;
    }
    return null;
  }

  private ensurePool<T>(pool: T[], size: number, factory: () => T): void {
    while (pool.length < size) pool.push(factory());
    if (pool.length > size) pool.length = size;
  }

  private rebuildPools(particleCap: number): void {
    this.particles = [];
    this.shockwaves = [];
    this.slashes = [];
    this.ribbons = [];
    this.spheres = [];
    this.arcs = [];
    this.afterimages = [];
    for (let i = 0; i < particleCap; i++) this.particles.push(this.makeParticle());
    for (let i = 0; i < 20; i++) this.shockwaves.push(this.makeShockwave());
    for (let i = 0; i < 20; i++) this.slashes.push(this.makeSlash());
    for (let i = 0; i < 18; i++) this.ribbons.push(this.makeRibbon());
    for (let i = 0; i < 12; i++) this.spheres.push(this.makeSphere());
    for (let i = 0; i < 14; i++) this.arcs.push(this.makeArc());
    for (let i = 0; i < 24; i++) this.afterimages.push(this.makeAfterimage());
  }

  private rebuildBg(count: number): void {
    this.bgParticles = [];
    for (let i = 0; i < count; i++) {
      this.bgParticles.push({
        x: Math.random() * 2400 - 600,
        y: Math.random() * 1400 - 400,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 8 - 4,
        life: Math.random(),
        maxLife: 1,
        color: '#c8c8d4',
        size: Math.random() * 1.8 + 0.6,
        active: true,
        kind: 'dust',
        angle: 0,
        spin: 0,
        gravity: 0,
        drag: 0,
        stretch: 1,
        alpha: 1,
      });
    }
  }

  private makeParticle(): Particle {
    return {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      color: '#fff',
      size: 1,
      active: false,
      kind: 'spark',
      angle: 0,
      spin: 0,
      gravity: 0,
      drag: 0,
      stretch: 1,
      alpha: 1,
    };
  }

  private makeShockwave(): Shockwave {
    return {
      x: 0,
      y: 0,
      radius: 0,
      maxRadius: 100,
      thickness: 5,
      color: '#fff',
      active: false,
      life: 0,
      maxLife: 1,
      rings: 1,
    };
  }

  private makeSlash(): SlashTrail {
    return {
      active: false,
      x: 0,
      y: 0,
      angle: 0,
      length: 80,
      width: 10,
      color: '#fff',
      life: 0,
      maxLife: 1,
      crescent: 0.7,
    };
  }

  private makeRibbon(): Ribbon {
    return {
      active: false,
      points: [],
      color: '#fff',
      width: 4,
      life: 0,
      maxLife: 1,
      curl: 1,
      speed: 200,
      angle: 0,
      ox: 0,
      oy: 0,
    };
  }

  private makeSphere(): EnergySphere {
    return {
      active: false,
      x: 0,
      y: 0,
      radius: 0,
      maxRadius: 20,
      color: '#fff',
      life: 0,
      maxLife: 1,
      pulse: 0,
    };
  }

  private makeArc(): ElectricArc {
    return {
      active: false,
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      color: '#fff',
      life: 0,
      maxLife: 1,
      segments: 6,
      jitter: 8,
      seed: 0,
    };
  }

  private makeAfterimage(): Afterimage {
    return {
      active: false,
      x: 0,
      y: 0,
      facing: 1,
      color: '#c8c8d8',
      life: 0,
      maxLife: 1,
      height: 150,
      alpha: 0.4,
    };
  }
}
