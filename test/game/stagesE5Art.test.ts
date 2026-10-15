// E5 art and data contracts (E5 plan section 7, notes 5, 6, 7, 8, and 9): the Stage 9 (Dragon's Lair)
// and Stage 10 (Void Spire) environments, the ten new enemies and two bosses, the scenery rules (no
// hazard surface, four named floor props), the tint rule, the five legibility rules (computed from the
// shipped palettes through test/support/legibility.ts, never typed in as targets), the animation-motion
// caps, the rasterization over the stage palettes with the boss phase palettes laid over them, and the
// vocabulary scans over every new file (comments included).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ENEMIES } from '../../src/game/data/enemies';
import type { EnemyRow } from '../../src/game/data/enemies';
import { PROP_FRAME_MS, TORCH_FRAME_MS } from '../../src/game/data/animations';
import { STAGES } from '../../src/game/data/stages';
import type { StageDef } from '../../src/game/data/stages';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { STAGE_PALETTES } from '../../src/game/sprites/palettes';
import { SpriteCache } from '../../src/game/sprites/spriteFactory';
import type { ArtSet } from '../../src/game/sprites/spriteFactory';
import type { SpriteTemplate } from '../../src/game/sprites/spriteTypes';
import { validateArtSet, validateEnemyArt } from '../../src/game/sprites/spriteValidator';
import { buildStage, validateStages } from '../../src/game/Stage';
import { FakeBitmaps } from '../support/engineFakes';
import type { FakeBitmap } from '../support/engineFakes';
import {
  calibrate,
  clothContrasts,
  colorDistance,
  contrast,
  floorCeiling,
  formatTable,
  legibilityRows,
  relLum,
  rgb,
  stageFloor,
} from '../support/legibility';
import { readText } from '../support/repo';
import { code } from '../support/source';

const LAIR = 'dragons-lair';
const SPIRE = 'void-spire';
const STAGE9 = ['drake-whelp', 'kobold-sapper', 'gilded-crown', 'ash-wyvern', 'hoard-dragon'];
const STAGE10 = [
  'crescent-drifter',
  'comet-tadpole',
  'eye-strider',
  'obelisk-sentinel',
  'void-sovereign',
];
const E5_ENEMIES = [...STAGE9, ...STAGE10];
const E5_BOSSES = ['hoard-dragon', 'void-sovereign'];
const ALL_BOSSES = [
  'rat-king',
  'goblin-foreman',
  'ooze-queen',
  'tomb-lich',
  'elder-dryad',
  'molten-colossus',
  'glacier-mammoth',
  'eclipse-warden',
  'hoard-dragon',
  'void-sovereign',
];

const stageDef = (id: string): StageDef => {
  const found = STAGES.find((s) => s.id === id);
  assert.ok(found, id);
  return found;
};
const row = (id: string): EnemyRow => {
  const found = ENEMIES.find((r) => r.id === id);
  assert.ok(found, id);
  return found;
};
const hasError = (errors: readonly string[], pattern: RegExp): boolean =>
  errors.some((e) => pattern.test(e));

type Mutable = {
  stageSprites: Record<string, { props: Record<string, SpriteTemplate> }>;
  stagePalettes: Record<string, Record<string, string>>;
  enemyPhasePalettes: Record<string, Record<string, string>[]>;
  enemies: Record<string, SpriteTemplate>;
};
const cloneArt = (): Mutable => structuredClone(SHIPPED_ART) as unknown as Mutable;

/** A stage character resolved through the stage palette, then the master palette. */
function colorOf(stageId: string, ch: string): string {
  const hex = SHIPPED_ART.stagePalettes[stageId]?.[ch] ?? SHIPPED_ART.palette[ch];
  assert.ok(hex, `${stageId}: character ${ch}`);
  return hex;
}

/** Mean relative luminance of the non-outline pixels of a stage's enemy idle frames (unlit). */
function enemyFillLuminance(stage: number): number {
  const ids = ENEMIES.filter((r) => r.stage === stage).map((r) => r.id);
  const stageId = STAGES[stage - 1]!.id;
  let sum = 0;
  let count = 0;
  for (const id of ids) {
    for (const frame of SHIPPED_ART.enemies[id]!.animations['idle']!) {
      for (const line of frame) {
        for (const ch of line) {
          if (ch === '.' || ch === 'o') continue;
          sum += relLum(rgb(colorOf(stageId, ch)));
          count += 1;
        }
      }
    }
  }
  assert.ok(count > 0, `stage ${stage}`);
  return sum / count;
}

/** Cells that differ between consecutive frames of one animation, including the wrap. */
function frameDiffs(frames: readonly string[][]): number[] {
  const out: number[] = [];
  for (let i = 0; i < frames.length; i++) {
    const a = frames[i]!;
    const b = frames[(i + 1) % frames.length]!;
    let changed = 0;
    for (let y = 0; y < Math.max(a.length, b.length); y++) {
      const la = a[y] ?? '';
      const lb = b[y] ?? '';
      for (let x = 0; x < Math.max(la.length, lb.length); x++) {
        if ((la[x] ?? '.') !== (lb[x] ?? '.')) changed += 1;
      }
    }
    out.push(changed);
  }
  return out;
}

/** Opaque pixel count per row of the first idle frame. */
function rowWidths(id: string): number[] {
  return SHIPPED_ART.enemies[id]!.animations['idle']![0]!.map(
    (line) => [...line].filter((ch) => ch !== '.').length,
  );
}

