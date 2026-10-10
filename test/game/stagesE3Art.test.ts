// E3 art and data contracts (E3 plan section 7, notes 5, 6, 7, and 8): the Stage 5 and Stage 6
// environments, the ten new enemies and two bosses, the lava rules, the Stage 6 tint rule, the
// rasterization over the stage palettes with the boss phase palettes laid over them, and the
// vocabulary scans over every new file (comments included).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ENEMIES } from '../../src/game/data/enemies';
import type { EnemyRow } from '../../src/game/data/enemies';
import { STAGES } from '../../src/game/data/stages';
import type { StageDef } from '../../src/game/data/stages';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import { STAGE_PALETTES } from '../../src/game/sprites/palettes';
import { SpriteCache } from '../../src/game/sprites/spriteFactory';
import type { ArtSet } from '../../src/game/sprites/spriteFactory';
import type { SpriteTemplate } from '../../src/game/sprites/spriteTypes';
import { validateArtSet, validateEnemyArt } from '../../src/game/sprites/spriteValidator';
import { validateStages } from '../../src/game/Stage';
import { FakeBitmaps } from '../support/engineFakes';
import type { FakeBitmap } from '../support/engineFakes';
import { readText } from '../support/repo';
import { code } from '../support/source';

const FOREST = 'enchanted-forest-ruins';
const MOLTEN = 'molten-core';
const STAGE5 = ['thorn-sprout', 'moss-wolf', 'bramble-pixie', 'ancient-treant', 'elder-dryad'];
const STAGE6 = ['ember-imp', 'slag-snail', 'magma-crab', 'furnace-guard', 'molten-colossus'];
const E3_ENEMIES = [...STAGE5, ...STAGE6];
const E3_BOSSES = ['elder-dryad', 'molten-colossus'];

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

