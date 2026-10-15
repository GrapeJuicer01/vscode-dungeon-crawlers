// Look-alike policy (E3 plan section 7, note 4; moved and generalized from stagesE2Art.test.ts).
// Reads the template maps directly (ENEMY_SPRITES, SUMMON_SPRITES), so it needs no wiring. The
// pixel-artist can run the same policy on unwired maps: `node test/support/lookAlikesReport.mjs`
// (see docs/engineering/testing-strategy.md). Metrics and the (now empty) pin ratchets live in
// test/support/lookAlikes.ts, the one source of truth.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ENEMIES } from '../../src/game/data/enemies';
import { ENEMY_SPRITES } from '../../src/game/sprites/enemyTemplates';
import { SUMMON_SPRITES } from '../../src/game/sprites/summonTemplates';
import {
  ALL_PINS,
  BASELINE_IDS,
  IOU_LIMIT,
  LEGACY_OVER,
  KNOWN_OVER,
  OVERLAP_LIMIT,
  SAME_STAGE_LIMIT,
  evaluate,
  findPin,
  iou,
  opaquePixels,
  overlap,
  sameSizePairs,
} from '../support/lookAlikes';
import type { LookAlikeEntry, PairMetrics } from '../support/lookAlikes';
import type { SpriteTemplate } from '../../src/game/sprites/spriteTypes';

const stageOf = new Map(ENEMIES.map((r) => [r.id, r.stage]));
const entries: LookAlikeEntry[] = ENEMIES.map((r) => {
  const template = ENEMY_SPRITES[r.id];
  assert.ok(template, `${r.id} has a template`);
  return { id: r.id, stage: stageOf.get(r.id)!, template };
});
const byTier = (tier: string): LookAlikeEntry[] =>
  entries.filter((e) => ENEMIES.find((r) => r.id === e.id)!.tier === tier);
const minionIds = new Set(byTier('minion').map((e) => e.id));
const pairs = sameSizePairs(entries);
const get = (a: string, b: string): PairMetrics => {
  const p = pairs.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  assert.ok(p, `${a} vs ${b} is a same-size pair`);
  return p;
};
const tpl = (rows: string[], anchor = { x: 0, y: 0 }): SpriteTemplate => ({
  id: 't',
  w: rows[0]!.length,
  h: rows.length,
  anchor,
  animations: { idle: [rows] },
});

void describe('look-alike metrics', () => {
  void it('overlap is over the smaller count and IoU over the union, aligned at the anchor', () => {
    const a = tpl(['XX..', 'XX..']); // 4 px
    const b = tpl(['XXXX', 'XXXX']); // 8 px, contains a
    assert.equal(overlap(a, b), 1);
    assert.equal(iou(a, b), 0.5);
    assert.equal(overlap(a, a), 1);
    assert.equal(iou(a, a), 1);
    const c = tpl(['....', '..XX']);
    assert.equal(overlap(a, c), 0);
    assert.equal(iou(a, c), 0);
  });

  void it('differently sized frames align on the anchor, not the corner', () => {
    const small = tpl(['X'], { x: 0, y: 0 });
    const big = tpl(['..', '.X'], { x: 1, y: 1 });
    assert.equal(opaquePixels(small).size, 1);
    assert.equal(overlap(small, big), 1);
    assert.equal(overlap(tpl(['X.'], { x: 0, y: 0 }), tpl(['X.'], { x: 1, y: 0 })), 0);
  });

  void it('the evaluator rejects a crafted clone, a high-IoU pair, and a same-stage pair', () => {
    const pair = (o: number, i: number, same = false): PairMetrics => ({
      a: 'x',
      b: 'y',
      stageA: 1,
      stageB: same ? 1 : 2,
      overlap: o,
      iou: i,
      sameStage: same,
    });
    const ids = new Set(['x', 'y']);
    assert.deepEqual(evaluate([pair(0.5, 0.4)], ids, {}).violations, []);
    assert.equal(evaluate([pair(0.85, 0.5)], ids, {}).violations.length, 1);
    assert.equal(evaluate([pair(0.84, 0.81)], ids, {}).violations.length, 1);
    assert.deepEqual(evaluate([pair(0.84, 0.8)], ids, {}).violations, []);
    assert.equal(evaluate([pair(0.76, 0.5, true)], ids, {}).violations.length, 1);
    assert.deepEqual(evaluate([pair(0.74, 0.5, true)], ids, {}).violations, []);
    // A pinned pair may hold but not worsen on either metric, and goes stale once it is under both limits.
    const pins = { 'x vs y': { overlap: 0.9, iou: 0.85 } };
    assert.deepEqual(evaluate([pair(0.9, 0.85)], ids, pins).violations, []);
    assert.equal(evaluate([pair(0.92, 0.85)], ids, pins).violations.length, 1);
    assert.equal(evaluate([pair(0.9, 0.9)], ids, pins).violations.length, 1);
    assert.deepEqual(evaluate([pair(0.8, 0.7)], ids, pins).stalePins, ['x vs y']);
    assert.deepEqual(evaluate([pair(0.9, 0.85)], ids, pins).stalePins, []);
  });

  void it('the policy constants match the plan', () => {
    assert.equal(OVERLAP_LIMIT, 0.85);
    assert.equal(IOU_LIMIT, 0.8);
    assert.equal(SAME_STAGE_LIMIT, 0.75);
    assert.deepEqual(Object.keys(KNOWN_OVER), [], 'the ten E2 pairs were all reworked away');
    assert.deepEqual(Object.keys(LEGACY_OVER), [], 'the legacy pins were all reworked away');
    assert.deepEqual(Object.keys(ALL_PINS), [], 'the ratchet is empty');
    assert.equal(
      Object.keys(ALL_PINS).length,
      Object.keys(KNOWN_OVER).length + Object.keys(LEGACY_OVER).length,
      'no key in both ratchets',
    );
  });
});

