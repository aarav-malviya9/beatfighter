import { Fighter } from '../animation/Fighter';
import {
  MOVES,
  getMove,
  getMovesByLevel,
  ALL_MOVE_IDS,
  type MoveDefinition,
  type AttackLevel,
} from '../animation/MoveLibrary';
import { type TrackAnalysis } from '../audio/MusicAnalyzer';
import { CameraDirector } from '../rendering/CameraDirector';
import { SoundFX } from '../audio/SoundFX';
import type { CanvasRenderer } from '../rendering/CanvasRenderer';

export {
  MOVES,
  getMove,
  getMovesByLevel,
  ALL_MOVE_IDS,
  type MoveDefinition,
  type AttackLevel,
};

class PRNG {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  public next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  public range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  public choice<T>(arr: T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
}

function rectIntersect(r1: any, r2: any): boolean {
  if (!r1 || !r2) return false;
  const x1 = Math.min(r1.x, r1.x + r1.width);
  const w1 = Math.abs(r1.width);
  const y1 = Math.min(r1.y, r1.y + r1.height);
  const h1 = Math.abs(r1.height);

  const x2 = Math.min(r2.x, r2.x + r2.width);
  const w2 = Math.abs(r2.width);
  const y2 = Math.min(r2.y, r2.y + r2.height);
  const h2 = Math.abs(r2.height);

  return !(x2 > x1 + w1 || x2 + w2 < x1 || y2 > y1 + h1 || y2 + h2 < y1);
}

export type CombatState =
  | 'NEUTRAL'
  | 'EXCHANGE'
  | 'COMBO'
  | 'STANDOFF'
  | 'SIGNATURE'
  | 'RECOVERY';

export type CombatPacingStage =
  | 'OPENING'
  | 'BUILDUP'
  | 'CLIMAX'
  | 'STANDOFF'
  | 'FINISHER';

interface SignatureStep {
  delay: number; // time offset from start of sequence
  actorIdx: number;
  moveId: string;
  triggerCamera?: (cam: CameraDirector) => void;
  teleportX?: (actor: Fighter, target: Fighter) => number;
}

interface ActiveSignatureSequence {
  name: string;
  steps: SignatureStep[];
  currentStepIndex: number;
  elapsedTime: number;
  totalDuration: number;
}

interface ComboState {
  attackerIdx: number;
  defenderIdx: number;
  chain: string[];
  chainIndex: number;
  maxHits: number;
  comboHitsLanded: number;
  nextMoveId: string | null;
  queuedTime: number;
}

export class CombatDirector {
  private fighters: Fighter[];
  private cooldowns: [number, number] = [0, 0];
  private prng: PRNG = new PRNG(12345);

  // Track timeline
  private trackAnalysis: TrackAnalysis | null = null;
  private currentBeatIndex = 0;

  // External delegates
  public onHit: (x: number, y: number, color: string, damage: number) => void;
  public camera: CameraDirector | null = null;
  public renderer: CanvasRenderer | null = null;
  public isPlayerControlled: boolean = false;

  // Cinematic Choreography State
  private combatState: CombatState = 'NEUTRAL';
  private pacingStage: CombatPacingStage = 'OPENING';
  private standoffTimer = 0;
  private totalFightTime = 0;
  private totalHitsCount = 0;
  private energyLevel = 0.5;

  // Combo system
  private activeCombo: ComboState | null = null;

  // Signature sequence player
  private activeSignature: ActiveSignatureSequence | null = null;

  // High attack registry for intelligent ducking
  private highAttackMoveIds = new Set([
    'hook',
    'uppercut',
    'roundhouse',
    'spinning_kick',
    'axe_kick',
    'finisher_kick',
  ]);

  constructor(
    fighters: Fighter[],
    onHit: (x: number, y: number, color: string, damage: number) => void,
    camera?: CameraDirector | null,
    renderer?: CanvasRenderer | null
  ) {
    this.fighters = fighters;
    this.onHit = onHit;
    this.camera = camera ?? null;
    this.renderer = renderer ?? null;
  }

  public setRenderer(renderer: CanvasRenderer | null): void {
    this.renderer = renderer;
  }