void describe('the shipped Stage 5 and Stage 6 environments', () => {
  void it('validateStages and validateArtSet are empty and the first six stage ids are in order', () => {
    assert.deepEqual(STAGES.map((s) => s.id).slice(0, 6), [
      'forgotten-cellar',
      'goblin-mine-shafts',
      'toxic-slime-caverns',
      'ancient-catacombs',
      FOREST,
      MOLTEN,
    ]);
    assert.deepEqual(validateStages(STAGES, SHIPPED_ART), []);
    assert.deepEqual(validateArtSet(SHIPPED_ART), []);
    assert.equal(stageDef(FOREST).index, 5);
    assert.equal(stageDef(MOLTEN).index, 6);
    assert.equal(stageDef(FOREST).name, 'Enchanted Forest Ruins');
    assert.equal(stageDef(MOLTEN).name, 'Molten Core');
  });

  void it('each stage carries its required props, with a 2-frame glowBloom and 4-frame lavaFall and 2-frame lavaChannel loop', () => {
    const forest = SHIPPED_ART.stageSprites[FOREST]!.props;
    for (const name of [
      'doorFrame',
      'brokenPillar',
      'hangingRoots',
      'glowBloom',
      'ruinedStatue',
      'fernPatch',
      'flowerBed',
    ]) {
      assert.ok(forest[name] !== undefined, `${FOREST} ${name}`);
    }
    assert.ok(forest['glowBloom']!.animations['idle']!.length >= 2);
    const molten = SHIPPED_ART.stageSprites[MOLTEN]!.props;
    for (const name of [
      'doorFrame',
      'obsidianPillar',
      'lavaFall',
      'lavaChannel',
      'anvil',
      'slagHeap',
      'toolRack',
    ]) {
      assert.ok(molten[name] !== undefined, `${MOLTEN} ${name}`);
    }
    assert.ok(molten['lavaFall']!.animations['idle']!.length >= 4);
    assert.ok(molten['lavaChannel']!.animations['idle']!.length >= 2);
  });

  void it('the ambients are the planned kinds and rates', () => {
    assert.deepEqual(stageDef(FOREST).ambient, { kind: 'fireflies', perSecond: 5 });
    assert.deepEqual(stageDef(MOLTEN).ambient, { kind: 'embers', perSecond: 6 });
  });

  void it('at least 6 distinct props plus the door frame, at most 8 lights, light colour char T', () => {
    for (const id of [FOREST, MOLTEN]) {
      const names = new Set(stageDef(id).props.map((p) => p.prop));
      assert.ok(names.size >= 7, `${id}: ${names.size} distinct props`);
      const lights = stageDef(id).props.filter((p) => p.light !== null);
      assert.ok(lights.length >= 1 && lights.length <= 8, `${id}: ${lights.length} lights`);
      for (const p of lights) assert.equal(p.light!.colorChar, 'T', `${id} ${p.prop}`);
    }
  });

  void it('solid props are alcove floor props at foot y 134 with a 12x5 footprint, and nothing else is solid', () => {
    for (const id of [FOREST, MOLTEN]) {
      const solids = stageDef(id).props.filter((p) => p.solid !== null);
      assert.ok(solids.length >= 1, `${id} has its alcove statue or anvil`);
      for (const p of solids) {
        assert.equal(p.layer, 'floor', `${id} ${p.prop}`);
        assert.equal(p.zone, 'alcove', `${id} ${p.prop}`);
        assert.equal(p.y, 134, `${id} ${p.prop}`);
        assert.deepEqual(p.solid, { w: 12, h: 5 }, `${id} ${p.prop}`);
      }
    }
    assert.deepEqual(
      stageDef(FOREST)
        .props.filter((p) => p.solid !== null)
        .map((p) => p.prop),
      ['ruinedStatue'],
    );
    assert.deepEqual(
      stageDef(MOLTEN)
        .props.filter((p) => p.solid !== null)
        .map((p) => p.prop),
      ['anvil'],
    );
  });

  void it('the stage palettes override exactly 1 to 8, g, and T as valid hex; the master gained at most 3 characters (hard cap 40, cap 48)', () => {
    for (const id of [FOREST, MOLTEN]) {
      const pal = SHIPPED_ART.stagePalettes[id]!;
      assert.deepEqual(Object.keys(pal).sort(), ['1', '2', '3', '4', '5', '6', '7', '8', 'T', 'g']);
      for (const value of Object.values(pal)) assert.match(value, /^#[0-9a-f]{6}$/i);
    }
    const colors = Object.keys(SHIPPED_ART.palette).length;
    assert.ok(colors >= 37 && colors <= 40, `${colors} master characters`);
    assert.equal(colors, 37, 'E3 adds no master character (restate if a later batch does)');
  });

  void it('firefly uses only master characters Y, N, L (no new colours)', () => {
    for (const ch of SHIPPED_ART.particlePalette.firefly) {
      assert.ok('YNL'.includes(ch), ch);
      assert.ok(SHIPPED_ART.palette[ch] !== undefined, ch);
    }
  });

  void it('a missing required prop in each new stage is reported by name', () => {
    for (const [id, prop] of [
      [FOREST, 'glowBloom'],
      [FOREST, 'ruinedStatue'],
      [FOREST, 'doorFrame'],
      [MOLTEN, 'lavaFall'],
      [MOLTEN, 'lavaChannel'],
      [MOLTEN, 'anvil'],
      [MOLTEN, 'doorFrame'],
    ] as const) {
      const art = cloneArt();
      delete art.stageSprites[id]!.props[prop];
      const errors = validateArtSet(art as unknown as ArtSet);
      assert.ok(hasError(errors, new RegExp(prop)), `${id} ${prop}: ${errors.join()}`);
    }
  });

  void it('a flame loop that is too short is reported (glowBloom 2, lavaFall 4, lavaChannel 2)', () => {
    for (const [id, prop, min] of [
      [FOREST, 'glowBloom', 2],
      [MOLTEN, 'lavaFall', 4],
      [MOLTEN, 'lavaChannel', 2],
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
});

void describe('lava safety (E3 plan 5.1 rules, hazard-free guarantee)', () => {
  void it('no floor-layer placement in any stage has lava in its prop name', () => {
    for (const stage of STAGES) {
      for (const p of stage.props.filter((x) => x.layer === 'floor')) {
        assert.doesNotMatch(p.prop, /lava/i, `${stage.id}: floor prop ${p.prop}`);
      }
    }
  });

  void it('lavaFall and lavaChannel are wall-layer, not solid, with a light that does not flicker', () => {
    const placements = stageDef(MOLTEN).props.filter((p) => /^lava/.test(p.prop));
    assert.ok(placements.length >= 4, `${placements.length} lava placements`);
    assert.deepEqual([...new Set(placements.map((p) => p.prop))].sort(), [
      'lavaChannel',
      'lavaFall',
    ]);
    for (const p of placements) {
      assert.equal(p.layer, 'wall', p.prop);
      assert.equal(p.solid, null, p.prop);
      assert.ok(p.light !== null, `${p.prop} is a light source`);
      assert.equal(p.light.flicker, false, `${p.prop} does not flicker`);
    }
    for (const p of stageDef(FOREST).props.filter((x) => x.prop === 'glowBloom')) {
      assert.equal(p.layer, 'wall');
      assert.equal(p.light?.flicker, false);
    }
  });

  void it('lava appears in no other stage, and no Stage 5 or 6 prop is named puddle', () => {
    for (const stage of STAGES.filter((s) => s.id !== MOLTEN)) {
      assert.deepEqual(
        stage.props.filter((p) => /lava/i.test(p.prop)),
        [],
        stage.id,
      );
    }
    for (const id of [FOREST, MOLTEN]) {
      for (const name of Object.keys(SHIPPED_ART.stageSprites[id]!.props)) {
        assert.doesNotMatch(name, /puddle/i, `${id} ${name}`);
      }
    }
  });

  void it('lava wall props sit on the wall, above the walking floor (bottom edge at or above the back-wall foot line y 134 plus the channel base band)', () => {
    for (const p of stageDef(MOLTEN).props.filter((x) => /^lava/.test(x.prop))) {
      const t = SHIPPED_ART.stageSprites[MOLTEN]!.props[p.prop]!;
      assert.ok(p.y + t.h <= 140, `${p.prop} at y ${p.y} height ${t.h} reaches the walking floor`);
    }
  });

  void it('lights are decoration data only: a light has no field that names damage, heat, or a hazard', () => {
    for (const stage of STAGES) {
      for (const p of stage.props) {
        if (p.light === null) continue;
        assert.deepEqual(Object.keys(p.light).sort(), [
          'colorChar',
          'flicker',
          'intensity',
          'radius',
        ]);
      }
    }
  });
});

void describe('the Stage 6 tint rule (E3 plan 5.1 rule 4)', () => {
  void it('the ambient character g is never red-dominant: red at most 1.3 times the larger of green and blue, in every stage', () => {
    for (const stage of STAGES) {
      // Stage 1 has no palette override: it uses the master `g`.
      const hex = STAGE_PALETTES[stage.id]?.['g'] ?? SHIPPED_ART.palette['g']!;
      const [r, g, b] = rgb(hex);
      assert.ok(r <= 1.3 * Math.max(g, b), `${stage.id}: g ${hex} red ${r} vs ${Math.max(g, b)}`);
    }
    const [r, g, b] = rgb(STAGE_PALETTES[MOLTEN]!['g']!);
    assert.ok(r / Math.max(g, b) <= 1.3, `molten-core ratio ${r / Math.max(g, b)}`);
    assert.ok(r / Math.max(g, b) >= 1, 'neutral to warm');
    assert.ok(Math.max(r, g, b) <= 160, 'dark');
  });

  void it('Stage 6 lights stay at intensity 0.8 or less', () => {
    for (const p of stageDef(MOLTEN).props) {
      if (p.light !== null) assert.ok(p.light.intensity <= 0.8, `${p.prop} ${p.light.intensity}`);
    }
  });

  void it('a crafted red-dominant tint would fail the same check (the rule is not vacuous)', () => {
    const [r, g, b] = rgb('#a03020');
    assert.ok(r > 1.3 * Math.max(g, b));
  });
});

void describe('the ten new enemies', () => {
  void it('one template per enemy row (forty in all), tier sizes, animation sets, and validateEnemyArt empty', () => {
    assert.equal(Object.keys(SHIPPED_ART.enemies).length, 40);
    assert.deepEqual(validateEnemyArt(SHIPPED_ART), []);
    const size = { minion: 16, elite: 24, boss: 48 } as const;
    for (const id of E3_ENEMIES) {
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
    const shapes = E3_ENEMIES.map(shape);
    assert.equal(new Set(shapes).size, E3_ENEMIES.length, shapes.join(' '));
    for (const id of E3_ENEMIES) {
      assert.ok(SHIPPED_ART.enemies[id]!.animations['idle']![0]!.join('').includes('.'), id);
    }
  });

  void it('both new bosses have exactly one phase palette of at most four master characters, as #rrggbb, and a missing one is reported', () => {
    for (const id of E3_BOSSES) {
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

  void it('an Elder Dryad or Molten Colossus phase palette with five overrides or a non-boss owner is rejected', () => {
    const many = cloneArt();
    many.enemyPhasePalettes['elder-dryad'] = [
      { '1': '#000000', '2': '#000001', '3': '#000002', '4': '#000003', '5': '#000004' },
    ];
    assert.ok(
      hasError(
        validateEnemyArt(many as unknown as ArtSet),
        /elder-dryad: phase palette overrides 5 characters, limit 4/,
      ),
    );
    const stray = cloneArt();
    stray.enemyPhasePalettes['moss-wolf'] = [{ '1': '#000000' }];
    assert.ok(hasError(validateEnemyArt(stray as unknown as ArtSet), /moss-wolf/));
  });
});

void describe('rasterization over the stage palette (drift 13.6, extended to Stages 5 and 6)', () => {
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

  void it('Stage 5 and Stage 6 enemies resolve through their own stage palette: recolored, same opaque pixels as the master resolution', () => {
    for (const id of E3_ENEMIES) {
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

  void it('an enemy takes its own stage palette: swapping the Stage 5 and Stage 6 palettes changes the result', () => {
    const swapped = cloneArt();
    swapped.stagePalettes[FOREST] = { ...SHIPPED_ART.stagePalettes[MOLTEN]! };
    swapped.stagePalettes[MOLTEN] = { ...SHIPPED_ART.stagePalettes[FOREST]! };
    for (const id of ['thorn-sprout', 'ember-imp']) {
      assert.notDeepEqual(pixels(swapped as unknown as ArtSet, id), pixels(SHIPPED_ART, id), id);
    }
  });

  void it('older stages are unaffected by the new stage palettes', () => {
    const stripped = cloneArt();
    delete stripped.stagePalettes[FOREST];
    delete stripped.stagePalettes[MOLTEN];
    for (const id of ['cellar-rat', 'goblin-miner', 'green-slime', 'bone-soldier', 'tomb-lich']) {
      assert.deepEqual(pixels(stripped as unknown as ArtSet, id), pixels(SHIPPED_ART, id), id);
    }
  });

  void it('boss phase palettes lay over the stage palette: same silhouette, phase 2 differs, only overridden characters change', () => {
    for (const id of E3_BOSSES) {
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

void describe('the E3 files: characters only (invariant 5) and the hero-side vocabulary (invariant 1), comments included', () => {
  const ART = [
    'src/game/sprites/stage5Templates.ts',
    'src/game/sprites/stage6Templates.ts',
    'src/game/sprites/enemiesStage5.ts',
    'src/game/sprites/enemiesStage6.ts',
    'src/game/sprites/elderDryadTemplate.ts',
    'src/game/sprites/moltenColossusTemplate.ts',
    'src/game/sprites/palettesE3.ts',
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
    // tuning.ts keeps older enemy-side prose (E1); only the E3 block is scanned.
    const tuning = readText('src/game/data/tuning.ts');
    const start = tuning.indexOf('// Stage 5 fireflies');
    const endMarker = 'STAGE_EMBER_LIFE_MAX_MS';
    const end = tuning.indexOf('\n', tuning.indexOf(endMarker, start));
    assert.ok(start > 0 && end > start, 'the E3 tuning block exists');
    assert.doesNotMatch(tuning.slice(start, end), BANNED);
  });

  void it('the template files hold no hex colour and no data URI; palettesE3 holds hex only as palette values', () => {
    for (const f of ART.filter((file) => !file.endsWith('palettesE3.ts'))) {
      assert.doesNotMatch(code(f), /#[0-9a-fA-F]{3,8}\b/, f);
      assert.doesNotMatch(code(f), /data:/, f);
    }
    assert.doesNotMatch(code('src/game/sprites/palettesE3.ts'), /data:/);
    assert.doesNotMatch(code('src/game/sprites/palettesE3.ts'), /\b(fetch|import\(|http)/);
  });

  void it('no E3 art or ambient file names a status effect, a burn, or a hero state', () => {
    for (const f of [...ART, ...ENGINE]) {
      assert.doesNotMatch(
        code(f),
        /\b(poison|poisoned|status|debuff|buff|slowed|burning|burn|scorch\w*|ignite\w*)\b/i,
        f,
      );
    }
  });

  void it('the Molten Core prose uses no gauge, pressure, or heat meter words', () => {
    for (const f of ART) {
      assert.doesNotMatch(
        readText(f),
        /\b(pressure|heat gauge|meter|thermometer|temperature)\b/i,
        f,
      );
    }
  });
});
