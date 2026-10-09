import { Fighter, type ActionState } from '../animation/Fighter';

export class CombatDirector {
  private fighters: Fighter[];
  
  constructor(fighters: Fighter[]) {
    this.fighters = fighters;
  }

  public onBeat(intensity: number) {
    // Choose an actor
    const actorIdx = Math.random() > 0.5 ? 0 : 1;
    const actor = this.fighters[actorIdx];
    const target = this.fighters[1 - actorIdx];

    if (actor.state !== 'IDLE' || target.state === 'HIT') return; // Wait for current action to finish

    // Determine action based on random chance + intensity
    const r = Math.random();
    
    let chosenAction: ActionState = 'IDLE';

    if (intensity > 180) { // Very high energy
      if (r < 0.2) chosenAction = 'JUMP_KICK';
      else if (r < 0.5) chosenAction = 'ROUNDHOUSE';
      else if (r < 0.7) chosenAction = 'UPPERCUT';
      else chosenAction = 'HOOK';
    } else if (intensity > 120) { // High energy
      if (r < 0.3) chosenAction = 'KICK';
      else if (r < 0.6) chosenAction = 'PUNCH';
      else if (r < 0.8) chosenAction = 'HOOK';
      else chosenAction = 'BLOCK';
    } else { // Low energy
      if (r < 0.2) chosenAction = 'PUNCH';
      else if (r < 0.4) chosenAction = 'BLOCK';
      else if (r < 0.6) chosenAction = 'DODGE';
      else if (r < 0.7) chosenAction = 'BACKFLIP';
    }

    if (chosenAction !== 'IDLE') {
      actor.state = chosenAction;
      actor.actionFrame = 0;

      // Reactions
      if (chosenAction !== 'BLOCK' && chosenAction !== 'DODGE' && chosenAction !== 'BACKFLIP') {
        const reactionR = Math.random();
        
        if (chosenAction === 'ROUNDHOUSE' || chosenAction === 'JUMP_KICK' || chosenAction === 'UPPERCUT') {
          // Heavy attacks -> higher chance of knockback
          if (reactionR < 0.3) {
            target.state = 'BLOCK';
          } else if (reactionR < 0.6) {
            target.state = 'KNOCKBACK';
          } else {
            target.state = 'HIT';
          }
        } else {
          // Normal attacks
          if (reactionR < 0.4) {
            target.state = 'BLOCK';
          } else if (reactionR < 0.7) {
            target.state = 'HIT';
          } else if (reactionR < 0.9) {
            target.state = 'DODGE';
          } else {
            target.state = 'BACKFLIP';
          }
        }
        target.actionFrame = 0;
      }
    }
  }

  public update() {
    this.fighters.forEach(f => f.update());
    
    // Distance management (fake walk towards each other)
    const p1 = this.fighters[0];
    const p2 = this.fighters[1];

    const dist = Math.abs(p1.x - p2.x);
    if (dist > 200 && p1.state === 'IDLE' && p2.state === 'IDLE') {
      p1.x += 1;
      p2.x -= 1;
    } else if (dist < 100 && p1.state === 'IDLE' && p2.state === 'IDLE') {
       p1.x -= 2;
       p2.x += 2;
    }
  }
}
