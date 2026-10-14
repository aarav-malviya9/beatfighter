export interface Joint {
  name: string;
  parent: string | null;
  offset: { x: number; y: number };
  length: number;
  angle: number;
  angleMin: number;
  angleMax: number;
  children: string[];
}

export interface Pose {
  joints: Record<string, { angle: number; x: number; y: number }>;
  root: { x: number; y: number };
  direction: 1 | -1;
  time: number;
}

export interface SkeletonConfig {
  height: number;
  proportions: {
    head: number;
    torso: number;
    upperArm: number;
    lowerArm: number;
    hand: number;
    thigh: number;
    shin: number;
    foot: number;
  };
}

export const DEFAULT_SKELETON: SkeletonConfig = {
  height: 160,
  proportions: {
    head: 0.13,
    torso: 0.30,
    upperArm: 0.18,
    lowerArm: 0.16,
    hand: 0.06,
    thigh: 0.24,
    shin: 0.22,
    foot: 0.06,
  },
};

export const JOINT_HIERARCHY: Joint[] = [
  { name: 'root', parent: null, offset: { x: 0, y: 0 }, length: 0, angle: 0, angleMin: -Math.PI, angleMax: Math.PI, children: ['hips'] },
  { name: 'hips', parent: 'root', offset: { x: 0, y: 0 }, length: 0, angle: 0, angleMin: -0.3, angleMax: 0.3, children: ['spine', 'thigh_l', 'thigh_r'] },
  { name: 'spine', parent: 'hips', offset: { x: 0, y: -1 }, length: 0.35, angle: 0, angleMin: -0.5, angleMax: 0.4, children: ['chest'] },
  { name: 'chest', parent: 'spine', offset: { x: 0, y: -1 }, length: 0.25, angle: 0, angleMin: -0.6, angleMax: 0.5, children: ['neck', 'shoulder_l', 'shoulder_r'] },
  { name: 'neck', parent: 'chest', offset: { x: 0, y: -1 }, length: 0.12, angle: 0, angleMin: -0.7, angleMax: 0.7, children: ['head'] },
  { name: 'head', parent: 'neck', offset: { x: 0, y: -1 }, length: 0.13, angle: 0, angleMin: -0.5, angleMax: 0.5, children: [] },
  { name: 'shoulder_l', parent: 'chest', offset: { x: -0.12, y: -0.02 }, length: 0, angle: 0.1, angleMin: -1.2, angleMax: 1.5, children: ['upperArm_l'] },
  { name: 'upperArm_l', parent: 'shoulder_l', offset: { x: 0, y: 0 }, length: 0.18, angle: -0.2, angleMin: -2.5, angleMax: 1.0, children: ['lowerArm_l'] },
  { name: 'lowerArm_l', parent: 'upperArm_l', offset: { x: 0, y: -1 }, length: 0.16, angle: 0.3, angleMin: -0.1, angleMax: 2.8, children: ['hand_l'] },
  { name: 'hand_l', parent: 'lowerArm_l', offset: { x: 0, y: -1 }, length: 0.06, angle: 0, angleMin: -0.8, angleMax: 0.8, children: [] },
  { name: 'shoulder_r', parent: 'chest', offset: { x: 0.12, y: -0.02 }, length: 0, angle: -0.1, angleMin: -1.5, angleMax: 1.2, children: ['upperArm_r'] },
  { name: 'upperArm_r', parent: 'shoulder_r', offset: { x: 0, y: 0 }, length: 0.18, angle: 0.2, angleMin: -1.0, angleMax: 2.5, children: ['lowerArm_r'] },
  { name: 'lowerArm_r', parent: 'upperArm_r', offset: { x: 0, y: -1 }, length: 0.16, angle: -0.3, angleMin: -2.8, angleMax: 0.1, children: ['hand_r'] },
  { name: 'hand_r', parent: 'lowerArm_r', offset: { x: 0, y: -1 }, length: 0.06, angle: 0, angleMin: -0.8, angleMax: 0.8, children: [] },
  { name: 'thigh_l', parent: 'hips', offset: { x: -0.08, y: 0 }, length: 0.24, angle: 0.1, angleMin: -1.5, angleMax: 1.2, children: ['shin_l'] },
  { name: 'shin_l', parent: 'thigh_l', offset: { x: 0, y: -1 }, length: 0.22, angle: 0, angleMin: -0.1, angleMax: 2.5, children: ['foot_l'] },
  { name: 'foot_l', parent: 'shin_l', offset: { x: 0, y: -1 }, length: 0.06, angle: 0, angleMin: -0.5, angleMax: 1.0, children: [] },
  { name: 'thigh_r', parent: 'hips', offset: { x: 0.08, y: 0 }, length: 0.24, angle: -0.1, angleMin: -1.2, angleMax: 1.5, children: ['shin_r'] },
  { name: 'shin_r', parent: 'thigh_r', offset: { x: 0, y: -1 }, length: 0.22, angle: 0, angleMin: -0.1, angleMax: 2.5, children: ['foot_r'] },
  { name: 'foot_r', parent: 'shin_r', offset: { x: 0, y: -1 }, length: 0.06, angle: 0, angleMin: -0.5, angleMax: 1.0, children: [] },
];

