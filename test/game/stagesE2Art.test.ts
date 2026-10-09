// E2 art contracts (E2 plan test notes 4 and 7): the Stage 3 and Stage 4 environments and the ten
// new enemies pass the validators, each rule rejects a crafted fault, the new enemies rasterize
// over their own stage palette with boss phase palettes laid over it, and the new files carry
// characters only and none of the hero-side banned vocabulary (comments included).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ENEMIES } from '../../src/game/data/enemies';
import type { EnemyRow } from '../../src/game/data/enemies';
import { STAGES } from '../../src/game/data/stages';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import type { ArtSet } from '../../src/game/sprites/spriteFactory';
import { SpriteCache } from '../../src/game/sprites/spriteFactory';
import { validateArtSet, validateEnemyArt } from '../../src/game/sprites/spriteValidator';
import type { SpriteTemplate } from '../../src/game/sprites/spriteTypes';
import { validateStages } from '../../src/game/Stage';
import { listFiles, readText } from '../support/repo';
import { code } from '../support/source';
import { FakeBitmaps } from '../support/engineFakes';
import type { FakeBitmap } from '../support/engineFakes';

const SLIME = 'toxic-slime-caverns';
const CATA = 'ancient-catacombs';
const STAGE3 = ['green-slime', 'spore-shroom', 'toxic-toad', 'jelly-cube', 'ooze-queen'];
const STAGE4 = ['bone-soldier', 'wailing-ghost', 'tomb-scarab', 'crypt-mummy', 'tomb-lich'];
const NEW_ENEMIES = [...STAGE3, ...STAGE4];

type Mutable = {
  stageSprites: Record<string, { props: Record<string, SpriteTemplate> }>;
  stagePalettes: Record<string, Record<string, string>>;
  enemyPhasePalettes: Record<string, Record<string, string>[]>;
  enemies: Record<string, SpriteTemplate>;
  palette: Record<string, string>;
  particlePalette: Record<string, string[]>;
};
const cloneArt = (): Mutable => structuredClone(SHIPPED_ART) as unknown as Mutable;
const hasError = (errors: readonly string[], pattern: RegExp): boolean =>
  errors.some((e) => pattern.test(e));

const row = (id: string): EnemyRow => {
  const found = ENEMIES.find((r) => r.id === id);
  assert.ok(found, id);
  return found;
};