  public setCamera(camera: CameraDirector | null): void {
    this.camera = camera;
  }

  public setTrackAnalysis(
    analysis: TrackAnalysis | null,
    seedString: string = 'beatfighter'
  ): void {
    this.trackAnalysis = analysis;
    this.currentBeatIndex = 0;

    let seed = 0;
    for (let i = 0; i < seedString.length; i++) {
      seed = (seed << 5) - seed + seedString.charCodeAt(i);
      seed |= 0;
    }
    this.prng = new PRNG(Math.abs(seed) || 12345);
    this.resetChoreography();
  }

  public getCombatState(): CombatState {
    return this.combatState;
  }

  public getPacingStage(): CombatPacingStage {
    return this.pacingStage;
  }

  private resetChoreography(): void {
    this.combatState = 'NEUTRAL';
    this.pacingStage = 'OPENING';
    this.standoffTimer = 0;
    this.totalFightTime = 0;
    this.totalHitsCount = 0;
    this.activeCombo = null;
    this.activeSignature = null;
  }

  // ---------------------------------------------------------------------------
  // Beat Handling & Dramatic Pacing
  // ---------------------------------------------------------------------------

  public onBeat(intensity: number, confidence: number = 1.0): void {
    const normIntensity = Math.min(1.0, Math.max(0.1, intensity / 255));
    this.energyLevel = 0.6 * this.energyLevel + 0.4 * normIntensity;

    // Trigger Camera Beat pulse
    if (this.camera) {
      this.camera.onBeat(this.energyLevel);
    }

    // Update dramatic pacing based on fight progression & energy
    this.updatePacing(normIntensity);

    // If an anime signature sequence is executing, let it drive actions
    if (this.activeSignature) {
      return;
    }

    // If currently locked in Standoff
    if (this.combatState === 'STANDOFF') {
      // High intensity drop breaks standoff with explosive clash!
      if (normIntensity > 0.65 || this.standoffTimer <= 0) {
        this.breakStandoff(normIntensity);
      }
      return;
    }

    // If an active combo chain is executing, let combo sequencer progress
    if (this.activeCombo) {
      return;
    }

    // Opportunity to trigger Signature Sequences at peak intensity!
    if (normIntensity > 0.72 && this.pacingStage === 'CLIMAX') {
      if (this.prng.next() < 0.45 && !this.activeSignature) {
        this.startRandomSignatureSequence();
        return;
      }
    }

    // Standard combat action initiative
    this.triggerBeatAction(normIntensity, confidence);
  }

  private updatePacing(intensity: number): void {
    if (this.totalFightTime < 10) {
      this.pacingStage = 'OPENING';
    } else if (intensity > 0.75 || this.totalHitsCount > 24) {
      this.pacingStage = 'CLIMAX';
    } else if (intensity > 0.45 || this.totalHitsCount > 8) {
      this.pacingStage = 'BUILDUP';
    } else {
      this.pacingStage = 'OPENING';
    }
  }

  private breakStandoff(intensity: number): void {
    this.combatState = 'EXCHANGE';
    this.standoffTimer = 0;

    const actorIdx = this.prng.next() > 0.5 ? 0 : 1;
    const actor = this.fighters[actorIdx];
    const target = this.fighters[1 - actorIdx];
    const dist = Math.abs(actor.x - target.x);

    this.orientFighters();

    if (dist > 180) {
      // Explode out of standoff with blink dash or lunge
      const opener = intensity > 0.8 ? 'blink_dash' : 'lunge';
      this.executeFighterMove(actor, opener);
    } else {
      // Explode with immediate heavy/counter strike
      const opener = intensity > 0.75 ? 'combo_rush' : 'cross';
      this.executeFighterMove(actor, opener);
    }

    this.cooldowns[actorIdx] = 0.3;
  }

