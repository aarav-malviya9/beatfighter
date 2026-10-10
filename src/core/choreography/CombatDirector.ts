import { Fighter } from '../animation/Fighter';
import { type ActionState, MOVES } from '../animation/MoveSet';

import { type TrackAnalysis } from '../audio/MusicAnalyzer';

class PRNG {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  public next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

function rectIntersect(r1: any, r2: any) {
  if (!r1 || !r2) return false;
  
  const x1 = Math.min(r1.x, r1.x + r1.width);
  const w1 = Math.abs(r1.width);
  const y1 = Math.min(r1.y, r1.y + r1.height);
  const h1 = Math.abs(r1.height);

  const x2 = Math.min(r2.x, r2.x + r2.width);
  const w2 = Math.abs(r2.width);
  const y2 = Math.min(r2.y, r2.y + r2.height);
  const h2 = Math.abs(r2.height);

  return !(x2 > x1 + w1 || 
           x2 + w2 < x1 || 
           y2 > y1 + h1 ||
           y2 + h2 < y1);
}

export class CombatDirector {
  private fighters: Fighter[];
  private cooldowns: [number, number] = [0, 0];
  private prng: PRNG = new PRNG(12345); // Default seed
  
  // Track timeline
  private trackAnalysis: TrackAnalysis | null = null;
  private currentBeatIndex = 0;
  
  public onHit: (x: number, y: number, color: string, damage: number) => void;
  
  constructor(fighters: Fighter[], onHit: (x: number, y: number, color: string, damage: number) => void) {
    this.fighters = fighters;
    this.onHit = onHit;
  }

  public setTrackAnalysis(analysis: TrackAnalysis | null, seedString: string = "beatfighter") {
    this.trackAnalysis = analysis;
    this.currentBeatIndex = 0;
    
    // Create a simple numeric seed from string
    let seed = 0;
    for (let i = 0; i < seedString.length; i++) {
      seed = (seed << 5) - seed + seedString.charCodeAt(i);
      seed |= 0;
    }
    this.prng = new PRNG(Math.abs(seed));
  }

  public onBeat(intensity: number) {
    const actorIdx = this.prng.next() > 0.5 ? 0 : 1;
    const actor = this.fighters[actorIdx];
    const target = this.fighters[1 - actorIdx];

    // Don't interrupt if currently doing something, unless idle/walking
    if (actor.state !== 'IDLE' || this.cooldowns[actorIdx] > 0) return;
    
    // Choose move based on intensity and distance
    const dist = Math.abs(actor.x - target.x);
    let chosenAction: ActionState = 'IDLE';
    const r = this.prng.next();

    if (dist > 250) {
       // Too far, no attacks, just let them walk or dodge
       if (r < 0.2) chosenAction = 'DODGE';
       return;
    }

    if (intensity > 180) {
      if (r < 0.2) chosenAction = 'JUMP_KICK';
      else if (r < 0.5) chosenAction = 'ROUNDHOUSE';
      else if (r < 0.7) chosenAction = 'UPPERCUT';
      else chosenAction = 'HOOK';
    } else if (intensity > 120) {
      if (r < 0.3) chosenAction = 'KICK';
      else if (r < 0.6) chosenAction = 'PUNCH';
      else if (r < 0.8) chosenAction = 'HOOK';
      else chosenAction = 'BLOCK'; // Block proactively
    } else {
      if (r < 0.3) chosenAction = 'PUNCH';
      else if (r < 0.6) chosenAction = 'BLOCK';
      else if (r < 0.8) chosenAction = 'DODGE';
      else chosenAction = 'BACKFLIP';
    }

    actor.performMove(chosenAction);
    this.cooldowns[actorIdx] = 0.5; // Basic cooldown
    
    // Proactive defense logic for target
    if (target.state === 'IDLE' && MOVES[chosenAction]) {
       const defR = this.prng.next();
       // If target is idle, they might try to block or dodge
       if (defR < 0.4) target.performMove('BLOCK');
       else if (defR < 0.6) target.performMove('DODGE');
       else if (defR < 0.7) target.performMove('BACKFLIP');
    }
  }