const JOINT_MAP = new Map(JOINT_HIERARCHY.map(j => [j.name, j]));

export function createDefaultPose(): Pose {
  const joints: Pose['joints'] = {};
  for (const joint of JOINT_HIERARCHY) {
    joints[joint.name] = { angle: joint.angle, x: 0, y: 0 };
  }
  return {
    joints,
    root: { x: 0, y: 0 },
    direction: 1,
    time: 0,
  };
}

export function solveForwardKinematics(pose: Pose, config: SkeletonConfig = DEFAULT_SKELETON, direction: 1 | -1 = 1): Pose {
  const result: Pose = { ...pose, joints: { ...pose.joints }, root: { ...pose.root }, direction, time: pose.time };
  const scale = config.height;

  function solveJoint(name: string, parentX: number, parentY: number, parentAngle: number) {
    const jointDef = JOINT_MAP.get(name);
    const jointData = result.joints[name];
    if (!jointDef || !jointData) return;

    const absAngle = parentAngle + jointData.angle * direction;
    const length = jointDef.length * scale;
    const x = parentX + Math.sin(absAngle) * length;
    const y = parentY - Math.cos(absAngle) * length;

    jointData.x = x;
    jointData.y = y;

    for (const childName of jointDef.children) {
      solveJoint(childName, x, y, absAngle);
    }
  }

  solveJoint('root', result.root.x, result.root.y, 0);
  return result;
}

export function interpolatePose(a: Pose, b: Pose, t: number): Pose {
  const clampedT = Math.max(0, Math.min(1, t));
  const eased = easedT(clampedT);

  const joints: Pose['joints'] = {};
  for (const name of Object.keys(a.joints)) {
    const ja = a.joints[name];
    const jb = b.joints[name];
    if (!ja || !jb) continue;

    let diff = jb.angle - ja.angle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    joints[name] = {
      angle: ja.angle + diff * eased,
      x: 0,
      y: 0,
    };
  }

  return {
    joints,
    root: {
      x: a.root.x + (b.root.x - a.root.x) * eased,
      y: a.root.y + (b.root.y - a.root.y) * eased,
    },
    direction: t < 0.5 ? a.direction : b.direction,
    time: a.time + (b.time - a.time) * eased,
  };
}

function easedT(t: number): number {
  return t * t * (3 - 2 * t); // smoothstep
}

export function blendPoses(poses: Pose[], weights: number[]): Pose {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return poses[0];

  const normalized = weights.map(w => w / totalWeight);
  const base = poses[0];
  const joints: Pose['joints'] = {};

  for (const name of Object.keys(base.joints)) {
    let sumX = 0, sumY = 0, sumAngle = 0;
    for (let i = 0; i < poses.length; i++) {
      const p = poses[i];
      const j = p.joints[name];
      if (!j) continue;
      const w = normalized[i];
      sumX += j.x * w;
      sumY += j.y * w;
      sumAngle += j.angle * w;
    }
    joints[name] = { angle: sumAngle, x: sumX, y: sumY };
  }

  let rx = 0, ry = 0;
  for (let i = 0; i < poses.length; i++) {
    const w = normalized[i];
    rx += poses[i].root.x * w;
    ry += poses[i].root.y * w;
  }

  return {
    joints,
    root: { x: rx, y: ry },
    direction: poses[0].direction,
    time: Date.now(),
  };
}

export function mirrorPose(pose: Pose): Pose {
  const joints: Pose['joints'] = {};
  const mirrorMap: Record<string, string> = {
    'shoulder_l': 'shoulder_r', 'shoulder_r': 'shoulder_l',
    'upperArm_l': 'upperArm_r', 'upperArm_r': 'upperArm_l',
    'lowerArm_l': 'lowerArm_r', 'lowerArm_r': 'lowerArm_l',
    'hand_l': 'hand_r', 'hand_r': 'hand_l',
    'thigh_l': 'thigh_r', 'thigh_r': 'thigh_l',
    'shin_l': 'shin_r', 'shin_r': 'shin_l',
    'foot_l': 'foot_r', 'foot_r': 'foot_l',
  };

  for (const name of Object.keys(pose.joints)) {
    const mirrored = mirrorMap[name] || name;
    const src = pose.joints[mirrored];
    if (!src) continue;

    let angle = src.angle;
    if (mirrorMap[name]) {
      angle = -src.angle;
    }

    joints[name] = { angle, x: 0, y: 0 };
  }

  return {
    joints,
    root: { x: pose.root.x, y: pose.root.y },
    direction: (-pose.direction) as 1 | -1,
    time: pose.time,
  };
}