  private triggerBeatAction(intensity: number, _confidence: number): void {
    const p1 = this.fighters[0];
    const p2 = this.fighters[1];
    const dist = Math.abs(p1.x - p2.x);

    // Pick attacker based on cooldown and idle state
    let actorIdx = -1;
    if (p1.state === 'IDLE' && p2.state === 'IDLE') {
      actorIdx = this.prng.next() > 0.5 ? 0 : 1;
    } else if (p1.state === 'IDLE' && this.cooldowns[0] <= 0) {
      actorIdx = 0;
    } else if (p2.state === 'IDLE' && this.cooldowns[1] <= 0) {
      actorIdx = 1;
    }

    if (actorIdx === -1) return;

    const actor = this.fighters[actorIdx];
    const target = this.fighters[1 - actorIdx];

    this.orientFighters();

    // 1. Distance Closing logic
    if (dist > 220) {
      if (intensity > 0.75 && this.prng.next() < 0.6) {
        this.executeFighterMove(actor, 'blink_dash');
      } else if (this.prng.next() < 0.7) {
        this.executeFighterMove(actor, 'lunge');
      } else {
        this.executeFighterMove(actor, 'dash');
      }
      this.cooldowns[actorIdx] = 0.35;
      return;
    }

    // 2. Chance for Standoff breathing moment after intense exchanges
    if (
      this.totalHitsCount > 0 &&
      this.totalHitsCount % 9 === 0 &&
      this.pacingStage !== 'CLIMAX' &&
      this.prng.next() < 0.5
    ) {
      this.enterStandoff();
      return;
    }

    // 3. Move selection based on dramatic pacing stage & intensity
    const chosenMoveId = this.selectMoveForStage(this.pacingStage, intensity, dist);
    if (!chosenMoveId) return;

    this.executeFighterMove(actor, chosenMoveId);
    this.cooldowns[actorIdx] = 0.45;
    this.combatState = 'EXCHANGE';

    // 4. Intelligent Defensive response from target
    this.handleIntelligentDefense(target, actor, chosenMoveId, intensity);
  }

  private selectMoveForStage(
    stage: CombatPacingStage,
    intensity: number,
    dist: number
  ): string {
    const r = this.prng.next();

    if (stage === 'OPENING') {
      // Opening round: light feints, jabs, low kicks, quick lunges
      if (dist > 120) return r < 0.5 ? 'lunge' : 'low_kick';
      if (r < 0.35) return 'jab';
      if (r < 0.6) return 'jab_feint';
      if (r < 0.8) return 'low_kick';
      return 'cross';
    }

    if (stage === 'BUILDUP') {
      // Buildup: medium attacks, hooks, body blows, sweeps, rush combos
      if (dist > 130) return r < 0.5 ? 'lunge' : 'roundhouse';
      if (r < 0.25) return 'cross';
      if (r < 0.45) return 'hook';
      if (r < 0.65) return 'body_blow';
      if (r < 0.8) return 'combo_rush';
      if (r < 0.9) return 'sweep';
      return 'palm_thrust';
    }

    // CLIMAX: Devastating heavy and special moves!
    if (dist > 140) {
      if (r < 0.3) return 'blink_dash';
      if (r < 0.6) return 'roundhouse';
      return 'energy_arc';
    }

    if (intensity > 0.8) {
      if (r < 0.25) return 'finisher_strike';
      if (r < 0.45) return 'finisher_kick';
      if (r < 0.65) return 'energy_strike';
      if (r < 0.85) return 'combo_storm';
      return 'shockwave';
    }

    if (r < 0.25) return 'uppercut';
    if (r < 0.5) return 'aerial_launch';
    if (r < 0.7) return 'roundhouse';
    if (r < 0.85) return 'spinning_kick';
    return 'axe_kick';
  }

  // ---------------------------------------------------------------------------
  // Intelligent Defense System
  // ---------------------------------------------------------------------------

