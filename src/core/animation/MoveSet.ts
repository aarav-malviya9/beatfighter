/**
 * Compatibility layer: legacy ActionState / MOVES API backed by MoveLibrary.
 */
import {
  MOVES as LIBRARY_MOVES,
  getMove,
  type MoveDefinition as LibraryMove,
  type MovePhase as LibraryMovePhase,
  type AttackLevel,
} from './MoveLibrary';

export type ActionState =
  | 'IDLE'
  | 'PUNCH'
  | 'HOOK'
  | 'UPPERCUT'
  | 'KICK'
  | 'ROUNDHOUSE'
  | 'JUMP_KICK'
  | 'BLOCK'
  | 'DODGE'
  | 'BACKFLIP'
  | 'HIT'
  | 'KNOCKBACK';

export type MovePhase = 'STARTUP' | 'ACTIVE' | 'RECOVERY';

/** Legacy move shape expected by older CombatDirector / MoveSet consumers. */
export interface MoveDefinition {
  state: ActionState;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  hitbox: {
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  } | null;
  forwardMovement: number;
  /** Library move id this legacy entry maps to */
  libraryId?: string;
  hitstun?: number;
  knockback?: number;
  launchPower?: number;
}

const LEGACY_TO_LIBRARY: Record<Exclude<ActionState, 'IDLE'>, string> = {
  PUNCH: 'jab',
  HOOK: 'hook',
  UPPERCUT: 'uppercut',
  KICK: 'low_kick',
  ROUNDHOUSE: 'roundhouse',
  JUMP_KICK: 'aerial_launch',
  BLOCK: 'block',
  DODGE: 'sidestep',
  BACKFLIP: 'roll',
  HIT: 'hit_react',
  KNOCKBACK: 'knockdown',
};

function toLegacy(state: ActionState, libraryId: string): MoveDefinition | null {
  const lib = getMove(libraryId);
  if (!lib) return null;

  const origin = lib.hitOrigin ?? 'hand_r';
  const isKick = origin.startsWith('foot');
  const offsetY = isKick ? -80 : -120;
  const size = Math.max(28, Math.min(60, lib.range * 0.4));

  return {
    state,
    startup: lib.startup,
    active: lib.active,
    recovery: lib.recovery,
    damage: lib.damage,
    hitbox:
      lib.damage > 0
        ? {
            offsetX: 12,
            offsetY,
            width: size,
            height: isKick ? 30 : 24,
          }
        : null,
    forwardMovement: lib.forwardMovement,
    libraryId,
    hitstun: lib.hitstun,
    knockback: lib.knockback,
    launchPower: lib.launchPower,
  };
}

export const MOVES: Record<string, MoveDefinition> = {};

for (const [state, libraryId] of Object.entries(LEGACY_TO_LIBRARY) as [
  Exclude<ActionState, 'IDLE'>,
  string,
][]) {
  const legacy = toLegacy(state, libraryId);
  if (legacy) MOVES[state] = legacy;
}

/** Resolve a legacy ActionState or library id to a library move. */
export function resolveLibraryMove(
  moveIdOrState: string,
): LibraryMove | undefined {
  if (LIBRARY_MOVES[moveIdOrState]) return LIBRARY_MOVES[moveIdOrState];
  const mapped = LEGACY_TO_LIBRARY[moveIdOrState as Exclude<ActionState, 'IDLE'>];
  if (mapped) return getMove(mapped);
  return undefined;
}

export type { AttackLevel, LibraryMove, LibraryMovePhase };
export { LIBRARY_MOVES, getMove };
