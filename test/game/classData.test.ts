// The class table (H1 plan test note 2): one row per id, the exact key set, bounded shots, and
// validateClasses rejecting crafted rows with an error that names the id.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CLASSES, CLASS_IDS, classDef, validateClasses } from '../../src/game/data/classes';
import type { ClassDef, EffectShot } from '../../src/game/data/classes';
import { EFFECT_IDS } from '../../src/game/data/effects';
import { readText } from '../support/repo';

const rows = CLASSES as readonly ClassDef[];
type Shot = { -readonly [K in keyof EffectShot]: EffectShot[K] };
type Mutable = { -readonly [K in keyof ClassDef]?: ClassDef[K] } & Record<string, unknown>;
const allShots = (def: ClassDef): readonly EffectShot[] => [...def.strike, ...def.ability.shots];

/** A deep mutable copy of one shipped row. */
function copy(id: string): ClassDef & Record<string, unknown> {
  const row = rows.find((r) => r.id === id);
  assert.ok(row);
  return structuredClone(row) as unknown as ClassDef & Record<string, unknown>;
}

function withRow(replace: string, row: unknown): readonly ClassDef[] {
  return rows.map((r) => (r.id === replace ? (row as ClassDef) : r));
}

void describe('CLASSES', () => {
  void it('has one row per CLASS_IDS entry, in order, with unique ids', () => {
    assert.deepEqual(
      rows.map((r) => r.id),
      [...CLASS_IDS],
    );
    assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  });

  void it('names equal the art style guide names', () => {
    const guide = readText('docs/design/art-style-guide.md');
    for (const r of rows) {
      assert.match(guide, new RegExp(`\\|\\s*${r.name}\\s*\\|`), r.name);
    }
    assert.deepEqual(
      rows.map((r) => r.name),
      ['Warrior', 'Mage', 'Archer', 'Rogue'],
    );
  });

  void it('every row has exactly the keys id, name, role, colors, silhouette, strike, ability', () => {
    for (const r of rows) {
      assert.deepEqual(Object.keys(r).sort(), [
        'ability',
        'colors',
        'id',
        'name',
        'role',
        'silhouette',
        'strike',
      ]);
      assert.deepEqual(Object.keys(r.ability).sort(), ['id', 'name', 'shots']);
      for (const s of allShots(r)) {
        assert.deepEqual(Object.keys(s).sort(), ['dx', 'dy', 'effect', 'lifeMs', 'vx', 'vy']);
      }
    }
  });

  void it('roles are melee, ranged, or caster', () => {
    for (const r of rows) {
      assert.ok(['melee', 'ranged', 'caster'].includes(r.role), r.role);
    }
  });

  void it('every shot uses a known effect, lives 100 to 1500 ms, stays within 40 x 24 px, and is at most 240 px/s', () => {
    for (const r of rows) {
      for (const s of allShots(r)) {
        assert.ok((EFFECT_IDS as readonly string[]).includes(s.effect), `${r.id} ${s.effect}`);
        assert.ok(s.lifeMs >= 100 && s.lifeMs <= 1500, `${r.id} life ${s.lifeMs}`);
        assert.ok(Math.abs(s.dx) <= 40 && Math.abs(s.dy) <= 24, `${r.id} offset`);
        assert.ok(Math.hypot(s.vx, s.vy) <= 240, `${r.id} speed`);
      }
    }
  });

  void it('at most 4 shots per list, and every ability has at least one', () => {
    for (const r of rows) {
      assert.ok(r.strike.length <= 4);
      assert.ok(r.ability.shots.length >= 1 && r.ability.shots.length <= 4);
    }
  });

  void it('the shots point forward (never at a hero): vx is not negative and dx is not behind the hero', () => {
    for (const r of rows) {
      for (const s of allShots(r)) {
        assert.ok(s.vx >= 0 && s.dx >= 0, `${r.id} ${s.effect}`);
      }
    }
  });

  void it('the strike and ability roles match the documented design', () => {
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    assert.equal(by['warrior']?.strike.length, 0);
    assert.equal(by['rogue']?.strike.length, 0);
    assert.equal(by['mage']?.strike[0]?.effect, 'orbBolt');
    assert.equal(by['archer']?.strike[0]?.effect, 'arrow');
    assert.equal(by['archer']?.ability.shots.length, 3);
    assert.deepEqual(
      rows.map((r) => r.ability.id),
      ['whirlwind', 'arcaneBurst', 'volley', 'daggerFlurry'],
    );
  });

  void it('every effect id is used by some class (no orphan effect)', () => {
    const used = new Set(rows.flatMap((r) => allShots(r).map((s) => s.effect)));
    assert.deepEqual([...used].sort(), [...EFFECT_IDS].sort());
  });

  void it('classDef finds every id and throws a fixed RangeError for an unknown one', () => {
    for (const id of CLASS_IDS) {
      assert.equal(classDef(id).id, id);
    }
    assert.throws(
      () => classDef('paladin' as never),
      (e: unknown) => e instanceof RangeError && e.message === 'Unknown class',
    );
  });
});