  private handleIntelligentDefense(
    defender: Fighter,
    _attacker: Fighter,
    incomingMoveId: string,
    _intensity: number
  ): void {
    if (defender.state !== 'IDLE') return;

    const incomingMove = getMove(incomingMoveId);
    if (!incomingMove || incomingMove.damage <= 0) return;

    const r = this.prng.next();
    const isHigh = this.highAttackMoveIds.has(incomingMoveId);
    const isHeavy =
      incomingMove.level === 'HEAVY' || incomingMove.level === 'SPECIAL';

    // 1. Duck under high attacks (hooks, roundhouses, axe kicks)
    if (isHigh && r < 0.38) {
      defender.performMove('duck');
      return;
    }

    // 2. Parry attacks (precision parry with counter setup)
    if (r < 0.32) {
      defender.performMove('parry');
      return;
    }

    // 3. Sidestep / combat roll out of range for heavy lunges or combos
    if (isHeavy && r < 0.55) {
      if (this.prng.next() < 0.5) {
        defender.performMove('roll');
      } else {
        defender.performMove('sidestep');
      }
      return;
    }

    // 4. Standard defensive block guard
    if (r < 0.75) {
      defender.performMove('block');
      return;
    }

    // 5. Remaining 25%: Defender takes the hit cleanly for cinematic impact!
  }

  // ---------------------------------------------------------------------------
  // Standoff / Breathing Room
  // ---------------------------------------------------------------------------

  private enterStandoff(): void {
    this.combatState = 'STANDOFF';
    this.standoffTimer = this.prng.range(1.4, 2.2);

    if (this.camera) {
      this.camera.onStandoff();
    }
  }

  // ---------------------------------------------------------------------------
  // Signature Sequences (Pre-scripted cinematic anime choreography)
  // ---------------------------------------------------------------------------

  private startRandomSignatureSequence(): void {
    const sequences = [
      'aerial_juggle',
      'shadow_blink_counter',
      'parry_finisher',
      'storm_rush_finisher',
    ];
    const picked = this.prng.choice(sequences);
    this.triggerSignatureSequence(picked);
  }

  private triggerSignatureSequence(seqName: string): void {
    const attackerIdx = this.prng.next() > 0.5 ? 0 : 1;
    const defenderIdx = 1 - attackerIdx;

    let steps: SignatureStep[] = [];
    let totalDur = 2.0;

    switch (seqName) {
      case 'aerial_juggle':
        // Launch into sky -> Aerial Pursuit -> Ground Slam impact!
        totalDur = 1.6;
        steps = [
          {
            delay: 0.0,
            actorIdx: attackerIdx,
            moveId: 'aerial_launch',
            triggerCamera: (cam) => cam.onAerial(),
          },
          {
            delay: 0.38,
            actorIdx: attackerIdx,
            moveId: 'aerial_pursuit',
            triggerCamera: (cam) =>
              cam.requestCamera({ zoom: 1.25, duration: 0.35 }),
          },
          {
            delay: 0.78,
            actorIdx: attackerIdx,
            moveId: 'ground_slam',
            triggerCamera: (cam) => cam.onImpact(1.4, 0),
          },
        ];
        break;

      case 'shadow_blink_counter':
        // Opponent throws attack -> Defender blink dashes behind -> Cinematic counter!
        totalDur = 1.5;
        steps = [
          {
            delay: 0.0,
            actorIdx: attackerIdx,
            moveId: 'cross',
          },
          {
            delay: 0.08,
            actorIdx: defenderIdx,
            moveId: 'blink_dash',
            triggerCamera: (cam) =>
              cam.requestCamera({ zoom: 1.3, slowMo: 0.3, duration: 0.3 }),
          },
          {
            delay: 0.32,
            actorIdx: defenderIdx,
            moveId: 'cinematic_counter',
            triggerCamera: (cam) => cam.onCounter(),
          },
        ];
        break;

      case 'parry_finisher':
        // Opponent attacks -> Defender parries -> Counter strike -> Finisher kick!
        totalDur = 1.4;
        steps = [
          {
            delay: 0.0,
            actorIdx: attackerIdx,
            moveId: 'hook',
          },
          {
            delay: 0.05,
            actorIdx: defenderIdx,
            moveId: 'parry',
            triggerCamera: (cam) => cam.onCounter(),
          },
          {
            delay: 0.28,
            actorIdx: defenderIdx,
            moveId: 'counter',
            triggerCamera: (cam) => cam.onImpact(0.8, 0),
          },
          {
            delay: 0.62,
            actorIdx: defenderIdx,
            moveId: 'finisher_kick',
            triggerCamera: (cam) => cam.onFinisher(),
          },
        ];
        break;

      case 'storm_rush_finisher':
      default:
        // Combo storm -> Rising uppercut -> Massive Finisher Strike!
        totalDur = 1.8;
        steps = [
          {
            delay: 0.0,
            actorIdx: attackerIdx,
            moveId: 'combo_rush',
          },
          {
            delay: 0.42,
            actorIdx: attackerIdx,
            moveId: 'uppercut',
            triggerCamera: (cam) => cam.onImpact(0.9, 0),
          },
          {
            delay: 0.85,
            actorIdx: attackerIdx,
            moveId: 'finisher_strike',
            triggerCamera: (cam) => cam.onFinisher(),
          },
        ];
        break;
    }

    this.activeSignature = {
      name: seqName,
      steps,
      currentStepIndex: 0,
      elapsedTime: 0,
      totalDuration: totalDur,
    };

    this.combatState = 'SIGNATURE';
  }

