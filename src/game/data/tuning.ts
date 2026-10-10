// Engine tuning constants (docs/architecture/data-model.md section 5). Cosmetic and engine-safety
// values, not user thresholds, so they are constants and not pixelAgents.* settings (decision
// H4-5). Every name carries its unit. Assumption: a default marked as such is a guess to be tuned
// by eye during the manual benchmark.

import type { SummonId } from './summons';

// ---- Loop ----
export const STEP_MS = 1000 / 60;
export const MAX_FRAME_MS = 100;
export const MAX_STEPS_PER_FRAME = 5;
export const EVENT_QUEUE_CAP = 256;
/** Consecutive faults before an entity is frozen (skipped by update). */
export const FAULT_LIMIT = 3;
/** Game time after a despawned event at which a hero is removed even if its exit stalled. */
export const EXIT_FAILSAFE_MS = 5000;
/** Fixed engine seed ("PAXE"); the same scene looks the same on every load. */
export const ENGINE_SEED = 0x50415845;

// ---- Hero ----
export const WALK_PX_PER_S = 40;
export const WARP_IN_MS = 600;
export const WARP_OUT_MS = 600;
export const VICTORY_MS = 1200;
export const REST_POSE_MIN_MS = 9000;
export const REST_POSE_MAX_MS = 16000;
export const SLEEP_AFTER_REST_MS = 30000;
/** Look variety; the validator checks the art provides exactly these counts. */
export const SKIN_TONE_COUNT = 4;
export const HAIR_COLOR_COUNT = 6;
/** Hero shadow width in px (a flat translucent bar drawn by the renderer). */
export const HERO_SHADOW_WIDTH_PX = 10;
/** Waiting before travel is retried when no path exists. Assumption: 1 s is invisible and cheap. */
export const PATH_RETRY_MS = 1000;

// ---- Engagement ----
export const ADVANCE_MS = 5000;
export const ENGAGE_MS = 2400;
export const SCROLL_PX_PER_S = 24;
export const SCROLL_EASE_MS = 300;
export const ATTACK_STAGGER_MAX_MS = 400;

// ---- Campfire ----
export const FLAME_LARGE_AT_RESTING = 3;
export const EMBER_BASE_PER_S = 4;
export const EMBER_PER_RESTING_PER_S = 3;
export const FIRE_LIGHT_BASE_PX = 40;
export const FIRE_LIGHT_PER_RESTING_PX = 6;
export const FIRE_LIGHT_MAX_PX = 72;
export const FIRE_LIGHT_INTENSITY = 0.9;
export const FIRE_FLICKER_MS = 120;
export const FIRE_SHADOW_WIDTH_PX = 30;

// ---- Effects ----
export const PARTICLE_CAPACITY = 384;
export const MAX_LIGHTS = 16;
export const LIGHT_MAP_WIDTH = 80;
export const LIGHT_MAP_HEIGHT = 45;
/** Light map scale: one light-map pixel is this many screen pixels. */
export const LIGHT_MAP_SCALE = 4;
/** Radial light bitmaps exist for radii in multiples of this many px (the "band" of flicker). */
export const LIGHT_RADIUS_STEP_PX = 8;
export const LIGHT_RADIUS_MAX_PX = 96;
/** Light intensity bands per radial bitmap. */
export const LIGHT_BANDS = 4;
export const TORCH_FLICKER_MS = 140;
/** Backdrop scroll factor relative to the corridor scroll. */
export const BACKDROP_PARALLAX = 0.25;
export const BACKDROP_WIDTH_PX = 128;
/** Drip gravity in px/s^2. Assumption: a short, quick fall reads as a drip at 320x180. */
export const DRIP_GRAVITY_PX_PER_S2 = 360;
export const DRIP_FALL_HEIGHT_PX = 44;
export const WARP_SPARKS_PER_S = 40;

