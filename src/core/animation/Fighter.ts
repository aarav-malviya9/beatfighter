import {
  createDefaultPose,
  interpolatePose,
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
    const moveTime = this.actionTime;

    // Forward movement during startup + active
    const moveWindow = startup + active;
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
      this.returnToIdle();
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

    // 6) Main shadow stickman body with inner glow & glowing striking limb
    this.drawSkeletonAt(ctx, this.currentPose, this.x, this.y, 1, false);

    // 7) Eye trail ribbons
    this.drawEyeTrails(ctx);

    // 8) Impact freeze frame speed lines & burst
    this.drawImpactEffect(ctx);
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

        this.motionTrail.push({
          x: tipWorldX,
          y: tipWorldY,
          life: 1,
        });
        if (this.motionTrail.length > 16) this.motionTrail.shift();

        // If in ACTIVE attack phase, record weapon slash arc ribbon
        if (this.currentPhase === 'ACTIVE') {
          // Base joint of the striking limb
          const baseJointName = this.getBaseJointName(trailJoint);
          const basePos = baseJointName
            ? getJointWorldPos(this.solvedPose, baseJointName)
            : null;
          const baseWorldX = basePos
            ? this.x + basePos.x * this.direction
            : tipWorldX - 16 * this.direction;
          const baseWorldY = basePos
            ? this.y + basePos.y
            : tipWorldY + 12;

          this.slashTrail.push({
            tipX: tipWorldX,
            tipY: tipWorldY,
            baseX: baseWorldX,
            baseY: baseWorldY,
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

      // Multi-layer glowing blade energy ribbon
      const grad = ctx.createLinearGradient(p1.baseX, p1.baseY, p1.tipX, p1.tipY);
      grad.addColorStop(0, hexAlpha(this.eyeColor, 0));
      grad.addColorStop(0.4, hexAlpha(this.eyeColor, alpha * 0.55));
      grad.addColorStop(0.85, hexAlpha('#ffffff', alpha * 0.95));
      grad.addColorStop(1, hexAlpha(this.eyeColor, alpha * 0.85));

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(p0.tipX, p0.tipY);
      ctx.lineTo(p1.tipX, p1.tipY);
      ctx.lineTo(p1.baseX, p1.baseY);
      ctx.lineTo(p0.baseX, p0.baseY);
      ctx.closePath();
      ctx.fill();

      // Sharp outer cutting edge
      ctx.strokeStyle = hexAlpha('#ffffff', alpha * 0.9);
      ctx.lineWidth = 3.5 * alpha;
      ctx.shadowColor = this.eyeColor;
      ctx.shadowBlur = 12;
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