export function getJointWorldPos(pose: Pose, name: string): { x: number; y: number } | null {
  return pose.joints[name] ? { x: pose.joints[name].x, y: pose.joints[name].y } : null;
}

export function getJointAngle(pose: Pose, name: string): number {
  return pose.joints[name]?.angle || 0;
}

export function setJointAngle(pose: Pose, name: string, angle: number): Pose {
  const jointDef = JOINT_MAP.get(name);
  if (!jointDef) return pose;

  const clamped = Math.max(jointDef.angleMin, Math.min(jointDef.angleMax, angle));
  return {
    ...pose,
    joints: { ...pose.joints, [name]: { ...pose.joints[name], angle: clamped } },
  };
}

export interface MoveKeyframe {
  time: number; // 0.0 to 1.0 (relative progress within move duration)
  pose: Pose;
  rootDelta?: { x: number; y: number }; // root trajectory offset
  weaponAngle?: number; // radians offset
  hitActive?: boolean;
  phase?: 'STARTUP' | 'ACTIVE' | 'RECOVERY' | 'FINISH';
  footPlant?: 'left' | 'right' | 'both' | 'none';
}

export function sampleClipPose(
  keyframes: MoveKeyframe[],
  progress: number,
  fallbackPose: Pose,
): {
  pose: Pose;
  weaponAngle: number;
  hitActive: boolean;
  phase: 'STARTUP' | 'ACTIVE' | 'RECOVERY' | 'FINISH';
  footPlant: 'left' | 'right' | 'both' | 'none';
} {
  if (!keyframes || keyframes.length === 0) {
    return {
      pose: fallbackPose,
      weaponAngle: 0,
      hitActive: false,
      phase: 'ACTIVE',
      footPlant: 'both',
    };
  }

  const p = Math.max(0, Math.min(1, progress));

  if (p <= keyframes[0].time) {
    const k = keyframes[0];
    return {
      pose: applyRootDelta(k.pose, k.rootDelta),
      weaponAngle: k.weaponAngle ?? 0,
      hitActive: !!k.hitActive,
      phase: k.phase ?? 'STARTUP',
      footPlant: k.footPlant ?? 'both',
    };
  }

  if (p >= keyframes[keyframes.length - 1].time) {
    const k = keyframes[keyframes.length - 1];
    return {
      pose: applyRootDelta(k.pose, k.rootDelta),
      weaponAngle: k.weaponAngle ?? 0,
      hitActive: !!k.hitActive,
      phase: k.phase ?? 'RECOVERY',
      footPlant: k.footPlant ?? 'both',
    };
  }

  let k0 = keyframes[0];
  let k1 = keyframes[1];
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (p >= keyframes[i].time && p <= keyframes[i + 1].time) {
      k0 = keyframes[i];
      k1 = keyframes[i + 1];
      break;
    }
  }

  const span = Math.max(0.0001, k1.time - k0.time);
  const localT = (p - k0.time) / span;

  const basePose = interpolatePose(k0.pose, k1.pose, localT);

  const rd0 = k0.rootDelta ?? { x: 0, y: 0 };
  const rd1 = k1.rootDelta ?? { x: 0, y: 0 };
  basePose.root.x += rd0.x + (rd1.x - rd0.x) * localT;
  basePose.root.y += rd0.y + (rd1.y - rd0.y) * localT;

  const wa0 = k0.weaponAngle ?? 0;
  const wa1 = k1.weaponAngle ?? 0;
  const weaponAngle = wa0 + (wa1 - wa0) * localT;

  const hitActive = Boolean(k0.hitActive || k1.hitActive) && localT >= 0.1 && localT <= 0.9;
  const phase = localT < 0.5 ? (k0.phase ?? 'STARTUP') : (k1.phase ?? 'ACTIVE');
  const footPlant = localT < 0.5 ? (k0.footPlant ?? 'both') : (k1.footPlant ?? 'both');

  return {
    pose: basePose,
    weaponAngle,
    hitActive,
    phase,
    footPlant,
  };
}

function applyRootDelta(pose: Pose, delta?: { x: number; y: number }): Pose {
  if (!delta) return pose;
  return {
    ...pose,
    root: {
      x: pose.root.x + delta.x,
      y: pose.root.y + delta.y,
    },
  };
}