void describe('look-alike policy on the wired enemy templates', () => {
  void it('compares every same-size pair of every tier (minions 16x16, elites 24x24, bosses 48x48)', () => {
    const minions = byTier('minion').length;
    const expected = [minions, byTier('elite').length, byTier('boss').length]
      .map((n) => (n * (n - 1)) / 2)
      .reduce((s, n) => s + n, 0);
    assert.equal(pairs.length, expected, 'no tier mixes sizes');
    for (const e of entries) assert.ok(e.template.w > 0 && e.template.h > 0, e.id);
  });

  void it('no two enemies share an idle frame (exact duplicates)', () => {
    const seen = new Map<string, string>();
    for (const e of entries) {
      const key = e.template.animations['idle']![0]!.join('/');
      assert.ok(!seen.has(key), `${e.id} duplicates ${seen.get(key)}`);
      seen.set(key, e.id);
    }
  });

  void it('every same-size pair is under 0.85 overlap and at most 0.80 IoU; same-stage minions under 0.75; the pinned pairs may not worsen', () => {
    assert.deepEqual(evaluate(pairs, minionIds).violations, []);
  });

  void it('every pinned entry (KNOWN_OVER and LEGACY_OVER) is still measured and still exceeds (a reworked pair must lose its pin)', () => {
    const ev = evaluate(pairs, minionIds);
    assert.deepEqual(
      [...new Set(ev.seenPins)].sort(),
      Object.keys(ALL_PINS).sort(),
      'stale or unmeasured pin',
    );
    assert.deepEqual(ev.stalePins, [], 'stale pin');
  });

  void it('pins are only for pairs among the 20 E1/E2 enemies, never for an enemy added later', () => {
    const base = new Set(BASELINE_IDS);
    for (const key of Object.keys(ALL_PINS)) {
      for (const id of key.split(' vs '))
        assert.ok(base.has(id), `${key}: ${id} is not a baseline enemy`);
    }
  });

  void it('any pinned pairs (none today) are recorded against their measured values and still exceed', () => {
    for (const key of Object.keys(ALL_PINS)) {
      const [a, b] = key.split(' vs ') as [string, string];
      const m = get(a, b);
      const pin = findPin(ALL_PINS, a, b)!.pin;
      const sameStageOver =
        m.sameStage && minionIds.has(a) && minionIds.has(b) && m.overlap >= SAME_STAGE_LIMIT;
      assert.ok(
        m.overlap >= OVERLAP_LIMIT || m.iou > IOU_LIMIT || sameStageOver,
        `${key} still exceeds`,
      );
      assert.ok(m.overlap <= pin.overlap + 0.0005, `${key} overlap ${m.overlap}`);
      assert.ok(m.iou <= pin.iou + 0.0005, `${key} iou ${m.iou}`);
    }
  });

  void it('named look-alikes stay under the limits', () => {
    for (const [a, b] of [
      ['tomb-scarab', 'ore-beetle'],
      ['wailing-ghost', 'cave-bat'],
    ] as const) {
      const m = get(a, b);
      assert.ok(m.overlap < OVERLAP_LIMIT, `${a} vs ${b} overlap ${m.overlap}`);
      assert.ok(m.iou <= IOU_LIMIT, `${a} vs ${b} iou ${m.iou}`);
    }
  });

  void it('the post-rework tight pairs stay under the limits, by name (measured overlap in the label)', () => {
    const tight: ReadonlyArray<readonly [string, string, number]> = [
      ['ore-beetle', 'tomb-scarab', 0.828],
      ['cellar-rat', 'tomb-scarab', 0.828],
      ['goblin-scout', 'frost-hare', 0.813],
      ['crate-mimic', 'jelly-cube', 0.844],
      ['jelly-cube', 'crypt-mummy', 0.809],
      ['rime-penguin', 'ember-imp', 0.847],
      ['rime-penguin', 'lantern-wraith', 0.84],
      ['frost-hare', 'snow-sentry', 0.737],
    ];
    for (const [a, b, measured] of tight) {
      const m = get(a, b);
      assert.ok(m.overlap < OVERLAP_LIMIT, `${a} vs ${b} overlap ${m.overlap}`);
      assert.ok(m.iou <= IOU_LIMIT, `${a} vs ${b} iou ${m.iou}`);
      // Guard against drift toward the limit: no worse than the measurement plus rounding.
      assert.ok(m.overlap <= measured + 0.0005, `${a} vs ${b} overlap ${m.overlap} > ${measured}`);
      if (m.sameStage) {
        assert.ok(m.overlap < SAME_STAGE_LIMIT, `${a} vs ${b} same-stage overlap ${m.overlap}`);
      }
    }
    assert.equal(get('frost-hare', 'snow-sentry').sameStage, true);
  });

  void it('Bone Soldier vs the skeleton summon (16x20, aligned at the anchor) stays under the limits', () => {
    const skeleton = SUMMON_SPRITES['skeleton'];
    assert.ok(skeleton !== undefined);
    const soldier = ENEMY_SPRITES['bone-soldier']!;
    assert.ok(overlap(soldier, skeleton) < OVERLAP_LIMIT, `overlap ${overlap(soldier, skeleton)}`);
    assert.ok(iou(soldier, skeleton) <= IOU_LIMIT, `iou ${iou(soldier, skeleton)}`);
  });
});

