// The hero class table (H1; H2 and H3 grow it to 12). Classes are purely cosmetic: a look (art),
// and the effects a hero plays while attacking. A row deliberately holds no combat or resource
// number (Core invariant 1). docs/design/classes.md embeds a table generated from this file by
// `npm run docs:tables`; this module is pure data so the generator can import it without art.
import type { EffectId } from './effects';
import { EFFECT_IDS } from './effects';

export const CLASS_IDS = ['warrior', 'mage', 'archer', 'rogue'] as const;
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

const ROW_KEYS = 'ability,colors,id,name,role,silhouette,strike';
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
  }
  for (const id of CLASS_IDS) {
    if (!seen.has(id)) {
      errors.push(`${id}: missing class row`);
    }
  }
  return errors;
}
