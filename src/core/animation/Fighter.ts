export type Point = { x: number; y: number };
export type ActionState = 'IDLE' | 'PUNCH' | 'HOOK' | 'UPPERCUT' | 'KICK' | 'ROUNDHOUSE' | 'JUMP_KICK' | 'BLOCK' | 'DODGE' | 'BACKFLIP' | 'HIT' | 'KNOCKBACK';

export class Fighter {
  public x: number;
  public y: number; // Ground level
  public direction: 1 | -1;
  public state: ActionState = 'IDLE';
  public actionFrame: number = 0;
  
  // Basic properties
  public height = 150;
  public color = '#000000';
  public eyeColor = '#00ffcc';

  constructor(x: number, y: number, direction: 1 | -1, color: string, eyeColor: string) {
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.color = color;
    this.eyeColor = eyeColor;
  }

  public update() {
    if (this.state !== 'IDLE') {
      this.actionFrame++;
      // Simple duration for actions
      if (this.actionFrame > 20) { 
        this.state = 'IDLE';
        this.actionFrame = 0;
      }
    } else {
      // Bobbing in IDLE
      this.actionFrame = (this.actionFrame + 1) % 60;
    }
  }

  public draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.direction, 1); // Flip based on direction
    
    // Animate based on state
    let headY = -this.height;
    let headX = 0;
    
    let leftHand: Point = { x: -20, y: -this.height * 0.5 };
    let rightHand: Point = { x: 20, y: -this.height * 0.5 };
    
    let leftFoot: Point = { x: -20, y: 0 };
    let rightFoot: Point = { x: 20, y: 0 };

    if (this.state === 'IDLE') {
      const bob = Math.sin(this.actionFrame * 0.2) * 5;
      headY += bob;
      leftHand.y += bob;
      rightHand.y += bob;
      leftHand.x += 10; // Guard up
      rightHand.x += 15;
      leftHand.y -= 20;
      rightHand.y -= 30;
    } else if (this.state === 'PUNCH') {
      const progress = this.actionFrame / 20;
      const extension = Math.sin(progress * Math.PI) * 40;
      rightHand.x += 20 + extension; // Punch forward
      rightHand.y -= 30;
      leftHand.x -= 10; // Guard back
      leftHand.y -= 20;
      headX += extension * 0.2; // Lean into punch
    } else if (this.state === 'HOOK') {
      const progress = this.actionFrame / 20;
      const extension = Math.sin(progress * Math.PI) * 35;
      rightHand.x += 10 + extension;
      rightHand.y -= 30 + extension * 0.5; // swing high
      headX += 5;
    } else if (this.state === 'UPPERCUT') {
      const progress = this.actionFrame / 20;
      const extension = Math.sin(progress * Math.PI) * 45;
      rightHand.x += 10 + extension * 0.5;
      rightHand.y -= 30 + extension; // punch up
      headX += 5;
      headY -= 10;
    } else if (this.state === 'KICK') {
       const progress = this.actionFrame / 20;
       const extension = Math.sin(progress * Math.PI) * 50;
       rightFoot.x += 30 + extension;
       rightFoot.y -= 40 + extension * 0.5;
       headX -= 10; // Lean back
    } else if (this.state === 'ROUNDHOUSE') {
       const progress = this.actionFrame / 20;
       const extension = Math.sin(progress * Math.PI) * 60;
       rightFoot.x += 40 + extension;
       rightFoot.y -= 70; // high kick
       headX -= 15; // Lean back more
       headY += 10;
    } else if (this.state === 'JUMP_KICK') {
       const progress = this.actionFrame / 20;
       const height = Math.sin(progress * Math.PI) * 60;
       ctx.translate(0, -height); // Jump up
       const extension = Math.sin(progress * Math.PI) * 50;
       rightFoot.x += 40 + extension;
       rightFoot.y -= 20;
       leftFoot.y -= 20;
    } else if (this.state === 'BLOCK') {
      leftHand.x += 15;
      leftHand.y -= 40;
      rightHand.x += 15;
      rightHand.y -= 40;
      headX -= 5;
    } else if (this.state === 'DODGE') {
      headX -= 25;
      headY += 20;
      leftHand.x -= 15;
      rightHand.x -= 15;
    } else if (this.state === 'BACKFLIP') {
      const progress = this.actionFrame / 20;
      const height = Math.sin(progress * Math.PI) * 80;
      ctx.translate(0, -height);
      ctx.rotate(-this.direction * progress * Math.PI * 2); // full rotation
    } else if (this.state === 'HIT') {
      headX -= 15;
      headY += 10;
      leftHand.x -= 10;
      rightHand.x -= 10;
    } else if (this.state === 'KNOCKBACK') {
      const progress = this.actionFrame / 20;
      const dist = Math.sin(progress * Math.PI) * 30;
      ctx.translate(-dist * this.direction, 0); // move backwards
      headX -= 25;
      headY += 15;
      leftHand.x -= 15;
      rightHand.x -= 15;
      leftHand.y -= 30;
      rightHand.y -= 30;
      leftFoot.x -= 20;
      rightFoot.x -= 10;
    }

    ctx.strokeStyle = this.color;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw Body
    ctx.beginPath();
    ctx.moveTo(headX, headY + 20); // Neck
    ctx.lineTo(0, -this.height * 0.5); // Hips
    ctx.stroke();

    // Draw Legs
    ctx.beginPath();
    ctx.moveTo(0, -this.height * 0.5);
    ctx.lineTo(leftFoot.x, leftFoot.y);
    ctx.moveTo(0, -this.height * 0.5);
    ctx.lineTo(rightFoot.x, rightFoot.y);
    ctx.stroke();

    // Draw Arms
    ctx.beginPath();
    ctx.moveTo(headX, headY + 30); // Shoulders
    ctx.lineTo(leftHand.x, leftHand.y);
    ctx.moveTo(headX, headY + 30);
    ctx.lineTo(rightHand.x, rightHand.y);
    ctx.stroke();

    // Draw Head
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(headX, headY, 15, 0, Math.PI * 2);
    ctx.fill();

    // Draw Eyes
    ctx.fillStyle = this.eyeColor;
    ctx.beginPath();
    // Eye position assumes character is facing right in its local scale
    ctx.arc(headX + 5, headY - 3, 3, 0, Math.PI * 2); 
    ctx.arc(headX + 12, headY - 3, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Add glow to eyes
    ctx.shadowColor = this.eyeColor;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0; // Reset

    ctx.restore();
  }
}
