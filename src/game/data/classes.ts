// The hero class table (H1 four, H2 four more, H3 four more: 12, final). Classes are purely cosmetic: a look (art),
// and the effects a hero plays while attacking. A row deliberately holds no combat or resource
// number (Core invariant 1). docs/design/classes.md embeds a table generated from this file by
// `npm run docs:tables`; this module is pure data so the generator can import it without art.
import type { EffectId } from './effects';
import { EFFECT_IDS } from './effects';
import type { SummonId } from './summons';
import { SUMMON_IDS } from './summons';

/** H1 order is kept (indexes 0 to 3); H2 appends four, H3 appends four more. */
export const CLASS_IDS = [
  'warrior',
  'mage',
  'archer',
  'rogue',
  'cleric',
  'paladin',
  'necromancer',
  'bard',
  'druid',
  'monk',
  'artificer',
  'berserker',
] as const;
export type ClassId = (typeof CLASS_IDS)[number];
export type ClassRole = 'melee' | 'ranged' | 'caster';

/**
 * One cosmetic effect to spawn, in hero-relative pixels: dx and vx are multiplied by +1 when the
 * hero faces right and -1 when left; dy is up-negative from the hero's foot pixel.
 */
export interface EffectShot {
  readonly effect: EffectId;
  readonly dx: number;
  readonly dy: number;
  /** px/s */
  readonly vx: number;
  /** px/s */
  readonly vy: number;
  readonly lifeMs: number;
}

export interface ClassAbility {
  readonly id: string;
  readonly name: string;
  readonly shots: readonly EffectShot[];
}

/**
 * A cosmetic ally a class raises with its ability (H2, ADR 0011). dx/dy are from the owner's foot
 * pixel; dx is mirrored when the owner faces left, and a small positive dy sorts the summon in
 * front of its owner. No number here can be a resource.
 */
export interface SummonDef {
  readonly kind: SummonId;
  readonly dx: number;
  readonly dy: number;
}

export interface ClassDef {
  readonly id: ClassId;
  /** From the art style guide. */
  readonly name: string;
  readonly role: ClassRole;
  /** Docs text, for example 'red + steel'. */
  readonly colors: string;
  /** Docs text: the readable cue at 16x20. */
  readonly silhouette: string;
  /** Spawned on the attack strike frame; empty for a pure melee swing. */
  readonly strike: readonly EffectShot[];
  readonly ability: ClassAbility;
  /** The ally raised with the ability, or null (Necromancer skeleton, Druid beast, Artificer turret). */
  readonly summon: SummonDef | null;
}

