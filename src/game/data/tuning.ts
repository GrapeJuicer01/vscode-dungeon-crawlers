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
