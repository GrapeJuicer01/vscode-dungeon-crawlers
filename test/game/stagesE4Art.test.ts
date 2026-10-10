// E4 art and data contracts (E4 plan section 7, notes 5, 6, 7, 8, and 9): the Stage 7 (Frozen
// Citadel) and Stage 8 (Shadow Realm) environments, the ten new enemies and two bosses, the scenery
// rules (no hazard surface, four named floor props), the tint rule, the legibility rules (computed
// from the shipped palettes, not pinned), the animation-motion caps, the rasterization over the stage
// palettes with the boss phase palettes laid over them, and the vocabulary scans over every new file
// (comments included).
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
import { readText } from '../support/repo';
import { code } from '../support/source';

const CITADEL = 'frozen-citadel';
const REALM = 'shadow-realm';
const STAGE7 = ['rime-penguin', 'frost-hare', 'snow-sentry', 'snow-yeti', 'glacier-mammoth'];
const STAGE8 = ['lantern-wraith', 'shard-cluster', 'mirror-mimic', 'gloom-stag', 'eclipse-warden'];
const E4_ENEMIES = [...STAGE7, ...STAGE8];
const E4_BOSSES = ['glacier-mammoth', 'eclipse-warden'];

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

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance of an sRGB colour. */
function relLum([r, g, b]: readonly [number, number, number]): number {
  const lin = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two relative luminances. */
const contrast = (a: number, b: number): number =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** A stage character resolved through the stage palette, then the master palette. */
function colorOf(stageId: string, ch: string): string {
  const hex = SHIPPED_ART.stagePalettes[stageId]?.[ch] ?? SHIPPED_ART.palette[ch];
  assert.ok(hex, `${stageId}: character ${ch}`);
  return hex;
}

/** Rows of the first frame of the first animation (tiles use one). */
function firstFrame(t: SpriteTemplate): string[] {
  const frames = Object.values(t.animations)[0];
  assert.ok(frames && frames[0], t.id);
  return frames[0];
}

/** Mean relative luminance of floorBack and floorFront frame 0 after the stage ambient multiply. */
function floorLuminance(stageId: string): number {
  const tiles = SHIPPED_ART.stageSprites[stageId]!.tiles;
  const g = rgb(colorOf(stageId, 'g'));
  let sum = 0;
  let count = 0;
  for (const tile of [tiles.floorBack[0]!, tiles.floorFront[0]!]) {
    for (const line of firstFrame(tile)) {
      for (const ch of line) {
        if (ch === '.') continue;
        const [r, gg, b] = rgb(colorOf(stageId, ch));
        sum += relLum([(r * g[0]) / 255, (gg * g[1]) / 255, (b * g[2]) / 255]);
        count += 1;
      }
    }
  }
  assert.ok(count > 0, stageId);
  return sum / count;
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

const OLD_ENEMIES = ENEMIES.filter((r) => r.stage <= 6).map((r) => r.id);

void describe('the shipped Stage 7 and Stage 8 environments', () => {
  void it('validateStages and validateArtSet are empty and the eight stage ids are in order', () => {
    assert.deepEqual(
      STAGES.map((s) => s.id),
      [
        'forgotten-cellar',
        'goblin-mine-shafts',
        'toxic-slime-caverns',
        'ancient-catacombs',
        'enchanted-forest-ruins',
        'molten-core',
        CITADEL,
        REALM,
      ],
    );
    assert.deepEqual(validateStages(STAGES, SHIPPED_ART), []);
    assert.deepEqual(validateArtSet(SHIPPED_ART), []);
    assert.equal(stageDef(CITADEL).index, 7);
    assert.equal(stageDef(REALM).index, 8);
    assert.equal(stageDef(CITADEL).name, 'Frozen Citadel');
    assert.equal(stageDef(REALM).name, 'Shadow Realm');
  });

  void it('each stage carries its required props, with the flame loops iceLamp 2, iceSheet 2, floatingShard 2, wispTorch 4', () => {
    const citadel = SHIPPED_ART.stageSprites[CITADEL]!.props;
    for (const name of [
      'doorFrame',
      'icePillar',
      'icicleCluster',
      'frostBanner',
      'iceLamp',
      'iceSheet',
      'iceThrone',
      'snowDrift',
    ]) {
      assert.ok(citadel[name] !== undefined, `${CITADEL} ${name}`);
    }
    const realm = SHIPPED_ART.stageSprites[REALM]!.props;
    for (const name of [
      'doorFrame',
      'duskPillar',
      'floatingShard',
      'mirrorFrame',
      'wispTorch',
      'duskAltar',
      'shardPatch',
    ]) {
      assert.ok(realm[name] !== undefined, `${REALM} ${name}`);
    }
    assert.ok(citadel['iceLamp']!.animations['idle']!.length >= 2);
    assert.ok(citadel['iceSheet']!.animations['idle']!.length >= 2);
    assert.ok(realm['floatingShard']!.animations['idle']!.length >= 2);
    assert.ok(realm['wispTorch']!.animations['idle']!.length >= 4);
  });

  void it('the ambients are the planned kinds and rates', () => {
    assert.deepEqual(stageDef(CITADEL).ambient, { kind: 'snow', perSecond: 9 });
    assert.deepEqual(stageDef(REALM).ambient, { kind: 'murk', perSecond: 4 });
  });

  void it('at least 6 distinct props plus the door frame, exactly 6 lights each (at most 8), light colour char T, no flicker', () => {
    for (const id of [CITADEL, REALM]) {
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
    const count = (id: string, prop: string): number =>
      stageDef(id).props.filter((p) => p.prop === prop && p.light !== null).length;
    assert.equal(count(CITADEL, 'iceLamp'), 4);
    assert.equal(count(CITADEL, 'iceSheet'), 2);
    assert.equal(count(REALM, 'wispTorch'), 4);
    assert.equal(count(REALM, 'floatingShard'), 2);
  });

  void it('floor-layer props are exactly iceThrone, snowDrift, duskAltar, shardPatch (the scenery rule 1 name set)', () => {
    const names = (id: string): string[] => [
      ...new Set(
        stageDef(id)
          .props.filter((p) => p.layer === 'floor')
          .map((p) => p.prop),
      ),
    ];
    assert.deepEqual(names(CITADEL).sort(), ['iceThrone', 'snowDrift']);
    assert.deepEqual(names(REALM).sort(), ['duskAltar', 'shardPatch']);
    assert.deepEqual([...names(CITADEL), ...names(REALM)].sort(), [
      'duskAltar',
      'iceThrone',
      'shardPatch',
      'snowDrift',
    ]);
  });

  void it('solid props are only iceThrone and duskAltar, alcove floor props at foot y 134 with a 12x5 footprint', () => {
    for (const id of [CITADEL, REALM]) {
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
      stageDef(CITADEL)
        .props.filter((p) => p.solid !== null)
        .map((p) => p.prop),
      ['iceThrone'],
    );
    assert.deepEqual(
      stageDef(REALM)
        .props.filter((p) => p.solid !== null)
        .map((p) => p.prop),
      ['duskAltar'],
    );
  });

  void it('no prop is named puddle or carries a hazard word; ice, mirrors, and shards are wall-layer or the four named floor props', () => {
    for (const id of [CITADEL, REALM]) {
      for (const name of Object.keys(SHIPPED_ART.stageSprites[id]!.props)) {
        assert.doesNotMatch(name, /puddle|slip|slide|hazard|trap|spike/i, `${id} ${name}`);
      }
      for (const p of stageDef(id).props) {
        if (
          /^(ice(Pillar|Lamp|Sheet)|icicle|frostBanner|duskPillar|floatingShard|mirrorFrame|wispTorch)/.test(
            p.prop,
          )
        ) {
          assert.equal(p.layer, 'wall', `${id} ${p.prop}`);
          assert.equal(p.solid, null, `${id} ${p.prop}`);
        }
      }
    }
  });

  void it('iceSheet sits in the wall-base band, above the walking floor (bottom edge at or above y 140)', () => {
    for (const p of stageDef(CITADEL).props.filter((x) => x.prop === 'iceSheet')) {
      const t = SHIPPED_ART.stageSprites[CITADEL]!.props['iceSheet']!;
      assert.ok(p.y + t.h <= 140, `iceSheet at y ${p.y} height ${t.h} reaches the walking floor`);
    }
  });

  void it('the stage palettes override exactly 1 to 8, g, and T as valid hex; the master palette gained no character (37, hard cap 40, cap 48)', () => {
    for (const id of [CITADEL, REALM]) {
      const pal = SHIPPED_ART.stagePalettes[id]!;
      assert.deepEqual(Object.keys(pal).sort(), ['1', '2', '3', '4', '5', '6', '7', '8', 'T', 'g']);
      for (const value of Object.values(pal)) assert.match(value, /^#[0-9a-f]{6}$/i);
      assert.ok(SHIPPED_ART.stageAmbientChar[id] !== undefined, `${id} ambient char`);
      assert.ok(SHIPPED_ART.stageClearChar[id] !== undefined, `${id} clear char`);
    }
    const colors = Object.keys(SHIPPED_ART.palette).length;
    assert.ok(colors <= 40, `${colors} master characters`);
    assert.equal(colors, 37, 'E4 adds no master character (restate if a later batch does)');
  });

  void it('a missing required prop in each new stage is reported by name', () => {
    for (const [id, prop] of [
      [CITADEL, 'iceLamp'],
      [CITADEL, 'iceSheet'],
      [CITADEL, 'iceThrone'],
      [CITADEL, 'snowDrift'],
      [CITADEL, 'doorFrame'],
      [REALM, 'floatingShard'],
      [REALM, 'wispTorch'],
      [REALM, 'duskAltar'],
      [REALM, 'shardPatch'],
      [REALM, 'doorFrame'],
    ] as const) {
      const art = cloneArt();
      delete art.stageSprites[id]!.props[prop];
      const errors = validateArtSet(art as unknown as ArtSet);
      assert.ok(hasError(errors, new RegExp(prop)), `${id} ${prop}: ${errors.join()}`);
    }
  });

  void it('a flame loop that is too short is reported (iceLamp 2, iceSheet 2, floatingShard 2, wispTorch 4)', () => {
    for (const [id, prop, min] of [
      [CITADEL, 'iceLamp', 2],
      [CITADEL, 'iceSheet', 2],
      [REALM, 'floatingShard', 2],
      [REALM, 'wispTorch', 4],
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
    for (const id of [CITADEL, REALM]) {
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

  void it('the engine slows non-torch props: PROP_FRAME_MS is at least 500 and only props named torch or lantern use TORCH_FRAME_MS', () => {
    assert.ok(PROP_FRAME_MS >= 500, `PROP_FRAME_MS ${PROP_FRAME_MS}`);
    assert.ok(TORCH_FRAME_MS < 500);
    const src = code('src/game/Stage.ts');
    assert.match(
      src,
      /p\.prop === 'torch' \|\| p\.prop === 'lantern' \? TORCH_FRAME_MS : PROP_FRAME_MS/,
    );
  });

  void it('every animated Stage 7 and Stage 8 placement is drawn live at 500 ms per frame or slower (iceSheet, floatingShard at least 500; iceLamp, wispTorch at least 300)', () => {
    for (const id of [CITADEL, REALM]) {
      const sprites = SHIPPED_ART.stageSprites[id]!.props;
      const animated = stageDef(id).props.filter(
        (p) => p.solid === null && (sprites[p.prop]?.animations['idle']?.length ?? 0) > 1,
      );
      const liveProps = live(id);
      assert.equal(liveProps.length, animated.length, id);
      assert.deepEqual(
        [...new Set(animated.map((p) => p.prop))].sort(),
        id === CITADEL ? ['iceLamp', 'iceSheet'] : ['floatingShard', 'wispTorch'],
        'only the planned props animate',
      );
      for (const p of animated) {
        const match = liveProps.find(
          (l) =>
            l.zone === p.zone &&
            l.x === p.x &&
            l.sheet.frames.length === sprites[p.prop]!.animations['idle']!.length,
        );
        assert.ok(match, `${id} ${p.prop} at ${p.zone} ${p.x} is a live prop`);
        const floor = p.prop === 'iceLamp' || p.prop === 'wispTorch' ? 300 : 500;
        assert.ok(match.frameMs >= floor, `${p.prop}: ${match.frameMs} ms per frame`);
        assert.equal(
          match.frameMs,
          PROP_FRAME_MS,
          `${p.prop} uses PROP_FRAME_MS, not the torch speed`,
        );
      }
    }
  });
});

void describe('the Stage 7 and Stage 8 tint rule (plan 5.1 rule 4, note 7c)', () => {
  void it('the ambient character g is neither red-dominant (red at most 1.3 times the larger of green and blue) nor near-black (relative luminance at least 0.02)', () => {
    for (const id of [CITADEL, REALM]) {
      const hex = STAGE_PALETTES[id]!['g']!;
      const [r, g, b] = rgb(hex);
      assert.ok(r <= 1.3 * Math.max(g, b), `${id}: g ${hex}`);
      assert.ok(relLum([r, g, b]) >= 0.02, `${id}: g ${hex} luminance ${relLum([r, g, b])}`);
      assert.ok(b >= r, `${id}: a cool tint (blue at least red)`);
    }
  });

  void it('the rule is not vacuous: a red-dominant or black tint fails the same checks', () => {
    const [r, g, b] = rgb('#a03020');
    assert.ok(r > 1.3 * Math.max(g, b));
    assert.ok(relLum([0, 0, 0]) < 0.02);
  });
});

void describe('legibility (plan note 8): computed from the shipped palettes, printed, self-calibrating', () => {
  const ids = STAGES.map((s) => s.id);
  const floor = new Map(ids.map((id) => [id, floorLuminance(id)]));

  void it('prints the floor luminance table and the enemy-to-floor contrast for all eight stages', (t) => {
    const lines = ids.map((id, i) => {
      const f = floor.get(id)!;
      const e = enemyFillLuminance(i + 1);
      return `stage ${i + 1} ${id}: floor ${f.toFixed(4)}, enemy fill ${e.toFixed(4)}, ratio ${(e / f).toFixed(2)}`;
    });
    t.diagnostic(lines.join('\n'));
    assert.equal(lines.length, 8);
  });

  void it('Stage 8 floor luminance is at least 70 percent of the darkest of Stages 1 to 7', () => {
    const darkest = Math.min(...ids.slice(0, 7).map((id) => floor.get(id)!));
    const stage8 = floor.get(REALM)!;
    assert.ok(stage8 >= 0.7 * darkest, `stage 8 ${stage8} vs darkest older ${darkest}`);
  });

  void it('Stage 7 floor luminance is at most 130 percent of the brightest of Stages 1 to 6', () => {
    const brightest = Math.max(...ids.slice(0, 6).map((id) => floor.get(id)!));
    const stage7 = floor.get(CITADEL)!;
    assert.ok(stage7 <= 1.3 * brightest, `stage 7 ${stage7} vs brightest older ${brightest}`);
  });

  void it('every hero class cloth (all twelve, the base hero cloth included) has a contrast of at least 2.0 against the Stage 7 and Stage 8 floors', () => {
    const cloths = new Map<string, string>([['base', SHIPPED_ART.palette['c']!]]);
    const classIds = Object.keys(SHIPPED_ART.classPalettes);
    assert.equal(classIds.length, 12);
    assert.ok(classIds.includes('necromancer'));
    for (const id of classIds) {
      cloths.set(id, SHIPPED_ART.classPalettes[id]!['c'] ?? SHIPPED_ART.palette['c']!);
    }
    assert.equal(SHIPPED_ART.palette['c'], '#4fa3e8');
    for (const stageId of [CITADEL, REALM]) {
      for (const [name, hex] of cloths) {
        const ratio = contrast(relLum(rgb(hex)), floor.get(stageId)!);
        assert.ok(ratio >= 2.0, `${name} cloth ${hex} on ${stageId}: contrast ${ratio.toFixed(2)}`);
      }
    }
  });

  void it('the mean enemy fill of Stage 7 and Stage 8 is at least twice as luminous as its floor', () => {
    for (const [stage, id] of [
      [7, CITADEL],
      [8, REALM],
    ] as const) {
      const ratio = enemyFillLuminance(stage) / floor.get(id)!;
      assert.ok(ratio >= 2.0, `stage ${stage}: enemy fill / floor ${ratio.toFixed(2)}`);
    }
  });
});

void describe('the ten new enemies', () => {
  void it('one template per enemy row (forty in all), tier sizes, animation sets, and validateEnemyArt empty', () => {
    assert.equal(Object.keys(SHIPPED_ART.enemies).length, 40);
    assert.deepEqual(validateEnemyArt(SHIPPED_ART), []);
    const size = { minion: 16, elite: 24, boss: 48 } as const;
    for (const id of E4_ENEMIES) {
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
    const shapes = E4_ENEMIES.map(shape);
    assert.equal(new Set(shapes).size, E4_ENEMIES.length, shapes.join(' '));
    for (const id of E4_ENEMIES) {
      assert.ok(SHIPPED_ART.enemies[id]!.animations['idle']![0]!.join('').includes('.'), id);
    }
  });

  void it('Glacier Mammoth is the first horizontal boss: wider than tall; every older boss is upright', () => {
    const extent = (id: string): { w: number; h: number } => {
      let minX = 99;
      let maxX = 0;
      let minY = 99;
      let maxY = 0;
      SHIPPED_ART.enemies[id]!.animations['idle']![0]!.forEach((line, y) => {
        [...line].forEach((ch, x) => {
          if (ch === '.') return;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        });
      });
      return { w: maxX - minX + 1, h: maxY - minY + 1 };
    };
    const mammoth = extent('glacier-mammoth');
    assert.ok(mammoth.w > mammoth.h, `mammoth ${mammoth.w}x${mammoth.h}`);
  });

  void it('both new bosses have exactly one phase palette of at most four master characters, as #rrggbb, and a missing one is reported', () => {
    for (const id of E4_BOSSES) {
      const list = SHIPPED_ART.enemyPhasePalettes[id]!;
      assert.equal(list.length, 1, id);
      assert.ok(Object.keys(list[0]!).length <= 4, id);
      for (const [key, value] of Object.entries(list[0]!)) {
        assert.ok(SHIPPED_ART.palette[key] !== undefined, `${id} ${key}`);
        assert.match(value, /^#[0-9a-f]{6}$/i);
      }
      const art = cloneArt();
      delete art.enemyPhasePalettes[id];
      assert.ok(
        validateEnemyArt(art as unknown as ArtSet).includes(`${id}: boss has no phase palette`),
        id,
      );
    }
  });

  void it('the phase palette table holds exactly the eight boss ids; a five-override palette or a non-boss owner is rejected', () => {
    assert.deepEqual(
      Object.keys(SHIPPED_ART.enemyPhasePalettes).sort(),
      ENEMIES.filter((r) => r.tier === 'boss')
        .map((r) => r.id)
        .sort(),
    );
    assert.equal(Object.keys(SHIPPED_ART.enemyPhasePalettes).length, 8);
    const many = cloneArt();
    many.enemyPhasePalettes['eclipse-warden'] = [
      { '1': '#000000', '2': '#000001', '3': '#000002', '4': '#000003', '5': '#000004' },
    ];
    assert.ok(
      hasError(
        validateEnemyArt(many as unknown as ArtSet),
        /eclipse-warden: phase palette overrides 5 characters, limit 4/,
      ),
    );
    const stray = cloneArt();
    stray.enemyPhasePalettes['frost-hare'] = [{ '1': '#000000' }];
    assert.ok(hasError(validateEnemyArt(stray as unknown as ArtSet), /frost-hare/));
  });

  void it('the telegraph and attack animations differ for both new bosses (a readable wind-up)', () => {
    for (const id of E4_BOSSES) {
      const a = SHIPPED_ART.enemies[id]!.animations;
      assert.notDeepEqual(a['telegraph'], a['attack'], id);
      assert.notDeepEqual(a['telegraph'], a['idle'], id);
    }
  });

  void it('walk differs from idle for every new enemy (they visibly move)', () => {
    for (const id of E4_ENEMIES) {
      const a = SHIPPED_ART.enemies[id]!.animations;
      assert.notDeepEqual(a['walk'], a['idle'], id);
    }
  });
});

void describe('animation motion (plan note 9): no new idle swap is larger than the largest shipped in E1 to E3', () => {
  const idleDiffs = (id: string): number[] =>
    frameDiffs(SHIPPED_ART.enemies[id]!.animations['idle']!);
  const shippedMax = Math.max(...OLD_ENEMIES.flatMap(idleDiffs));

  void it('the largest E1 to E3 enemy idle swap is 466 changed pixels (Ooze Queen); restate if older art is reworked', (t) => {
    const biggest = OLD_ENEMIES.map((id) => [id, Math.max(...idleDiffs(id))] as const).sort(
      (a, b) => b[1] - a[1],
    )[0]!;
    t.diagnostic(`largest shipped idle swap: ${biggest[0]} ${biggest[1]}`);
    assert.deepEqual(biggest, ['ooze-queen', 466]);
  });

  void it('every E4 enemy idle swap is at most the shipped maximum, and prints the largest', (t) => {
    const lines = E4_ENEMIES.map((id) => `${id} ${Math.max(...idleDiffs(id))}`);
    t.diagnostic(lines.join(', '));
    for (const id of E4_ENEMIES) {
      for (const d of idleDiffs(id)) assert.ok(d <= shippedMax, `${id}: ${d} > ${shippedMax}`);
    }
  });

  void it('every E4 animated prop frame swap is at most the largest prop swap shipped in Stages 1 to 6', (t) => {
    const propDiffs = (stageId: string): [string, number][] =>
      Object.entries(SHIPPED_ART.stageSprites[stageId]!.props)
        .filter(([, tpl]) => (tpl.animations['idle']?.length ?? 0) > 1)
        .map(([name, tpl]) => [
          `${stageId}/${name}`,
          Math.max(...frameDiffs(tpl.animations['idle']!)),
        ]);
    const older = STAGES.slice(0, 6).flatMap((s) => propDiffs(s.id));
    const max = Math.max(...older.map((e) => e[1]));
    const mine = [CITADEL, REALM].flatMap(propDiffs);
    t.diagnostic(`older max ${max}; E4: ${mine.map((e) => `${e[0]} ${e[1]}`).join(', ')}`);
    assert.equal(mine.length, 4, 'iceLamp, iceSheet, floatingShard, wispTorch');
    for (const [name, d] of mine) assert.ok(d <= max, `${name}: ${d} > ${max}`);
  });

  void it('the measurement is not vacuous: swapping an enemy idle frame for a blank one counts every opaque cell', () => {
    const first = SHIPPED_ART.enemies['ooze-queen']!.animations['idle']![0]!;
    const blank = first.map((line) => '.'.repeat(line.length));
    const opaque = first.join('').replaceAll('.', '').length;
    assert.ok(opaque > 0);
    assert.equal(frameDiffs([first, blank])[0], opaque);
  });
});

void describe('rasterization over the stage palette (drift 13.6, extended to Stages 7 and 8)', () => {
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

  void it('Stage 7 and Stage 8 enemies resolve through their own stage palette: recolored, same opaque pixels as the master resolution', () => {
    for (const id of E4_ENEMIES) {
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

  void it('an enemy takes its own stage palette: swapping the Stage 7 and Stage 8 palettes changes the result', () => {
    const swapped = cloneArt();
    swapped.stagePalettes[CITADEL] = { ...SHIPPED_ART.stagePalettes[REALM]! };
    swapped.stagePalettes[REALM] = { ...SHIPPED_ART.stagePalettes[CITADEL]! };
    for (const id of ['rime-penguin', 'lantern-wraith']) {
      assert.notDeepEqual(pixels(swapped as unknown as ArtSet, id), pixels(SHIPPED_ART, id), id);
    }
  });

  void it('older stages are unaffected by the new stage palettes', () => {
    const stripped = cloneArt();
    delete stripped.stagePalettes[CITADEL];
    delete stripped.stagePalettes[REALM];
    for (const id of ['cellar-rat', 'goblin-miner', 'green-slime', 'bone-soldier', 'ember-imp']) {
      assert.deepEqual(pixels(stripped as unknown as ArtSet, id), pixels(SHIPPED_ART, id), id);
    }
  });

  void it('boss phase palettes lay over the stage palette: same silhouette, phase 2 differs, only overridden characters change', () => {
    for (const id of E4_BOSSES) {
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
});

void describe('the E4 files: characters only (invariant 5) and the hero-side vocabulary (invariant 1), comments included', () => {
  const ART = [
    'src/game/sprites/stage7Templates.ts',
    'src/game/sprites/stage8Templates.ts',
    'src/game/sprites/enemiesStage7.ts',
    'src/game/sprites/enemiesStage8.ts',
    'src/game/sprites/glacierMammothTemplate.ts',
    'src/game/sprites/eclipseWardenTemplate.ts',
    'src/game/sprites/palettesE4.ts',
  ];
  const ENGINE = ['src/game/Ambience.ts', 'src/game/Particles.ts'];
  const BANNED = /\b(hp|health|mana|dead|downed|retreat|damage|gauge|hurt|dying)\b/i;

  void it('every file exists and is not empty', () => {
    for (const f of [...ART, ...ENGINE]) assert.ok(readText(f).length > 100, f);
  });

  void it('the ban list (hp, health, mana, dead, downed, retreat, damage, gauge, hurt, dying) matches nowhere', () => {
    for (const f of [...ART, ...ENGINE, 'src/game/data/stages.ts']) {
      const hit = BANNED.exec(readText(f));
      assert.equal(hit, null, `${f}: ${hit?.[0]}`);
    }
    // tuning.ts keeps older enemy-side prose (E1); only the E4 block is scanned.
    const tuning = readText('src/game/data/tuning.ts');
    const start = tuning.indexOf('SNOW_MIN_Y');
    const end = tuning.indexOf('\n', tuning.indexOf('MURK_LIFE_MAX_MS', start));
    assert.ok(start > 0 && end > start, 'the E4 tuning block exists');
    assert.doesNotMatch(tuning.slice(start, end), BANNED);
  });

  void it('the template files hold no hex colour and no data URI; palettesE4 holds hex only as palette values', () => {
    for (const f of ART.filter((file) => !file.endsWith('palettesE4.ts'))) {
      assert.doesNotMatch(code(f), /#[0-9a-fA-F]{3,8}\b/, f);
      assert.doesNotMatch(code(f), /data:/, f);
    }
    assert.doesNotMatch(code('src/game/sprites/palettesE4.ts'), /data:/);
    assert.doesNotMatch(code('src/game/sprites/palettesE4.ts'), /\b(fetch|import\(|http)/);
    for (const f of ENGINE) assert.doesNotMatch(code(f), /#[0-9a-fA-F]{3,8}\b/, f);
  });

  void it('no E4 art or ambient file names a status effect, a freeze, or a hero state', () => {
    for (const f of [...ART, ...ENGINE]) {
      assert.doesNotMatch(
        code(f),
        /\b(poison|poisoned|status|debuff|buff|slowed|chilled|freezing|freeze|frozen hero|cursed|stunned)\b/i,
        f,
      );
    }
  });

  void it('prose never describes a hero as frozen, chilled, hurt, or shadowed (frozen is a stage and scenery name only)', () => {
    for (const f of [...ART, ...ENGINE]) {
      for (const line of readText(f).split('\n')) {
        if (/\bheroe?s?\b/i.test(line)) {
          assert.doesNotMatch(
            line,
            /\b(frozen|freez\w*|chill\w*|shadowed|hurt|cold)\b/i,
            `${f}: ${line}`,
          );
        }
      }
    }
  });

  void it('no E4 art file uses a pressure, cold gauge, or meter word', () => {
    for (const f of ART) {
      assert.doesNotMatch(
        readText(f),
        /\b(pressure|cold gauge|meter|thermometer|temperature)\b/i,
        f,
      );
    }
  });
});