export const CLASSES = [
  {
    id: 'warrior',
    name: 'Warrior',
    role: 'melee',
    colors: 'red + steel',
    silhouette: 'wide shoulders, red plume above a steel helm, round shield',
    strike: [],
    ability: {
      id: 'whirlwind',
      name: 'Whirlwind',
      shots: [{ effect: 'whirl', dx: 0, dy: -6, vx: 0, vy: 0, lifeMs: 460 }],
    },
    summon: null,
  },
  {
    id: 'mage',
    name: 'Mage',
    role: 'caster',
    colors: 'blue + gold',
    silhouette: 'tallest figure, pointy hat with a gold band, orb staff',
    strike: [{ effect: 'orbBolt', dx: 12, dy: -12, vx: 150, vy: 0, lifeMs: 500 }],
    ability: {
      id: 'arcaneBurst',
      name: 'Arcane Burst',
      shots: [{ effect: 'arcaneBurst', dx: 28, dy: -10, vx: 0, vy: 0, lifeMs: 420 }],
    },
    summon: null,
  },
  {
    id: 'archer',
    name: 'Archer',
    role: 'ranged',
    colors: 'forest green + brown',
    silhouette: 'pointed hood, quiver bulge behind the shoulder, bow',
    strike: [{ effect: 'arrow', dx: 12, dy: -10, vx: 180, vy: 0, lifeMs: 500 }],
    ability: {
      id: 'volley',
      name: 'Volley',
      shots: [
        { effect: 'arrow', dx: 12, dy: -14, vx: 180, vy: -10, lifeMs: 500 },
        { effect: 'arrow', dx: 12, dy: -10, vx: 180, vy: 0, lifeMs: 500 },
        { effect: 'arrow', dx: 12, dy: -6, vx: 180, vy: 10, lifeMs: 500 },
      ],
    },
    summon: null,
  },
  {
    id: 'rogue',
    name: 'Rogue',
    role: 'melee',
    colors: 'slate + purple',
    silhouette: 'low forward crouch, hood and mask, twin daggers',
    strike: [],
    ability: {
      id: 'daggerFlurry',
      name: 'Dagger Flurry',
      shots: [
        { effect: 'smokePuff', dx: 0, dy: -4, vx: 0, vy: 0, lifeMs: 360 },
        { effect: 'dagger', dx: 10, dy: -12, vx: 200, vy: 0, lifeMs: 400 },
        { effect: 'dagger', dx: 4, dy: -8, vx: 200, vy: 0, lifeMs: 400 },
      ],
    },
    summon: null,
  },
  {
    id: 'cleric',
    name: 'Cleric',
    role: 'melee',
    colors: 'white + gold',
    silhouette: 'rounded hood or mitre, soft glow pixel, mace',
    strike: [],
    // A picture of a blessing, centered on the caster. It targets and restores nothing.
    ability: {
      id: 'blessing',
      name: 'Blessing',
      shots: [
        { effect: 'blessGlow', dx: 0, dy: -3, vx: 0, vy: 0, lifeMs: 600 },
        { effect: 'buffSparkle', dx: -5, dy: -12, vx: 0, vy: -16, lifeMs: 640 },
        { effect: 'buffSparkle', dx: 5, dy: -10, vx: 0, vy: -12, lifeMs: 640 },
      ],
    },
    summon: null,
  },
  {
    id: 'paladin',
    name: 'Paladin',
    role: 'melee',
    colors: 'gold + white',
    silhouette: 'winged helm, tall kite shield, glowing sword',
    strike: [],
    ability: {
      id: 'radiantSmite',
      name: 'Radiant Smite',
      shots: [
        { effect: 'holyBurst', dx: 16, dy: -10, vx: 0, vy: 0, lifeMs: 440 },
        { effect: 'buffSparkle', dx: 4, dy: -14, vx: 0, vy: -14, lifeMs: 560 },
      ],
    },
    summon: null,
  },
  {
    id: 'necromancer',
    name: 'Necromancer',
    role: 'caster',
    colors: 'dark purple + sickly green',
    silhouette: 'hood, hunched, skull staff, skeleton beside it',
    strike: [{ effect: 'soulWisp', dx: 12, dy: -12, vx: 130, vy: 0, lifeMs: 520 }],
    ability: {
      id: 'boneCall',
      name: 'Bone Call',
      shots: [
        { effect: 'soulWisp', dx: 16, dy: -4, vx: 0, vy: -22, lifeMs: 560 },
        { effect: 'soulWisp', dx: 20, dy: -4, vx: 0, vy: -14, lifeMs: 560 },
      ],
    },
    // Decoration: no health, no target, no effect on any hero (ADR 0011).
    summon: { kind: 'skeleton', dx: 18, dy: 1 },
  },
  {
    id: 'bard',
    name: 'Bard',
    role: 'caster',
    colors: 'teal + magenta',
    silhouette: 'big feathered hat, lute',
    strike: [{ effect: 'note', dx: 8, dy: -14, vx: 28, vy: -18, lifeMs: 700 }],
    ability: {
      id: 'chorus',
      name: 'Chorus',
      shots: [
        { effect: 'note', dx: 6, dy: -16, vx: 24, vy: -26, lifeMs: 760 },
        { effect: 'note', dx: 8, dy: -14, vx: 36, vy: -18, lifeMs: 760 },
        { effect: 'note', dx: 10, dy: -12, vx: 48, vy: -10, lifeMs: 760 },
      ],
    },
    summon: null,
  },
  {
    id: 'druid',
    name: 'Druid',
    role: 'caster',
    colors: 'earth brown + leaf green',
    silhouette: 'antler or leaf crown, gnarled wooden staff, beast beside it',
    strike: [{ effect: 'leaf', dx: 10, dy: -12, vx: 110, vy: -6, lifeMs: 600 }],
    ability: {
      id: 'wildCall',
      name: 'Wild Call',
      shots: [
        { effect: 'leaf', dx: 12, dy: -8, vx: 20, vy: -22, lifeMs: 640 },
        { effect: 'leaf', dx: 16, dy: -6, vx: 34, vy: -14, lifeMs: 640 },
      ],
    },
    // Decoration: no health, no target, no effect on any hero (ADR 0011).
    summon: { kind: 'beast', dx: 16, dy: 1 },
  },
  {
    id: 'monk',
    name: 'Monk',
    role: 'melee',
    colors: 'orange + cream',
    silhouette: 'headband, bare forearms, glowing fists, no weapon',
    // A static glow at the fist on the strike frame (the glowing fists are weapon-layer art).
    strike: [{ effect: 'chiOrb', dx: 11, dy: -9, vx: 0, vy: 0, lifeMs: 200 }],
    ability: {
      id: 'chiBurst',
      name: 'Chi Burst',
      shots: [
        { effect: 'chiBurst', dx: 18, dy: -10, vx: 0, vy: 0, lifeMs: 440 },
        { effect: 'chiOrb', dx: 10, dy: -9, vx: 0, vy: 0, lifeMs: 300 },
      ],
    },
    summon: null,
  },
  {
    id: 'artificer',
    name: 'Artificer',
    role: 'ranged',
    colors: 'copper + teal',
    silhouette: 'goggles on forehead, gear backpack, wrench, turret beside it',
    strike: [{ effect: 'wrench', dx: 10, dy: -12, vx: 140, vy: -4, lifeMs: 520 }],
    ability: {
      id: 'deployTurret',
      name: 'Deploy Turret',
      shots: [
        { effect: 'smokePuff', dx: 14, dy: -3, vx: 0, vy: 0, lifeMs: 360 },
        { effect: 'wrench', dx: 8, dy: -14, vx: 0, vy: -18, lifeMs: 500 },
      ],
    },
    // Decoration: no health, no target, no effect on any hero (ADR 0011).
    summon: { kind: 'turret', dx: 14, dy: 1 },
  },
  {
    id: 'berserker',
    name: 'Berserker',
    role: 'melee',
    colors: 'fur brown + war-paint red',
    silhouette: 'wild spiky hair, bare chest, oversized axe',
    // No strike effect: the axe swing is in the weapon layer.
    strike: [],
    // A timer-driven one-shot flourish, identical on every cast (H3 plan section 2.1).
    ability: {
      id: 'battleRoar',
      name: 'Battle Roar',
      shots: [
        { effect: 'warCry', dx: 0, dy: -3, vx: 0, vy: 0, lifeMs: 480 },
        { effect: 'smokePuff', dx: -6, dy: -1, vx: 0, vy: 0, lifeMs: 360 },
        { effect: 'smokePuff', dx: 8, dy: -1, vx: 0, vy: 0, lifeMs: 360 },
      ],
    },
    summon: null,
  },
] as const satisfies readonly ClassDef[];

