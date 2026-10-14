import {
  createDefaultPose,
  interpolatePose,
  sampleClipPose,
  solveForwardKinematics,
  getJointWorldPos,
  DEFAULT_SKELETON,
  type Pose,
  type SkeletonConfig,
} from './PoseEngine';
import {
  MOVES,
  IDLE_POSE,
  HIT_POSE,
  BLOCK_POSE,
  KNOCKDOWN_POSE,
  getMove,
  type MoveDefinition,
  type MovePhase,
} from './MoveLibrary';

export type Point = { x: number; y: number };
export type FighterStyle = 'shadow' | 'celestial' | 'crimson' | 'void';

/** Legacy ActionState names → MoveLibrary ids */
const LEGACY_STATE_TO_MOVE: Record<string, string> = {
  IDLE: '',
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

const BONE_CONNECTIONS: [string, string][] = [
  ['hips', 'spine'],
  ['spine', 'chest'],
  ['chest', 'neck'],
  ['neck', 'head'],
  ['chest', 'shoulder_l'],
  ['shoulder_l', 'upperArm_l'],
  ['upperArm_l', 'lowerArm_l'],
  ['lowerArm_l', 'hand_l'],
  ['chest', 'shoulder_r'],
  ['shoulder_r', 'upperArm_r'],
  ['upperArm_r', 'lowerArm_r'],
  ['lowerArm_r', 'hand_r'],
  ['hips', 'thigh_l'],
  ['thigh_l', 'shin_l'],
  ['shin_l', 'foot_l'],
  ['hips', 'thigh_r'],
  ['thigh_r', 'shin_r'],
  ['shin_r', 'foot_r'],
];

/** Bones associated with specific striking limb origins */
const STRIKE_LIMB_BONES: Record<string, [string, string][]> = {
  hand_r: [
    ['shoulder_r', 'upperArm_r'],
    ['upperArm_r', 'lowerArm_r'],
    ['lowerArm_r', 'hand_r'],
  ],
  hand_l: [
    ['shoulder_l', 'upperArm_l'],
    ['upperArm_l', 'lowerArm_l'],
    ['lowerArm_l', 'hand_l'],
  ],
  foot_r: [
    ['hips', 'thigh_r'],
    ['thigh_r', 'shin_r'],
    ['shin_r', 'foot_r'],
  ],
  foot_l: [
    ['hips', 'thigh_l'],
    ['thigh_l', 'shin_l'],
    ['shin_l', 'foot_l'],
  ],
  torso: [
    ['hips', 'spine'],
    ['spine', 'chest'],
  ],
};

interface Afterimage {
  pose: Pose;
  x: number;
  y: number;
  alpha: number;
  color: string;
}

interface TrailPoint {
  x: number;
  y: number;
  life: number;
}

interface SlashPoint {
  tipX: number;
  tipY: number;
  baseX: number;
  baseY: number;
  life: number;
  maxLife: number;
}

interface EyeTrailPoint {
  x: number;
  y: number;
  life: number;
}

interface AuraParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  orbitAngle?: number;
  orbitRadius?: number;
  orbitSpeed?: number;
  color?: string;
}

interface ImpactLine {
  angle: number;
  length: number;
  width: number;
}

interface ImpactEffect {
  x: number;
  y: number;
  timer: number;
  duration: number;
  lines: ImpactLine[];
}

export type WeaponType = 'katana' | 'dual_blades' | 'scythe' | 'fists';
export type HeadgearType = 'straw_hat' | 'ninja_headband' | 'demon_mask' | 'none';

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  life: number;
  active: boolean;
  color: string;
}

interface ClothNode {
  x: number;
  y: number;
  oldX: number;
  oldY: number;
}

export class Fighter {
  public x: number;
  public y: number;
  public direction: 1 | -1;
  public state: string = 'IDLE';
  public actionTime: number = 0;

  public height = 160;
  public color = '#000000';
  public eyeColor = '#00ffcc';

  public currentMoveId: string | null = null;
  public currentMove: MoveDefinition | null = null;
  public isHitActive: boolean = false;
  public currentPhase: MovePhase | null = null;

  public health: number = 100;
  public style: FighterStyle = 'shadow';

  // Ninja Weapons & Gear ($10,000 Reference)
  public weapon: WeaponType = 'katana';
  public headgear: HeadgearType = 'straw_hat';
  public projectiles: Projectile[] = [];

  // Flowing cloth physics ribbons (Headband & Waist Sash)
  private headbandRibbon: ClothNode[] = [];
  private sashRibbon: ClothNode[] = [];

  private groundY: number;
  private auraIntensity: number = 0.35;
  private breathTime: number = 0;

  private currentPose: Pose;
  private fromPose: Pose;
  private targetPose: Pose;
  private solvedPose: Pose;

  private skeleton: SkeletonConfig;
  private velocityY: number = 0;
  private knockbackVel: number = 0;

  private afterimages: Afterimage[] = [];
  private motionTrail: TrailPoint[] = [];
  private slashTrail: SlashPoint[] = [];
  private eyeTrail: EyeTrailPoint[] = [];
  private auraParticles: AuraParticle[] = [];
  private afterimageTimer: number = 0;

  // Impact freeze & speed lines effect
  private wasHitActive: boolean = false;
  private impactEffect: ImpactEffect | null = null;

  // Joint history for motion blur
  private prevJointPositions: Record<string, Point> = {};
  private currentWeaponAngleOffset: number = 0;

  constructor(
    x: number,
    y: number,
    direction: 1 | -1,
    color: string,
    eyeColor: string,
  ) {
    this.x = x;
    this.y = y;
    this.groundY = y;
    this.direction = direction;
    this.color = color;
    this.eyeColor = eyeColor;

    this.skeleton = {
      ...DEFAULT_SKELETON,
      height: this.height,
    };

    this.currentPose = clonePose(IDLE_POSE);
    this.fromPose = clonePose(IDLE_POSE);
    this.targetPose = clonePose(IDLE_POSE);
    this.solvedPose = solveForwardKinematics(
      this.currentPose,
      this.skeleton,
      this.direction,
    );

    // Initialize 4-node cloth ribbon for ninja headband
    for (let i = 0; i < 4; i++) {
      this.headbandRibbon.push({
        x: x - i * 12 * direction,
        y: y - this.height * 0.85,
        oldX: x - i * 12 * direction,
        oldY: y - this.height * 0.85,
      });
    }

    // Initialize 3-node cloth ribbon for waist sash
    for (let i = 0; i < 3; i++) {
      this.sashRibbon.push({
        x: x - i * 10 * direction,
        y: y - this.height * 0.45,
        oldX: x - i * 10 * direction,
        oldY: y - this.height * 0.45,
      });
    }
  }

  public performMove(moveIdOrState: string): void {
    if (moveIdOrState === 'IDLE' || moveIdOrState === '') {
      this.returnToIdle();
      return;
    }

    const resolvedId =
      MOVES[moveIdOrState]
        ? moveIdOrState
        : LEGACY_STATE_TO_MOVE[moveIdOrState] ?? moveIdOrState;

    const move = getMove(resolvedId);
    if (!move) {
      if (moveIdOrState === 'HIT') {
        this.applyReaction('HIT', HIT_POSE, 0.25);
        return;
      }
      if (moveIdOrState === 'KNOCKBACK') {
        this.applyReaction('KNOCKBACK', KNOCKDOWN_POSE, 0.55);
        return;
      }
      return;
    }

    this.currentMoveId = move.id;
    this.currentMove = move;
    this.state = move.state;
    this.actionTime = 0;
    this.isHitActive = false;
    this.wasHitActive = false;
    this.currentPhase = 'STARTUP';

    this.fromPose = clonePose(this.currentPose);
    this.targetPose = clonePose(move.pose);
    this.targetPose.direction = this.direction;

    // Fast-move immediate afterimage burst
    if (move.level === 'SPECIAL' || move.finisher) {
      this.spawnAfterimage(0.8);
    }
  }