  public update(dt: number, currentTime: number) {
    if (dt > 1.0 || dt < 0) {
       this.fighters.forEach(f => f.performMove('IDLE'));
       dt = 0;
       
       // Resync beat index if we jumped
       if (this.trackAnalysis) {
         this.currentBeatIndex = this.trackAnalysis.beats.findIndex(b => b >= currentTime);
         if (this.currentBeatIndex === -1) this.currentBeatIndex = this.trackAnalysis.beats.length;
       }
    }

    // Process pre-calculated beats
    if (this.trackAnalysis) {
      while (this.currentBeatIndex < this.trackAnalysis.beats.length && 
             this.trackAnalysis.beats[this.currentBeatIndex] <= currentTime) {
        
        // Find intensity at this time
        const energyIdx = Math.floor(currentTime * 100); // 100Hz sampling in MusicAnalyzer (chunkSize 0.01s)
        const intensity = this.trackAnalysis.energyCurve[energyIdx] !== undefined 
          ? this.trackAnalysis.energyCurve[energyIdx] * 255 
          : 100;
          
        this.onBeat(intensity);
        this.currentBeatIndex++;
      }
    }

    // Cooldowns
    this.cooldowns[0] = Math.max(0, this.cooldowns[0] - dt);
    this.cooldowns[1] = Math.max(0, this.cooldowns[1] - dt);

    this.fighters.forEach(f => f.update(dt));

    const p1 = this.fighters[0];
    const p2 = this.fighters[1];

    // Collision detection for hits
    this.checkHit(p1, p2);
    this.checkHit(p2, p1);

    // Forward movement applied from attacks
    [p1, p2].forEach((f, idx) => {
       if (f.currentMove && (f.currentPhase === 'STARTUP' || f.currentPhase === 'ACTIVE')) {
           const target = this.fighters[1 - idx];
           // Don't step forward if too close (clipping prevention)
           if (Math.abs(f.x - target.x) > 80) {
              f.x += (f.currentMove.forwardMovement * dt * 5) * f.direction;
           }
       }
    });

    // Distance management when idle (fake walk towards each other)
    const dist = Math.abs(p1.x - p2.x);
    if (p1.state === 'IDLE' && p2.state === 'IDLE') {
      if (dist > 150) {
        p1.x += 100 * dt;
        p2.x -= 100 * dt;
      } else if (dist < 100) {
        p1.x -= 100 * dt;
        p2.x += 100 * dt;
      }
    }
    
    // Hard boundary prevention
    p1.x = Math.max(100, Math.min(1180, p1.x));
    p2.x = Math.max(100, Math.min(1180, p2.x));
    
    // Ensure p1 is always left of p2
    if (p1.x > p2.x - 50) {
       p1.x = p2.x - 50;
    }
  }

  private checkHit(attacker: Fighter, defender: Fighter) {
    if (attacker.isHitActive && attacker.currentMove) {
       const hitbox = attacker.getHitbox();
       const bodybox = defender.getBodyBox();
       
       if (!hitbox) return;
       
       if (rectIntersect(hitbox, bodybox)) {
          // Resolve hit
          attacker.isHitActive = false; // Cannot hit multiple times with same active phase
          
          if (defender.state === 'BLOCK') {
            // Blocked
            defender.actionTime = 0;
            this.onHit(hitbox.x, hitbox.y, '#ffffff', 0.5); // Small block spark
          } else if (defender.state === 'DODGE' || defender.state === 'BACKFLIP') {
            // Missed
          } else {
            // Landed
            const dmg = attacker.currentMove.damage;
            this.onHit(hitbox.x, hitbox.y, defender.eyeColor, dmg / 10);
            if (dmg > 20) {
              defender.performMove('KNOCKBACK');
            } else {
              defender.performMove('HIT');
            }
          }
       }
    }
  }
}
