// A data-driven class hero (H1, decision H1-2): one class, any of the rows in data/classes.ts.
// Everything a class does is cosmetic: it wears its look and spawns pooled effects while the
// party attacks. The hooks receive only the World, which has no roster, so nothing here can reach
// Hero.applyAgentState or any lifecycle (Core invariants 1 and 2). There is no target and no
// hit: shots fly into the empty corridor and end in a spark. The ability interval is a hidden
// seeded timer that is never drawn or exposed.
import { classFor } from '../data/classMap';
import { classDef } from '../data/classes';
import type { ClassDef, EffectShot } from '../data/classes';
import { ABILITY_INTERVAL_MAX_MS, ABILITY_INTERVAL_MIN_MS } from '../data/tuning';
import type { HeroLayerSet } from '../sprites/spriteTypes';
import { Hero } from './Hero';
import type { HeroInit } from './Hero';
import type { World } from './Entity';
import type { SummonPose } from './Summon';

export class ClassHero extends Hero {
  readonly #def: ClassDef;
  // Hidden schedule: attack time since the last cast, and the interval to wait. -1 = not yet drawn.
  #sinceCastMs = 0;
  #nextCastMs = -1;

  constructor(init: HeroInit, def: ClassDef) {
    super(init);
    this.#def = def;
  }

  /** Class layers, or the base hero when the art set has none for this class. */
  protected override heroLayers(world: World): HeroLayerSet {
    return world.cache.classLayers(this.#def.id) ?? world.cache.baseHero;
  }

  protected override onAttackStrike(world: World): void {
    this.#spawn(this.#def.strike, world);
  }

  /** The timer advances only while attacking (this is called only in the attack phase). */
  protected override shouldCastAbility(dtMs: number, world: World): boolean {
    if (this.#nextCastMs < 0) {
      this.#nextCastMs = this.#nextInterval(world);
    }
    this.#sinceCastMs += dtMs;
    if (this.#sinceCastMs < this.#nextCastMs) {
      return false;
    }
    this.#sinceCastMs = 0;
    this.#nextCastMs = this.#nextInterval(world);
    return true;
  }

  protected override onAbilityRelease(world: World): void {
    this.#spawn(this.#def.ability.shots, world);
    const summon = this.#def.summon;
    if (summon !== null) {
      const sign = this.faceRight ? 1 : -1;
      world.summons.raise(
        this.slot,
        summon.kind,
        Math.floor(this.x) + summon.dx * sign,
        Math.floor(this.y) + summon.dy,
        this.faceRight,
      );
    }
  }

  override update(dtMs: number, world: World): void {
    super.update(dtMs, world);
    if (this.#def.summon !== null) {
      this.#tendSummon(world);
    }
  }

  /**
   * Pushes plain numbers into the pool while fighting (the lease). Reads only phase, slot,
   * position, and facing; never the lifecycle (ADR 0011).
   */
  #tendSummon(world: World): void {
    const summon = this.#def.summon;
    if (summon === null) {
      return;
    }
    const phase = this.phase;
    let pose: SummonPose;
    if (phase === 'advance') {
      pose = 'walk';
    } else if (phase === 'attack' || phase === 'ability') {
      pose = 'attack';
    } else {
      return;
    }
    const sign = this.faceRight ? 1 : -1;
    world.summons.renew(
      this.slot,
      summon.kind,
      Math.floor(this.x) + summon.dx * sign,
      Math.floor(this.y) + summon.dy,
      this.faceRight,
      pose,
    );
  }

  #nextInterval(world: World): number {
    return (
      ABILITY_INTERVAL_MIN_MS + world.rng() * (ABILITY_INTERVAL_MAX_MS - ABILITY_INTERVAL_MIN_MS)
    );
  }

  /** Offsets are from the floored foot pixel, mirrored when the hero faces left. */
  #spawn(shots: readonly EffectShot[], world: World): void {
    const sign = this.faceRight ? 1 : -1;
    const x = Math.floor(this.x);
    const y = Math.floor(this.y);
    for (const shot of shots) {
      world.effects.spawn(
        shot.effect,
        x + shot.dx * sign,
        y + shot.dy,
        shot.vx * sign,
        shot.vy,
        shot.lifeMs,
        sign < 0,
      );
    }
  }
}

/**
 * The default HeroFactory from H1: the class comes from the id alone (classFor), so it is the
 * same after a replacement, a snapshot rebuild, or a webview reload.
 */
export function createHero(init: HeroInit): Hero {
  const id = classFor(init.info.id);
  return new ClassHero({ ...init, look: { ...init.look, classId: id } }, classDef(id));
}
