// The class table (H1 plan test note 2): one row per id, the exact key set, bounded shots, and
// validateClasses rejecting crafted rows with an error that names the id.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CLASSES, CLASS_IDS, classDef, validateClasses } from '../../src/game/data/classes';
import type { ClassDef, EffectShot } from '../../src/game/data/classes';
import { EFFECT_IDS } from '../../src/game/data/effects';
import { SUMMON_IDS } from '../../src/game/data/summons';
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
  void it('has twelve rows, one per CLASS_IDS entry, in order, with unique ids', () => {
    assert.equal(rows.length, 12);
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
      [
        'Warrior',
        'Mage',
        'Archer',
        'Rogue',
        'Cleric',
        'Paladin',
        'Necromancer',
        'Bard',
        'Druid',
        'Monk',
        'Artificer',
        'Berserker',
      ],
    );
  });

  void it('every row has exactly the keys id, name, role, colors, silhouette, strike, ability, summon', () => {
    for (const r of rows) {
      assert.deepEqual(Object.keys(r).sort(), [
        'ability',
        'colors',
        'id',
        'name',
        'role',
        'silhouette',
        'strike',
        'summon',
      ]);
      assert.deepEqual(Object.keys(r.ability).sort(), ['id', 'name', 'shots']);
      for (const s of allShots(r)) {
        assert.deepEqual(Object.keys(s).sort(), ['dx', 'dy', 'effect', 'lifeMs', 'vx', 'vy']);
      }
    }
  });

  void it('summon is null for nine rows; necromancer, druid, artificer own one kind each', () => {
    const expected: Record<string, { kind: string; dx: number; dy: number }> = {
      necromancer: { kind: 'skeleton', dx: 18, dy: 1 },
      druid: { kind: 'beast', dx: 16, dy: 1 },
      artificer: { kind: 'turret', dx: 14, dy: 1 },
    };
    for (const r of rows) {
      const want = expected[r.id];
      if (want !== undefined) {
        assert.deepEqual(r.summon, want, r.id);
        assert.deepEqual(Object.keys(r.summon ?? {}).sort(), ['dx', 'dy', 'kind']);
        assert.ok(Math.abs(want.dx) <= 40 && Math.abs(want.dy) <= 24);
      } else {
        assert.equal(r.summon, null, r.id);
      }
    }
    assert.equal(rows.filter((r) => r.summon !== null).length, 3);
    const kinds = rows.flatMap((r) => (r.summon === null ? [] : [r.summon.kind]));
    assert.deepEqual(
      [...kinds].sort(),
      [...SUMMON_IDS].sort(),
      'each kind used by exactly one class',
    );
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

  void it('no shot moves backward (vx >= 0); only the self-centered Cleric blessing and Berserker roar sit behind or on the hero', () => {
    for (const r of rows) {
      for (const s of allShots(r)) {
        assert.ok(s.vx >= 0, `${r.id} ${s.effect} vx`);
        if (r.id !== 'cleric' && r.id !== 'berserker') {
          assert.ok(s.dx >= 0, `${r.id} ${s.effect} dx`);
        } else {
          // Plan section 3: the blessing and the roar (a ring and two puffs at the feet) are
          // centered on the caster, within a few pixels.
          assert.ok(Math.abs(s.dx) <= 8, `${r.id} ${s.effect} dx`);
        }
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
    assert.equal(by['cleric']?.strike.length, 0);
    assert.equal(by['paladin']?.strike.length, 0);
    assert.equal(by['necromancer']?.strike.length, 1);
    assert.equal(by['necromancer']?.strike[0]?.effect, 'soulWisp');
    assert.equal(by['bard']?.strike.length, 1);
    assert.equal(by['bard']?.strike[0]?.effect, 'note');
    assert.equal(by['druid']?.strike[0]?.effect, 'leaf');
    assert.equal(by['monk']?.strike[0]?.effect, 'chiOrb');
    assert.equal(by['artificer']?.strike[0]?.effect, 'wrench');
    assert.equal(by['berserker']?.strike.length, 0, 'the axe swing is art, not an effect');
    assert.deepEqual(
      rows.map((r) => r.ability.id),
      [
        'whirlwind',
        'arcaneBurst',
        'volley',
        'daggerFlurry',
        'blessing',
        'radiantSmite',
        'boneCall',
        'chorus',
        'wildCall',
        'chiBurst',
        'deployTurret',
        'battleRoar',
      ],
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
      () => classDef('ranger' as never),
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

  void it('rejects an extra summon key, an unknown summon kind, and a far summon offset', () => {
    const extra = copy('necromancer');
    (extra.summon as unknown as Record<string, unknown>)['hp'] = 5;
    let errors = validateClasses(withRow('necromancer', extra));
    assert.equal(errors.length, 1, errors.join('\n'));
    assert.match(errors[0] ?? '', /^necromancer: the summon has an unexpected key set/);

    const kind = copy('necromancer');
    (kind.summon as unknown as { kind: string }).kind = 'dragon';
    errors = validateClasses(withRow('necromancer', kind));
    assert.equal(errors.length, 1, errors.join('\n'));
    assert.match(errors[0] ?? '', /^necromancer: the summon uses an unknown kind/);
    assert.doesNotMatch(errors[0] ?? '', /dragon/);

    const far = copy('necromancer');
    (far.summon as unknown as { dx: number }).dx = 60;
    errors = validateClasses(withRow('necromancer', far));
    assert.equal(errors.length, 1, errors.join('\n'));
    assert.match(errors[0] ?? '', /^necromancer: the summon offset is too far/);

    const farY = copy('necromancer');
    (farY.summon as unknown as { dy: number }).dy = 25;
    assert.equal(validateClasses(withRow('necromancer', farY)).length, 1);
  });

  void it('rejects a row missing the summon key', () => {
    const row = copy('mage');
    delete (row as Mutable).summon;
    assert.match(validateClasses(withRow('mage', row)).join('\n'), /^mage: unexpected key set/);
  });

  void it('rejects a missing class row', () => {
    const errors = validateClasses(rows.filter((r) => r.id !== 'archer'));
    assert.deepEqual(errors, ['archer: missing class row']);
  });

  void it('rejects an id that is not in CLASS_IDS', () => {
    const row = copy('mage');
    (row as { id: string }).id = 'ranger';
    const errors = validateClasses([...rows.filter((r) => r.id !== 'mage'), row]);
    assert.ok(
      errors.some((e) => /^ranger: id is not in CLASS_IDS/.test(e)),
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
