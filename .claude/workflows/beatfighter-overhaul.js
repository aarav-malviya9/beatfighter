export const meta = {
  name: 'beatfighter-overhaul',
  description: 'Full cinematic shadow combat overhaul - parallel build of all core systems',
  phases: [
    { title: 'Foundations', detail: 'MoveLibrary + PoseEngine + Fighter skeleton' },
    { title: 'Combat Systems', detail: 'CombatDirector + CameraDirector + MusicSync' },
    { title: 'VFX + Arenas', detail: 'Premium VFX engine + Dynamic arenas' },
    { title: 'Integration', detail: 'Wire into App + UI + Build verification' },
  ],
};

phase('Foundations');
const moveLibrary = await agent(`
Create a comprehensive MoveLibrary.ts with 40+ martial arts moves for a shadow fighter game.
Each move needs: id, name, level (LIGHT/MEDIUM/HEAVY/SPECIAL), state, startup/active/recovery/total frames (seconds),
damage, hitstun, knockback, launchPower, groundBounce, range, forwardMovement, cancelWindow,
camera request (zoom, shake, slowMo, duration, track, wide), vfx request (type, origin, color, intensity),
and a Pose object defining joint angles for the keyframe.
Categories: Jabs, Crosses, Hooks, Uppercuts, Body Blows, Low Kicks, Roundhouses, Spinning Kicks, 
Sweeps, Blocks, Parries, Sidesteps, Ducks, Counters, Lunges, Dashes, Retreats, Rolls, Blink-Dashes,
Multi-hit combos, Aerial launches, Ground slams, Energy strikes, Shockwaves, Energy arcs, 
Cinematic counters, Aerial pursuits, Knockdowns, Finishers.
Use the Pose type from PoseEngine (joints: Record<string, {angle, x, y}>, root, direction, time).
Output as MoveRegistry. Write to src/core/animation/MoveLibrary.ts.
`, { label: 'MoveLibrary', phase: 'Foundations', isolation: 'worktree' });

const fighterSkeleton = await agent(`
Rewrite Fighter.ts to use the new PoseEngine skeletal animation system.
The Fighter should: have a SkeletonConfig and currentPose (from PoseEngine), 
implement performMove(moveId: string) that looks up the move in MoveLibrary and interpolates from current pose to move pose over startup frames,
update(dt) that advances through STARTUP -> ACTIVE -> RECOVERY -> FINISH phases with proper timing,
getHitbox() that computes world-space hitboxes from joint positions (hand_r, hand_l, foot_r, foot_l, head, chest),
getBodyBox() for hurtboxes, draw(ctx) that renders the skeleton as elegant shadow silhouettes with:
- Connected limbs (lines between joints)
- Joint circles at elbows, knees, shoulders, hips
- Glowing eyes on head that intensify during attacks
- Energy aura that pulses with attack state
- Motion trails on hands/feet during ACTIVE phase
- Proper scaling for direction (1/-1)
Export Fighter class. Write to src/core/animation/Fighter.ts.
`, { label: 'Fighter', phase: 'Foundations', isolation: 'worktree' });

phase('Combat Systems');
const combatDirector = await agent(`
Create a new CombatDirector.ts that implements cinematic combat choreography.
Features: 
- CombatState enum: IDLE, STANDOFF, EXCHANGE, COUNTER, AERIAL, FINISHER, END
- Track both fighters' states, distances, cooldowns, combo counters
- chooseAction(attacker, defender, context) that considers: distance, music intensity, beat confidence, 
  previous move, defender state, combo potential, aggression level
- Move selection weighted by: range match, damage potential, counter opportunity, cinematic value
- Defense logic: block on heavy telegraph, dodge on fast, parry on predictable, counter on whiff
- Combo system: chain LIGHT->MEDIUM->HEAVY->SPECIAL with cancel windows
- Signature sequences: Divine Counter, Shadow Blitz, Celestial Impact, Final Eclipse
- Beat synchronization: onBeat(intensity, confidence, energyCurve) triggers actions
- Camera event emission: emitCameraEvent(event) for CameraDirector
- VFX event emission: emitVFXEvent(event) for VFXEngine
- Finisher detection: when health low + music climax + meter full
Export CombatDirector class. Write to src/core/choreography/CombatDirector.ts.
`, { label: 'CombatDirector', phase: 'Combat Systems', isolation: 'worktree' });

const cameraDirector = await agent(`
Create CameraDirector.ts for cinematic camera control.
Features:
- CameraState: tracking, zoom, angle, shake, slowMo, target framing
- Smooth follow with configurable deadzone and lookahead
- Event-driven camera actions: onImpact(force, dir), onPowerUp(fighter), onFinisher(), 
  onAerialExchange(), onStandoff(), onBeat(intensity), onCounter()
- Cinematic zoom: pull in before heavy attacks, wide for aerials, impact zoom + shake
- Slow-motion: brief 0.1-0.3s on heavy hits, longer on finishers
- Safe margins: keep both fighters visible with configurable padding
- Return to neutral: smooth ease back after events
- Parallax layers for arena backgrounds
- Screen-space distortion on major impacts (if WebGL available, else 2D approximation)
Export CameraDirector class. Write to src/core/rendering/CameraDirector.ts.
`, { label: 'CameraDirector', phase: 'Combat Systems', isolation: 'worktree' });