void describe('validateClasses', () => {
  void it('accepts the shipped table', () => {
    assert.deepEqual(validateClasses(rows), []);
  });

  void it('rejects an unknown effect with one error naming the class', () => {
    const row = copy('mage');
    (row.strike[0] as { effect: string }).effect = 'fireball';
    const errors = validateClasses(withRow('mage', row));
    assert.equal(errors.length, 1, errors.join('\n'));
    assert.match(errors[0] ?? '', /^mage\/strike: .*unknown effect/);
    assert.doesNotMatch(errors[0] ?? '', /fireball/);
  });

  void it('rejects a duplicate id with one error', () => {
    const errors = validateClasses([...rows, copy('warrior')]);
    assert.equal(errors.length, 1, errors.join('\n'));
    assert.match(errors[0] ?? '', /^warrior: duplicate class id/);
  });

  void it('rejects an extra key (a field such as hp cannot be added unnoticed)', () => {
    for (const key of ['hp', 'mana', 'health', 'power']) {
      const row = copy('rogue');
      row[key] = 5;
      const errors = validateClasses(withRow('rogue', row));
      assert.equal(errors.length, 1, `${key}: ${errors.join('\n')}`);
      assert.match(errors[0] ?? '', /^rogue: unexpected key set/);
      assert.doesNotMatch(errors[0] ?? '', new RegExp(key));
    }
  });

  void it('rejects a missing key and an extra shot key', () => {
    const missing = copy('rogue');
    delete (missing as Mutable).silhouette;
    assert.match(
      validateClasses(withRow('rogue', missing)).join('\n'),
      /^rogue: unexpected key set/,
    );
    const shot = copy('archer');
    (shot.strike[0] as unknown as Record<string, unknown>)['damage'] = 3;
    const errors = validateClasses(withRow('archer', shot));
    assert.equal(errors.length, 1);
    assert.match(errors[0] ?? '', /^archer\/strike: a shot has an unexpected key set/);
  });

  void it('rejects a missing class row', () => {
    const errors = validateClasses(rows.filter((r) => r.id !== 'archer'));
    assert.deepEqual(errors, ['archer: missing class row']);
  });

  void it('rejects an id that is not in CLASS_IDS', () => {
    const row = copy('mage');
    (row as { id: string }).id = 'paladin';
    const errors = validateClasses([...rows.filter((r) => r.id !== 'mage'), row]);
    assert.ok(
      errors.some((e) => /^paladin: id is not in CLASS_IDS/.test(e)),
      errors.join('\n'),
    );
    assert.ok(errors.some((e) => e === 'mage: missing class row'));
  });

  void it('rejects out-of-bounds lifetime, offset, speed, and shot count', () => {
    const cases: [string, (s: Shot) => void, RegExp][] = [
      ['short life', (s) => (s.lifeMs = 99), /lifetime/],
      ['long life', (s) => (s.lifeMs = 1501), /lifetime/],
      ['far dx', (s) => (s.dx = 41), /offset/],
      ['far dy', (s) => (s.dy = -25), /offset/],
      ['fast', (s) => ((s.vx = 200), (s.vy = 140)), /faster than 240/],
      ['NaN life', (s) => (s.lifeMs = NaN), /lifetime/],
    ];
    for (const [label, mutate, pattern] of cases) {
      const row = copy('archer');
      mutate(row.strike[0] as Shot);
      const errors = validateClasses(withRow('archer', row));
      assert.equal(errors.length, 1, `${label}: ${errors.join('\n')}`);
      assert.match(errors[0] ?? '', pattern, label);
      assert.match(errors[0] ?? '', /^archer\/strike/, label);
    }
    const crowd = copy('archer');
    (crowd.ability.shots as Shot[]).push(...crowd.ability.shots, ...crowd.ability.shots);
    assert.match(
      validateClasses(withRow('archer', crowd)).join('\n'),
      /archer\/ability: more than 4 shots/,
    );
  });
});