// ---- Classes and cosmetic effects (H1) ----
/** Live cosmetic effects (projectiles, bursts). Assumption: 24 covers 8 heroes with headroom. */
export const EFFECT_CAPACITY = 24;
/** Hidden ability interval, in ms of attack time. Assumption: 4 to 8 s feels alive, never busy. */
export const ABILITY_INTERVAL_MIN_MS = 4000;
export const ABILITY_INTERVAL_MAX_MS = 8000;
/** Attack frame index on which a strike effect is released (frame 1 is the strike pose). */
export const ATTACK_STRIKE_FRAME = 1;
/** Ability frame index on which the ability effects are released. */
export const ABILITY_RELEASE_FRAME = 1;
/** Duration of one effect animation frame, in ms. Assumption: 90 ms reads as a quick pulse. */
export const EFFECT_FRAME_MS = 90;
/** An effect farther than this many px outside the 0..320 view is expired early. */
export const EFFECT_CULL_MARGIN_PX = 32;
/** Consecutive draw faults before the renderer disables the effect pass. */
export const EFFECT_FAULT_LIMIT = 3;

// ---- Summons (H2, ADR 0011) ----
/** Live summons in total. Assumption: one per Necromancer-like hero slot; 8 matches the 8-hero target. */
export const SUMMON_CAPACITY = 8;
/** How long a summon lives past its owner's last renewal, in ms. Assumption: 250 ms (15 steps) rides over a frame hitch. */
export const SUMMON_LEASE_MS = 250;
/**
 * Summon shadow width in px per kind (a flat translucent bar drawn by the renderer).
 * Assumption (H3-8): 8 for the skeleton, 12 for the wider wolf, 10 for the turret; art-tunable data.
 */
export const SUMMON_SHADOW_PX: Readonly<Record<SummonId, number>> = {
  skeleton: 8,
  beast: 12,
  turret: 10,
};

// ---- Enemies, combat, and stages (E1, ADR 0013) ----
// Cosmetic and engine-safety values, constants and not settings (decision H4-5). Enemy numbers
// (health, speed, attack timing) live in data/enemies.ts, not here.
/** Pooled regular enemies. The one boss uses a separate pooled instance. */
export const ENEMY_CAPACITY = 12;
/** Spawn x, off the right edge of the 320 px view. */
export const ENEMY_SPAWN_X = 340;
/** Lanes by foot y: 156 - 5 * lane, so a wave of six does not stack on one pixel row. */
export const ENEMY_LANE_COUNT = 4;
export const ENEMY_LANE_FOOT_Y = 156;
export const ENEMY_LANE_STEP_PX = 5;
/** Gap between the front of the party and where enemies stand. */
export const ENEMY_GAP_PX = 14;
export const ENEMY_STAND_MAX_X = 300;
/** The boss stands closer than this x at most, so its wide body does not leave the view. */
export const BOSS_STAND_MAX_X = 288;
export const BOSS_GAP_PX = 28;
/** A withdrawing enemy is released once it passes this x. */
export const ENEMY_RELEASE_X = 340;
/** Pause after a wave is cleared before the next spawns. */
export const WAVE_GAP_MS = 1200;
/** No fighters for this long makes every live enemy walk off. */
export const WITHDRAW_AFTER_MS = 2000;
/** Spawn weight of a regular row: minions are three times as common as the elite. */
export const MINION_WEIGHT = 3;
export const ELITE_WEIGHT = 1;
/** An enemy flashes white this long after a strike. */
export const ENEMY_FLASH_MS = 100;
/** A bar stays visible this long after the last strike (always visible for an engaged boss). */
export const ENEMY_BAR_SHOW_MS = 2500;
export const ENEMY_DISSOLVE_FRAME_MS = 100;
/** Engine-generated dissolve frames per enemy (spriteFactory builds them). */
export const ENEMY_DISSOLVE_FRAMES = 4;
/** Boss telegraph (2 frames) before each attack, and its intro pose. */
export const ENEMY_TELEGRAPH_MS = 500;
export const ENEMY_INTRO_MS = 1200;
/** Attack animation frame on which an enemy's attack lands (the cosmetic reaction fires). */
export const ENEMY_ATTACK_STRIKE_FRAME = 1;
/** Boss phase 2 below this fraction of its health: attacks come at this multiple of the interval. */
export const BOSS_PHASE2_FRACTION = 0.5;
export const BOSS_PHASE2_INTERVAL_FACTOR = 0.7;
/** Fighters a boss slam reaches, and a regular attack reaches. */
export const BOSS_SLAM_TARGETS = 3;
/** Strikes counted per fighter per step at most (a guard against a runaway serial). */
export const MAX_SERIAL_DELTA = 2;
/** Combat faults before combat is disabled for the page load. */
export const COMBAT_FAULT_LIMIT = 3;
/** Draw faults before the drop pass or the fade is disabled. */
export const PASS_FAULT_LIMIT = 3;
/** After the boss falls: hold, then the stage changes behind a dark fade. */
export const STAGE_CLEAR_HOLD_MS = 1200;
export const STAGE_FADE_MS = 400;
/** The boot gate (waiting for the stored progress) gives up after this much game time. */
export const PROGRESS_WAIT_MS = 1500;
/** Impact sparks emitted on every strike that lands. */
export const HIT_SPARKS = 2;

