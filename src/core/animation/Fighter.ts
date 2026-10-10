import { type ActionState, type MovePhase, MOVES, type MoveDefinition } from './MoveSet';

export type Point = { x: number; y: number };

export class Fighter {
  public x: number;
  public y: number; // Ground level
  public direction: 1 | -1;
  public state: ActionState = 'IDLE';
  public actionTime: number = 0;
  
  // Basic properties
  public height = 150;
  public color = '#000000';
  public eyeColor = '#00ffcc';

  public currentMove: MoveDefinition | null = null;
  public isHitActive: boolean = false;
  public currentPhase: MovePhase | null = null;
  
  // Cinematic trails
  private handTrail: Point[] = [];
  private footTrail: Point[] = [];

  constructor(x: number, y: number, direction: 1 | -1, color: string, eyeColor: string) {
    this.x = x;
    this.y = y;
    this.direction = direction;
    this.color = color;
    this.eyeColor = eyeColor;
  }

  public performMove(moveState: ActionState) {
    this.state = moveState;
    this.actionTime = 0;
    this.currentMove = MOVES[moveState] || null;
    this.isHitActive = false;
    this.currentPhase = 'STARTUP';
  }

  public update(dt: number) {
    if (this.state !== 'IDLE') {
      this.actionTime += dt;
      
      if (this.currentMove) {
        const { startup, active, recovery } = this.currentMove;
        
        if (this.actionTime < startup) {
          this.currentPhase = 'STARTUP';
          this.isHitActive = false;
        } else if (this.actionTime < startup + active) {
          this.currentPhase = 'ACTIVE';
          this.isHitActive = true;
        } else if (this.actionTime < startup + active + recovery) {
          this.currentPhase = 'RECOVERY';
          this.isHitActive = false;
        } else {
          this.state = 'IDLE';
          this.currentMove = null;
          this.currentPhase = null;
          this.actionTime = 0;
          this.isHitActive = false;
        }
      } else {
        // Simple defensive or reaction moves that don't have active hitboxes
        let duration = 0.33; 
        if (this.state === 'BLOCK' || this.state === 'DODGE') duration = 0.4;
        if (this.state === 'BACKFLIP') duration = 0.6;
        if (this.state === 'HIT') duration = 0.2;
        if (this.state === 'KNOCKBACK') duration = 0.4;

        if (this.actionTime > duration) { 
          this.state = 'IDLE';
          this.actionTime = 0;
        }
      }
    } else {
      // Bobbing in IDLE
      this.actionTime = (this.actionTime + dt) % 1.0;
    }
  }

  public getHitbox() {
    if (!this.currentMove || !this.currentMove.hitbox || this.currentPhase !== 'ACTIVE') return null;
    const h = this.currentMove.hitbox;
    return {
      x: this.x + (h.offsetX * this.direction),
      y: this.y + h.offsetY,
      width: h.width * this.direction,
      height: h.height
    };
  }

  public getBodyBox() {
    return {
      x: this.x - 20,
      y: this.y - this.height,
      width: 40,
      height: this.height
    };
  }

  public draw(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.direction, 1);
    
    let headY = -this.height;
    let headX = 0;
    
    let leftHand: Point = { x: -20, y: -this.height * 0.5 };
    let rightHand: Point = { x: 20, y: -this.height * 0.5 };
    let leftFoot: Point = { x: -20, y: 0 };
    let rightFoot: Point = { x: 20, y: 0 };