  private updateSignatureSequence(dt: number): void {
    if (!this.activeSignature) return;

    this.activeSignature.elapsedTime += dt;
    const seq = this.activeSignature;

    while (
      seq.currentStepIndex < seq.steps.length &&
      seq.elapsedTime >= seq.steps[seq.currentStepIndex].delay
    ) {
      const step = seq.steps[seq.currentStepIndex];
      const actor = this.fighters[step.actorIdx];
      const target = this.fighters[1 - step.actorIdx];

      this.orientFighters();

      if (step.teleportX) {
        actor.x = step.teleportX(actor, target);
      }

      this.executeFighterMove(actor, step.moveId);

      if (step.triggerCamera && this.camera) {
        step.triggerCamera(this.camera);
      }

      seq.currentStepIndex++;
    }

    if (seq.elapsedTime >= seq.totalDuration) {
      this.activeSignature = null;
      this.combatState = 'NEUTRAL';
      this.cooldowns[0] = 0.4;
      this.cooldowns[1] = 0.4;
    }
  }

  // ---------------------------------------------------------------------------
  // Combo System
  // ---------------------------------------------------------------------------

  private handleComboFollowUp(attacker: Fighter, defender: Fighter): void {
    if (!attacker.currentMove) return;

    const moveDef = attacker.currentMove;
    const comboChain = moveDef.combo;

    // Check if move has combo links
    if (!comboChain || comboChain.length === 0) {
      this.activeCombo = null;
      return;
    }

    const attackerIdx = this.fighters.indexOf(attacker);
    const defenderIdx = 1 - attackerIdx;

    if (!this.activeCombo || this.activeCombo.attackerIdx !== attackerIdx) {
      // Start fresh combo
      const maxHits = Math.floor(this.prng.range(3, 5.5));
      this.activeCombo = {
        attackerIdx,
        defenderIdx,
        chain: comboChain,
        chainIndex: 0,
        maxHits,
        comboHitsLanded: 1,
        nextMoveId: this.selectComboMove(comboChain),
        queuedTime: 0,
      };
      this.combatState = 'COMBO';
    } else {
      // Advance existing combo
      this.activeCombo.comboHitsLanded++;

      // Defender combo breaker escape check
      if (this.activeCombo.comboHitsLanded >= 2 && this.prng.next() < 0.35) {
        defender.performMove(this.prng.next() < 0.5 ? 'roll' : 'duck');
        this.activeCombo = null;
        this.combatState = 'NEUTRAL';
        return;
      }

      if (this.activeCombo.comboHitsLanded >= this.activeCombo.maxHits) {
        // Combo reached culmination
        this.activeCombo = null;
        this.combatState = 'RECOVERY';
        return;
      }

      this.activeCombo.nextMoveId = this.selectComboMove(comboChain);
    }
  }

  private selectComboMove(chain: string[]): string {
    // Prefer higher escalation moves if available
    if (chain.length === 1) return chain[0];

    // Check if any finisher or heavy move is in chain and we are at climax
    if (this.pacingStage === 'CLIMAX') {
      const finisher = chain.find(
        (m) => m.includes('finisher') || m === 'spinning_kick' || m === 'ground_slam'
      );
      if (finisher && this.prng.next() < 0.6) return finisher;
    }

    return this.prng.choice(chain);
  }