void describe('the shipped Stage 9 and Stage 10 environments', () => {
  void it('validateStages and validateArtSet are empty; the stages are rows 9 and 10 with their names', () => {
    assert.deepEqual(validateStages(STAGES, SHIPPED_ART), []);
    assert.deepEqual(validateArtSet(SHIPPED_ART), []);
    assert.equal(stageDef(LAIR).index, 9);
    assert.equal(stageDef(SPIRE).index, 10);
    assert.equal(stageDef(LAIR).name, "Dragon's Lair");
    assert.equal(stageDef(SPIRE).name, 'Void Spire');
    assert.deepEqual(Object.keys(SHIPPED_ART.stageSprites).sort(), STAGES.map((s) => s.id).sort());
  });

  void it('each stage carries its required props, with the flame loops hoardBrazier 4, goldVein 2, voidRift 4, orbitRing 2', () => {
    const lair = SHIPPED_ART.stageSprites[LAIR]!.props;
    for (const name of [
      'doorFrame',
      'scorchedPillar',
      'drakeSkull',
      'hoardBrazier',
      'goldVein',
      'scaleBanner',
      'hoardPile',
      'goldScatter',
    ]) {
      assert.ok(lair[name] !== undefined, `${LAIR} ${name}`);
    }
    const spire = SHIPPED_ART.stageSprites[SPIRE]!.props;
    for (const name of [
      'doorFrame',
      'spirePillar',
      'voidRift',
      'starWindow',
      'orbitRing',
      'riftPedestal',
      'crackedSlab',
    ]) {
      assert.ok(spire[name] !== undefined, `${SPIRE} ${name}`);
    }
    assert.ok(lair['hoardBrazier']!.animations['idle']!.length >= 4);
    assert.ok(lair['goldVein']!.animations['idle']!.length >= 2);
    assert.ok(spire['voidRift']!.animations['idle']!.length >= 4);
    assert.ok(spire['orbitRing']!.animations['idle']!.length >= 2);
    assert.equal(spire['starWindow']!.animations['idle']!.length, 1, 'the star window is static');
  });

  void it('the ambients are the planned kinds and rates (shimmer 8 per second, rifts 3 per second)', () => {
    assert.deepEqual(stageDef(LAIR).ambient, { kind: 'shimmer', perSecond: 8 });
    assert.deepEqual(stageDef(SPIRE).ambient, { kind: 'rifts', perSecond: 3 });
  });

  void it('at least 6 distinct props plus the door frame, exactly 6 lights each (at most 8), light colour char T, no flicker, planned radius and intensity', () => {
    for (const id of [LAIR, SPIRE]) {
      const names = new Set(stageDef(id).props.map((p) => p.prop));
      assert.ok(names.size >= 7, `${id}: ${names.size} distinct props`);
      const lights = stageDef(id).props.filter((p) => p.light !== null);
      assert.equal(lights.length, 6, `${id}: ${lights.length} lights`);
      assert.ok(lights.length <= 8);
      for (const p of lights) {
        assert.equal(p.light!.colorChar, 'T', `${id} ${p.prop}`);
        assert.equal(p.light!.flicker, false, `${id} ${p.prop} does not flicker`);
        assert.ok(p.light!.intensity <= 0.8, `${id} ${p.prop} ${p.light!.intensity}`);
        assert.deepEqual(Object.keys(p.light!).sort(), [
          'colorChar',
          'flicker',
          'intensity',
          'radius',
        ]);
      }
    }
    const light = (id: string, prop: string): { radius: number; intensity: number }[] =>
      stageDef(id)
        .props.filter((p) => p.prop === prop && p.light !== null)
        .map((p) => ({ radius: p.light!.radius, intensity: p.light!.intensity }));
    assert.deepEqual(light(LAIR, 'hoardBrazier'), Array(4).fill({ radius: 52, intensity: 0.8 }));
    assert.deepEqual(light(LAIR, 'goldVein'), Array(2).fill({ radius: 40, intensity: 0.5 }));
    assert.deepEqual(light(SPIRE, 'voidRift'), Array(4).fill({ radius: 48, intensity: 0.7 }));
    assert.deepEqual(light(SPIRE, 'orbitRing'), Array(2).fill({ radius: 40, intensity: 0.5 }));
  });

  void it('floor-layer props are exactly hoardPile, goldScatter, riftPedestal, crackedSlab (the scenery rule 1 name set)', () => {
    const names = (id: string): string[] => [
      ...new Set(
        stageDef(id)
          .props.filter((p) => p.layer === 'floor')
          .map((p) => p.prop),
      ),
    ];
    assert.deepEqual(names(LAIR).sort(), ['goldScatter', 'hoardPile']);
    assert.deepEqual(names(SPIRE).sort(), ['crackedSlab', 'riftPedestal']);
    assert.deepEqual([...names(LAIR), ...names(SPIRE)].sort(), [
      'crackedSlab',
      'goldScatter',
      'hoardPile',
      'riftPedestal',
    ]);
    for (const n of [...names(LAIR), ...names(SPIRE)]) assert.doesNotMatch(n, /lava/i);
  });

  void it('solid props are only hoardPile and riftPedestal, alcove floor props at foot y 134 with a 12x5 footprint', () => {
    for (const id of [LAIR, SPIRE]) {
      const solids = stageDef(id).props.filter((p) => p.solid !== null);
      assert.equal(solids.length, 1, `${id}: one solid prop`);
      for (const p of solids) {
        assert.equal(p.layer, 'floor', `${id} ${p.prop}`);
        assert.equal(p.zone, 'alcove', `${id} ${p.prop}`);
        assert.equal(p.y, 134, `${id} ${p.prop}`);
        assert.deepEqual(p.solid, { w: 12, h: 5 }, `${id} ${p.prop}`);
      }
    }
    assert.deepEqual(
      stageDef(LAIR)
        .props.filter((p) => p.solid !== null)
        .map((p) => p.prop),
      ['hoardPile'],
    );
    assert.deepEqual(
      stageDef(SPIRE)
        .props.filter((p) => p.solid !== null)
        .map((p) => p.prop),
      ['riftPedestal'],
    );
  });

  void it('no prop is named torch, lantern, or puddle or carries a hazard word; braziers, veins, rifts, and rings are wall-layer decoration', () => {
    for (const id of [LAIR, SPIRE]) {
      for (const name of Object.keys(SHIPPED_ART.stageSprites[id]!.props)) {
        assert.doesNotMatch(
          name,
          /^(torch|lantern|puddle)$|slip|slide|hazard|trap|spike|lava/i,
          `${id} ${name}`,
        );
      }
      for (const p of stageDef(id).props) {
        if (
          /^(scorchedPillar|drakeSkull|hoardBrazier|goldVein|scaleBanner|spirePillar|voidRift|starWindow|orbitRing)$/.test(
            p.prop,
          )
        ) {
          assert.equal(p.layer, 'wall', `${id} ${p.prop}`);
          assert.equal(p.solid, null, `${id} ${p.prop}`);
        }
      }
    }
  });

  void it('goldVein sits in the wall-base band, above the walking floor (bottom edge at or above y 140)', () => {
    const t = SHIPPED_ART.stageSprites[LAIR]!.props['goldVein']!;
    for (const p of stageDef(LAIR).props.filter((x) => x.prop === 'goldVein')) {
      assert.ok(p.y + t.h <= 140, `goldVein at y ${p.y} height ${t.h} reaches the walking floor`);
    }
  });

  void it('the stage palettes override exactly 1 to 8, g, and T as valid hex; the master palette gained no character (37, hard cap 40, cap 48)', () => {
    for (const id of [LAIR, SPIRE]) {
      const pal = SHIPPED_ART.stagePalettes[id]!;
      assert.deepEqual(Object.keys(pal).sort(), ['1', '2', '3', '4', '5', '6', '7', '8', 'T', 'g']);
      for (const value of Object.values(pal)) assert.match(value, /^#[0-9a-f]{6}$/i);
      assert.ok(SHIPPED_ART.stageAmbientChar[id] !== undefined, `${id} ambient char`);
      assert.ok(SHIPPED_ART.stageClearChar[id] !== undefined, `${id} clear char`);
    }
    const colors = Object.keys(SHIPPED_ART.palette).length;
    assert.ok(colors <= 40, `${colors} master characters`);
    assert.equal(colors, 37, 'E5 adds no master character (restate if a later batch does)');
  });

  void it('a missing required prop in each new stage is reported by name', () => {
    for (const [id, prop] of [
      [LAIR, 'hoardBrazier'],
      [LAIR, 'goldVein'],
      [LAIR, 'hoardPile'],
      [LAIR, 'goldScatter'],
      [LAIR, 'scorchedPillar'],
      [LAIR, 'drakeSkull'],
      [LAIR, 'scaleBanner'],
      [LAIR, 'doorFrame'],
      [SPIRE, 'voidRift'],
      [SPIRE, 'orbitRing'],
      [SPIRE, 'riftPedestal'],
      [SPIRE, 'crackedSlab'],
      [SPIRE, 'spirePillar'],
      [SPIRE, 'starWindow'],
      [SPIRE, 'doorFrame'],
    ] as const) {
      const art = cloneArt();
      delete art.stageSprites[id]!.props[prop];
      const errors = validateArtSet(art as unknown as ArtSet);
      assert.ok(hasError(errors, new RegExp(prop)), `${id} ${prop}: ${errors.join()}`);
    }
  });

  void it('a flame loop that is too short is reported (hoardBrazier 4, goldVein 2, voidRift 4, orbitRing 2)', () => {
    for (const [id, prop, min] of [
      [LAIR, 'hoardBrazier', 4],
      [LAIR, 'goldVein', 2],
      [SPIRE, 'voidRift', 4],
      [SPIRE, 'orbitRing', 2],
    ] as const) {
      const art = cloneArt();
      const t = art.stageSprites[id]!.props[prop]!;
      t.animations['idle'] = t.animations['idle']!.slice(0, min - 1);
      const errors = validateArtSet(art as unknown as ArtSet);
      assert.ok(
        hasError(errors, new RegExp(`${prop} needs a flame loop of at least ${min} frames`)),
        errors.join(),
      );
    }
  });

  void it('a stage whose art is removed is rejected by validateStages (the switch is atomic: rows without art cannot ship)', () => {
    for (const id of [LAIR, SPIRE]) {
      const noSprites = cloneArt();
      delete noSprites.stageSprites[id];
      assert.ok(
        hasError(validateStages(STAGES, noSprites as unknown as ArtSet), /no stage art/),
        id,
      );
    }
  });
});

void describe('prop animation timing (plan note 9; the constants are read from the engine)', () => {
  const live = (id: string): ReturnType<typeof buildStage>['livePropsBehind'] => {
    const bitmaps = new FakeBitmaps();
    const cache = new SpriteCache(bitmaps, SHIPPED_ART);
    return buildStage(stageDef(id), SHIPPED_ART, cache, bitmaps).livePropsBehind;
  };

  void it('every animated Stage 9 and Stage 10 placement is drawn live at exactly PROP_FRAME_MS (500 ms per frame), never the torch speed', () => {
    assert.ok(PROP_FRAME_MS >= 500 && TORCH_FRAME_MS < 500);
    for (const id of [LAIR, SPIRE]) {
      const sprites = SHIPPED_ART.stageSprites[id]!.props;
      const animated = stageDef(id).props.filter(
        (p) => p.solid === null && (sprites[p.prop]?.animations['idle']?.length ?? 0) > 1,
      );
      const liveProps = live(id);
      assert.equal(liveProps.length, animated.length, id);
      assert.deepEqual(
        [...new Set(animated.map((p) => p.prop))].sort(),
        id === LAIR ? ['goldVein', 'hoardBrazier'] : ['orbitRing', 'voidRift'],
        'only the planned props animate',
      );
      for (const p of animated) {
        assert.doesNotMatch(p.prop, /^(torch|lantern)$/);
        const match = liveProps.find(
          (l) =>
            l.zone === p.zone &&
            l.x === p.x &&
            l.sheet.frames.length === sprites[p.prop]!.animations['idle']!.length,
        );
        assert.ok(match, `${id} ${p.prop} at ${p.zone} ${p.x} is a live prop`);
        assert.equal(match.frameMs, 500, `${p.prop} runs at 500 ms per frame`);
        assert.equal(match.frameMs, PROP_FRAME_MS);
      }
    }
  });
});

void describe('the Stage 9 and Stage 10 tint rule (plan 5.1 rule 4, note 7c)', () => {
  void it('the ambient character g is neither red-dominant (red at most 1.3 times the larger of green and blue) nor near-black (relative luminance at least 0.02)', () => {
    for (const id of [LAIR, SPIRE]) {
      const hex = STAGE_PALETTES[id]!['g']!;
      const [r, g, b] = rgb(hex);
      assert.ok(r <= 1.3 * Math.max(g, b), `${id}: g ${hex}`);
      assert.ok(relLum([r, g, b]) >= 0.02, `${id}: g ${hex} luminance ${relLum([r, g, b])}`);
    }
    const [, , b10] = rgb(STAGE_PALETTES[SPIRE]!['g']!);
    const [r10] = rgb(STAGE_PALETTES[SPIRE]!['g']!);
    assert.ok(b10 >= r10, 'Stage 10 is a cool slate-blue tint');
  });

  void it('the rule is not vacuous: a red-dominant or black tint fails the same checks', () => {
    const [r, g, b] = rgb('#a03020');
    assert.ok(r > 1.3 * Math.max(g, b));
    assert.ok(relLum([0, 0, 0]) < 0.02);
  });
});

void describe('legibility rules 1 to 5 (plan note 8): computed from the shipped palettes, printed, self-calibrating', () => {
  const olderIds = STAGES.slice(0, 8).map((s) => s.id);
  const olderRows = legibilityRows(SHIPPED_ART, olderIds);
  const cal = calibrate(SHIPPED_ART, olderRows);
  const allRows = legibilityRows(
    SHIPPED_ART,
    STAGES.map((s) => s.id),
  );
  const lum = (id: string): number => stageFloor(SHIPPED_ART, id).luminance;

  void it('prints the ten-stage floor luminance and cloth-contrast table with the calibration', (t) => {
    t.diagnostic(formatTable(allRows, cal));
    const fills = STAGES.map((s) => {
      const e = enemyFillLuminance(s.index);
      return `stage ${s.index} ${s.id}: floor ${lum(s.id).toFixed(4)}, enemy fill ${e.toFixed(4)}, ratio ${(e / lum(s.id)).toFixed(2)}`;
    });
    t.diagnostic(fills.join('\n'));
    assert.equal(allRows.length, 10);
  });

  void it('rule 1: every one of the twelve class cloths (and the base hero cloth) has a contrast of at least 2.0 against BOTH Stage 9 and Stage 10 floors; the Necromancer is the binding class', (t) => {
    assert.equal(Object.keys(SHIPPED_ART.classPalettes).length, 12);
    const lines: string[] = [];
    for (const id of [LAIR, SPIRE]) {
      const c = clothContrasts(SHIPPED_ART, lum(id));
      assert.equal(c.byClass.size, 13, 'twelve classes plus the base hero');
      lines.push(`${id}: minimum cloth contrast ${c.min.toFixed(3)} (${c.minClass})`);
      for (const [name, ratio] of c.byClass) {
        assert.ok(ratio >= 2.0, `${name} on ${id}: contrast ${ratio.toFixed(3)}`);
      }
      assert.equal(c.minClass, 'necromancer', `${id}`);
    }
    t.diagnostic(lines.join('\n'));
  });

  void it('rule 1 ceiling: the Stage 9 floor stays under the Necromancer-limited ceiling, and Stage 9 reads hot through the backdrop, not a bright floor', () => {
    const ceiling = floorCeiling(SHIPPED_ART, 2.0);
    assert.equal(ceiling.limitedBy, 'necromancer');
    assert.ok(lum(LAIR) <= ceiling.value, `${lum(LAIR)} vs ceiling ${ceiling.value}`);
    assert.ok(lum(LAIR) <= 0.0325 + 1e-9, `${lum(LAIR)}`);
  });

  void it('rule 2: the Stage 9 floor is at most 130 percent of the brightest of Stages 1 to 8', () => {
    assert.ok(lum(LAIR) <= cal.stage9Ceiling, `${lum(LAIR)} vs ${cal.stage9Ceiling}`);
    assert.ok(cal.stage9Ceiling <= 0.0421 + 1e-4, `${cal.stage9Ceiling}`);
  });

  void it('rule 3: the Stage 10 floor is at least 70 percent of the darkest of Stages 1 to 9 (Molten Core is the precedent)', () => {
    const darkest9 = Math.min(...STAGES.slice(0, 9).map((s) => lum(s.id)));
    assert.ok(lum(SPIRE) >= 0.7 * darkest9, `${lum(SPIRE)} vs ${darkest9}`);
    assert.ok(lum(SPIRE) >= cal.stage10Floor, `${lum(SPIRE)} vs ${cal.stage10Floor}`);
    assert.ok(cal.stage10Floor >= 0.0067 - 1e-4, `${cal.stage10Floor}`);
  });

  void it('rule 4: the mean floor colour of Stage 9 and of Stage 10 each differs from every other stage by at least the smallest pairwise distance among Stages 1 to 8', (t) => {
    const min = cal.minDistance.value;
    const lines: string[] = [];
    for (const id of [LAIR, SPIRE]) {
      const mine = stageFloor(SHIPPED_ART, id).color;
      let nearest = { d: Infinity, other: '' };
      for (const s of STAGES) {
        if (s.id === id) continue;
        const d = colorDistance(mine, stageFloor(SHIPPED_ART, s.id).color);
        if (d < nearest.d) nearest = { d, other: s.id };
        assert.ok(d >= min, `${id} vs ${s.id}: ${d.toFixed(1)} < ${min.toFixed(1)}`);
      }
      lines.push(
        `${id}: nearest ${nearest.other} at ${nearest.d.toFixed(1)} (calibration ${min.toFixed(1)})`,
      );
    }
    t.diagnostic(lines.join('\n'));
  });

  void it('rule 5: the mean enemy fill of Stage 9 and Stage 10 is at least twice as luminous as its floor', () => {
    for (const [stage, id] of [
      [9, LAIR],
      [10, SPIRE],
    ] as const) {
      const ratio = enemyFillLuminance(stage) / lum(id);
      assert.ok(ratio >= 2.0, `stage ${stage}: enemy fill / floor ${ratio.toFixed(2)}`);
    }
  });

  void it('the rules are not vacuous: a floor above the ceiling fails the Necromancer, a pale tint on the same tiles raises the measured luminance', () => {
    const ceiling = floorCeiling(SHIPPED_ART, 2.0).value;
    const necro = relLum(rgb(SHIPPED_ART.classPalettes['necromancer']!['c']!));
    assert.ok(contrast(necro, ceiling * 1.2) < 2.0);
    const art = cloneArt();
    art.stagePalettes[LAIR] = { ...art.stagePalettes[LAIR]!, g: '#ffffff' };
    const brighter = stageFloor(art as unknown as ArtSet, LAIR).luminance;
    assert.ok(brighter > lum(LAIR) * 2, `${brighter} vs ${lum(LAIR)}`);
    assert.ok(clothContrasts(art as unknown as ArtSet, brighter).min < 2.0);
  });
});

void describe('the ten new enemies', () => {
  void it('there is one template per enemy row (fifty in all), tier sizes, animation sets, and validateEnemyArt empty', () => {
    assert.equal(Object.keys(SHIPPED_ART.enemies).length, 50);
    assert.deepEqual(validateEnemyArt(SHIPPED_ART), []);
    const size = { minion: 16, elite: 24, boss: 48 } as const;
    for (const id of E5_ENEMIES) {
      const r = row(id);
      const t = SHIPPED_ART.enemies[id]!;
      assert.equal(t.id, `enemies/${id}`);
      assert.deepEqual([t.w, t.h], [size[r.tier], size[r.tier]], id);
      assert.deepEqual(
        Object.keys(t.animations).sort(),
        r.tier === 'boss'
          ? ['attack', 'idle', 'intro', 'telegraph', 'walk']
          : ['attack', 'idle', 'walk'],
        id,
      );
      assert.equal(t.animations['idle']!.length, 2, `${id}: two idle frames`);
      assert.equal(t.animations['walk']!.length, 2, `${id}: two walk frames`);
      assert.equal(t.animations['attack']!.length, 3, `${id}: three attack frames`);
      if (r.tier === 'boss') {
        assert.equal(t.animations['telegraph']!.length, 2, `${id}`);
        assert.equal(t.animations['intro']!.length, 2, `${id}`);
        const frames = Object.values(t.animations).reduce((n, f) => n + f.length, 0);
        assert.equal(frames, 11, `${id}: 11 frames`);
        assert.deepEqual(t.anchor, { x: 24, y: 47 }, id);
      } else {
        assert.deepEqual(t.anchor, r.tier === 'minion' ? { x: 8, y: 15 } : { x: 12, y: 23 }, id);
      }
      const colors = new Set(Object.values(t.animations).flat(2).join('').replaceAll('.', ''));
      assert.ok(colors.size <= 12, `${id}: ${colors.size} colors`);
      for (const name of Object.keys(t.animations)) {
        assert.doesNotMatch(name, /hit|death|dead|die|dying|hurt|downed/i, `${id} ${name}`);
      }
    }
  });

  void it('their idle silhouettes are distinct (tier, pixel count, bounding box) and none is a solid block', () => {
    const shape = (id: string): string => {
      let count = 0;
      let minX = 99;
      let maxX = 0;
      let minY = 99;
      let maxY = 0;
      SHIPPED_ART.enemies[id]!.animations['idle']![0]!.forEach((line, y) => {
        [...line].forEach((ch, x) => {
          if (ch === '.') return;
          count += 1;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        });
      });
      return `${row(id).tier}:${count}:${maxX - minX + 1}x${maxY - minY + 1}`;
    };
    const shapes = E5_ENEMIES.map(shape);
    assert.equal(new Set(shapes).size, E5_ENEMIES.length, shapes.join(' '));
    for (const id of E5_ENEMIES) {
      assert.ok(SHIPPED_ART.enemies[id]!.animations['idle']![0]!.join('').includes('.'), id);
    }
  });

  void it('Hoard Dragon has its wings raised in an M: the shoulder span in the upper half is clearly wider than the waist above the gold heap', () => {
    const w = rowWidths('hoard-dragon');
    const upperPeak = Math.max(...w.slice(0, 24));
    const waist = Math.min(...w.slice(22, 32));
    assert.ok(
      upperPeak >= waist * 1.2,
      `upper peak ${upperPeak} vs waist ${waist}: ${w.join(',')}`,
    );
    assert.ok(upperPeak >= 30, `wing span ${upperPeak}`);
  });

  void it('Void Sovereign is the inverted-triangle boss: broad at the top and tapering to a point, with the narrowest bottom quarter of all ten bosses', (t) => {
    // Taper: the widest row of the bottom quarter over the widest row of the whole sprite.
    const taper = (id: string): number => {
      const w = rowWidths(id);
      return Math.max(...w.slice(Math.floor(w.length * 0.75))) / Math.max(...w);
    };
    const upper = (id: string): number => {
      const w = rowWidths(id);
      return w.slice(0, w.length / 2).reduce((a, b) => a + b, 0) / w.reduce((a, b) => a + b, 0);
    };
    const table = ALL_BOSSES.map((id) => [id, taper(id)] as const).sort((x, y) => x[1] - y[1]);
    t.diagnostic(
      `bottom-quarter width over widest row, narrowest first: ${table.map(([id, r]) => `${id} ${r.toFixed(2)}`).join(', ')}`,
    );
    assert.equal(table[0]![0], 'void-sovereign', 'no other boss tapers as far');
    assert.ok(upper('void-sovereign') > 0.5, `upper-half share ${upper('void-sovereign')}`);
    const w = rowWidths('void-sovereign');
    const bottom = w.filter((n) => n > 0).slice(-3);
    assert.ok(Math.max(...bottom) <= 12, `base widths ${bottom.join(',')}`);
  });

  void it('every one of the ten bosses has exactly one phase palette of at most four master characters, as #rrggbb, and a missing one is reported', () => {
    assert.deepEqual(Object.keys(SHIPPED_ART.enemyPhasePalettes).sort(), [...ALL_BOSSES].sort());
    assert.deepEqual(
      ALL_BOSSES.sort(),
      ENEMIES.filter((r) => r.tier === 'boss')
        .map((r) => r.id)
        .sort(),
    );
    for (const id of ALL_BOSSES) {
      const list = SHIPPED_ART.enemyPhasePalettes[id]!;
      assert.equal(list.length, 1, id);
      assert.ok(Object.keys(list[0]!).length >= 1 && Object.keys(list[0]!).length <= 4, id);
      for (const [key, value] of Object.entries(list[0]!)) {
        assert.ok(SHIPPED_ART.palette[key] !== undefined, `${id} ${key}`);
        assert.match(value, /^#[0-9a-f]{6}$/i);
      }
    }
    for (const id of E5_BOSSES) {
      const art = cloneArt();
      delete art.enemyPhasePalettes[id];
      assert.ok(
        validateEnemyArt(art as unknown as ArtSet).includes(`${id}: boss has no phase palette`),
        id,
      );
    }
    const many = cloneArt();
    many.enemyPhasePalettes['void-sovereign'] = [
      { '1': '#000000', '2': '#000001', '3': '#000002', '4': '#000003', '5': '#000004' },
    ];
    assert.ok(
      hasError(
        validateEnemyArt(many as unknown as ArtSet),
        /void-sovereign: phase palette overrides 5 characters, limit 4/,
      ),
    );
    const stray = cloneArt();
    stray.enemyPhasePalettes['comet-tadpole'] = [{ '1': '#000000' }];
    assert.ok(hasError(validateEnemyArt(stray as unknown as ArtSet), /comet-tadpole/));
  });

  void it('the telegraph and attack animations differ for both new bosses, and from idle (a readable wind-up)', () => {
    for (const id of E5_BOSSES) {
      const a = SHIPPED_ART.enemies[id]!.animations;
      assert.notDeepEqual(a['telegraph'], a['attack'], id);
      assert.notDeepEqual(a['telegraph'], a['idle'], id);
      assert.notDeepEqual(a['attack'], a['idle'], id);
    }
  });

  void it('walk differs from idle for every new enemy (they visibly move)', () => {
    for (const id of E5_ENEMIES) {
      const a = SHIPPED_ART.enemies[id]!.animations;
      assert.notDeepEqual(a['walk'], a['idle'], id);
    }
  });
});

void describe('animation motion (plan note 9): no new idle swap is larger than the largest shipped in Stages 1 to 8', () => {
  const OLDER = ENEMIES.filter((r) => r.stage <= 8).map((r) => r.id);
  const idleDiffs = (id: string): number[] =>
    frameDiffs(SHIPPED_ART.enemies[id]!.animations['idle']!);
  const shippedMax = Math.max(...OLDER.flatMap(idleDiffs));

  void it('the largest idle swap among the 40 older enemies is 466 changed pixels; restate if older art is reworked', (t) => {
    const biggest = OLDER.map((id) => [id, Math.max(...idleDiffs(id))] as const).sort(
      (a, b) => b[1] - a[1],
    )[0]!;
    t.diagnostic(`largest shipped idle swap: ${biggest[0]} ${biggest[1]}`);
    assert.equal(biggest[1], 466);
  });

  void it('every E5 enemy idle swap is at most the shipped maximum, and prints each', (t) => {
    const lines = E5_ENEMIES.map((id) => `${id} ${Math.max(...idleDiffs(id))}`);
    t.diagnostic(lines.join(', '));
    for (const id of E5_ENEMIES) {
      for (const d of idleDiffs(id)) assert.ok(d <= shippedMax, `${id}: ${d} > ${shippedMax}`);
    }
  });

  void it('every E5 animated prop frame swap is at most the governing cap (the largest shipped idle swap, 466), and prints the tighter prop-to-prop comparison', (t) => {
    const propDiffs = (stageId: string): [string, number][] =>
      Object.entries(SHIPPED_ART.stageSprites[stageId]!.props)
        .filter(([, tpl]) => (tpl.animations['idle']?.length ?? 0) > 1)
        .map(([name, tpl]) => [
          `${stageId}/${name}`,
          Math.max(...frameDiffs(tpl.animations['idle']!)),
        ]);
    const older = STAGES.slice(0, 8).flatMap((s) => propDiffs(s.id));
    const olderMax = Math.max(...older.map((e) => e[1]));
    const mine = [LAIR, SPIRE].flatMap(propDiffs);
    // The E4 test compared new props with the largest older PROP swap; the plan and the sprite spec cap
    // props and enemies alike at the largest shipped enemy idle swap. The tighter figure is reported.
    t.diagnostic(
      `older prop max ${olderMax}; E5: ${mine.map((e) => `${e[0]} ${e[1]}`).join(', ')}` +
        (mine.some((e) => e[1] > olderMax) ? ' (voidRift is above the older prop maximum)' : ''),
    );
    assert.equal(mine.length, 4, 'hoardBrazier, goldVein, voidRift, orbitRing');
    for (const [name, d] of mine) assert.ok(d <= shippedMax, `${name}: ${d} > ${shippedMax}`);
  });

  void it('the measurement is not vacuous: swapping an enemy idle frame for a blank one counts every opaque cell', () => {
    const first = SHIPPED_ART.enemies['hoard-dragon']!.animations['idle']![0]!;
    const blank = first.map((line) => '.'.repeat(line.length));
    const opaque = first.join('').replaceAll('.', '').length;
    assert.ok(opaque > 0);
    assert.equal(frameDiffs([first, blank])[0], opaque);
  });
});

void describe('rasterization over the stage palette (drift 13.6, extended to Stages 9 and 10)', () => {
  function pixels(art: ArtSet, id: string, phase = 1): string[] {
    const cache = new SpriteCache(new FakeBitmaps(), art);
    const sprites = cache.enemy(id, phase);
    assert.ok(sprites, id);
    const frame = sprites['idle']!.frames[0] as FakeBitmap;
    const out: string[] = [];
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const px = frame.pixel(x, y);
        out.push(px[3] === 0 ? '.' : px.slice(0, 3).join(','));
      }
    }
    return out;
  }
  const without = (): ArtSet => ({ ...SHIPPED_ART, stagePalettes: {} });

  void it('Stage 9 and Stage 10 enemies resolve through their own stage palette: recolored, same opaque pixels as the master resolution', () => {
    for (const id of E5_ENEMIES) {
      const own = pixels(SHIPPED_ART, id);
      const master = pixels(without(), id);
      assert.deepEqual(
        own.map((c) => c === '.'),
        master.map((c) => c === '.'),
        `${id}: same silhouette`,
      );
      assert.notDeepEqual(own, master, `${id} uses stage characters`);
    }
  });

  void it('an enemy takes its own stage palette: swapping the Stage 9 and Stage 10 palettes changes the result', () => {
    const swapped = cloneArt();
    swapped.stagePalettes[LAIR] = { ...SHIPPED_ART.stagePalettes[SPIRE]! };
    swapped.stagePalettes[SPIRE] = { ...SHIPPED_ART.stagePalettes[LAIR]! };
    for (const id of ['drake-whelp', 'crescent-drifter']) {
      assert.notDeepEqual(pixels(swapped as unknown as ArtSet, id), pixels(SHIPPED_ART, id), id);
    }
  });

  void it('older stages are unaffected by the new stage palettes', () => {
    const stripped = cloneArt();
    delete stripped.stagePalettes[LAIR];
    delete stripped.stagePalettes[SPIRE];
    for (const id of [
      'cellar-rat',
      'goblin-miner',
      'green-slime',
      'bone-soldier',
      'ember-imp',
      'rime-penguin',
      'lantern-wraith',
    ]) {
      assert.deepEqual(pixels(stripped as unknown as ArtSet, id), pixels(SHIPPED_ART, id), id);
    }
  });

  void it('boss phase palettes lay over the stage palette: same silhouette, phase 2 differs, only overridden characters change', () => {
    for (const id of E5_BOSSES) {
      const p1 = pixels(SHIPPED_ART, id, 1);
      const p2 = pixels(SHIPPED_ART, id, 2);
      assert.deepEqual(
        p1.map((c) => c === '.'),
        p2.map((c) => c === '.'),
        `${id}: same silhouette`,
      );
      assert.notDeepEqual(p1, p2, `${id}: phase 2 looks different`);
      const master2 = pixels(without(), id, 2);
      const kept = p1.filter((c, i) => c === p2[i] && c !== master2[i]);
      assert.ok(kept.length > 0, `${id}: untouched pixels keep the stage palette`);
      const art = cloneArt();
      art.enemyPhasePalettes[id] = [{ '3': '#ff00ff' }];
      const a = pixels(art as unknown as ArtSet, id, 1);
      const b = pixels(art as unknown as ArtSet, id, 2);
      assert.ok(b.filter((c, i) => c !== a[i]).every((c) => c === '255,0,255'));
    }
  });

  void it('phase 2 adds no large bright area: the near-white pixels it introduces stay a small share of the boss (Stage 10 is dark)', (t) => {
    const lines: string[] = [];
    for (const id of E5_BOSSES) {
      const p1 = pixels(SHIPPED_ART, id, 1);
      const p2 = pixels(SHIPPED_ART, id, 2);
      const opaque = p1.filter((c) => c !== '.').length;
      const lumOf = (c: string): number =>
        relLum(c.split(',').map(Number) as unknown as [number, number, number]);
      const brightened = p2.filter((c, i) => c !== '.' && c !== p1[i] && lumOf(c) >= 0.6).length;
      lines.push(`${id}: ${brightened} of ${opaque} opaque pixels become near-white in phase 2`);
      assert.ok(brightened <= opaque * 0.12, `${id}: ${brightened} of ${opaque}`);
    }
    t.diagnostic(lines.join('\n'));
  });
});