  public takeHit(damage: number, knockback: number, launchPower: number): void {
    this.health = Math.max(0, this.health - damage);
    this.knockbackVel = -Math.abs(knockback) * this.direction;
    this.velocityY = -launchPower * 420;

    if (launchPower > 0.4 || damage > 25) {
      this.performMove('knockdown');
    } else {
      this.performMove('hit_react');
    }
  }

  public update(dt: number): void {
    this.breathTime += dt;
    this.actionTime += dt;

    // Gravity / launch
    if (this.y < this.groundY || this.velocityY !== 0) {
      this.velocityY += 1400 * dt;
      this.y += this.velocityY * dt;
      if (this.y >= this.groundY) {
        this.y = this.groundY;
        this.velocityY = 0;
      }
    }

    if (this.knockbackVel !== 0) {
      this.x += this.knockbackVel * dt;
      this.knockbackVel *= Math.max(0, 1 - 6 * dt);
      if (Math.abs(this.knockbackVel) < 2) this.knockbackVel = 0;
    }

    if (!this.currentMove) {
      this.updateIdle(dt);
      this.solveAndTrail(dt);
      this.updateParticlesAndEffects(dt);
      return;
    }

    const { startup, active, recovery, total, forwardMovement } =
      this.currentMove;
    const moveWindow = startup + active;

    if (this.currentMove.keyframes && this.currentMove.keyframes.length > 0) {
      const progress = Math.min(1.0, Math.max(0, this.actionTime / Math.max(0.001, total)));
      const sample = sampleClipPose(this.currentMove.keyframes, progress, this.targetPose);

      this.currentPose = sample.pose;
      this.currentPhase = sample.phase;
      this.isHitActive = sample.hitActive && this.currentMove.damage > 0;
      this.currentWeaponAngleOffset = sample.weaponAngle;

      // Forward movement follows action window
      if (this.actionTime <= moveWindow && moveWindow > 0) {
        this.x += (forwardMovement / moveWindow) * dt * this.direction;
      }

      // Foot plant constraint
      if (sample.footPlant === 'both' || sample.footPlant === 'left' || sample.footPlant === 'right') {
        if (this.y >= this.groundY - 1) {
          this.y = this.groundY;
          this.velocityY = 0;
        }
      }

      if (this.actionTime >= total) {
        this.currentWeaponAngleOffset = 0;
        this.returnToIdle();
      }
    } else {
      const moveTime = this.actionTime;
      // Forward movement during startup + active
      if (moveTime <= moveWindow && moveWindow > 0) {
        this.x += (forwardMovement / moveWindow) * dt * this.direction;
      }

      if (moveTime < startup) {
        this.currentPhase = 'STARTUP';
        this.isHitActive = false;
        const t = startup > 0 ? moveTime / startup : 1;
        this.currentPose = interpolatePose(this.fromPose, this.targetPose, t);
      } else if (moveTime < startup + active) {
        this.currentPhase = 'ACTIVE';
        this.isHitActive = this.currentMove.damage > 0;
        this.currentPose = clonePose(this.targetPose);
      } else if (moveTime < total) {
        this.currentPhase = 'RECOVERY';
        this.isHitActive = false;
        const recElapsed = moveTime - startup - active;
        const t = recovery > 0 ? recElapsed / recovery : 1;
        this.currentPose = interpolatePose(this.targetPose, IDLE_POSE, t);
      } else {
        this.currentWeaponAngleOffset = 0;
        this.returnToIdle();
      }
    }

    // Impact detection: when hit active first turns true
    if (!this.wasHitActive && this.isHitActive) {
      this.triggerImpactEffect();
    }
    this.wasHitActive = this.isHitActive;

    // Enhanced Afterimages: dash, blink, heavy moves, or special moves
    const isBlink =
      this.currentMoveId === 'blink_dash' ||
      this.currentMoveId === 'dash' ||
      this.state === 'DASH';
    const isFastOrHeavy =
      isBlink ||
      this.currentMove?.level === 'HEAVY' ||
      this.currentMove?.level === 'SPECIAL' ||
      this.currentMove?.finisher ||
      Math.abs(this.knockbackVel) > 90;

    if (isFastOrHeavy && (this.currentPhase === 'STARTUP' || this.currentPhase === 'ACTIVE')) {
      this.afterimageTimer += dt;
      const spawnRate = isBlink ? 0.025 : 0.035;
      if (this.afterimageTimer > spawnRate) {
        this.afterimageTimer = 0;
        this.spawnAfterimage(isBlink ? 0.65 : 0.45);
      }
    }

    this.decayAfterimages(dt);
    this.solveAndTrail(dt);
    this.updateParticlesAndEffects(dt);
    this.updateClothPhysics(dt);
    this.updateProjectiles(dt);
  }

  public getHitbox(): {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null {
    if (!this.currentMove || this.currentPhase !== 'ACTIVE' || !this.isHitActive) {
      return null;
    }
    if (this.currentMove.damage <= 0) return null;

    const originName = this.currentMove.hitOrigin ?? 'hand_r';
    const joint = getJointWorldPos(this.solvedPose, originName);
    const range = this.currentMove.range || 40;
    const size = Math.max(24, Math.min(56, range * 0.35));

    if (joint) {
      return {
        x: this.x + joint.x * this.direction - (this.direction > 0 ? 0 : size),
        y: this.y + joint.y - size * 0.5,
        width: size * this.direction,
        height: size,
      };
    }

    // Fallback ahead of torso
    return {
      x: this.x + 20 * this.direction,
      y: this.y - this.height * 0.55,
      width: range * 0.5 * this.direction,
      height: 36,
    };
  }

  public getBodyBox(): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const crouch =
      this.currentMoveId === 'duck' || this.currentMoveId === 'sweep'
        ? 0.65
        : 1;
    const h = this.height * crouch;
    return {
      x: this.x - 22,
      y: this.y - h,
      width: 44,
      height: h,
    };
  }

  public getJointWorld(name: string): { x: number; y: number } | null {
    const local = getJointWorldPos(this.solvedPose, name);
    if (!local) return null;
    return {
      x: this.x + local.x * this.direction,
      y: this.y + local.y,
    };
  }

  public draw(ctx: CanvasRenderingContext2D): void {
    // 1) Soft ground shadow beneath fighter
    this.drawGroundShadow(ctx);

    // 2) Afterimages behind body (with eyeColor energy glow)
    for (const ghost of this.afterimages) {
      this.drawSkeletonAt(ctx, ghost.pose, ghost.x, ghost.y, ghost.alpha, true);
    }

    // 3) Sweeping arc weapon slashes and motion trails
    this.drawWeaponTrails(ctx);
    this.drawMotionTrail(ctx);

    // 4) Motion blur streaks on fast joints
    this.drawMotionBlurStreaks(ctx);

    // 5) Energy Aura & Style-specific FX
    this.drawAura(ctx);
    this.drawStyleAuraParticles(ctx);

    // 6) Main shadow stickman body with weapons & headgear
    this.drawSkeletonAt(ctx, this.currentPose, this.x, this.y, 1, false);

    // 7) Flowing cloth ribbons (Headband & Waist Sash)
    this.drawClothRibbons(ctx);

    // 8) Eye trail ribbons
    this.drawEyeTrails(ctx);

    // 9) Impact freeze frame speed lines & burst
    this.drawImpactEffect(ctx);

    // 10) Flying ninja projectiles (Kunai / Shuriken)
    this.drawProjectiles(ctx);
  }

  public setGroundY(y: number): void {
    this.groundY = y;
    if (this.y > y) this.y = y;
  }

  public setAuraIntensity(n: number): void {
    this.auraIntensity = Math.max(0, Math.min(1, n));
  }

