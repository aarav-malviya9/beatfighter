export type ArenaType =
  | 'void'
  | 'celestial_temple'
  | 'moonlit'
  | 'fractured'
  | 'cosmic';

interface ArenaPalette {
  void: string;
  charcoal: string;
  silver: string;
  blue: string;
  violet: string;
  crimson: string;
  mist: string;
}

interface ParallaxLayer {
  depth: number;
  draw: (
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    w: number,
    h: number,
    time: number,
    music: number,
    palette: ArenaPalette,
  ) => void;
}

interface ImpactRipple {
  active: boolean;
  x: number;
  y: number;
  force: number;
  life: number;
  maxLife: number;
}

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  hue: 'silver' | 'blue' | 'violet' | 'crimson';
}

const PALETTES: Record<ArenaType, ArenaPalette> = {
  void: {
    void: '#030303',
    charcoal: '#121214',
    silver: '#a8a8b4',
    blue: '#3a4560',
    violet: '#3a3050',
    crimson: '#4a2828',
    mist: 'rgba(180,180,200,0.04)',
  },
  celestial_temple: {
    void: '#06050a',
    charcoal: '#16141c',
    silver: '#c0c0cc',
    blue: '#2e3a58',
    violet: '#3a2e52',
    crimson: '#4a3038',
    mist: 'rgba(200,198,220,0.05)',
  },
  moonlit: {
    void: '#04060a',
    charcoal: '#10141a',
    silver: '#b8c0cc',
    blue: '#2a4058',
    violet: '#2e3448',
    crimson: '#3a3038',
    mist: 'rgba(170,190,220,0.06)',
  },
  fractured: {
    void: '#050404',
    charcoal: '#181414',
    silver: '#b0a8a8',
    blue: '#2a3040',
    violet: '#3a2838',
    crimson: '#5a2828',
    mist: 'rgba(200,160,160,0.04)',
  },
  cosmic: {
    void: '#03040a',
    charcoal: '#0e1018',
    silver: '#a8b0c0',
    blue: '#243048',
    violet: '#2e2848',
    crimson: '#3a2438',
    mist: 'rgba(160,170,210,0.05)',
  },
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export class ArenaSystem {
  private type: ArenaType = 'celestial_temple';
  private palette: ArenaPalette = PALETTES.celestial_temple;
  private layers: ParallaxLayer[] = [];
  private ripples: ImpactRipple[] = [];
  private embers: Ember[] = [];
  private musicIntensity = 0;
  private time = 0;
  private fractureSeed = 1.7;
  private moonPhase = 0.65;

  constructor(type: ArenaType = 'celestial_temple') {
    for (let i = 0; i < 12; i++) {
      this.ripples.push({
        active: false,
        x: 0,
        y: 0,
        force: 0,
        life: 0,
        maxLife: 1,
      });
    }
    this.setArena(type);
  }

  public setArena(type: ArenaType): void {
    this.type = type;
    this.palette = PALETTES[type];
    this.layers = this.buildLayers(type);
    this.rebuildEmbers(type);
    this.fractureSeed = 1.3 + (type.length % 5) * 0.37;
    this.moonPhase = type === 'moonlit' ? 0.72 : 0.55;
  }

  public getArena(): ArenaType {
    return this.type;
  }

  public onImpact(x: number, y: number, force: number): void {
    const f = clamp01(force);
    for (const r of this.ripples) {
      if (r.active) continue;
      r.active = true;
      r.x = x;
      r.y = y;
      r.force = f;
      r.maxLife = 0.45 + 0.35 * f;
      r.life = r.maxLife;
      break;
    }

    // Kick a few embers upward from the impact point
    const kick = Math.floor(3 + f * 6);
    let kicked = 0;
    for (const e of this.embers) {
      if (Math.random() > 0.7) continue;
      e.x = x + (Math.random() - 0.5) * 40;
      e.y = y + (Math.random() - 0.5) * 20;
      e.vx = (Math.random() - 0.5) * 80 * f;
      e.vy = -40 - Math.random() * 120 * f;
      e.life = 0.6 + Math.random() * 0.6;
      kicked++;
      if (kicked >= kick) break;
    }
  }

  public update(dt: number, musicIntensity: number): void {
    this.time += dt;
    this.musicIntensity += (clamp01(musicIntensity) - this.musicIntensity) * Math.min(1, dt * 4);

    for (const r of this.ripples) {
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) r.active = false;
    }

    for (const e of this.embers) {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vy -= 12 * dt;
      e.vx *= Math.pow(0.4, dt);
      e.life -= dt * 0.15;
      if (e.life <= 0 || e.y < -800) {
        this.respawnEmber(e);
      }
    }
  }

  public drawBackground(
    ctx: CanvasRenderingContext2D,
    camX: number,
    camY: number,
    zoom: number,
    width: number,
    height: number,
    time: number,
  ): void {
    const t = time || this.time;
    const music = this.musicIntensity;

    // Base void fill
    ctx.fillStyle = this.palette.void;
    ctx.fillRect(0, 0, width, height);

    // Soft vignette atmosphere
    const vig = ctx.createRadialGradient(
      width * 0.5,
      height * 0.42,
      height * 0.1,
      width * 0.5,
      height * 0.5,
      height * 0.85,
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, width, height);

    // Music-reactive ambient wash (subtle, never neon)
    const wash = ctx.createRadialGradient(
      width * 0.5,
      height * 0.75,
      0,
      width * 0.5,
      height,
      height * 0.9,
    );
    const m = music * 0.35;
    wash.addColorStop(0, this.tint(this.palette.violet, 0.08 + m * 0.12));
    wash.addColorStop(0.55, this.tint(this.palette.blue, 0.04 + m * 0.06));
    wash.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, width, height);

    for (const layer of this.layers) {
      const ox = (camX - width * 0.5) * layer.depth * 0.35 * zoom;
      const oy = (camY - height * 0.35) * layer.depth * 0.2 * zoom;
      ctx.save();
      layer.draw(ctx, ox, oy, width, height, t, music, this.palette);
      ctx.restore();
    }

    this.drawImpactHalos(ctx, camX, camY, zoom, width, height);
  }

  public drawForeground(
    ctx: CanvasRenderingContext2D,
    camX: number,
    camY: number,
    zoom: number,
    width: number,
    height: number,
    time: number,
  ): void {
    const t = time || this.time;
    void camX;
    void camY;
    void zoom;

    // Ground fog band (world-ish, drawn after camera so it sits near fighters)
    ctx.save();
    const fog = ctx.createLinearGradient(0, -40, 0, 220);
    fog.addColorStop(0, 'rgba(0,0,0,0)');
    fog.addColorStop(0.35, this.palette.mist);
    fog.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = fog;
    ctx.fillRect(-2500, -20, 5000, 260);

    // Embers / ash drifting in front
    for (const e of this.embers) {
      const a = clamp01(e.life) * 0.35;
      ctx.fillStyle = this.emberColor(e.hue, a);
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Arena-specific foreground accents
    if (this.type === 'fractured') {
      this.drawFractureCracks(ctx, t, true);
    } else if (this.type === 'celestial_temple') {
      // Soft column light shafts near ground
      ctx.globalAlpha = 0.04 + this.musicIntensity * 0.03;
      ctx.fillStyle = this.palette.silver;
      for (let i = -2; i <= 2; i++) {
        const x = i * 280;
        ctx.beginPath();
        ctx.moveTo(x - 18, -420);
        ctx.lineTo(x + 18, -420);
        ctx.lineTo(x + 55, 40);
        ctx.lineTo(x - 55, 40);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (this.type === 'cosmic') {
      // Near-field star dust
      ctx.fillStyle = 'rgba(200,205,220,0.15)';
      for (let i = 0; i < 18; i++) {
        const sx = Math.sin(t * 0.4 + i * 2.1) * 600 + i * 40;
        const sy = -80 - ((t * 20 + i * 37) % 200);
        ctx.beginPath();
        ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Screen-edge vignette remnant for depth (subtle)
    void width;
    void height;
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Layers per arena
  // ---------------------------------------------------------------------------

  private buildLayers(type: ArenaType): ParallaxLayer[] {
    switch (type) {
      case 'void':
        return [
          { depth: 0.05, draw: (ctx, ox, oy, w, h, time, music, p) => this.drawVoidFar(ctx, ox, oy, w, h, time, music, p) },
          { depth: 0.2, draw: (ctx, ox, oy, w, h, time, music, p) => this.drawHorizon(ctx, ox, oy, w, h, time, music, p) },
        ];
      case 'celestial_temple':
        return [
          { depth: 0.05, draw: (ctx, ox, oy, w, h, time, music, p) => this.drawStarField(ctx, ox, oy, w, h, time, music, p, 40) },
          { depth: 0.15, draw: (ctx, ox, oy, w, h, time, music, p) => this.drawTempleSilhouette(ctx, ox, oy, w, h, time, music, p) },
          { depth: 0.35, draw: (ctx, ox, oy, w, h, time, music, p) => this.drawColumns(ctx, ox, oy, w, h, time, music, p) },
          { depth: 0.55, draw: (ctx, ox, oy, w, h, time, music, p) => this.drawHorizon(ctx, ox, oy, w, h, time, music, p) },
        ];
      case 'moonlit':
        return [
          { depth: 0.04, draw: (ctx, ox, oy, w, h, time, music, p) => this.drawStarField(ctx, ox, oy, w, h, time, music, p, 55) },
          { depth: 0.12, draw: (ctx, ox, oy, w, h, time, music, p) => this.drawMoon(ctx, ox, oy, w, h, time, music, p) },
          { depth: 0.3, draw: (ctx, ox, oy, w, h, time, music, p) => this.drawCloudBands(ctx, ox, oy, w, h, time, music, p) },
          { depth: 0.5, draw: (ctx, ox, oy, w, h, time, music, p) => this.drawHorizon(ctx, ox, oy, w, h, time, music, p) },
        ];
      case 'fractured':
        return [
          { depth: 0.06, draw: (ctx, ox, oy, w, h, time, music, p) => this.drawVoidFar(ctx, ox, oy, w, h, time, music, p) },
          { depth: 0.22, draw: (ctx, ox, oy, w, h, time, music, p) => this.drawFractureBackdrop(ctx, ox, oy, w, h, time, music, p) },
          { depth: 0.45, draw: (ctx, ox, oy, w, h, time, music, p) => this.drawHorizon(ctx, ox, oy, w, h, time, music, p) },
        ];
      case 'cosmic':
        return [
          { depth: 0.03, draw: (ctx, ox, oy, w, h, time, music, p) => this.drawStarField(ctx, ox, oy, w, h, time, music, p, 80) },
          { depth: 0.14, draw: (ctx, ox, oy, w, h, time, music, p) => this.drawNebula(ctx, ox, oy, w, h, time, music, p) },
          { depth: 0.32, draw: (ctx, ox, oy, w, h, time, music, p) => this.drawCosmicRings(ctx, ox, oy, w, h, time, music, p) },
          { depth: 0.52, draw: (ctx, ox, oy, w, h, time, music, p) => this.drawHorizon(ctx, ox, oy, w, h, time, music, p) },
        ];
      default:
        return [];
    }
  }

  private drawVoidFar(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    w: number,
    h: number,
    time: number,
    music: number,
    p: ArenaPalette,
  ): void {
    const g = ctx.createRadialGradient(
      w * 0.5 - ox * 0.2,
      h * 0.35 - oy * 0.2,
      20,
      w * 0.5 - ox * 0.2,
      h * 0.4 - oy * 0.2,
      h * 0.55,
    );
    g.addColorStop(0, this.tint(p.charcoal, 0.55 + music * 0.1));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Faint vertical grain
    ctx.strokeStyle = this.tint(p.silver, 0.03);
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const x = ((i * 137 + time * 4) % w);
      ctx.beginPath();
      ctx.moveTo(x - ox * 0.1, 0);
      ctx.lineTo(x - ox * 0.1, h);
      ctx.stroke();
    }
  }

  private drawStarField(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    w: number,
    h: number,
    time: number,
    music: number,
    p: ArenaPalette,
    count: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const seed = i * 97.13;
      const x = ((seed * 13.7 + ox * 0.15) % w + w) % w;
      const y = ((seed * 7.3 + oy * 0.1) % (h * 0.7) + h * 0.7) % (h * 0.7);
      const twinkle = 0.25 + 0.35 * Math.sin(time * (0.8 + (i % 5) * 0.15) + i);
      const a = (0.15 + twinkle * 0.35) * (0.7 + music * 0.3);
      ctx.fillStyle = this.tint(p.silver, a);
      ctx.fillRect(x, y, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
    }
  }

  private drawTempleSilhouette(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    w: number,
    h: number,
    _time: number,
    music: number,
    p: ArenaPalette,
  ): void {
    const baseY = h * 0.62 - oy * 0.3;
    ctx.fillStyle = this.tint(p.charcoal, 0.85);
    ctx.beginPath();
    ctx.moveTo(-100 - ox, baseY + 80);
    ctx.lineTo(w * 0.18 - ox, baseY - 40);
    ctx.lineTo(w * 0.28 - ox, baseY + 10);
    ctx.lineTo(w * 0.5 - ox, baseY - 120 - music * 10);
    ctx.lineTo(w * 0.72 - ox, baseY + 10);
    ctx.lineTo(w * 0.82 - ox, baseY - 40);
    ctx.lineTo(w + 100 - ox, baseY + 80);
    ctx.lineTo(w + 100 - ox, h);
    ctx.lineTo(-100 - ox, h);
    ctx.closePath();
    ctx.fill();

    // Pediment silver edge
    ctx.strokeStyle = this.tint(p.silver, 0.12);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w * 0.35 - ox, baseY - 20);
    ctx.lineTo(w * 0.5 - ox, baseY - 120 - music * 10);
    ctx.lineTo(w * 0.65 - ox, baseY - 20);
    ctx.stroke();
  }

  private drawColumns(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    w: number,
    h: number,
    time: number,
    music: number,
    p: ArenaPalette,
  ): void {
    const baseY = h * 0.72 - oy * 0.4;
    const cols = 5;
    for (let i = 0; i < cols; i++) {
      const x = w * (0.15 + i * 0.175) - ox * 0.8;
      const tall = h * 0.42 + Math.sin(time * 0.3 + i) * 4;
      ctx.fillStyle = this.tint(p.charcoal, 0.7);
      ctx.fillRect(x - 14, baseY - tall, 28, tall);
      ctx.fillStyle = this.tint(p.silver, 0.08 + music * 0.04);
      ctx.fillRect(x - 14, baseY - tall, 4, tall);
      // Capital
      ctx.fillStyle = this.tint(p.silver, 0.14);
      ctx.fillRect(x - 22, baseY - tall - 8, 44, 10);
    }
  }

  private drawMoon(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    w: number,
    h: number,
    time: number,
    music: number,
    p: ArenaPalette,
  ): void {
    const mx = w * 0.72 - ox * 0.25;
    const my = h * 0.22 - oy * 0.15;
    const r = 48 + music * 6;
    const g = ctx.createRadialGradient(mx - 10, my - 10, 4, mx, my, r * 2.2);
    g.addColorStop(0, this.tint(p.silver, 0.35));
    g.addColorStop(0.35, this.tint(p.blue, 0.12));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(mx, my, r * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.tint(p.silver, 0.55);
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, Math.PI * 2);
    ctx.fill();

    // Crescent shadow
    ctx.fillStyle = this.palette.void;
    ctx.beginPath();
    ctx.arc(mx + r * this.moonPhase * 0.55, my - 4, r * 0.92, 0, Math.PI * 2);
    ctx.fill();

    // Soft lunar haze
    ctx.strokeStyle = this.tint(p.blue, 0.08 + 0.04 * Math.sin(time));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(mx, my, r * 1.35, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawCloudBands(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    w: number,
    h: number,
    time: number,
    music: number,
    p: ArenaPalette,
  ): void {
    for (let i = 0; i < 4; i++) {
      const y = h * (0.35 + i * 0.08) - oy * 0.25;
      const drift = ((time * (8 + i * 3) - ox * 0.4) % (w + 200)) - 100;
      ctx.fillStyle = this.tint(i % 2 === 0 ? p.blue : p.violet, 0.06 + music * 0.03);
      ctx.beginPath();
      ctx.ellipse(drift + i * 120, y, 180 + i * 30, 18 + i * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFractureBackdrop(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    w: number,
    h: number,
    time: number,
    music: number,
    p: ArenaPalette,
  ): void {
    const cx = w * 0.5 - ox * 0.3;
    const cy = h * 0.45 - oy * 0.2;
    ctx.strokeStyle = this.tint(p.crimson, 0.12 + music * 0.08);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + this.fractureSeed;
      const len = 80 + (i % 3) * 60 + music * 30;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      let x = cx;
      let y = cy;
      for (let s = 0; s < 4; s++) {
        x += Math.cos(a + Math.sin(time + s + i) * 0.2) * (len / 4);
        y += Math.sin(a + Math.cos(time * 0.7 + s) * 0.2) * (len / 4);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Floating shards
    ctx.fillStyle = this.tint(p.charcoal, 0.7);
    for (let i = 0; i < 6; i++) {
      const sx = cx + Math.cos(time * 0.2 + i) * (100 + i * 40);
      const sy = cy + Math.sin(time * 0.15 + i * 1.3) * (40 + i * 12);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(time * 0.1 + i);
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(10, 8);
      ctx.lineTo(-10, 8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawFractureCracks(ctx: CanvasRenderingContext2D, time: number, foreground: boolean): void {
    const p = this.palette;
    ctx.strokeStyle = this.tint(p.crimson, foreground ? 0.18 : 0.1);
    ctx.lineWidth = foreground ? 1.5 : 1;
    for (let i = 0; i < 5; i++) {
      const x0 = -400 + i * 220;
      ctx.beginPath();
      ctx.moveTo(x0, 10);
      ctx.lineTo(x0 + 30 + Math.sin(time + i) * 10, 40);
      ctx.lineTo(x0 - 20, 70);
      ctx.lineTo(x0 + 40, 110);
      ctx.stroke();
    }
  }

  private drawNebula(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    w: number,
    h: number,
    time: number,
    music: number,
    p: ArenaPalette,
  ): void {
    const blobs = [
      { x: 0.3, y: 0.3, c: p.violet },
      { x: 0.65, y: 0.28, c: p.blue },
      { x: 0.5, y: 0.45, c: p.crimson },
    ];
    for (const b of blobs) {
      const x = w * b.x - ox * 0.2;
      const y = h * b.y - oy * 0.15;
      const r = h * (0.22 + music * 0.04 + Math.sin(time * 0.3) * 0.01);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, this.tint(b.c, 0.14));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawCosmicRings(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    w: number,
    h: number,
    time: number,
    music: number,
    p: ArenaPalette,
  ): void {
    const cx = w * 0.5 - ox * 0.35;
    const cy = h * 0.4 - oy * 0.2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(time * 0.05);
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = this.tint(i === 1 ? p.violet : p.silver, 0.08 + music * 0.05);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 120 + i * 55, 28 + i * 10, i * 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawHorizon(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    w: number,
    h: number,
    _time: number,
    music: number,
    p: ArenaPalette,
  ): void {
    const y = h * 0.78 - oy * 0.5;
    const g = ctx.createLinearGradient(0, y - 80, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.35, this.tint(p.charcoal, 0.55));
    g.addColorStop(1, this.tint(p.void, 1));
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 80, w, h - (y - 80));

    // Ground line suggestion
    ctx.strokeStyle = this.tint(p.silver, 0.08 + music * 0.04);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();

    // Floor sheen
    const sheen = ctx.createRadialGradient(w * 0.5 - ox * 0.2, y, 0, w * 0.5 - ox * 0.2, y, w * 0.45);
    sheen.addColorStop(0, this.tint(p.silver, 0.05 + music * 0.03));
    sheen.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, y, w, h - y);
  }

  private drawImpactHalos(
    ctx: CanvasRenderingContext2D,
    camX: number,
    camY: number,
    zoom: number,
    width: number,
    height: number,
  ): void {
    for (const r of this.ripples) {
      if (!r.active) continue;
      const t = r.life / r.maxLife;
      const sx = width * 0.5 + (r.x - camX) * zoom;
      const sy = height * 0.5 + (r.y - camY) * zoom;
      const radius = (40 + r.force * 120) * (1 - t) * zoom + 20;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, radius);
      g.addColorStop(0, this.tint(this.palette.silver, 0.12 * t * r.force));
      g.addColorStop(0.5, this.tint(this.palette.violet, 0.06 * t));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private rebuildEmbers(type: ArenaType): void {
    const count = type === 'void' ? 20 : type === 'cosmic' ? 50 : 35;
    this.embers = [];
    for (let i = 0; i < count; i++) {
      const e: Ember = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 1,
        life: 1,
        hue: 'silver',
      };
      this.respawnEmber(e);
      this.embers.push(e);
    }
  }

  private respawnEmber(e: Ember): void {
    e.x = Math.random() * 2000 - 1000;
    e.y = Math.random() * 600 - 200;
    e.vx = (Math.random() - 0.5) * 20;
    e.vy = -10 - Math.random() * 25;
    e.size = Math.random() * 1.8 + 0.5;
    e.life = 0.5 + Math.random() * 1.5;
    const roll = Math.random();
    if (roll < 0.55) e.hue = 'silver';
    else if (roll < 0.75) e.hue = 'blue';
    else if (roll < 0.9) e.hue = 'violet';
    else e.hue = 'crimson';
  }

  private emberColor(hue: Ember['hue'], a: number): string {
    const map = {
      silver: this.palette.silver,
      blue: this.palette.blue,
      violet: this.palette.violet,
      crimson: this.palette.crimson,
    };
    return this.tint(map[hue], a);
  }

  private tint(color: string, alpha: number): string {
    if (color.startsWith('rgba')) {
      return color.replace(/[\d.]+\)$/g, `${clamp01(alpha)})`);
    }
    const hex = color.replace('#', '');
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const n = parseInt(full, 16);
    if (Number.isNaN(n)) return `rgba(128,128,128,${clamp01(alpha)})`;
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${clamp01(alpha)})`;
  }
}