const BY_ID: ReadonlyMap<string, ClassDef> = new Map(CLASSES.map((def) => [def.id, def]));

/** Throws only on a programming error (an id that is not in CLASS_IDS). */
export function classDef(id: ClassId): ClassDef {
  const def = BY_ID.get(id);
  if (def === undefined) {
    throw new RangeError('Unknown class');
  }
  return def;
}

const ROW_KEYS = 'ability,colors,id,name,role,silhouette,strike,summon';
const SHOT_KEYS = 'dx,dy,effect,lifeMs,vx,vy';
const MAX_SHOTS = 4;

function shotErrors(owner: string, shots: readonly EffectShot[]): string[] {
  const errors: string[] = [];
  if (shots.length > MAX_SHOTS) {
    errors.push(`${owner}: more than ${MAX_SHOTS} shots`);
  }
  for (const shot of shots) {
    if (Object.keys(shot).sort().join() !== SHOT_KEYS) {
      errors.push(`${owner}: a shot has an unexpected key set`);
    }
    if (!(EFFECT_IDS as readonly string[]).includes(shot.effect)) {
      errors.push(`${owner}: a shot uses an unknown effect`);
    }
    if (!(shot.lifeMs >= 100 && shot.lifeMs <= 1500)) {
      errors.push(`${owner}: a shot lifetime is outside 100..1500 ms`);
    }
    if (!(Math.abs(shot.dx) <= 40 && Math.abs(shot.dy) <= 24)) {
      errors.push(`${owner}: a shot offset is too far from the hero`);
    }
    if (!(Math.hypot(shot.vx, shot.vy) <= 240)) {
      errors.push(`${owner}: a shot is faster than 240 px/s`);
    }
  }
  return errors;
}

function summonErrors(owner: string, summon: SummonDef | null): string[] {
  if (summon === null) {
    return [];
  }
  if (summon === undefined || typeof summon !== 'object') {
    // A row missing the key entirely (JS callers, hand-built rows) is a key-set error.
    return [`${owner}: the summon has an unexpected key set`];
  }
  const errors: string[] = [];
  if (Object.keys(summon).sort().join() !== 'dx,dy,kind') {
    errors.push(`${owner}: the summon has an unexpected key set`);
  }
  if (!(SUMMON_IDS as readonly string[]).includes(summon.kind)) {
    errors.push(`${owner}: the summon uses an unknown kind`);
  }
  if (!(Math.abs(summon.dx) <= 40 && Math.abs(summon.dy) <= 24)) {
    errors.push(`${owner}: the summon offset is too far from the hero`);
  }
  return errors;
}

/** Pure check of a class table (tests only; not run at boot). Errors name ids, never content. */
export function validateClasses(defs: readonly ClassDef[]): readonly string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const def of defs) {
    if (seen.has(def.id)) {
      errors.push(`${def.id}: duplicate class id`);
    }
    seen.add(def.id);
    if (!(CLASS_IDS as readonly string[]).includes(def.id)) {
      errors.push(`${def.id}: id is not in CLASS_IDS`);
    }
    if (Object.keys(def).sort().join() !== ROW_KEYS) {
      errors.push(`${def.id}: unexpected key set`);
    }
    errors.push(...shotErrors(`${def.id}/strike`, def.strike));
    errors.push(...shotErrors(`${def.id}/ability`, def.ability.shots));
    errors.push(...summonErrors(def.id, def.summon));
  }
  for (const id of CLASS_IDS) {
    if (!seen.has(id)) {
      errors.push(`${id}: missing class row`);
    }
  }
  return errors;
}