  public setStyle(s: FighterStyle): void {
    this.style = s;
    switch (s) {
      case 'shadow':
        this.color = '#0a0a12';
        this.eyeColor = '#7b5cff';
        break;
      case 'celestial':
        this.color = '#101828';
        this.eyeColor = '#66e0ff';
        break;
      case 'crimson':
        this.color = '#1a0508';
        this.eyeColor = '#ff2244';
        break;
      case 'void':
        this.color = '#050510';
        this.eyeColor = '#cc66ff';
        break;
    }
  }

  // —— private ——

  private spawnAfterimage(initialAlpha: number): void {
    this.afterimages.push({
      pose: clonePose(this.currentPose),
      x: this.x,
      y: this.y,
      alpha: initialAlpha,
      color: this.eyeColor,
    });
    if (this.afterimages.length > 10) {
      this.afterimages.shift();
    }
  }

  private updateIdle(_dt: number): void {
    this.state = 'IDLE';
    this.currentPhase = null;
    this.isHitActive = false;

    const bob = Math.sin(this.breathTime * Math.PI * 2 * 0.9) * 0.04;
    const armSway = Math.sin(this.breathTime * Math.PI * 2 * 0.7) * 0.03;

    const breath = clonePose(IDLE_POSE);
    if (breath.joints.spine) breath.joints.spine.angle += bob;
    if (breath.joints.chest) breath.joints.chest.angle += bob * 0.5;
    if (breath.joints.upperArm_l) breath.joints.upperArm_l.angle += armSway;
    if (breath.joints.upperArm_r) breath.joints.upperArm_r.angle -= armSway;
    breath.root.y = Math.sin(this.breathTime * Math.PI * 2 * 0.9) * 2.5;

    this.currentPose = interpolatePose(this.currentPose, breath, 0.15);
    this.decayAfterimages(_dt);
  }

  private returnToIdle(): void {
    this.state = 'IDLE';
    this.currentMove = null;
    this.currentMoveId = null;
    this.currentPhase = null;
    this.isHitActive = false;
    this.wasHitActive = false;
    this.actionTime = 0;
    this.fromPose = clonePose(this.currentPose);
    this.targetPose = clonePose(IDLE_POSE);
  }

  private applyReaction(state: string, pose: Pose, duration: number): void {
    this.state = state;
    this.currentMoveId = null;
    this.currentMove = {
      id: state.toLowerCase(),
      name: state,
      level: 'LIGHT',
      state,
      startup: 0.02,
      active: duration * 0.5,
      recovery: duration * 0.5,
      total: duration,
      damage: 0,
      hitstun: 0,
      knockback: 0,
      launchPower: 0,
      groundBounce: 0,
      range: 0,
      forwardMovement: state === 'KNOCKBACK' ? -20 : -8,
      cancelWindow: 0,
      pose,
    };
    this.actionTime = 0;
    this.isHitActive = false;
    this.wasHitActive = false;
    this.currentPhase = 'STARTUP';
    this.fromPose = clonePose(this.currentPose);
    this.targetPose = clonePose(pose);
  }

  private solveAndTrail(dt: number): void {
    const local = clonePose(this.currentPose);
    local.root = { x: this.currentPose.root.x, y: this.currentPose.root.y };
    local.direction = this.direction;
    this.solvedPose = solveForwardKinematics(local, this.skeleton, 1);

    const isAttacking =
      this.currentMove &&
      this.currentMove.damage > 0 &&
      (this.currentPhase === 'ACTIVE' || this.currentPhase === 'STARTUP');

    const trailJoint =
      this.currentMove?.hitOrigin ?? (isAttacking ? 'hand_r' : null);

    // Record motion trail & weapon slash ribbon
    if (trailJoint && this.currentMove && this.currentMove.damage > 0) {
      const tipPos = getJointWorldPos(this.solvedPose, trailJoint);
      if (tipPos) {
        const tipWorldX = this.x + tipPos.x * this.direction;
        const tipWorldY = this.y + tipPos.y;

        let bladeTipX = tipWorldX;
        let bladeTipY = tipWorldY;
        let bladeBaseX = tipWorldX;
        let bladeBaseY = tipWorldY;

        if (this.weapon !== 'fists' && (trailJoint === 'hand_r' || trailJoint === 'hand_l')) {
          const armName = trailJoint === 'hand_r' ? 'lowerArm_r' : 'lowerArm_l';
          const armPos = getJointWorldPos(this.solvedPose, armName);
          if (armPos) {
            const ax = this.x + armPos.x * this.direction;
            const ay = this.y + armPos.y;
            const dx = tipWorldX - ax;
            const dy = tipWorldY - ay;
            const baseAngle = Math.atan2(dy, dx);
            const isLeft = trailJoint === 'hand_l';
            const offset = (isLeft ? -Math.PI * 0.75 : 0.15 * this.direction) + this.currentWeaponAngleOffset * this.direction;
            const bladeAngle = baseAngle + offset;
            const bladeLen = this.weapon === 'scythe' ? 95 : this.weapon === 'katana' ? 75 : 55;
            bladeTipX = tipWorldX + Math.cos(bladeAngle) * bladeLen;
            bladeTipY = tipWorldY + Math.sin(bladeAngle) * bladeLen;
            bladeBaseX = tipWorldX;
            bladeBaseY = tipWorldY;
          }
        } else {
          const baseName = this.getBaseJointName(trailJoint);
          const basePos = baseName ? getJointWorldPos(this.solvedPose, baseName) : null;
          bladeBaseX = basePos ? this.x + basePos.x * this.direction : tipWorldX - 16 * this.direction;
          bladeBaseY = basePos ? this.y + basePos.y : tipWorldY + 12;
        }

        this.motionTrail.push({
          x: bladeTipX,
          y: bladeTipY,
          life: 1,
        });
        if (this.motionTrail.length > 16) this.motionTrail.shift();

        // If in ACTIVE attack phase, record weapon slash arc ribbon
        if (this.currentPhase === 'ACTIVE') {
          this.slashTrail.push({
            tipX: bladeTipX,
            tipY: bladeTipY,
            baseX: bladeBaseX,
            baseY: bladeBaseY,
            life: 1,
            maxLife: 1,
          });
          if (this.slashTrail.length > 14) this.slashTrail.shift();
        }
      }
    }

    // Decay motion trails
    for (const t of this.motionTrail) t.life -= dt * 3.8;
    this.motionTrail = this.motionTrail.filter((t) => t.life > 0);

    // Decay slash trails
    for (const s of this.slashTrail) s.life -= dt * 4.5;
    this.slashTrail = this.slashTrail.filter((s) => s.life > 0);

    // Record dynamic eye trail
    const headPos = getJointWorldPos(this.solvedPose, 'head');
    if (headPos) {
      const eyeX = this.x + (headPos.x + 3) * this.direction;
      const eyeY = this.y + headPos.y - 2;
      const speed = Math.hypot(this.knockbackVel, this.velocityY);
      const isMovingFast = speed > 40 || isAttacking || this.state === 'DASH';

      if (isMovingFast) {
        this.eyeTrail.push({ x: eyeX, y: eyeY, life: 1 });
        if (this.eyeTrail.length > 12) this.eyeTrail.shift();
      }
    }

    // Decay eye trails
    for (const e of this.eyeTrail) e.life -= dt * 5.5;
    this.eyeTrail = this.eyeTrail.filter((e) => e.life > 0);

    // Update joint positions for motion blur
    for (const name of ['hand_r', 'hand_l', 'foot_r', 'foot_l', 'head']) {
      const p = getJointWorldPos(this.solvedPose, name);
      if (p) {
        this.prevJointPositions[name] = {
          x: this.x + p.x * this.direction,
          y: this.y + p.y,
        };
      }
    }
  }

