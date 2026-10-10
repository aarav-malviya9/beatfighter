export class Camera {
  public x: number = 0;
  public y: number = 0;
  public zoom: number = 1.0;
  public angle: number = 0;
  
  private targetX: number = 0;
  private targetY: number = 0;
  private targetZoom: number = 1.0;
  
  private shakeX: number = 0;
  private shakeY: number = 0;
  private shakeIntensity: number = 0;
  private shakeDecay: number = 0.9;

  public update(dt: number) {
    // Easing towards target
    const ease = 1.0 - Math.pow(0.01, dt); // frame-rate independent easing
    
    this.x += (this.targetX - this.x) * ease;
    this.y += (this.targetY - this.y) * ease;
    this.zoom += (this.targetZoom - this.zoom) * ease * 0.5;

    // Shake logic
    if (this.shakeIntensity > 0.1) {
      this.shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeY = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= Math.pow(this.shakeDecay, dt * 60);
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shakeIntensity = 0;
    }
  }

  public frame(p1x: number, p2x: number, p1y: number, p2y: number, intensity: number) {
    const midX = (p1x + p2x) / 2;
    const midY = (p1y + p2y) / 2;
    const dist = Math.abs(p1x - p2x);
    
    // Default framing
    this.targetX = midX;
    this.targetY = midY - 100; // Look slightly above them
    
    // Zoom based on distance and music intensity
    let desiredZoom = 1.0;
    if (dist < 150) desiredZoom = 1.2 + (intensity * 0.1);
    else if (dist > 400) desiredZoom = 0.8;
    
    this.targetZoom = desiredZoom;
  }

  public addShake(amount: number) {
    this.shakeIntensity = Math.max(this.shakeIntensity, amount);
  }

  public apply(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.translate(width / 2, height / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.rotate(this.angle);
    ctx.translate(-this.x + this.shakeX, -this.y + this.shakeY);
  }
}
