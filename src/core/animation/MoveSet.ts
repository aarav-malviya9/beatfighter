export type ActionState = 'IDLE' | 'PUNCH' | 'HOOK' | 'UPPERCUT' | 'KICK' | 'ROUNDHOUSE' | 'JUMP_KICK' | 'BLOCK' | 'DODGE' | 'BACKFLIP' | 'HIT' | 'KNOCKBACK';

export type MovePhase = 'STARTUP' | 'ACTIVE' | 'RECOVERY';

export interface MoveDefinition {
  state: ActionState;
  startup: number;   // time in seconds
  active: number;    // time in seconds
  recovery: number;  // time in seconds
  damage: number;
  hitbox: {
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  } | null;
  forwardMovement: number; // How much they step forward during startup/active
}

export const MOVES: Record<string, MoveDefinition> = {
  PUNCH: {
    state: 'PUNCH',
    startup: 0.05,
    active: 0.1,
    recovery: 0.15,
    damage: 10,
    hitbox: { offsetX: 10, offsetY: -120, width: 40, height: 20 },
    forwardMovement: 10
  },
  HOOK: {
    state: 'HOOK',
    startup: 0.08,
    active: 0.1,
    recovery: 0.2,
    damage: 15,
    hitbox: { offsetX: 10, offsetY: -120, width: 45, height: 25 },
    forwardMovement: 15
  },
  UPPERCUT: {
    state: 'UPPERCUT',
    startup: 0.1,
    active: 0.1,
    recovery: 0.25,
    damage: 25,
    hitbox: { offsetX: 10, offsetY: -140, width: 30, height: 40 },
    forwardMovement: 20
  },
  KICK: {
    state: 'KICK',
    startup: 0.1,
    active: 0.15,
    recovery: 0.2,
    damage: 15,
    hitbox: { offsetX: 10, offsetY: -80, width: 50, height: 30 },
    forwardMovement: 10
  },
  ROUNDHOUSE: {
    state: 'ROUNDHOUSE',
    startup: 0.15,
    active: 0.15,
    recovery: 0.3,
    damage: 30,
    hitbox: { offsetX: 10, offsetY: -140, width: 60, height: 30 },
    forwardMovement: 20
  },
  JUMP_KICK: {
    state: 'JUMP_KICK',
    startup: 0.2,
    active: 0.2,
    recovery: 0.3,
    damage: 35,
    hitbox: { offsetX: 20, offsetY: -80, width: 50, height: 40 },
    forwardMovement: 30
  }
};