void describe('the E5 files: characters only (invariant 5) and the hero-side vocabulary (invariant 1), comments included', () => {
  const ART = [
    'src/game/sprites/stage9Templates.ts',
    'src/game/sprites/stage10Templates.ts',
    'src/game/sprites/enemiesStage9.ts',
    'src/game/sprites/enemiesStage10.ts',
    'src/game/sprites/hoardDragonTemplate.ts',
    'src/game/sprites/voidSovereignTemplate.ts',
    'src/game/sprites/palettesE5.ts',
  ];
  const ENGINE = ['src/game/Ambience.ts', 'src/game/Particles.ts'];
  const BANNED = /\b(hp|health|mana|dead|downed|retreat|damage|gauge|hurt|dying)\b/i;

  void it('every file exists and is not empty', () => {
    for (const f of [...ART, ...ENGINE]) assert.ok(readText(f).length > 100, f);
  });

  void it('the ban list (hp, health, mana, dead, downed, retreat, damage, gauge, hurt, dying) matches nowhere, including the E5 tuning block', () => {
    for (const f of [...ART, ...ENGINE, 'src/game/data/stages.ts']) {
      const hit = BANNED.exec(readText(f));
      assert.equal(hit, null, `${f}: ${hit?.[0]}`);
    }
    // tuning.ts keeps older enemy-side prose (E1); only the E5 block is scanned.
    const tuning = readText('src/game/data/tuning.ts');
    const start = tuning.indexOf('SHIMMER_MIN_Y');
    const end = tuning.indexOf('\n', tuning.indexOf('RIFT_LIFE_MAX_MS', start));
    assert.ok(start > 0 && end > start, 'the E5 tuning block exists');
    assert.doesNotMatch(tuning.slice(start, end), BANNED);
  });

  void it('the template files hold no hex colour and no data URI; palettesE5 holds hex only as palette values', () => {
    for (const f of ART.filter((file) => !file.endsWith('palettesE5.ts'))) {
      assert.doesNotMatch(code(f), /#[0-9a-fA-F]{3,8}\b/, f);
      assert.doesNotMatch(code(f), /data:/, f);
    }
    assert.doesNotMatch(code('src/game/sprites/palettesE5.ts'), /data:/);
    assert.doesNotMatch(code('src/game/sprites/palettesE5.ts'), /\b(fetch|import\(|http)/);
    for (const f of ENGINE) assert.doesNotMatch(code(f), /#[0-9a-fA-F]{3,8}\b/, f);
  });

  void it('no E5 art or ambient file names a status effect or a hero state', () => {
    for (const f of [...ART, ...ENGINE]) {
      assert.doesNotMatch(
        code(f),
        /\b(poison|poisoned|status|debuff|buff|slowed|chilled|burning|burned|scorched hero|drained|cursed|stunned|enraged)\b/i,
        f,
      );
    }
  });

  void it('prose never describes a hero as burned, scorched, drained, pulled, lit, or void-touched (fire, gold, and the void are scenery and enemy art only)', () => {
    for (const f of [...ART, ...ENGINE]) {
      for (const line of readText(f).split('\n')) {
        if (/\bheroe?s?\b/i.test(line)) {
          assert.doesNotMatch(
            line,
            /\b(burn\w*|scorch\w*|drain\w*|pull\w*|lit|singe\w*|hurt|dying|void)\b/i,
            `${f}: ${line}`,
          );
        }
      }
    }
  });

  void it('no E5 art file uses a heat gauge, meter, or temperature word, and no animation name implies damage', () => {
    for (const f of ART) {
      assert.doesNotMatch(
        readText(f),
        /\b(pressure|heat gauge|meter|thermometer|temperature)\b/i,
        f,
      );
    }
  });

  void it('Ambience reads the stage ambient only; neither E5 ambient kind is read by anything but Ambience, the particle code, and the stage row', () => {
    const readers = [
      'src/game/Combat.ts',
      'src/game/Game.ts',
      'src/game/Roster.ts',
      'src/game/Engagement.ts',
    ];
    for (const f of readers) {
      assert.doesNotMatch(code(f), /['"](shimmer|rifts?)['"]/, f);
    }
  });
});