    if (this.state === 'IDLE') {
      const bob = Math.sin(this.actionTime * Math.PI * 2) * 5;
      headY += bob;
      leftHand.y += bob;
      rightHand.y += bob;
      leftHand.x += 10;
      rightHand.x += 15;
      leftHand.y -= 20;
      rightHand.y -= 30;
    } else if (this.currentMove) {
       // Interpolation based on move phase
       const { startup, active, recovery } = this.currentMove;
       let totalDuration = startup + active + recovery;
       let p = this.actionTime / totalDuration;
       
       // Easing
       let extension = Math.sin(p * Math.PI);
       
       if (this.state === 'PUNCH') {
         rightHand.x += 20 + extension * 40;
         rightHand.y -= 30;
         leftHand.x -= 10;
         leftHand.y -= 20;
         headX += extension * 10;
       } else if (this.state === 'HOOK') {
         rightHand.x += 10 + extension * 35;
         rightHand.y -= 30 + extension * 20;
         headX += 5;
       } else if (this.state === 'UPPERCUT') {
         rightHand.x += 10 + extension * 20;
         rightHand.y -= 30 + extension * 60;
         headX += 5;
         headY -= 10;
       } else if (this.state === 'KICK') {
         rightFoot.x += 30 + extension * 50;
         rightFoot.y -= 40 + extension * 25;
         headX -= 10;
       } else if (this.state === 'ROUNDHOUSE') {
         rightFoot.x += 40 + extension * 60;
         rightFoot.y -= 70;
         headX -= 15;
         headY += 10;
       } else if (this.state === 'JUMP_KICK') {
         const height = Math.sin(p * Math.PI) * 60;
         ctx.translate(0, -height);
         rightFoot.x += 40 + extension * 50;
         rightFoot.y -= 20;
         leftFoot.y -= 20;
       }
    } else {
      // Defensive & Reaction animations
      if (this.state === 'BLOCK') {
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
        const p = this.actionTime / 0.6;
        const height = Math.sin(p * Math.PI) * 80;
        ctx.translate(0, -height);
        ctx.rotate(-this.direction * p * Math.PI * 2);
      } else if (this.state === 'HIT') {
        headX -= 15;
        headY += 10;
        leftHand.x -= 10;
        rightHand.x -= 10;
      } else if (this.state === 'KNOCKBACK') {
        const p = this.actionTime / 0.4;
        const dist = Math.sin(p * Math.PI) * 30;
        ctx.translate(-dist * this.direction, 0);
        headX -= 25;
        headY += 15;
        leftHand.x -= 15;
        rightHand.x -= 15;
        leftHand.y -= 30;
        rightHand.y -= 30;
        leftFoot.x -= 20;
        rightFoot.x -= 10;
      }
    }

    // Update trails
    this.handTrail.unshift({ x: rightHand.x * this.direction + this.x, y: rightHand.y + this.y });
    this.footTrail.unshift({ x: rightFoot.x * this.direction + this.x, y: rightFoot.y + this.y });
    if (this.handTrail.length > 10) this.handTrail.pop();
    if (this.footTrail.length > 10) this.footTrail.pop();

    ctx.save();
    
    // Draw Trails if attacking
    if (this.currentMove && (this.currentPhase === 'ACTIVE' || this.currentPhase === 'STARTUP')) {
      const drawTrail = (trail: Point[]) => {
        if (trail.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(trail[0].x, trail[0].y);
        for (let i = 1; i < trail.length; i++) {
          ctx.lineTo(trail[i].x, trail[i].y);
        }
        ctx.strokeStyle = this.eyeColor;
        ctx.lineWidth = 15;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // Fade out trail
        const gradient = ctx.createLinearGradient(trail[0].x, trail[0].y, trail[trail.length-1].x, trail[trail.length-1].y);
        gradient.addColorStop(0, this.eyeColor);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.strokeStyle = gradient;
        ctx.stroke();
      };
      
      const isKick = this.state.includes('KICK') || this.state === 'ROUNDHOUSE';
      drawTrail(isKick ? this.footTrail : this.handTrail);
    }

    ctx.translate(this.x, this.y);
    ctx.scale(this.direction, 1);

    // Aura
    if (this.currentMove) {
      ctx.fillStyle = this.eyeColor;
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.arc(0, -this.height * 0.5, this.height * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }

    ctx.strokeStyle = this.color;
    ctx.lineWidth = 12; // Thicker cinematic limbs
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Body
    ctx.beginPath();
    ctx.moveTo(headX, headY + 20);
    ctx.lineTo(0, -this.height * 0.5);
    ctx.stroke();

    // Legs
    ctx.beginPath();
    ctx.moveTo(0, -this.height * 0.5);
    ctx.lineTo(leftFoot.x, leftFoot.y);
    ctx.moveTo(0, -this.height * 0.5);
    ctx.lineTo(rightFoot.x, rightFoot.y);
    ctx.stroke();

    // Arms
    ctx.beginPath();
    ctx.moveTo(headX, headY + 30);
    ctx.lineTo(leftHand.x, leftHand.y);
    ctx.moveTo(headX, headY + 30);
    ctx.lineTo(rightHand.x, rightHand.y);
    ctx.stroke();

    // Head
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(headX, headY, 18, 0, Math.PI * 2);
    ctx.fill();

    // Glowing Eyes
    ctx.fillStyle = this.eyeColor;
    ctx.shadowColor = this.eyeColor;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    
    // Angry eyes if attacking
    if (this.currentMove) {
      ctx.moveTo(headX + 2, headY - 5);
      ctx.lineTo(headX + 8, headY - 2);
      ctx.lineTo(headX + 2, headY);
      
      ctx.moveTo(headX + 10, headY - 5);
      ctx.lineTo(headX + 16, headY - 2);
      ctx.lineTo(headX + 10, headY);
    } else {
      ctx.arc(headX + 5, headY - 3, 3, 0, Math.PI * 2); 
      ctx.arc(headX + 12, headY - 3, 3, 0, Math.PI * 2);
    }
    
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }
}