void describe('the shipped Stage 3 and Stage 4 environments', () => {
  void it('validateStages(STAGES, SHIPPED_ART) and validateArtSet(SHIPPED_ART) are empty with six stages (E3)', () => {
    assert.equal(STAGES.length, 6);
    assert.deepEqual(validateStages(STAGES, SHIPPED_ART), []);
    assert.deepEqual(validateArtSet(SHIPPED_ART), []);
    assert.deepEqual(Object.keys(SHIPPED_ART.stageSprites).sort(), STAGES.map((s) => s.id).sort());
  });

  void it('each new stage carries its required props, with a 2-frame glow shroom pulse and a 4-frame candelabra loop', () => {
    const slime = SHIPPED_ART.stageSprites[SLIME]!.props;
    for (const name of [
      'pipe',
      'slimeDrape',
      'glowShroom',
      'toxicBarrel',
      'slimePool',
      'mushrooms',
      'doorFrame',
    ]) {
      assert.ok(slime[name] !== undefined, `${SLIME}/${name}`);
    }
    assert.ok(slime['glowShroom']!.animations['idle']!.length >= 2);
    const cata = SHIPPED_ART.stageSprites[CATA]!.props;
    for (const name of [
      'skullNiche',
      'candelabra',
      'crackedPillar',
      'sarcophagus',
      'urn',
      'boneRubble',
      'doorFrame',
    ]) {
      assert.ok(cata[name] !== undefined, `${CATA}/${name}`);
    }
    assert.ok(cata['candelabra']!.animations['idle']!.length >= 4);
  });

  void it('placements: at most 8 lights, one door frame, solids only as alcove floor props at foot y 134, no prop named puddle in Stage 3', () => {
    for (const id of [SLIME, CATA]) {
      const def = STAGES.find((s) => s.id === id)!;
      assert.ok(def.props.filter((p) => p.light !== null).length <= 8);
      assert.equal(def.props.filter((p) => p.prop === 'doorFrame').length, 1);
      for (const p of def.props.filter((placed) => placed.solid !== null)) {
        assert.equal(p.zone, 'alcove', `${id}/${p.prop}`);
        assert.equal(p.layer, 'floor');
        assert.equal(p.y, 134);
      }
      assert.ok(def.props.length >= 10);
    }
    assert.ok(!STAGES.find((s) => s.id === SLIME)!.props.some((p) => p.prop === 'puddle'));
  });

  void it('the lights: glow shroom does not flicker, candelabra does; both use the T light character', () => {
    const lights = (id: string): { prop: string; flicker: boolean; colorChar: string }[] =>
      STAGES.find((s) => s.id === id)!
        .props.filter((p) => p.light !== null)
        .map((p) => ({ prop: p.prop, ...p.light! }));
    const slime = lights(SLIME);
    assert.ok(slime.length >= 2 && slime.every((l) => l.prop === 'glowShroom'));
    assert.ok(slime.every((l) => !l.flicker && l.colorChar === 'T'));
    const cata = lights(CATA);
    assert.ok(cata.length >= 2 && cata.every((l) => l.prop === 'candelabra'));
    assert.ok(cata.every((l) => l.flicker && l.colorChar === 'T'));
  });

  void it('the stage palettes override exactly 1 to 8, g, and T, as valid hex; the master palette gained no characters', () => {
    for (const id of [SLIME, CATA]) {
      const pal = SHIPPED_ART.stagePalettes[id]!;
      assert.deepEqual(Object.keys(pal).sort(), ['1', '2', '3', '4', '5', '6', '7', '8', 'T', 'g']);
      for (const value of Object.values(pal)) assert.match(value, /^#[0-9a-f]{6}$/i);
    }
    const colors = Object.keys(SHIPPED_ART.palette).length;
    assert.ok(colors <= 48, `${colors}`);
    assert.equal(colors, 37, 'E2 adds no master character (restate if a later batch does)');
  });

  void it('the bubble and wisp ramps are three master characters each', () => {
    for (const kind of ['bubble', 'wisp'] as const) {
      const ramp = SHIPPED_ART.particlePalette[kind];
      assert.equal(ramp.length, 3, kind);
      for (const ch of ramp) assert.ok(SHIPPED_ART.palette[ch] !== undefined, `${kind} ${ch}`);
    }
  });
});

void describe('the ten new enemies', () => {
  void it('there is one template per enemy row (thirty), at the documented tier sizes and animation sets', () => {
    assert.equal(Object.keys(SHIPPED_ART.enemies).length, 30);
    assert.deepEqual(validateEnemyArt(SHIPPED_ART), []);
    const size = { minion: 16, elite: 24, boss: 48 } as const;
    for (const id of NEW_ENEMIES) {
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
      const colors = new Set(Object.values(t.animations).flat(2).join('').replaceAll('.', ''));
      assert.ok(colors.size <= 12, `${id}: ${colors.size} colors`);
    }
  });

  void it('silhouettes are distinct: no two new enemies of one tier share both pixel count and bounding box', () => {
    const shape = (id: string): string => {
      const rows = SHIPPED_ART.enemies[id]!.animations['idle']![0]!;
      let count = 0;
      let minX = Infinity;
      let maxX = -1;
      let minY = Infinity;
      let maxY = -1;
      rows.forEach((line, y) => {
        [...line].forEach((ch, x) => {
          if (ch !== '.') {
            count += 1;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        });
      });
      return `${row(id).tier}:${count}:${maxX - minX + 1}x${maxY - minY + 1}`;
    };
    const shapes = NEW_ENEMIES.map(shape);
    assert.equal(new Set(shapes).size, NEW_ENEMIES.length, shapes.join(' '));
    // And none is a solid filled block (a silhouette with some negative space).
    for (const id of NEW_ENEMIES) {
      const rows = SHIPPED_ART.enemies[id]!.animations['idle']![0]!;
      assert.ok(rows.join('').includes('.'), `${id} has transparent pixels`);
    }
  });

  // The overlap, IoU, same-stage, exact-duplicate, and KNOWN_OVER checks moved to lookAlikes.test.ts.
});

void describe('rasterization over the stage palette (drift 13.6, extended to Stages 3 and 4)', () => {
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

  void it('Stage 3 and Stage 4 enemies resolve through their own stage palette: recolored, with the same opaque pixels as the master resolution', () => {
    for (const id of NEW_ENEMIES) {
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

  void it('an enemy takes its own stage palette, not another stage palette: swapping the Stage 3 and Stage 4 palettes changes the result', () => {
    const swapped = cloneArt();
    swapped.stagePalettes[SLIME] = { ...SHIPPED_ART.stagePalettes[CATA]! };
    swapped.stagePalettes[CATA] = { ...SHIPPED_ART.stagePalettes[SLIME]! };
    for (const id of ['green-slime', 'bone-soldier']) {
      assert.notDeepEqual(pixels(swapped as unknown as ArtSet, id), pixels(SHIPPED_ART, id), id);
    }
  });

  void it('older stages are unaffected by the new stage palettes', () => {
    const stripped = cloneArt();
    delete stripped.stagePalettes[SLIME];
    delete stripped.stagePalettes[CATA];
    for (const id of ['cellar-rat', 'goblin-miner', 'rat-king', 'goblin-foreman']) {
      assert.deepEqual(pixels(stripped as unknown as ArtSet, id), pixels(SHIPPED_ART, id), id);
    }
  });

  void it('boss phase palettes lay over the stage palette: same silhouette, phase 2 differs, only overridden characters change', () => {
    for (const id of ['ooze-queen', 'tomb-lich']) {
      const p1 = pixels(SHIPPED_ART, id, 1);
      const p2 = pixels(SHIPPED_ART, id, 2);
      assert.deepEqual(
        p1.map((c) => c === '.'),
        p2.map((c) => c === '.'),
        `${id}: same silhouette`,
      );
      assert.notDeepEqual(p1, p2, `${id}: phase 2 looks different`);
      // Pixels phase 2 leaves alone still show the stage colors (not the master colors).
      const master2 = pixels(without(), id, 2);
      const kept = p1
        .map((c, i) => (c === p2[i] && c !== master2[i] ? i : -1))
        .filter((i) => i >= 0);
      assert.ok(kept.length > 0, `${id}: untouched pixels keep the stage palette`);
      // Overlay semantics with a crafted single override.
      const art = cloneArt();
      art.enemyPhasePalettes[id] = [{ '3': '#ff00ff' }];
      const a = pixels(art as unknown as ArtSet, id, 1);
      const b = pixels(art as unknown as ArtSet, id, 2);
      assert.ok(b.filter((c, i) => c !== a[i]).every((c) => c === '255,0,255'));
    }
  });

  void it('ENEMY_PHASE_PALETTES keys are exactly the six boss ids, one phase each, at most four master characters', () => {
    const bosses = ENEMIES.filter((r) => r.tier === 'boss').map((r) => r.id);
    assert.deepEqual(Object.keys(SHIPPED_ART.enemyPhasePalettes).sort(), [
      'elder-dryad',
      'goblin-foreman',
      'molten-colossus',
      'ooze-queen',
      'rat-king',
      'tomb-lich',
    ]);
    assert.deepEqual(Object.keys(SHIPPED_ART.enemyPhasePalettes).sort(), bosses.sort());
    for (const list of Object.values(SHIPPED_ART.enemyPhasePalettes)) {
      assert.equal(list.length, 1);
      assert.ok(Object.keys(list[0]!).length <= 4);
    }
  });
});

void describe('negative cases for the new stages', () => {
  void it('a missing required prop in each new stage is reported by name', () => {
    for (const [id, prop] of [
      [SLIME, 'glowShroom'],
      [SLIME, 'toxicBarrel'],
      [CATA, 'candelabra'],
      [CATA, 'sarcophagus'],
      [CATA, 'doorFrame'],
    ] as const) {
      const art = cloneArt();
      delete art.stageSprites[id]!.props[prop];
      const errors = validateArtSet(art as unknown as ArtSet);
      assert.ok(
        hasError(errors, new RegExp(`${id}: missing required prop ${prop}`)),
        errors.join(),
      );
    }
  });

  void it('flame loops that are too short are rejected: a 1-frame glow shroom and a 3-frame candelabra', () => {
    const shroom = cloneArt();
    const g = shroom.stageSprites[SLIME]!.props['glowShroom']!;
    g.animations['idle'] = g.animations['idle']!.slice(0, 1);
    const e1 = validateArtSet(shroom as unknown as ArtSet);
    assert.ok(hasError(e1, /glowShroom needs a flame loop of at least 2 frames/), e1.join());
    const candle = cloneArt();
    const c = candle.stageSprites[CATA]!.props['candelabra']!;
    c.animations['idle'] = c.animations['idle']!.slice(0, 3);
    const e2 = validateArtSet(candle as unknown as ArtSet);
    assert.ok(hasError(e2, /candelabra needs a flame loop of at least 4 frames/), e2.join());
  });

  void it('a prop or tile using a character outside the stage set is rejected in both new stages', () => {
    for (const id of [SLIME, CATA]) {
      const art = cloneArt();
      const props = art.stageSprites[id]!.props;
      const name = Object.keys(props).find((n) => n !== 'doorFrame')!;
      const frame = props[name]!.animations['idle']![0]!;
      const at = frame.findIndex((r) => r.replaceAll('.', '').length > 0);
      frame[at] = 'o' + frame[at]!.slice(1);
      const errors = validateArtSet(art as unknown as ArtSet);
      assert.ok(hasError(errors, /outside the stage set/), `${id}: ${errors.join()}`);
    }
  });

  void it('a missing boss template is reported by id', () => {
    const art = cloneArt();
    delete art.enemies['ooze-queen'];
    const errors = validateEnemyArt(art as unknown as ArtSet);
    assert.ok(hasError(errors, /ooze-queen: no enemy template/), errors.join());
  });

  void it('a boss template without its telegraph is rejected for both new bosses', () => {
    for (const id of ['ooze-queen', 'tomb-lich']) {
      const art = cloneArt();
      delete art.enemies[id]!.animations['telegraph'];
      const errors = validateEnemyArt(art as unknown as ArtSet);
      assert.ok(hasError(errors, new RegExp(id)), `${id}: ${errors.join()}`);
    }
  });
});

void describe('boss phase palette requirement (validateEnemyArt)', () => {
  const bosses = ENEMIES.filter((r) => r.tier === 'boss').map((r) => r.id);
  const phaseErrors = (art: Mutable): string[] =>
    validateEnemyArt(art as unknown as ArtSet).filter((m) => /boss has no phase palette/.test(m));

  void it('shipped art reports no missing phase palette', () => {
    assert.deepEqual(phaseErrors(cloneArt()), []);
  });

  void it('deleting a boss entry yields exactly one error naming that boss (ooze-queen, rat-king)', () => {
    for (const id of ['ooze-queen', 'rat-king']) {
      const art = cloneArt();
      delete art.enemyPhasePalettes[id];
      assert.deepEqual(phaseErrors(art), [`${id}: boss has no phase palette`]);
    }
  });

  void it('an empty entry yields exactly one error for that boss', () => {
    for (const id of bosses) {
      const art = cloneArt();
      art.enemyPhasePalettes[id] = [];
      assert.deepEqual(phaseErrors(art), [`${id}: boss has no phase palette`]);
    }
  });

  void it('non-boss rows never trigger it, even with no phase palettes at all', () => {
    const art = cloneArt();
    art.enemyPhasePalettes = {};
    const errors = phaseErrors(art);
    assert.equal(errors.length, bosses.length);
    const nonBoss = ENEMIES.filter((r) => r.tier !== 'boss').map((r) => r.id);
    for (const id of nonBoss) assert.ok(!errors.some((m) => m.startsWith(`${id}:`)), id);
  });
});

void describe('the new art and data files (invariants 1 and 5)', () => {
  const ART = [
    'src/game/sprites/stage3Templates.ts',
    'src/game/sprites/stage4Templates.ts',
    'src/game/sprites/enemiesStage3.ts',
    'src/game/sprites/enemiesStage4.ts',
    'src/game/sprites/oozeQueenTemplate.ts',
    'src/game/sprites/tombLichTemplate.ts',
    'src/game/sprites/palettesE2.ts',
  ];
  const ENGINE = ['src/game/Ambience.ts', 'src/game/Particles.ts'];
  const BANNED = /\b(hp|health|mana|dead|downed|retreat|damage|gauge|hurt|dying)\b/i;

  void it('every new file exists', () => {
    const all = new Set(listFiles('src/game'));
    for (const f of [...ART, ...ENGINE]) assert.ok(all.has(f), f);
  });

  void it('the hero-side ban list (hp, health, mana, dead, downed, retreat, damage, gauge, hurt, dying) matches nowhere, comments included', () => {
    for (const f of [...ART, ...ENGINE]) {
      const hit = BANNED.exec(readText(f));
      assert.equal(hit, null, `${f}: ${hit?.[0]}`);
    }
  });

  void it('the new template files hold no hex colour and no data URI; palettesE2 holds hex only as palette values', () => {
    for (const f of ART.filter((file) => !file.endsWith('palettesE2.ts'))) {
      assert.doesNotMatch(code(f), /#[0-9a-fA-F]{3,8}\b/, f);
      assert.doesNotMatch(code(f), /data:/, f);
    }
    assert.doesNotMatch(code('src/game/sprites/palettesE2.ts'), /data:/);
    assert.doesNotMatch(code('src/game/sprites/palettesE2.ts'), /\b(fetch|import\(|http)/);
  });

  void it('no new art or ambient file draws or names a hero, a status, or a poison icon', () => {
    for (const f of [...ART, ...ENGINE]) {
      assert.doesNotMatch(code(f), /\b(poison|poisoned|status|debuff|buff|slowed)\b/i, f);
    }
  });
});
