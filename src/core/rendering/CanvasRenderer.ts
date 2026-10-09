import { Fighter } from '../animation/Fighter';

export class CanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  private sparks: {x: number, y: number, color: string}[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.width = canvas.width;
    this.height = canvas.height;
  }

  public resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
    this.width = width;
    this.height = height;
  }

  public render(fighters: Fighter[], bgIntensity: number = 0, frequencyData?: Uint8Array) {
    // Clear with dynamic background based on music intensity
    const intensity = Math.min(bgIntensity / 255, 1);
    
    // Subtle flash/color on beats with slight transparency for motion trails
    const bgVal = Math.floor(20 + intensity * 40);
    this.ctx.fillStyle = `rgba(${bgVal}, ${bgVal}, ${bgVal}, 0.3)`;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Draw waveform in background if provided
    if (frequencyData) {
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      const barWidth = this.width / frequencyData.length;
      for (let i = 0; i < frequencyData.length; i++) {
        const barHeight = (frequencyData[i] / 255) * this.height * 0.5;
        this.ctx.fillRect(i * barWidth, this.height - 100 - barHeight, barWidth, barHeight);
      }
    }

    // Determine screen shake and sparks
    let shakeX = 0;
    let shakeY = 0;
    this.sparks.length = 0; // Reuse array

    fighters.forEach(fighter => {
      if ((fighter.state === 'HIT' || fighter.state === 'KNOCKBACK') && fighter.actionTime < 0.08) {
        shakeX += (Math.random() - 0.5) * 20;
        shakeY += (Math.random() - 0.5) * 20;
        
        // Add spark at roughly chest level
        this.sparks.push({
          x: fighter.x - (20 * fighter.direction), 
          y: fighter.y - fighter.height * 0.7,
          color: fighter.eyeColor
        });
      }
    });

    this.ctx.save();
    this.ctx.translate(shakeX, shakeY);

    // Draw ground
    this.ctx.fillStyle = '#111';
    this.ctx.fillRect(-50, this.height - 100, this.width + 100, 150); // extend to cover shake

    // Draw fighters
    fighters.forEach(fighter => fighter.draw(this.ctx));

    // Draw sparks
    this.sparks.forEach(spark => {
      this.ctx.fillStyle = spark.color;
      this.ctx.shadowColor = spark.color;
      this.ctx.shadowBlur = 15;
      for (let i = 0; i < 5; i++) {
         const angle = Math.random() * Math.PI * 2;
         const dist = Math.random() * 40 + 10;
         this.ctx.beginPath();
         this.ctx.arc(spark.x + Math.cos(angle) * dist, spark.y + Math.sin(angle) * dist, Math.random() * 3 + 1, 0, Math.PI * 2);
         this.ctx.fill();
      }
      this.ctx.shadowBlur = 0;
    });

    this.ctx.restore();
  }
}