void describe('E3 look-alike policy: every new enemy satisfies the full policy, with no pin', () => {
  const E3_IDS = [
    'thorn-sprout',
    'moss-wolf',
    'bramble-pixie',
    'ancient-treant',
    'elder-dryad',
    'ember-imp',
    'slag-snail',
    'magma-crab',
    'furnace-guard',
    'molten-colossus',
  ];

  void it('the ten E3 enemies are all measured, and no pair involving one is pinned', () => {
    for (const id of E3_IDS) {
      assert.ok(
        entries.some((e) => e.id === id),
        id,
      );
      assert.ok(
        !Object.keys(ALL_PINS).some((key) => key.split(' vs ').includes(id)),
        `${id} must not be pinned`,
      );
    }
  });

  void it('every pair that involves an E3 enemy is under 0.85 overlap and at most 0.80 IoU', () => {
    const involved = pairs.filter((p) => E3_IDS.includes(p.a) || E3_IDS.includes(p.b));
    // 12 older + 5 new minions per new minion, 5 other elites, 5 other bosses: a floor, not a count.
    assert.ok(involved.length >= 17 * 6, `${involved.length} pairs`);
    for (const p of involved) {
      assert.ok(p.overlap < OVERLAP_LIMIT, `${p.a} vs ${p.b} overlap ${p.overlap}`);
      assert.ok(p.iou <= IOU_LIMIT, `${p.a} vs ${p.b} iou ${p.iou}`);
    }
  });

  void it('same-stage minions of Stage 5 and Stage 6 are under 0.75 overlap', () => {
    for (const stage of [5, 6]) {
      const same = pairs.filter(
        (p) => p.stageA === stage && p.stageB === stage && minionIds.has(p.a) && minionIds.has(p.b),
      );
      assert.equal(same.length, 3, `stage ${stage}: three minions, three pairs`);
      for (const p of same) assert.ok(p.overlap < 0.75, `${p.a} vs ${p.b} ${p.overlap}`);
    }
  });

  void it('the named E3 pairs stay under the limits', () => {
    const named: [string, string][] = [
      ['bramble-pixie', 'wailing-ghost'],
      ['bramble-pixie', 'cave-bat'],
      ['moss-wolf', 'cellar-rat'],
      ['moss-wolf', 'toxic-toad'],
      ['slag-snail', 'green-slime'],
      ['ember-imp', 'goblin-scout'],
      ['thorn-sprout', 'spore-shroom'],
      ['magma-crab', 'ore-beetle'],
      ['magma-crab', 'web-spider'],
      ['ancient-treant', 'crypt-mummy'],
      ['ancient-treant', 'rock-golem'],
      ['furnace-guard', 'rock-golem'],
      ...['rat-king', 'goblin-foreman', 'ooze-queen', 'tomb-lich'].flatMap(
        (old): [string, string][] => [
          ['elder-dryad', old],
          ['molten-colossus', old],
        ],
      ),
      ['elder-dryad', 'molten-colossus'],
    ];
    for (const [a, b] of named) {
      const m = get(a, b);
      assert.ok(m.overlap < OVERLAP_LIMIT, `${a} vs ${b} overlap ${m.overlap}`);
      assert.ok(m.iou <= IOU_LIMIT, `${a} vs ${b} iou ${m.iou}`);
    }
  });
});

