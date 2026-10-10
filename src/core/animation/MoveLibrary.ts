import { type Pose } from './PoseEngine';

export type MovePhase = 'STARTUP' | 'ACTIVE' | 'RECOVERY' | 'FINISH';

export type AttackLevel = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'SPECIAL';

export interface MoveCameraRequest {
  zoom?: number;        // multiplier
  shake?: number;       // 0..1
  shakeDir?: [number, number];
  slowMo?: number;      // 0..1, 0 = full speed
  duration?: number;    // seconds
  track?: boolean;
  wide?: boolean;
}

export interface MoveVFXRequest {
  type: 'slash' | 'burst' | 'shockwave' | 'arc' | 'energy' | 'launch' | 'slam' | 'spark';
  origin: 'hand_l' | 'hand_r' | 'foot_l' | 'foot_r' | 'torso' | 'ground' | 'center';
  color: string;
  intensity: number; // 0..1
  radius?: number;
}

export interface MoveDefinition {
  id: string;
  name: string;
  level: AttackLevel;
  state: string;
  startup: number;
  active: number;
  recovery: number;
  total: number;
  damage: number;
  hitstun: number;       // seconds opponent is stunned
  knockback: number;     // pixels
  launchPower: number;   // 0..1, vertical launch
  groundBounce: number;  // 0..1
  range: number;         // effective reach
  forwardMovement: number;
  cancelWindow: number;  // seconds from end of active where you can cancel
  camera?: MoveCameraRequest;
  vfx?: MoveVFXRequest;
  pose: Pose;
  combo?: string[];      // allowed follow-ups
  finisher?: boolean;
}

export type MoveRegistry = Record<string, MoveDefinition>;

// Re-export Pose type for convenience
export type { Pose };