  private getBaseJointName(tipJoint: string): string | null {
    switch (tipJoint) {
      case 'hand_r':
        return 'lowerArm_r';
      case 'hand_l':
        return 'lowerArm_l';
      case 'foot_r':
        return 'shin_r';
      case 'foot_l':
        return 'shin_l';
      default:
        return null;
    }
  }

  private triggerImpactEffect(): void {
    const originName = this.currentMove?.hitOrigin ?? 'hand_r';
    const j = getJointWorldPos(this.solvedPose, originName);
    const originX = j ? this.x + j.x * this.direction : this.x + 35 * this.direction;
    const originY = j ? this.y + j.y : this.y - this.height * 0.55;

    // Radiating manga impact lines
    const lineCount = 14;
    const lines: ImpactLine[] = [];
    for (let i = 0; i < lineCount; i++) {
      const angle = (i / lineCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      lines.push({
        angle,
        length: 25 + Math.random() * 45,
        width: 1.5 + Math.random() * 2.5,
      });
    }

    this.impactEffect = {
      x: originX,
      y: originY,
      timer: 0.16,
      duration: 0.16,
      lines,
    };
  }

  private updateParticlesAndEffects(dt: number): void {
    // Impact effect timer
    if (this.impactEffect) {
      this.impactEffect.timer -= dt;
      if (this.impactEffect.timer <= 0) {
        this.impactEffect = null;
      }
    }

    // Aura particles emission & update
    const chest = this.solvedPose.joints.chest;
    const cx = this.x + (chest?.x ?? 0) * this.direction;
    const cy = this.y + (chest?.y ?? -this.height * 0.5);

    const isSpecial =
      this.currentMove?.level === 'SPECIAL' || !!this.currentMove?.finisher;
    const spawnMultiplier = isSpecial ? 3 : 1;

    // Spawn style-specific particles
    if (Math.random() < 0.45 * spawnMultiplier) {
      if (this.style === 'shadow') {
        // Dark purple wisps rising from body
        this.auraParticles.push({
          x: cx + (Math.random() - 0.5) * 36,
          y: cy + (Math.random() - 0.5) * 50 + 20,
          vx: (Math.random() - 0.5) * 20,
          vy: -35 - Math.random() * 45,
          size: 4 + Math.random() * 8,
          alpha: 0.8,
          life: 1,
          maxLife: 0.7 + Math.random() * 0.5,
          color: '#8b44ff',
        });
      } else if (this.style === 'celestial') {
        // Ethereal blue particles orbiting fighter
        const orbitAngle = Math.random() * Math.PI * 2;
        this.auraParticles.push({
          x: cx,
          y: cy,
          vx: 0,
          vy: 0,
          size: 2.5 + Math.random() * 4,
          alpha: 0.9,
          life: 1,
          maxLife: 1.2 + Math.random() * 0.8,
          orbitAngle,
          orbitRadius: 35 + Math.random() * 35,
          orbitSpeed: (1.5 + Math.random() * 2) * (Math.random() > 0.5 ? 1 : -1),
          color: '#55e0ff',
        });
      } else if (this.style === 'crimson') {
        // Fiery red ember particles drifting backwards/upwards
        this.auraParticles.push({
          x: cx + (Math.random() - 0.5) * 28,
          y: cy + (Math.random() - 0.5) * 45,
          vx: -this.direction * (20 + Math.random() * 40) + (Math.random() - 0.5) * 15,
          vy: -25 - Math.random() * 35,
          size: 2.5 + Math.random() * 5,
          alpha: 0.95,
          life: 1,
          maxLife: 0.6 + Math.random() * 0.5,
          color: '#ff3344',
        });
      } else if (this.style === 'void') {
        // Distortion ripples & glitch particles
        this.auraParticles.push({
          x: cx + (Math.random() - 0.5) * 40,
          y: cy + (Math.random() - 0.5) * 60,
          vx: (Math.random() - 0.5) * 15,
          vy: (Math.random() - 0.5) * 15,
          size: 6 + Math.random() * 12,
          alpha: 0.7,
          life: 1,
          maxLife: 0.5 + Math.random() * 0.4,
          color: '#c044ff',
        });
      }
    }

    // Update existing particles
    for (const p of this.auraParticles) {
      p.life -= dt / p.maxLife;
      if (p.orbitAngle !== undefined && p.orbitRadius !== undefined && p.orbitSpeed !== undefined) {
        p.orbitAngle += p.orbitSpeed * dt;
        p.x = cx + Math.cos(p.orbitAngle) * p.orbitRadius;
        p.y = cy + Math.sin(p.orbitAngle) * (p.orbitRadius * 0.42);
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }
    this.auraParticles = this.auraParticles.filter((p) => p.life > 0);
  }

  private decayAfterimages(dt: number): void {
    for (const a of this.afterimages) a.alpha -= dt * 2.2;
    this.afterimages = this.afterimages.filter((a) => a.alpha > 0.02);
  }

  /** 1. Soft elliptical ground shadow beneath fighter */
  private drawGroundShadow(ctx: CanvasRenderingContext2D): void {
    const heightAboveGround = Math.max(0, this.groundY - this.y);
    const squishFactor = Math.max(0.18, 1 - heightAboveGround / 280);

    const shadowWidth = 46 * squishFactor;
    const shadowHeight = 13 * (squishFactor * 0.85);
    const shadowAlpha = 0.55 * squishFactor;

    ctx.save();
    ctx.translate(this.x, this.groundY);

    const grd = ctx.createRadialGradient(0, 0, shadowWidth * 0.1, 0, 0, shadowWidth);
    grd.addColorStop(0, `rgba(0, 0, 0, ${shadowAlpha})`);
    grd.addColorStop(0.5, `rgba(0, 0, 0, ${shadowAlpha * 0.55})`);
    grd.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.ellipse(0, 0, shadowWidth, shadowHeight, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** 2. Weapon trails: Sweeping arc ribbon behind striking limb during attacks */
  private drawWeaponTrails(ctx: CanvasRenderingContext2D): void {
    if (this.slashTrail.length < 2) return;

    ctx.save();
    for (let i = 1; i < this.slashTrail.length; i++) {
      const p0 = this.slashTrail[i - 1];
      const p1 = this.slashTrail[i];
      const alpha = Math.min(p0.life, p1.life);

      // 1. Bold Sumi-e Calligraphy Ink Brush Stroke (Deep Dark Japanese Anime Aesthetic)
      ctx.fillStyle = hexAlpha('#040408', alpha * 0.88);
      ctx.beginPath();
      ctx.moveTo(p0.tipX, p0.tipY);
      ctx.lineTo(p1.tipX, p1.tipY);
      ctx.lineTo(p1.baseX, p1.baseY);
      ctx.lineTo(p0.baseX, p0.baseY);
      ctx.closePath();
      ctx.fill();

      // 2. Multi-layer glowing blade energy ribbon
      const grad = ctx.createLinearGradient(p1.baseX, p1.baseY, p1.tipX, p1.tipY);
      grad.addColorStop(0, hexAlpha(this.eyeColor, 0));
      grad.addColorStop(0.35, hexAlpha(this.eyeColor, alpha * 0.65));
      grad.addColorStop(0.82, hexAlpha('#ffffff', alpha * 0.95));
      grad.addColorStop(1, hexAlpha(this.eyeColor, alpha * 0.88));

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(p0.tipX, p0.tipY);
      ctx.lineTo(p1.tipX, p1.tipY);
      ctx.lineTo(p1.baseX, p1.baseY);
      ctx.lineTo(p0.baseX, p0.baseY);
      ctx.closePath();
      ctx.fill();

      // 3. Razor sharp outer cutting edge
      ctx.strokeStyle = hexAlpha('#ffffff', alpha * 0.95);
      ctx.lineWidth = 4 * alpha;
      ctx.shadowColor = this.eyeColor;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(p0.tipX, p0.tipY);
      ctx.lineTo(p1.tipX, p1.tipY);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 3. Dynamic Eye Trails: Neon streak tracing the eyes during rapid movements */
  private drawEyeTrails(ctx: CanvasRenderingContext2D): void {
    if (this.eyeTrail.length < 2) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = this.eyeColor;
    ctx.shadowBlur = 16;

    for (let i = 1; i < this.eyeTrail.length; i++) {
      const a = this.eyeTrail[i - 1];
      const b = this.eyeTrail[i];
      const alpha = Math.min(a.life, b.life);

      ctx.strokeStyle = hexAlpha(this.eyeColor, alpha * 0.85);
      ctx.lineWidth = 3.5 * alpha;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      // White inner core
      ctx.strokeStyle = hexAlpha('#ffffff', alpha * 0.95);
      ctx.lineWidth = 1.6 * alpha;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 4. Motion blur streaks connecting fast-moving joints */
  private drawMotionBlurStreaks(ctx: CanvasRenderingContext2D): void {
    const isAttacking =
      this.currentPhase === 'ACTIVE' || this.currentPhase === 'STARTUP';
    if (!isAttacking && Math.abs(this.knockbackVel) < 30 && Math.abs(this.velocityY) < 60) {
      return;
    }

    ctx.save();
    ctx.lineCap = 'round';

    for (const name of ['hand_r', 'hand_l', 'foot_r', 'foot_l']) {
      const curr = this.getJointWorld(name);
      const prev = this.prevJointPositions[name];
      if (!curr || !prev) continue;

      const dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      if (dist > 7) {
        ctx.strokeStyle = hexAlpha(this.eyeColor, 0.35);
        ctx.lineWidth = 9;
        ctx.shadowColor = this.eyeColor;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** 5. Impact Freeze Frame: Radiating speed lines & burst */
  private drawImpactEffect(ctx: CanvasRenderingContext2D): void {
    if (!this.impactEffect) return;

    const { x, y, timer, duration, lines } = this.impactEffect;
    const progress = 1 - timer / duration;
    const alpha = Math.max(0, 1 - progress);

    ctx.save();
    ctx.translate(x, y);

    // Expanding shock ring
    const ringRadius = progress * 65;
    ctx.strokeStyle = hexAlpha('#ffffff', alpha * 0.9);
    ctx.lineWidth = 3 * (1 - progress);
    ctx.shadowColor = this.eyeColor;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Radiating manga impact lines
    for (const line of lines) {
      const startDist = 12 + progress * 20;
      const endDist = startDist + line.length * (1 - progress * 0.4);
      const cos = Math.cos(line.angle);
      const sin = Math.sin(line.angle);

      ctx.strokeStyle = hexAlpha(this.eyeColor, alpha * 0.85);
      ctx.lineWidth = line.width * (1 - progress * 0.5);
      ctx.beginPath();
      ctx.moveTo(cos * startDist, sin * startDist);
      ctx.lineTo(cos * endDist, sin * endDist);
      ctx.stroke();
    }

    // Epicenter flash
    ctx.fillStyle = hexAlpha('#ffffff', alpha * 0.95);
    ctx.beginPath();
    ctx.arc(0, 0, 8 * (1 - progress), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /** 6. Style-specific energy aura particles */
  private drawStyleAuraParticles(ctx: CanvasRenderingContext2D): void {
    if (this.auraParticles.length === 0) return;

    ctx.save();
    for (const p of this.auraParticles) {
      const alpha = p.life * p.alpha;
      const col = p.color ?? this.eyeColor;

      if (this.style === 'shadow') {
        // Dark purple smoke wisp
        const rad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        rad.addColorStop(0, hexAlpha(col, alpha * 0.7));
        rad.addColorStop(0.6, hexAlpha('#120526', alpha * 0.4));
        rad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (this.style === 'celestial') {
        // Ethereal starlight diamond
        ctx.shadowColor = col;
        ctx.shadowBlur = 10;
        ctx.fillStyle = hexAlpha('#ffffff', alpha * 0.9);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Cross sparkle
        ctx.strokeStyle = hexAlpha(col, alpha * 0.75);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x - p.size * 1.6, p.y);
        ctx.lineTo(p.x + p.size * 1.6, p.y);
        ctx.moveTo(p.x, p.y - p.size * 1.6);
        ctx.lineTo(p.x, p.y + p.size * 1.6);
        ctx.stroke();
      } else if (this.style === 'crimson') {
        // Blazing red cinder ember
        ctx.shadowColor = '#ff2244';
        ctx.shadowBlur = 12;
        ctx.fillStyle = hexAlpha('#ffaa33', alpha * 0.95);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = hexAlpha('#ff1133', alpha * 0.8);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (this.style === 'void') {
        // Spacetime distortion ring
        ctx.strokeStyle = hexAlpha(col, alpha * 0.65);
        ctx.lineWidth = 1.8;
        ctx.shadowColor = col;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawAura(ctx: CanvasRenderingContext2D): void {
    const isSpecial =
      this.currentMove?.level === 'SPECIAL' || !!this.currentMove?.finisher;
    const moveBoost = this.currentMove
      ? (isSpecial ? 1.6 : 0.7) + 0.3 * Math.min(1, this.actionTime * 4)
      : 0.45;
    const intensity = this.auraIntensity * moveBoost;
    if (intensity < 0.05) return;

    const cx = this.x + (this.solvedPose.joints.chest?.x ?? 0) * this.direction;
    const cy = this.y + (this.solvedPose.joints.chest?.y ?? -this.height * 0.45);

    const styleColor = this.eyeColor;
    const radius = this.height * (isSpecial ? 0.95 : 0.75);

    ctx.save();
    // Dark flame aura lick effect around torso
    const flameLicks = isSpecial ? 7 : 4;
    for (let i = 0; i < flameLicks; i++) {
      const angle = (i / flameLicks) * Math.PI - Math.PI * 0.5;
      const flameDist = radius * 0.45 + Math.sin(this.breathTime * 9 + i * 2) * 12;
      const fx = cx + Math.cos(angle) * (flameDist * 0.6);
      const fy = cy + Math.sin(angle) * flameDist - 10;

      const fGrd = ctx.createRadialGradient(fx, fy, 4, fx, fy, 28);
      fGrd.addColorStop(0, hexAlpha(styleColor, 0.28 * intensity));
      fGrd.addColorStop(0.5, hexAlpha('#060410', 0.15 * intensity));
      fGrd.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = fGrd;
      ctx.beginPath();
      ctx.arc(fx, fy, 28, 0, Math.PI * 2);
      ctx.fill();
    }

    // Radial aura sphere
    const grd = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius);
    grd.addColorStop(0, hexAlpha(styleColor, 0.26 * intensity));
    grd.addColorStop(0.55, hexAlpha(styleColor, 0.09 * intensity));
    grd.addColorStop(1, hexAlpha(styleColor, 0));

    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawMotionTrail(ctx: CanvasRenderingContext2D): void {
    if (this.motionTrail.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < this.motionTrail.length; i++) {
      const a = this.motionTrail[i - 1];
      const b = this.motionTrail[i];
      const alpha = Math.min(a.life, b.life) * 0.6;
      ctx.strokeStyle = hexAlpha(this.eyeColor, alpha);
      ctx.lineWidth = 11 * Math.min(a.life, b.life);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Main Shadow Stickman Skeleton Drawing:
   * Dark silhouette body, subtle eyeColor glow outline, glowing striking limb,
   * expressive dynamic eyes, and inner nexus cores.
   */
  private drawSkeletonAt(
    ctx: CanvasRenderingContext2D,
    pose: Pose,
    ox: number,
    oy: number,
    alpha: number,
    ghost: boolean,
  ): void {
    const local = clonePose(pose);
    const solved = solveForwardKinematics(local, this.skeleton, 1);

    const jp = (name: string): Point | null => {
      const j = solved.joints[name];
      if (!j) return null;
      return { x: ox + j.x * this.direction, y: oy + j.y };
    };

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const isAttacking =
      !ghost &&
      this.currentPhase === 'ACTIVE' &&
      !!this.currentMove &&
      this.currentMove.damage > 0;

    // Identify bones belonging to striking limb
    const strikingOrigin = this.currentMove?.hitOrigin ?? 'hand_r';
    const strikingBones = isAttacking
      ? (STRIKE_LIMB_BONES[strikingOrigin] ?? [])
      : [];


    // PASS 1: Subtle outer glow outline matching eyeColor (Dark silhouette edge)
    if (!ghost) {
      ctx.strokeStyle = hexAlpha(this.eyeColor, 0.42);
      ctx.shadowColor = this.eyeColor;
      ctx.shadowBlur = 12;
      ctx.lineWidth = 15;

      for (const [a, b] of BONE_CONNECTIONS) {
        const pa = jp(a);
        const pb = jp(b);
        if (!pa || !pb) continue;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
    }

    // PASS 2: Dark silhouette body limbs (Thicker, darker, slight transparency)
    const baseLimbWidth = ghost ? 9 : 13;
    ctx.strokeStyle = ghost ? hexAlpha(this.eyeColor, 0.7) : this.color;
    ctx.lineWidth = baseLimbWidth;
    ctx.shadowBlur = ghost ? 6 : 2;
    ctx.shadowColor = ghost ? this.eyeColor : '#000000';

    for (const [a, b] of BONE_CONNECTIONS) {
      const pa = jp(a);
      const pb = jp(b);
      if (!pa || !pb) continue;

      // Spine & thighs are naturally sturdier
      const isTorsoOrThigh =
        a === 'hips' || a === 'spine' || a === 'thigh_l' || a === 'thigh_r';
      ctx.lineWidth = isTorsoOrThigh ? baseLimbWidth + 2 : baseLimbWidth;

      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }

    // PASS 3: Striking limb GLOWS brighter during attacks!
    if (isAttacking) {
      ctx.shadowColor = this.eyeColor;
      ctx.shadowBlur = 24;
      ctx.strokeStyle = hexAlpha(this.eyeColor, 0.85);
      ctx.lineWidth = baseLimbWidth + 3;

      for (const [a, b] of strikingBones) {
        const pa = jp(a);
        const pb = jp(b);
        if (!pa || !pb) continue;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      // Hot white core on striking limb
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      for (const [a, b] of strikingBones) {
        const pa = jp(a);
        const pb = jp(b);
        if (!pa || !pb) continue;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
    }

    // HEAD RENDERING
    const head = jp('head');
    const neck = jp('neck');
    if (head) {
      const headRadius = ghost ? 13 : 16;

      // Outer glow for head
      if (!ghost) {
        ctx.fillStyle = hexAlpha(this.eyeColor, 0.35);
        ctx.shadowColor = this.eyeColor;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(head.x, head.y, headRadius + 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Dark silhouette head
      ctx.shadowBlur = 0;
      ctx.fillStyle = ghost ? hexAlpha(this.eyeColor, 0.5) : this.color;
      ctx.beginPath();
      ctx.arc(head.x, head.y, headRadius, 0, Math.PI * 2);
      ctx.fill();

      // DYNAMIC EYES
      if (!ghost) {
        this.drawDynamicEyes(ctx, head.x, head.y, isAttacking);
      }
    }

    // Soft glowing energy nexus joint dots for shadow stickman aesthetic
    if (!ghost && neck) {
      ctx.fillStyle = hexAlpha(this.eyeColor, 0.3);
      for (const name of [
        'hips',
        'chest',
        'hand_l',
        'hand_r',
        'foot_l',
        'foot_r',
        'shoulder_l',
        'shoulder_r',
      ]) {
        const p = jp(name);
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Headgear (Straw Hat, Demon Mask, Headband)
    if (head) {
      this.drawHeadgear(ctx, head, ghost);
    }

    // Weapons held in hands (Katana, Dual Blades, Scythe)
    this.drawWeapons(ctx, jp, isAttacking, ghost);

    ctx.restore();
  }

  /**
   * 4. Dynamic Eyes:
   * - Narrow predatory slits when attacking
   * - Wide vigilant slits when blocking
   * - Dramatic pulse & star flare during finisher/special moves
   * - Normal fierce glowing orbs when idle
   */
  private drawDynamicEyes(
    ctx: CanvasRenderingContext2D,
    headX: number,
    headY: number,
    isAttacking: boolean,
  ): void {
    const eyeBaseX = headX + 3.5 * this.direction;
    const eyeY = headY - 2.5;

    const isBlocking = this.state === 'BLOCK' || this.currentMoveId === 'block';
    const isHit =
      this.state === 'HIT' ||
      this.state === 'KNOCKBACK' ||
      this.state === 'knockdown' ||
      this.state === 'hit_react';
    const isFinisher =
      !!this.currentMove?.finisher || this.currentMove?.level === 'SPECIAL';

    // Finisher/Special pulse factor
    const pulse = isFinisher
      ? 1 + Math.sin(this.actionTime * 24) * 0.4
      : isAttacking
        ? 1.25
        : 1.0;

    ctx.save();
    ctx.shadowColor = this.eyeColor;
    ctx.shadowBlur = (isAttacking ? 22 : 12) * pulse;
    ctx.fillStyle = this.eyeColor;

    if (isHit) {
      // Squeezed narrow flickering pain slashes
      ctx.strokeStyle = this.eyeColor;
      ctx.lineWidth = 2;
      for (const oxe of [0, 7]) {
        const ex = eyeBaseX + oxe * this.direction;
        ctx.beginPath();
        ctx.moveTo(ex - 3 * this.direction, eyeY - 2);
        ctx.lineTo(ex + 3 * this.direction, eyeY + 2);
        ctx.stroke();
      }
    } else if (isBlocking) {
      // Wide vigilant shield arcs
      ctx.lineWidth = 2.8;
      ctx.strokeStyle = this.eyeColor;
      for (const oxe of [0, 8]) {
        const ex = eyeBaseX + oxe * this.direction;
        ctx.beginPath();
        ctx.ellipse(ex, eyeY, 4, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (isAttacking) {
      // Narrow fierce razor slits
      ctx.fillStyle = this.eyeColor;
      ctx.beginPath();
      for (const oxe of [0, 8]) {
        const ex = eyeBaseX + oxe * this.direction;
        ctx.moveTo(ex - 4 * this.direction, eyeY - 4);
        ctx.lineTo(ex + 4 * this.direction, eyeY - 0.5);
        ctx.lineTo(ex - 4 * this.direction, eyeY + 2.5);
        ctx.closePath();
      }
      ctx.fill();

      // White inner glare
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (const oxe of [0, 8]) {
        const ex = eyeBaseX + oxe * this.direction;
        ctx.moveTo(ex - 2 * this.direction, eyeY - 2);
        ctx.lineTo(ex + 2 * this.direction, eyeY - 0.5);
        ctx.lineTo(ex - 2 * this.direction, eyeY + 1);
        ctx.closePath();
      }
      ctx.fill();
    } else {
      // Normal fierce oval anime eye glow
      for (const oxe of [0, 8]) {
        const ex = eyeBaseX + oxe * this.direction;
        ctx.beginPath();
        ctx.ellipse(ex, eyeY, 3, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // White hot center
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex, eyeY, 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = this.eyeColor;
      }
    }

    // Finisher cross-star flare
    if (isFinisher) {
      const flareLen = (12 + Math.sin(this.actionTime * 18) * 5) * pulse;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(eyeBaseX - flareLen, eyeY);
      ctx.lineTo(eyeBaseX + flareLen, eyeY);
      ctx.moveTo(eyeBaseX, eyeY - flareLen);
      ctx.lineTo(eyeBaseX, eyeY + flareLen);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // NINJA CLOTH PHYSICS & WEAPON SYSTEMS ($10,000 Ref: Straw Hat, Katanas, Scythe)
  // ---------------------------------------------------------------------------

  private updateClothPhysics(dt: number): void {
    const headWorld = this.getJointWorld('head');
    if (headWorld && this.headbandRibbon.length > 0) {
      this.headbandRibbon[0].x = headWorld.x - 8 * this.direction;
      this.headbandRibbon[0].y = headWorld.y - 2;

      for (let i = 1; i < this.headbandRibbon.length; i++) {
        const node = this.headbandRibbon[i];
        const vx = (node.x - node.oldX) * 0.88;
        const vy = (node.y - node.oldY) * 0.88 + 340 * dt;
        node.oldX = node.x;
        node.oldY = node.y;

        const wind = Math.sin(this.breathTime * 8 + i * 1.5) * 22 - this.direction * 35;
        node.x += vx + wind * dt;
        node.y += vy;

        const prev = this.headbandRibbon[i - 1];
        const dx = node.x - prev.x;
        const dy = node.y - prev.y;
        const dist = Math.hypot(dx, dy) || 1;
        const maxDist = 13;
        if (dist > maxDist) {
          node.x = prev.x + (dx / dist) * maxDist;
          node.y = prev.y + (dy / dist) * maxDist;
        }
      }
    }

    const hipsWorld = this.getJointWorld('hips');
    if (hipsWorld && this.sashRibbon.length > 0) {
      this.sashRibbon[0].x = hipsWorld.x - 6 * this.direction;
      this.sashRibbon[0].y = hipsWorld.y;

      for (let i = 1; i < this.sashRibbon.length; i++) {
        const node = this.sashRibbon[i];
        const vx = (node.x - node.oldX) * 0.85;
        const vy = (node.y - node.oldY) * 0.85 + 380 * dt;
        node.oldX = node.x;
        node.oldY = node.y;

        const wind = Math.sin(this.breathTime * 6 + i) * 18 - this.direction * 22;
        node.x += vx + wind * dt;
        node.y += vy;

        const prev = this.sashRibbon[i - 1];
        const dx = node.x - prev.x;
        const dy = node.y - prev.y;
        const dist = Math.hypot(dx, dy) || 1;
        const maxDist = 12;
        if (dist > maxDist) {
          node.x = prev.x + (dx / dist) * maxDist;
          node.y = prev.y + (dy / dist) * maxDist;
        }
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  public throwKunai(targetX: number, targetY: number): void {
    const handWorld = this.getJointWorld('hand_r') ?? { x: this.x + 20 * this.direction, y: this.y - 80 };
    const dx = targetX - handWorld.x;
    const dy = targetY - handWorld.y;
    const angle = Math.atan2(dy, dx);
    const speed = 750;

    this.projectiles.push({
      x: handWorld.x,
      y: handWorld.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      angle,
      life: 1.2,
      active: true,
      color: this.eyeColor,
    });
  }

  private drawClothRibbons(ctx: CanvasRenderingContext2D): void {
    // 1. Headband ribbons
    if (this.headbandRibbon.length >= 2 && this.headgear !== 'none') {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Outer glow
      ctx.strokeStyle = hexAlpha(this.eyeColor, 0.45);
      ctx.lineWidth = 6;
      ctx.shadowColor = this.eyeColor;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(this.headbandRibbon[0].x, this.headbandRibbon[0].y);
      for (let i = 1; i < this.headbandRibbon.length; i++) {
        ctx.lineTo(this.headbandRibbon[i].x, this.headbandRibbon[i].y);
      }
      ctx.stroke();

      // Dark ninja cloth core
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 4;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(this.headbandRibbon[0].x, this.headbandRibbon[0].y);
      for (let i = 1; i < this.headbandRibbon.length; i++) {
        ctx.lineTo(this.headbandRibbon[i].x, this.headbandRibbon[i].y);
      }
      ctx.stroke();

      // Whipping glowing ribbon tip
      const last = this.headbandRibbon[this.headbandRibbon.length - 1];
      ctx.fillStyle = hexAlpha(this.eyeColor, 0.9);
      ctx.shadowColor = this.eyeColor;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // 2. Waist sash ribbons
    if (this.sashRibbon.length >= 2) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.strokeStyle = hexAlpha(this.eyeColor, 0.35);
      ctx.lineWidth = 4.5;
      ctx.shadowColor = this.eyeColor;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(this.sashRibbon[0].x, this.sashRibbon[0].y);
      for (let i = 1; i < this.sashRibbon.length; i++) {
        ctx.lineTo(this.sashRibbon[i].x, this.sashRibbon[i].y);
      }
      ctx.stroke();

      ctx.strokeStyle = this.color;
      ctx.lineWidth = 3;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(this.sashRibbon[0].x, this.sashRibbon[0].y);
      for (let i = 1; i < this.sashRibbon.length; i++) {
        ctx.lineTo(this.sashRibbon[i].x, this.sashRibbon[i].y);
      }
      ctx.stroke();

      ctx.restore();
    }
  }

  private drawHeadgear(
    ctx: CanvasRenderingContext2D,
    head: Point,
    ghost: boolean,
  ): void {
    if (ghost) return;

    if (this.headgear === 'straw_hat') {
      // Classic Conical Straw Ronin Hat (Kasa)
      ctx.save();
      ctx.translate(head.x, head.y - 12);

      // Hat angle follows head tilt
      const headAngle = 0.08 * this.direction;
      ctx.rotate(headAngle);

      const hatWidth = 62;
      const hatHeight = 22;

      // Drop shadow over face
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.beginPath();
      ctx.ellipse(0, 10, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Straw cone gradient
      const hatGrad = ctx.createLinearGradient(0, -hatHeight, 0, 4);
      hatGrad.addColorStop(0, '#1c1510');
      hatGrad.addColorStop(0.4, '#382b20');
      hatGrad.addColorStop(0.7, '#241a14');
      hatGrad.addColorStop(1, '#0e0a08');

      ctx.fillStyle = hatGrad;
      ctx.strokeStyle = hexAlpha(this.eyeColor, 0.5);
      ctx.lineWidth = 1.6;
      ctx.shadowColor = this.eyeColor;
      ctx.shadowBlur = 6;

      ctx.beginPath();
      ctx.moveTo(0, -hatHeight);
      ctx.lineTo(hatWidth * 0.5, 4);
      ctx.lineTo(-hatWidth * 0.5, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Bamboo weave line accents
      ctx.strokeStyle = 'rgba(120, 95, 65, 0.45)';
      ctx.lineWidth = 1;
      ctx.shadowBlur = 0;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(0, -hatHeight);
        ctx.lineTo(i * 12, 4);
        ctx.stroke();
      }

      // Red Ronin knot cord
      ctx.strokeStyle = '#c02030';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-10, 4);
      ctx.lineTo(0, 16);
      ctx.lineTo(10, 4);
      ctx.stroke();

      ctx.restore();
    } else if (this.headgear === 'demon_mask') {
      // Curved Oni Horns & Warped Silhouette
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.shadowColor = this.eyeColor;
      ctx.shadowBlur = 14;

      // Left Horn
      ctx.fillStyle = this.color;
      ctx.strokeStyle = this.eyeColor;
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(-7 * this.direction, -14);
      ctx.quadraticCurveTo(-18 * this.direction, -24, -22 * this.direction, -36);
      ctx.quadraticCurveTo(-14 * this.direction, -22, -2 * this.direction, -16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Right Horn
      ctx.beginPath();
      ctx.moveTo(3 * this.direction, -14);
      ctx.quadraticCurveTo(12 * this.direction, -26, 18 * this.direction, -38);
      ctx.quadraticCurveTo(8 * this.direction, -22, 7 * this.direction, -15);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    } else if (this.headgear === 'ninja_headband') {
      // Shinobi Forehead Metal Plate
      ctx.save();
      ctx.translate(head.x, head.y - 7);

      ctx.fillStyle = '#08080c';
      ctx.fillRect(-18, -4, 36, 8);

      // Metal Protector Plate
      const plateGrad = ctx.createLinearGradient(-10, -3, 10, 3);
      plateGrad.addColorStop(0, '#555566');
      plateGrad.addColorStop(0.5, '#c0c0d8');
      plateGrad.addColorStop(1, '#666677');

      ctx.fillStyle = plateGrad;
      ctx.strokeStyle = hexAlpha(this.eyeColor, 0.8);
      ctx.lineWidth = 1;
      ctx.shadowColor = this.eyeColor;
      ctx.shadowBlur = 8;
      ctx.fillRect(-12, -3, 24, 6);
      ctx.strokeRect(-12, -3, 24, 6);

      ctx.restore();
    }
  }

  private drawWeapons(
    ctx: CanvasRenderingContext2D,
    jp: (name: string) => Point | null,
    isAttacking: boolean,
    ghost: boolean,
  ): void {
    if (this.weapon === 'fists') return;

    const handR = jp('hand_r');
    const lowerArmR = jp('lowerArm_r');
    const handL = jp('hand_l');
    const lowerArmL = jp('lowerArm_l');

    if (this.weapon === 'katana') {
      if (handR && lowerArmR) {
        this.drawKatana(ctx, handR, lowerArmR, isAttacking, ghost, false);
      }
    } else if (this.weapon === 'dual_blades') {
      if (handR && lowerArmR) {
        this.drawKatana(ctx, handR, lowerArmR, isAttacking, ghost, false);
      }
      if (handL && lowerArmL) {
        this.drawKatana(ctx, handL, lowerArmL, isAttacking, ghost, true);
      }
    } else if (this.weapon === 'scythe') {
      if (handR && lowerArmR) {
        this.drawScythe(ctx, handR, lowerArmR, isAttacking, ghost);
      }
    }
  }

  private drawKatana(
    ctx: CanvasRenderingContext2D,
    hand: Point,
    arm: Point,
    isAttacking: boolean,
    ghost: boolean,
    isLeft: boolean,
  ): void {
    const dx = hand.x - arm.x;
    const dy = hand.y - arm.y;
    const baseAngle = Math.atan2(dy, dx);
    const bladeAngle =
      (isLeft ? baseAngle - Math.PI * 0.75 : baseAngle + 0.15 * this.direction) +
      this.currentWeaponAngleOffset * this.direction;

    ctx.save();
    ctx.translate(hand.x, hand.y);
    ctx.rotate(bladeAngle);

    const bladeLen = 68;
    const hiltLen = 16;

    // Hilt (Tsuka)
    ctx.strokeStyle = ghost ? hexAlpha(this.eyeColor, 0.5) : '#15151e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-hiltLen, 0);
    ctx.lineTo(0, 0);
    ctx.stroke();

    // Hilt wrap diamond accents
    if (!ghost) {
      ctx.strokeStyle = hexAlpha(this.eyeColor, 0.7);
      ctx.lineWidth = 1.2;
      for (let x = -hiltLen + 3; x < 0; x += 4) {
        ctx.beginPath();
        ctx.moveTo(x, -2);
        ctx.lineTo(x + 2, 2);
        ctx.stroke();
      }
    }

    // Tsuba (Blade Guard)
    ctx.fillStyle = ghost ? hexAlpha(this.eyeColor, 0.8) : '#d4af37';
    ctx.shadowColor = this.eyeColor;
    ctx.shadowBlur = ghost ? 0 : 8;
    ctx.fillRect(0, -5, 3.5, 10);

    // Blade Outer Energy Corona
    const glowColor = hexAlpha(this.eyeColor, isAttacking ? 0.95 : 0.6);
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = isAttacking ? 6 : 3.5;
    ctx.shadowColor = this.eyeColor;
    ctx.shadowBlur = isAttacking ? 22 : 12;

    ctx.beginPath();
    ctx.moveTo(3, 0);
    ctx.quadraticCurveTo(bladeLen * 0.6, -4, bladeLen, -2);
    ctx.stroke();

    // Steel Blade Body
    ctx.strokeStyle = ghost ? hexAlpha(this.eyeColor, 0.7) : '#d8e0f0';
    ctx.lineWidth = 2.4;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(3, 0);
    ctx.quadraticCurveTo(bladeLen * 0.6, -4, bladeLen, -2);
    ctx.stroke();

    // Razor White Cutting Edge
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(3, -1);
    ctx.quadraticCurveTo(bladeLen * 0.6, -4.5, bladeLen, -2);
    ctx.stroke();

    ctx.restore();
  }

  private drawScythe(
    ctx: CanvasRenderingContext2D,
    hand: Point,
    arm: Point,
    isAttacking: boolean,
    ghost: boolean,
  ): void {
    const dx = hand.x - arm.x;
    const dy = hand.y - arm.y;
    const baseAngle = Math.atan2(dy, dx);
    const scytheAngle =
      baseAngle +
      0.3 * this.direction +
      this.currentWeaponAngleOffset * this.direction;

    ctx.save();
    ctx.translate(hand.x, hand.y);
    ctx.rotate(scytheAngle);

    // Shaft (Long Pole)
    const shaftLen = 110;
    ctx.strokeStyle = ghost ? hexAlpha(this.eyeColor, 0.6) : '#121218';
    ctx.lineWidth = 4.5;
    ctx.shadowColor = this.eyeColor;
    ctx.shadowBlur = ghost ? 4 : 8;
    ctx.beginPath();
    ctx.moveTo(-shaftLen * 0.35, 0);
    ctx.lineTo(shaftLen * 0.65, 0);
    ctx.stroke();

    // Crescent Blade Head
    const bladeHeadX = shaftLen * 0.65;
    ctx.save();
    ctx.translate(bladeHeadX, 0);

    // Giant curved crescent blade
    const crescentAlpha = isAttacking ? 0.95 : 0.75;
    ctx.strokeStyle = hexAlpha(this.eyeColor, crescentAlpha);
    ctx.lineWidth = isAttacking ? 8 : 5;
    ctx.shadowColor = this.eyeColor;
    ctx.shadowBlur = isAttacking ? 28 : 14;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(25 * this.direction, -45, -20 * this.direction, -65);
    ctx.stroke();

    // Inner blade edge
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(25 * this.direction, -45, -20 * this.direction, -65);
    ctx.stroke();

    ctx.restore();
    ctx.restore();
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D): void {
    if (this.projectiles.length === 0) return;

    ctx.save();
    for (const p of this.projectiles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);

      // Kunai blade
      ctx.fillStyle = hexAlpha('#ffffff', 0.95);
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 12;

      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(0, 4);
      ctx.lineTo(-10, 2);
      ctx.lineTo(-10, -2);
      ctx.lineTo(0, -4);
      ctx.closePath();
      ctx.fill();

      // Ring handle
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(-13, 0, 3, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }
    ctx.restore();
  }
}

function clonePose(pose: Pose): Pose {
  const joints: Pose['joints'] = {};
  for (const name of Object.keys(pose.joints)) {
    const j = pose.joints[name];
    joints[name] = { angle: j.angle, x: j.x, y: j.y };
  }
  return {
    joints,
    root: { x: pose.root.x, y: pose.root.y },
    direction: pose.direction,
    time: pose.time,
  };
}

function hexAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  if (hex.startsWith('#')) {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    }
    return `rgba(${r},${g},${b},${a})`;
  }
  if (hex.startsWith('rgb(')) {
    return hex.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  }
  return hex;
}

// Re-export pose constants useful for external systems
export { IDLE_POSE, HIT_POSE, BLOCK_POSE, KNOCKDOWN_POSE, createDefaultPose };