void describe('E4 look-alike policy: every new enemy satisfies the full policy, with no pin', () => {
  const E4_IDS = [
    'rime-penguin',
    'frost-hare',
    'snow-sentry',
    'snow-yeti',
    'glacier-mammoth',
    'lantern-wraith',
    'shard-cluster',
    'mirror-mimic',
    'gloom-stag',
    'eclipse-warden',
  ];

  void it('after E5 the matrix covers 30 minions, 10 elites, and 10 bosses; BASELINE_IDS is still the 20 E1/E2 ids', () => {
    assert.equal(byTier('minion').length, 30);
    assert.equal(byTier('elite').length, 10);
    assert.equal(byTier('boss').length, 10);
    assert.equal(BASELINE_IDS.length, 20);
    for (const id of E4_IDS) assert.ok(!BASELINE_IDS.includes(id), id);
  });

  void it('the ten E4 enemies are all measured, and no pair involving one is pinned', () => {
    for (const id of E4_IDS) {
      assert.ok(
        entries.some((e) => e.id === id),
        id,
      );
      assert.ok(
        !Object.keys(ALL_PINS).some((key) => key.split(' vs ').includes(id)),
        `${id} must not be pinned`,
      );
    }
    assert.deepEqual(Object.keys(LEGACY_OVER), [], 'the legacy ratchet stays empty');
  });

  void it('every pair that involves an E4 enemy is under 0.85 overlap and at most 0.80 IoU', () => {
    const involved = pairs.filter((p) => E4_IDS.includes(p.a) || E4_IDS.includes(p.b));
    // 23 other minions per new minion (less the shared pairs), 7 other elites, 7 other bosses.
    assert.ok(involved.length >= 140, `${involved.length} pairs`);
    for (const p of involved) {
      assert.ok(p.overlap < OVERLAP_LIMIT, `${p.a} vs ${p.b} overlap ${p.overlap}`);
      assert.ok(p.iou <= IOU_LIMIT, `${p.a} vs ${p.b} iou ${p.iou}`);
    }
  });

  void it('same-stage minions of Stage 7 and Stage 8 are under 0.75 overlap (Frost Hare vs Snow Sentry is the tight one)', () => {
    for (const stage of [7, 8]) {
      const same = pairs.filter(
        (p) => p.stageA === stage && p.stageB === stage && minionIds.has(p.a) && minionIds.has(p.b),
      );
      assert.equal(same.length, 3, `stage ${stage}: three minions, three pairs`);
      for (const p of same)
        assert.ok(p.overlap < SAME_STAGE_LIMIT, `${p.a} vs ${p.b} ${p.overlap}`);
    }
    assert.ok(get('frost-hare', 'snow-sentry').overlap < SAME_STAGE_LIMIT);
  });

  void it('the four tight-margin pairs stay under the limits (rime-penguin vs ember-imp and vs lantern-wraith, crate-mimic vs gloom-stag, frost-hare vs snow-sentry)', () => {
    for (const [a, b] of [
      ['rime-penguin', 'ember-imp'],
      ['rime-penguin', 'lantern-wraith'],
      ['crate-mimic', 'gloom-stag'],
      ['frost-hare', 'snow-sentry'],
    ] as const) {
      const m = get(a, b);
      assert.ok(m.overlap < OVERLAP_LIMIT, `${a} vs ${b} overlap ${m.overlap}`);
      assert.ok(m.iou <= IOU_LIMIT, `${a} vs ${b} iou ${m.iou}`);
    }
  });

  void it('the named E4 pairs stay under the limits', () => {
    const named: [string, string][] = [
      ...['wailing-ghost', 'goblin-scout', 'bone-soldier', 'spore-shroom'].map(
        (o): [string, string] => ['rime-penguin', o],
      ),
      ...['moss-wolf', 'toxic-toad', 'cellar-rat', 'cave-bat'].map((o): [string, string] => [
        'frost-hare',
        o,
      ]),
      ...['green-slime', 'spore-shroom', 'thorn-sprout'].map((o): [string, string] => [
        'snow-sentry',
        o,
      ]),
      ...['wailing-ghost', 'bramble-pixie', 'cave-bat'].map((o): [string, string] => [
        'lantern-wraith',
        o,
      ]),
      ...['bramble-pixie', 'cave-bat'].map((o): [string, string] => ['shard-cluster', o]),
      ...['rock-golem', 'crypt-mummy', 'furnace-guard', 'crate-mimic', 'ancient-treant'].map(
        (o): [string, string] => ['snow-yeti', o],
      ),
      ...['ancient-treant', 'jelly-cube', 'crypt-mummy'].map((o): [string, string] => [
        'gloom-stag',
        o,
      ]),
      ...[
        'rat-king',
        'goblin-foreman',
        'ooze-queen',
        'tomb-lich',
        'elder-dryad',
        'molten-colossus',
      ].flatMap((old): [string, string][] => [
        ['glacier-mammoth', old],
        ['eclipse-warden', old],
      ]),
      ['glacier-mammoth', 'eclipse-warden'],
    ];
    for (const [a, b] of named) {
      const m = get(a, b);
      assert.ok(m.overlap < OVERLAP_LIMIT, `${a} vs ${b} overlap ${m.overlap}`);
      assert.ok(m.iou <= IOU_LIMIT, `${a} vs ${b} iou ${m.iou}`);
    }
  });
});

