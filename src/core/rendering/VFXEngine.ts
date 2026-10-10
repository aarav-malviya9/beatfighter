export interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  color: string; size: number;
  active: boolean;
}

export interface Shockwave {
  x: number; y: number;
  radius: number; maxRadius: number;
  thickness: number; color: string;
  active: boolean;
}

export class VFXEngine {
  private particles: Particle[] = [];
  private shockwaves: Shockwave[] = [];
  private bgParticles: Particle[] = [];
  
  constructor(poolSize = 1000) {
    for(let i = 0; i < poolSize; i++) {
      this.particles.push({x:0, y:0, vx:0, vy:0, life:0, maxLife:1, color:'#fff', size:1, active:false});
    }
    for(let i = 0; i < 20; i++) {
      this.shockwaves.push({x:0, y:0, radius:0, maxRadius:100, thickness:5, color:'#fff', active:false});
    }
    // Atmospheric background dust
    for(let i = 0; i < 200; i++) {
      this.bgParticles.push({
        x: Math.random() * 2000 - 400,
        y: Math.random() * 1000 - 200,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10 - 5,
        life: Math.random(),
        maxLife: 1,
        color: '#ffffff',
        size: Math.random() * 2 + 1,
        active: true
      });
    }
  }

  public emitHit(x: number, y: number, color: string, intensity: number = 1) {
    const count = Math.floor(20 * intensity);
    let emitted = 0;
    for (let p of this.particles) {
      if (!p.active) {
        p.active = true;
        p.x = x; p.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 300 * intensity + 50;
        p.vx = Math.cos(angle) * speed;
        p.vy = Math.sin(angle) * speed;
        p.maxLife = Math.random() * 0.3 + 0.1;
        p.life = p.maxLife;
        p.color = color;
        p.size = Math.random() * 4 + 2;
        emitted++;
        if (emitted >= count) break;
      }
    }

    // Add shockwave
    if (intensity > 0.5) {
      for (let s of this.shockwaves) {
        if (!s.active) {
          s.active = true;
          s.x = x; s.y = y;
          s.radius = 10;
          s.maxRadius = 150 * intensity;
          s.thickness = 10 * intensity;
          s.color = color;
          break;
        }
      }
    }
  }

  public update(dt: number) {
    // Standard particles
    for (let p of this.particles) {
      if (p.active) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 500 * dt; // gravity
        p.vx *= Math.pow(0.1, dt); // friction
        p.life -= dt;
        if (p.life <= 0) p.active = false;
      }
    }

    // Shockwaves
    for (let s of this.shockwaves) {
      if (s.active) {
        s.radius += (s.maxRadius - s.radius) * (1.0 - Math.pow(0.001, dt));
        s.thickness *= Math.pow(0.01, dt);
        if (s.thickness < 0.5) s.active = false;
      }
    }

    // Atmospheric
    for (let p of this.bgParticles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      // Drift upwards slightly
      p.vy -= 10 * dt;
      
      // Wrap around
      if (p.y < -500) p.y = 1000;
      if (p.x < -1000) p.x = 2000;
      if (p.x > 2000) p.x = -1000;
    }
  }

  public drawBackground(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    for (let p of this.bgParticles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  public drawForeground(ctx: CanvasRenderingContext2D) {
    // Draw shockwaves
    for (let s of this.shockwaves) {
      if (s.active) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.lineWidth = s.thickness;
        ctx.strokeStyle = s.color;
        ctx.stroke();
      }
    }

    // Draw particles
    for (let p of this.particles) {
      if (p.active) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1.0;
  }
}