  private updateComboProgress(_dt: number): void {
    if (!this.activeCombo) return;

    const attacker = this.fighters[this.activeCombo.attackerIdx];

    // If attacker returned to idle or finished active phase, cancel into next combo move
    if (!attacker.currentMove) {
      if (this.activeCombo.nextMoveId) {
        this.executeFighterMove(attacker, this.activeCombo.nextMoveId);
        this.activeCombo.nextMoveId = null;
      }
      return;
    }

    // Cancel window acceleration
    if (
      attacker.currentPhase === 'RECOVERY' ||
      (attacker.currentPhase === 'ACTIVE' &&
        attacker.actionTime >= attacker.currentMove.startup + attacker.currentMove.active * 0.7)
    ) {
      if (this.activeCombo.nextMoveId) {
        this.executeFighterMove(attacker, this.activeCombo.nextMoveId);
        this.activeCombo.nextMoveId = null;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Frame Update Loop
  // ---------------------------------------------------------------------------

  public update(dt: number, currentTime: number): void {
    if (dt > 1.0 || dt < 0) {
      this.fighters.forEach((f) => f.performMove('IDLE'));
      dt = 0;

      if (this.trackAnalysis) {
        this.currentBeatIndex = this.trackAnalysis.beats.findIndex(
          (b) => b >= currentTime
        );
        if (this.currentBeatIndex === -1) {
          this.currentBeatIndex = this.trackAnalysis.beats.length;
        }
      }
    }

    this.totalFightTime += dt;

    // Process pre-calculated audio track beats
    if (this.trackAnalysis) {
      while (
        this.currentBeatIndex < this.trackAnalysis.beats.length &&
        this.trackAnalysis.beats[this.currentBeatIndex] <= currentTime
      ) {
        const energyIdx = Math.floor(currentTime * 100);
        const intensity =
          this.trackAnalysis.energyCurve[energyIdx] !== undefined
            ? this.trackAnalysis.energyCurve[energyIdx] * 255
            : 100;

        this.onBeat(intensity);
        this.currentBeatIndex++;
      }
    }

    // Update cooldown timers
    this.cooldowns[0] = Math.max(0, this.cooldowns[0] - dt);
    this.cooldowns[1] = Math.max(0, this.cooldowns[1] - dt);

    // Update standoff breathing timer
    if (this.combatState === 'STANDOFF') {
      this.standoffTimer -= dt;
      if (this.standoffTimer <= 0) {
        this.breakStandoff(this.energyLevel);
      }
    }

    // Update active scripted signature sequence
    if (this.activeSignature) {
      this.updateSignatureSequence(dt);
    }

    // Update combo sequencing
    if (this.activeCombo) {
      this.updateComboProgress(dt);
    }

    // Update fighter physics & pose solves
    this.fighters.forEach((f) => f.update(dt));

    const p1 = this.fighters[0];
    const p2 = this.fighters[1];

    // Collision detection
    this.checkHit(p1, p2);
    this.checkHit(p2, p1);

    // Forward momentum from attacks
    this.applyForwardMovement(dt);

    // Distance management & staging
    this.manageDistanceAndBoundaries(dt);
  }

  // ---------------------------------------------------------------------------
  // Combat Hit Resolution
  // ---------------------------------------------------------------------------

  private checkHit(attacker: Fighter, defender: Fighter): void {
    if (!attacker.isHitActive || !attacker.currentMove) return;

    const hitbox = attacker.getHitbox();
    const bodybox = defender.getBodyBox();

    if (!hitbox) return;

    if (rectIntersect(hitbox, bodybox)) {
      // Consume hit activation so one strike cannot multi-hit
      attacker.isHitActive = false;

      const currentMove = attacker.currentMove;
      const hitX = hitbox.x + hitbox.width * 0.5;
      const hitY = hitbox.y + hitbox.height * 0.5;

      // 1. Parry Check
      if (defender.state === 'BLOCK' && defender.currentMoveId === 'parry') {
        this.handleParrySuccess(attacker, defender, hitX, hitY);
        return;
      }

      // 2. Duck Check against High Attacks
      if (defender.state === 'DODGE' && defender.currentMoveId === 'duck') {
        if (this.highAttackMoveIds.has(currentMove.id)) {
          // Whiffed over ducking defender! Defender can counter-attack
          this.handleDuckCounter(defender);
          return;
        }
      }

      // 3. Sidestep & Combat Roll Evade Check
      if (
        defender.state === 'DODGE' ||
        defender.state === 'BACKFLIP' ||
        defender.currentMoveId === 'roll' ||
        defender.currentMoveId === 'sidestep'
      ) {
        // Complete clean dodge
        return;
      }

      // 4. Guard Block
      if (defender.state === 'BLOCK') {
        defender.actionTime = 0;
        this.onHit(hitX, hitY, '#ffffff', 0.45);
        if (this.camera) {
          this.camera.addShake(4);
        }
        return;
      }

      // 5. Clean Devastating Hit!
      this.totalHitsCount++;
      const dmg = currentMove.damage;
      const vfxIntensity = Math.min(1.0, Math.max(0.2, dmg / 45));

      // Sound FX
      SoundFX.getInstance().playHit(dmg >= 24);
      SoundFX.getInstance().playBladeSlash();

      // Emit Hit VFX
      this.onHit(hitX, hitY, defender.eyeColor, vfxIntensity);

      // Dimensional Cut / Finisher sequence
      if (currentMove.finisher || dmg >= 35) {
        SoundFX.getInstance().playDimensionalSlash();
        if (this.renderer) {
          this.renderer.triggerDimensionalSlash(hitX, hitY, attacker.eyeColor);
          this.renderer.addCombatCallout(hitX, hitY - 45, 'DIMENSIONAL CUT!', attacker.eyeColor, true);
        }
      } else if (dmg >= 20) {
        if (this.renderer) {
          this.renderer.addCombatCallout(hitX, hitY - 30, 'CRITICAL HIT!', '#ffffff', true);
        }
      } else {
        if (this.renderer) {
          this.renderer.addCombatCallout(hitX, hitY - 20, 'SHADOW STRIKE', attacker.eyeColor, false);
        }
      }

      // Camera impacts
      if (this.camera) {
        this.camera.onImpact(vfxIntensity, attacker.direction);
        if (currentMove.finisher || dmg >= 35) {
          this.camera.onFinisher();
        } else if (currentMove.launchPower > 0.4) {
          this.camera.onAerial();
        }
      }

      // Defender Hit Reaction with proper knockback & aerial launches
      defender.takeHit(dmg, currentMove.knockback, currentMove.launchPower);

      // Progress combo follow-up
      this.handleComboFollowUp(attacker, defender);
    }
  }

  private handleParrySuccess(
    attacker: Fighter,
    defender: Fighter,
    hitX: number,
    hitY: number
  ): void {
    // Metallic sword clash ring
    SoundFX.getInstance().playBladeClash(1.35);

    if (this.renderer) {
      this.renderer.triggerSwordClash(hitX, hitY);
      this.renderer.addCombatCallout(hitX, hitY - 35, 'PERFECT PARRY!', '#ffd700', true);
    }

    // White-gold parry spark
    this.onHit(hitX, hitY, '#ffe066', 0.85);

    if (this.camera) {
      this.camera.onCounter();
    }

    // Stagger attacker
    attacker.performMove('hit_react');

    // Immediate counter-attack from defender
    const counterMove = this.prng.next() < 0.7 ? 'counter' : 'uppercut';
    defender.performMove(counterMove);
    this.combatState = 'EXCHANGE';
  }

  private handleDuckCounter(defender: Fighter): void {
    // If ducking defender finishes startup, reward with rising uppercut or body blow
    if (defender.currentPhase === 'ACTIVE' && this.prng.next() < 0.6) {
      defender.performMove('uppercut');
      if (this.camera) {
        this.camera.requestCamera({ zoom: 1.18, duration: 0.2 });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Movement & Distance Management
  // ---------------------------------------------------------------------------

  public handlePlayerInput(
    action: 'left' | 'right' | 'light' | 'heavy' | 'special' | 'dodge' | 'jump' | 'duck' | 'throw',
  ): void {
    const p1 = this.fighters[0];
    const p2 = this.fighters[1];
    if (!p1 || !p2) return;

    switch (action) {
      case 'left':
        p1.direction = -1;
        p1.x = Math.max(120, p1.x - 24);
        p1.performMove('dash');
        break;
      case 'right':
        p1.direction = 1;
        p1.x = Math.min(1160, p1.x + 24);
        p1.performMove('dash');
        break;
      case 'light':
        this.executeFighterMove(p1, this.prng.choice(['jab', 'cross', 'hook']));
        break;
      case 'heavy':
        this.executeFighterMove(p1, this.prng.choice(['roundhouse', 'axe_kick', 'uppercut', 'spinning_kick']));
        break;
      case 'special':
        this.executeFighterMove(p1, this.prng.choice(['finisher_strike', 'cinematic_counter', 'energy_strike']));
        break;
      case 'dodge':
        this.executeFighterMove(p1, this.prng.choice(['parry', 'roll', 'sidestep']));
        break;
      case 'jump':
        this.executeFighterMove(p1, 'aerial_launch');
        break;
      case 'duck':
        this.executeFighterMove(p1, 'duck');
        break;
      case 'throw':
        p1.throwKunai(p2.x, p2.y - 70);
        SoundFX.getInstance().playProjectileThrow();
        break;
    }
  }

  private executeFighterMove(fighter: Fighter, moveId: string): void {
    const move = getMove(moveId);
    if (!move) return;

    fighter.performMove(moveId);
    SoundFX.getInstance().playWhoosh(move.level === 'HEAVY' || !!move.finisher ? 1.4 : 1.0);

    // Trigger Move Camera requests if specified
    if (move.camera && this.camera) {
      this.camera.requestCamera(move.camera);
    }
  }

  private applyForwardMovement(dt: number): void {
    const p1 = this.fighters[0];
    const p2 = this.fighters[1];

    [p1, p2].forEach((f, idx) => {
      if (
        f.currentMove &&
        (f.currentPhase === 'STARTUP' || f.currentPhase === 'ACTIVE')
      ) {
        const target = this.fighters[1 - idx];
        const dist = Math.abs(f.x - target.x);
        // Don't step inside opponent to prevent model clipping
        if (dist > 75) {
          f.x += f.currentMove.forwardMovement * dt * 3.5 * f.direction;
        }
      }
    });
  }

  private manageDistanceAndBoundaries(dt: number): void {
    const p1 = this.fighters[0];
    const p2 = this.fighters[1];
    const dist = Math.abs(p1.x - p2.x);

    // Standoff spacing & tense circling
    if (this.combatState === 'STANDOFF') {
      if (dist < 150) {
        p1.x -= 40 * dt * p1.direction;
        p2.x -= 40 * dt * p2.direction;
      }
    } else if (p1.state === 'IDLE' && p2.state === 'IDLE') {
      // Natural fighting game spacing
      if (dist > 160) {
        p1.x += 80 * dt * p1.direction;
        p2.x += 80 * dt * p2.direction;
      } else if (dist < 90) {
        p1.x -= 70 * dt * p1.direction;
        p2.x -= 70 * dt * p2.direction;
      }
    }

    // Stage Boundaries
    const minStageX = 90;
    const maxStageX = 1190;
    p1.x = Math.max(minStageX, Math.min(maxStageX, p1.x));
    p2.x = Math.max(minStageX, Math.min(maxStageX, p2.x));

    // Keep fighters facing each other when idle or mobile
    this.orientFighters();
  }

  private orientFighters(): void {
    const p1 = this.fighters[0];
    const p2 = this.fighters[1];

    if (p1.state === 'IDLE' || p1.state === 'DODGE') {
      p1.direction = p1.x <= p2.x ? 1 : -1;
    }
    if (p2.state === 'IDLE' || p2.state === 'DODGE') {
      p2.direction = p2.x <= p1.x ? 1 : -1;
    }
  }
}