void describe('E5 look-alike policy (ten new enemies; the 50-enemy matrix)', () => {
  const E5_IDS = [
    'drake-whelp',
    'kobold-sapper',
    'gilded-crown',
    'ash-wyvern',
    'hoard-dragon',
    'crescent-drifter',
    'comet-tadpole',
    'eye-strider',
    'obelisk-sentinel',
    'void-sovereign',
  ];

  void it('the matrix is 525 same-size pairs (30 choose 2 minions, 10 choose 2 elites, 10 choose 2 bosses) and no pin exists', () => {
    assert.equal(entries.length, 50);
    assert.equal(pairs.length, (30 * 29) / 2 + (10 * 9) / 2 + (10 * 9) / 2);
    assert.equal(pairs.length, 525);
    assert.deepEqual(Object.keys(ALL_PINS), [], 'zero pins');
    for (const id of E5_IDS) {
      assert.ok(
        entries.some((e) => e.id === id),
        id,
      );
      assert.ok(!BASELINE_IDS.includes(id), id);
    }
  });

  void it('every pair that involves an E5 enemy is under 0.85 overlap and at most 0.80 IoU (the batch adds 193 pairs)', () => {
    const involved = pairs.filter((p) => E5_IDS.includes(p.a) || E5_IDS.includes(p.b));
    assert.equal(involved.length, 193, '159 minion + 17 elite + 17 boss pairs');
    for (const p of involved) {
      assert.ok(p.overlap < OVERLAP_LIMIT, `${p.a} vs ${p.b} overlap ${p.overlap}`);
      assert.ok(p.iou <= IOU_LIMIT, `${p.a} vs ${p.b} iou ${p.iou}`);
    }
  });

  void it('same-stage minions of Stage 9 and Stage 10 are under 0.75 overlap', () => {
    for (const stage of [9, 10]) {
      const same = pairs.filter(
        (p) => p.stageA === stage && p.stageB === stage && minionIds.has(p.a) && minionIds.has(p.b),
      );
      assert.equal(same.length, 3, `stage ${stage}: three minions, three pairs`);
      for (const p of same)
        assert.ok(p.overlap < SAME_STAGE_LIMIT, `${p.a} vs ${p.b} ${p.overlap}`);
    }
  });

  void it('the tightest E5 pairs, by name, stay under the limits (measured overlap is in the label and printed)', (t) => {
    const tight: [string, string][] = [
      ['eye-strider', 'toxic-toad'],
      ['hoard-dragon', 'molten-colossus'],
      ['crescent-drifter', 'spore-shroom'],
      ['comet-tadpole', 'goblin-miner'],
    ];
    const lines: string[] = [];
    for (const [a, b] of tight) {
      const m = get(a, b);
      lines.push(`${a} vs ${b}: overlap ${m.overlap.toFixed(3)}, iou ${m.iou.toFixed(3)}`);
      assert.ok(m.overlap < OVERLAP_LIMIT, `${a} vs ${b} overlap ${m.overlap}`);
      assert.ok(m.iou <= IOU_LIMIT, `${a} vs ${b} iou ${m.iou}`);
    }
    t.diagnostic(lines.join('\n'));
  });

  void it('the named E5 pairs of plan note 4 stay under the limits', () => {
    const named: [string, string][] = [
      ...['rime-penguin', 'ember-imp', 'wailing-ghost', 'spore-shroom'].map(
        (o): [string, string] => ['drake-whelp', o],
      ),
      ...['goblin-miner', 'snow-sentry', 'bone-soldier'].map((o): [string, string] => [
        'kobold-sapper',
        o,
      ]),
      ...['shard-cluster', 'lantern-wraith', 'bramble-pixie'].map((o): [string, string] => [
        'gilded-crown',
        o,
      ]),
      ...['mirror-mimic', 'shard-cluster'].map((o): [string, string] => ['crescent-drifter', o]),
      ...['frost-hare', 'cave-bat', 'toxic-toad'].map((o): [string, string] => [
        'comet-tadpole',
        o,
      ]),
      ...['mirror-mimic', 'tomb-scarab', 'web-spider'].map((o): [string, string] => [
        'eye-strider',
        o,
      ]),
      ...[
        'gloom-stag',
        'snow-yeti',
        'furnace-guard',
        'rock-golem',
        'crypt-mummy',
        'ancient-treant',
      ].map((o): [string, string] => ['ash-wyvern', o]),
      ...['rock-golem', 'crypt-mummy', 'ash-wyvern'].map((o): [string, string] => [
        'obelisk-sentinel',
        o,
      ]),
      ...['elder-dryad', 'molten-colossus', 'rat-king'].map((o): [string, string] => [
        'hoard-dragon',
        o,
      ]),
      ...['tomb-lich', 'eclipse-warden', 'ooze-queen'].map((o): [string, string] => [
        'void-sovereign',
        o,
      ]),
      ['hoard-dragon', 'void-sovereign'],
    ];
    for (const [a, b] of named) {
      const m = get(a, b);
      assert.ok(m.overlap < OVERLAP_LIMIT, `${a} vs ${b} overlap ${m.overlap}`);
      assert.ok(m.iou <= IOU_LIMIT, `${a} vs ${b} iou ${m.iou}`);
    }
  });
});