const musicSync = await agent(`
Create MusicSync.ts that bridges audio analysis to combat choreography.
Features:
- Consumes TrackAnalysis (beats[], bpm, energyCurve[], duration) from MusicAnalyzer
- BeatEvent: { time, intensity, confidence, isDownbeat, energySlope }
- Intensity levels: CALM(0-0.2), BUILDING(0.2-0.4), DRIVING(0.4-0.6), INTENSE(0.6-0.8), CLIMAX(0.8-1.0)
- Detect: drops (sharp intensity rise), breaks (sharp fall), sustained high energy, rhythmic density
- Export: getIntensityAt(time), getNextBeat(time), getPhase(time), getRhythmicDensity(time)
- Combat hints: preferredAttackLevel(intensity), shouldCombo(density), shouldFinisher(climaxProximity)
- Sync state survives pause/resume/seek/export
Export MusicSync class. Write to src/core/audio/MusicSync.ts.
`, { label: 'MusicSync', phase: 'Combat Systems', isolation: 'worktree' });

phase('VFX + Arenas');
const vfxEngine = await agent(`
Create a premium VFXEngine.ts with object-pooled particle systems.
Systems: 
1. ImpactParticles - white flash frames, expanding rings, radial speed lines, directional bursts, ground dust
2. EnergyTrails - crescent slashes, curved ribbons, charged limb glows, energy spheres, electric arcs
3. Atmospheric - drifting embers/ash/smoke/dust, volumetric light shafts (2D gradient trick), parallax dust
4. Afterimages - fading silhouette clones during blink-dashes
5. Distortion - screen-space ripple on major hits
All systems: object pools (pre-allocate 2000 particles), emit(config), update(dt), draw(ctx).
Config-driven: color, intensity, lifetime, size, gravity, friction, additive blending.
Performance: quality tiers (LOW/MEDIUM/HIGH/ULTRA) that scale pool sizes and effect complexity.
Export VFXEngine class. Write to src/core/rendering/VFXEngine.ts.
`, { label: 'VFXEngine', phase: 'VFX + Arenas', isolation: 'worktree' });

const arenaSystem = await agent(`
Create ArenaSystem.ts with 5 layered environments.
Arenas:
1. Void - pure black, floating particles, subtle vignette
2. Celestial Temple - shadowy columns, distant arches, ground fog, reactive lighting
3. Moonlit Arena - moon glow, drifting fog layers, reflective ground plane
4. Fractured Landscape - glowing cracks in ground, debris, reactive fissures on impact
5. Cosmic - starfield parallax, nebula gradients, atmospheric depth
Each arena: background layers (far/mid/near), particle systems, lighting state, 
onImpact(x, y, force) triggers cracks/debris/lighting flash, draw(ctx, camera, time).
Quality tiers for particle counts. Export ArenaSystem, ArenaType enum. Write to src/core/rendering/ArenaSystem.ts.
`, { label: 'ArenaSystem', phase: 'VFX + Arenas', isolation: 'worktree' });

phase('Integration');
const appIntegration = await agent(`
Update App.tsx to wire everything together:
- Import new Fighter, CombatDirector, CameraDirector, VFXEngine, ArenaSystem, MusicSync
- Initialize all systems in useEffect
- Render loop: update(dt) -> combatDirector.update -> cameraDirector.update -> vfxEngine.update -> arena.update
- Draw: arena.drawBackground -> camera.apply -> fighters.draw -> vfxEngine.draw -> arena.drawForeground
- UI: add controls for arena select, fighter style, visual theme, cinematic intensity, camera movement, VFX intensity, combat aggression, choreography variation, slow-mo frequency, preview quality
- Presets: Minimal Shadow, Dark Fantasy, Celestial, Anime Impact, Crimson Eclipse (as config objects)
- Keep existing audio controls, file upload, Spotify sync, video export working
- Handle resize, devicePixelRatio, pause/resume/seek sync
Write updated App.tsx.
`, { label: 'AppIntegration', phase: 'Integration', isolation: 'worktree' });

const buildVerify = await agent(`
Run the production build and typecheck:
1. npx tsc -b (TypeScript build check)
2. npx oxlint (lint)
3. npx vite build (production build)
Report any errors. If errors, describe them clearly so they can be fixed.
Run in C:\\Users\\27aar\\Documents\\antigravity\\agitated-pascal\\beatfighter.
`, { label: 'BuildVerify', phase: 'Integration' });

return { moveLibrary, fighterSkeleton, combatDirector, cameraDirector, musicSync, vfxEngine, arenaSystem, appIntegration, buildVerify };