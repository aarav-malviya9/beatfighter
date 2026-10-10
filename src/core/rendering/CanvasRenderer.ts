import { Fighter } from '../animation/Fighter';
import { Camera } from './Camera';
import { VFXEngine } from './VFXEngine';

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  
  public camera: Camera;
  public vfx: VFXEngine;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.width = canvas.width;
    this.height = canvas.height;
    this.camera = new Camera();
    this.vfx = new VFXEngine();
  }

  public resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.width = width;
    this.height = height;
  }

  public update(dt: number, fighters: Fighter[], intensity: number) {
    this.camera.frame(fighters[0].x, fighters[1].x, fighters[0].y, fighters[1].y, intensity);
    this.camera.update(dt);
    this.vfx.update(dt);
  }

  public render(fighters: Fighter[], bgIntensity: number = 0, frequencyData?: Uint8Array) {
    const intensity = Math.min(bgIntensity / 255, 1);
    
    // Draw deeply dark fantasy background
    this.ctx.fillStyle = '#050505';
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Dynamic background lighting based on intensity
    const gradient = this.ctx.createRadialGradient(this.width/2, this.height, 0, this.width/2, this.height, this.height);
    gradient.addColorStop(0, `rgba(${Math.floor(50 * intensity)}, ${Math.floor(20 * intensity)}, ${Math.floor(80 * intensity)}, 0.4)`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.save();
    // Apply cinematic camera
    this.camera.apply(this.ctx, this.width, this.height);

    // Background VFX
    this.vfx.drawBackground(this.ctx);

    // Ground plane (stylized celestial floor)
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    this.ctx.fillRect(-2000, 0, 4000, 1000);
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(-2000, 0);
    this.ctx.lineTo(2000, 0);
    this.ctx.stroke();

    // Foreground Fighters
    fighters.forEach(fighter => fighter.draw(this.ctx));

    // Foreground VFX
    this.vfx.drawForeground(this.ctx);

    this.ctx.restore();
  }
}