// ---- Hero hit reactions (cosmetic; ADR 0013) ----
/** A struck hero shows a white silhouette this long, at most once per gap (photosensitivity). */
export const HERO_FLASH_MS = 100;
export const HERO_FLASH_GAP_MS = 500;
/** Slide in whole pixels (strong = a boss slam), decaying to 0 over HERO_KNOCK_MS. */
export const HERO_KNOCK_PX = 1;
export const HERO_KNOCK_STRONG_PX = 2;
export const HERO_KNOCK_MS = 160;

// ---- Stage 2 ambient (dust motes) ----
export const MOTE_MIN_Y = 40;
export const MOTE_MAX_Y = 150;
export const MOTE_LIFE_MIN_MS = 2500;
export const MOTE_LIFE_MAX_MS = 4500;

// ---- Stage 3 ambient (rising bubbles) and Stage 4 ambient (low fog), first guesses tuned by eye ----
export const BUBBLE_MIN_Y = 118;
export const BUBBLE_MAX_Y = 156;
export const BUBBLE_RISE_MIN = 12;
export const BUBBLE_RISE_MAX = 26;
export const BUBBLE_LIFE_MIN_MS = 1400;
export const BUBBLE_LIFE_MAX_MS = 2600;
export const FOG_MIN_Y = 132;
export const FOG_MAX_Y = 158;
export const FOG_DRIFT_MIN = 3;
export const FOG_DRIFT_MAX = 9;
export const FOG_LIFE_MIN_MS = 4500;
export const FOG_LIFE_MAX_MS = 7500;

// Stage 5 fireflies (E3). Cosmetic only; first guesses, tuned by eye.
export const FIREFLY_MIN_Y = 60;
export const FIREFLY_MAX_Y = 140;
export const FIREFLY_DRIFT = 6;
export const FIREFLY_LIFE_MIN_MS = 3500;
export const FIREFLY_LIFE_MAX_MS = 6500;

// Stage 7 snow (E4). Cosmetic only; first guesses, tuned by eye. Fall speeds are positive = down.
export const SNOW_MIN_Y = 4;
export const SNOW_MAX_Y = 60;
export const SNOW_DRIFT = 5;
export const SNOW_FALL_MIN = 8;
export const SNOW_FALL_MAX = 16;
export const SNOW_LIFE_MIN_MS = 3500;
export const SNOW_LIFE_MAX_MS = 6000;

// Stage 8 murk (E4). Cosmetic only; motes rise slowly while drifting sideways.
export const MURK_MIN_Y = 90;
export const MURK_MAX_Y = 156;
export const MURK_DRIFT = 4;
export const MURK_RISE_MIN = 3;
export const MURK_RISE_MAX = 8;
export const MURK_LIFE_MIN_MS = 4000;
export const MURK_LIFE_MAX_MS = 7000;

// Stage 6 ambient embers (E3). Separate from the campfire EMBER_* constants.
export const STAGE_EMBER_MIN_Y = 112;
export const STAGE_EMBER_MAX_Y = 156;
export const STAGE_EMBER_RISE_MIN = 14;
export const STAGE_EMBER_RISE_MAX = 30;
export const STAGE_EMBER_LIFE_MIN_MS = 1800;
export const STAGE_EMBER_LIFE_MAX_MS = 3200;
