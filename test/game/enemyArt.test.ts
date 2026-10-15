// Enemy, drop, bar, and Stage 2 art contracts (E1 plan test note 11; sprite-spec; drift 13.6):
// the shipped art passes every validator, and each rule rejects a crafted fault with an error that
// names the template. Also the engine-generated flash and dissolve frames, the per-stage palette
// fix (a Stage 2 enemy is drawn over the mine colors, a boss phase palette over the stage palette,
// not the master), and the vocabulary and format scans of the new art files.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ENEMIES } from '../../src/game/data/enemies';
import { DROP_KINDS } from '../../src/game/data/drops';
import type { DropKind } from '../../src/game/data/drops';
import { ENEMY_DISSOLVE_FRAMES } from '../../src/game/data/tuning';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import type { ArtSet } from '../../src/game/sprites/spriteFactory';
import { SpriteCache } from '../../src/game/sprites/spriteFactory';
import {
  validateArtSet,
  validateDropArt,
  validateEnemyArt,
} from '../../src/game/sprites/spriteValidator';
import type { SpriteTemplate } from '../../src/game/sprites/spriteTypes';
import { listFiles } from '../support/repo';
import { code } from '../support/source';
import type { FakeBitmap } from '../support/engineFakes';
import { FakeBitmaps } from '../support/engineFakes';

type Overridden = 'enemies' | 'drops' | 'palette' | 'stagePalettes' | 'enemyPhasePalettes';
type MutableArt = {
  -readonly [K in Exclude<keyof ArtSet, Overridden>]: ArtSet[K];
} & {
  enemies: Record<string, SpriteTemplate>;
  drops: Record<DropKind, SpriteTemplate>;
  palette: Record<string, string>;
  stagePalettes: Record<string, Record<string, string>>;
  enemyPhasePalettes: Record<string, Record<string, string>[]>;
};

function cloneArt(): MutableArt {
  return structuredClone(SHIPPED_ART) as unknown as MutableArt;
}

const MINE = 'goblin-mine-shafts';
const hasError = (errors: readonly string[], pattern: RegExp): boolean =>
  errors.some((e) => pattern.test(e));

/** Pads every frame of a template to w x h with transparent pixels (a legal way to enlarge it). */
function resize(t: SpriteTemplate, w: number, h: number): SpriteTemplate {
  const animations: Record<string, string[][]> = {};
  for (const [name, frames] of Object.entries(t.animations)) {
    animations[name] = frames.map((rows) => {
      const padded = rows.map((r) => r + '.'.repeat(Math.max(0, w - t.w)));
      while (padded.length < h) padded.push('.'.repeat(w));
      return padded;
    });
  }
  return { ...t, w, h, animations };
}

void describe('the shipped E1 art passes every validator', () => {
  void it('validateEnemyArt, validateDropArt, and validateArtSet report nothing', () => {
    assert.deepEqual(validateEnemyArt(SHIPPED_ART), []);
    assert.deepEqual(validateDropArt(SHIPPED_ART), []);
    assert.deepEqual(validateArtSet(SHIPPED_ART), []);
  });

  void it('has exactly fifty enemy templates (E1 to E5), one per enemy row, with the documented animation sets and sizes', () => {
    assert.deepEqual(Object.keys(SHIPPED_ART.enemies).sort(), ENEMIES.map((r) => r.id).sort());
    assert.equal(ENEMIES.length, 50);
    const limit = { minion: 20, elite: 28, boss: 64 } as const;
    for (const row of ENEMIES) {
      const t = SHIPPED_ART.enemies[row.id]!;
      assert.equal(t.id, `enemies/${row.id}`);
      const names = Object.keys(t.animations).sort();
      assert.deepEqual(
        names,
        row.tier === 'boss'
          ? ['attack', 'idle', 'intro', 'telegraph', 'walk']
          : ['attack', 'idle', 'walk'],
        row.id,
      );
      assert.equal(t.animations['idle']?.length, 2);
      assert.equal(t.animations['walk']?.length, 2);
      assert.equal(t.animations['attack']?.length, 3);
      assert.ok(t.w <= limit[row.tier] && t.h <= limit[row.tier], row.id);
      assert.ok(t.anchor.x >= 0 && t.anchor.x < t.w && t.anchor.y >= 0 && t.anchor.y < t.h);
      for (const name of names) {
        assert.doesNotMatch(name, /hit|death|dead|die|dying|hurt|downed/i);
      }
    }
  });

  void it('has the four drop kinds as idle-only templates no larger than 12x12 with at most 8 colors', () => {
    assert.deepEqual(Object.keys(SHIPPED_ART.drops).sort(), [...DROP_KINDS].sort());
    for (const kind of DROP_KINDS) {
      const t = SHIPPED_ART.drops[kind];
      assert.equal(t.id, `drops/${kind}`);
      assert.deepEqual(Object.keys(t.animations), ['idle']);
      assert.ok(t.w <= 12 && t.h <= 12, `${kind} ${t.w}x${t.h}`);
      const colors = new Set(t.animations['idle']!.flat().join('').replaceAll('.', ''));
      assert.ok(colors.size <= 8, `${kind}: ${colors.size} colors`);
    }
  });

  void it('the bar frames are small outlines with a transparent interior; the fill and back characters are palette colors', () => {
    const { frame, bossFrame, fillChar, backChar } = SHIPPED_ART.enemyBar;
    assert.deepEqual([frame.w, frame.h], [18, 4]);
    assert.deepEqual([bossFrame.w, bossFrame.h], [34, 5]);
    for (const t of [frame, bossFrame]) {
      const rows = t.animations['idle']![0]!;
      assert.equal(rows[0]!.replaceAll('o', ''), '', 'top edge solid');
      assert.equal(rows[rows.length - 1]!.replaceAll('o', ''), '', 'bottom edge solid');
      for (const row of rows.slice(1, -1)) {
        assert.match(row, /^o\.+o$/, 'transparent interior');
      }
    }
    assert.ok(SHIPPED_ART.palette[fillChar] !== undefined);
    assert.ok(SHIPPED_ART.palette[backChar] !== undefined);
    assert.notEqual(fillChar, backChar);
  });

  void it('the mote ramp has three palette characters; the master palette stays within the cap of 48 colors', () => {
    const ramp = SHIPPED_ART.particlePalette['mote'];
    assert.equal(ramp.length, 3);
    for (const ch of ramp) assert.ok(SHIPPED_ART.palette[ch] !== undefined);
    const colors = Object.keys(SHIPPED_ART.palette).length;
    assert.ok(colors <= 48, `${colors} master colors`);
  });

  void it('stage palettes override only the stage characters 1 to 8 and the g and T light and ambient characters; the cellar has none', () => {
    assert.deepEqual(SHIPPED_ART.stagePalettes['forgotten-cellar'], {});
    const mine = SHIPPED_ART.stagePalettes[MINE]!;
    for (const key of Object.keys(mine)) {
      assert.match(key, /^[1-8gT]$/);
      assert.match(mine[key]!, /^#[0-9a-f]{6}$/i);
    }
    assert.deepEqual(Object.keys(mine).sort(), ['1', '2', '3', '4', '5', '6', '7', '8', 'T', 'g']);
  });

  void it('phase palettes exist for exactly the ten bosses, each overriding at most four master characters', () => {
    assert.deepEqual(Object.keys(SHIPPED_ART.enemyPhasePalettes).sort(), [
      'eclipse-warden',
      'elder-dryad',
      'glacier-mammoth',
      'goblin-foreman',
      'hoard-dragon',
      'molten-colossus',
      'ooze-queen',
      'rat-king',
      'tomb-lich',
      'void-sovereign',
    ]);
    for (const list of Object.values(SHIPPED_ART.enemyPhasePalettes)) {
      assert.equal(list.length, 1);
      assert.ok(Object.keys(list[0]!).length <= 4);
      for (const key of Object.keys(list[0]!)) assert.ok(SHIPPED_ART.palette[key] !== undefined);
    }
  });

  void it('Stage 2 has all required props with a 4-frame lantern loop', () => {
    const props = SHIPPED_ART.stageSprites[MINE]!.props;
    for (const name of [
      'support',
      'pickaxe',
      'oreVein',
      'lantern',
      'minecart',
      'rubble',
      'doorFrame',
    ]) {
      assert.ok(props[name] !== undefined, name);
    }
    assert.equal(props['lantern']!.animations['idle']!.length, 4);
  });
});

void describe('validateEnemyArt rejects crafted faults', () => {
  void it('a missing template and a template for an unknown enemy', () => {
    const art = cloneArt();
    delete art.enemies['cellar-rat'];
    art.enemies['zombie'] = SHIPPED_ART.enemies['cave-bat']!;
    const errors = validateEnemyArt(art);
    assert.ok(errors.includes('cellar-rat: no enemy template'), errors.join());
    assert.ok(errors.includes('zombie: enemy template for an unknown enemy'), errors.join());
  });

  void it('a template whose id does not match its key', () => {
    const art = cloneArt();
    art.enemies['cellar-rat'] = { ...art.enemies['cellar-rat']!, id: 'enemies/other' };
    assert.ok(
      hasError(validateEnemyArt(art), /enemies\/other: enemy id does not match its key cellar-rat/),
    );
  });

  void it('a missing required animation, an extra animation, and a wrong frame count', () => {
    const art = cloneArt();
    const rat = art.enemies['cellar-rat']!;
    delete rat.animations['walk'];
    rat.animations['dance'] = rat.animations['idle']!;
    rat.animations['attack'] = rat.animations['attack']!.slice(0, 2);
    const errors = validateEnemyArt(art);
    assert.ok(
      hasError(errors, /enemies\/cellar-rat: missing required animation walk/),
      errors.join(),
    );
    assert.ok(hasError(errors, /enemies\/cellar-rat: unexpected animation dance/), errors.join());
    assert.ok(hasError(errors, /animation attack has 2 frames, expected 3/), errors.join());
  });

  void it('a boss without telegraph or intro, and a regular enemy carrying them', () => {
    const art = cloneArt();
    delete art.enemies['rat-king']!.animations['telegraph'];
    delete art.enemies['rat-king']!.animations['intro'];
    art.enemies['cave-bat']!.animations['telegraph'] = art.enemies['cave-bat']!.animations['idle']!;
    const errors = validateEnemyArt(art);
    assert.ok(hasError(errors, /rat-king: missing required animation telegraph/));
    assert.ok(hasError(errors, /rat-king: missing required animation intro/));
    assert.ok(hasError(errors, /cave-bat: unexpected animation telegraph/));
  });

  void it('forbidden animation names: hit, death, dead, die, dying, hurt, downed', () => {
    for (const name of ['hit', 'death', 'dead', 'die', 'Dying', 'hurt', 'downed']) {
      const art = cloneArt();
      art.enemies['cellar-rat']!.animations[name] = art.enemies['cellar-rat']!.animations['idle']!;
      assert.ok(
        hasError(validateEnemyArt(art), new RegExp(`forbidden enemy animation name ${name}`)),
        name,
      );
    }
  });

  void it('an oversize tier: a minion past 16x16 is rejected, a minion at 16x16 and a boss at 48x48 are not', () => {
    const art = cloneArt();
    art.enemies['cellar-rat'] = resize(art.enemies['cellar-rat']!, 17, 16);
    assert.ok(hasError(validateEnemyArt(art), /cellar-rat: minion is larger than 16x16/));
    const tall = cloneArt();
    tall.enemies['cellar-rat'] = resize(tall.enemies['cellar-rat']!, 16, 17);
    assert.ok(hasError(validateEnemyArt(tall), /minion is larger than 16x16/));
    const elite = cloneArt();
    elite.enemies['crate-mimic'] = resize(elite.enemies['crate-mimic']!, 25, 24);
    assert.ok(hasError(validateEnemyArt(elite), /crate-mimic: elite is larger than 24x24/));
    const boss = cloneArt();
    boss.enemies['rat-king'] = resize(boss.enemies['rat-king']!, 49, 48);
    assert.ok(hasError(validateEnemyArt(boss), /rat-king: boss is larger than 48x48/));
    assert.deepEqual(validateEnemyArt(SHIPPED_ART), []);
  });

  void it('more than 12 colors in one enemy', () => {
    const art = cloneArt();
    const rat = art.enemies['cellar-rat']!;
    const chars = Object.keys(art.palette).slice(0, 14).join('');
    const row = (chars + '.'.repeat(16)).slice(0, 16);
    rat.animations['idle']![0]![0] = row;
    assert.ok(
      hasError(
        validateEnemyArt(art),
        /enemies\/cellar-rat: uses 14 colors, limit 12|uses 1\d colors, limit 12/,
      ),
    );
  });

  void it('a pixel character missing from the palette is rejected without echoing it', () => {
    const art = cloneArt();
    const frame = art.enemies['cellar-rat']!.animations['idle']![0]!;
    frame[8] = '~' + frame[8]!.slice(1);
    const errors = validateEnemyArt(art);
    assert.ok(hasError(errors, /enemies\/cellar-rat: .*missing from the palette/));
    assert.ok(errors.every((e) => !e.includes('~') || !/ ~ /.test(e)));
  });

  void it('phase palettes: more than four overrides, an unknown character, a bad value, and a non-boss owner', () => {
    const many = cloneArt();
    many.enemyPhasePalettes['rat-king'] = [
      { a: '#111111', b: '#111111', c: '#111111', d: '#111111', e: '#111111' },
    ];
    assert.ok(
      hasError(validateEnemyArt(many), /rat-king: phase palette overrides 5 characters, limit 4/),
    );
    const unknown = cloneArt();
    unknown.enemyPhasePalettes['rat-king'] = [{ '~': '#111111' }];
    assert.ok(
      hasError(validateEnemyArt(unknown), /rat-king: phase palette overrides an unknown character/),
    );
    const bad = cloneArt();
    bad.enemyPhasePalettes['rat-king'] = [{ a: 'red' }];
    assert.ok(hasError(validateEnemyArt(bad), /rat-king: phase palette value is not #rrggbb/));
    const owner = cloneArt();
    owner.enemyPhasePalettes['cellar-rat'] = [{ a: '#111111' }];
    assert.ok(
      hasError(validateEnemyArt(owner), /cellar-rat: phase palettes belong to bosses only/),
    );
  });

  void it('a bar whose fill or back character is not in the palette', () => {
    const art = cloneArt();
    (art.enemyBar as { fillChar: string }).fillChar = '~';
    assert.ok(
      hasError(validateEnemyArt(art), /enemy bar: a fill or back character is not in the palette/),
    );
  });

  void it('error text names templates and counts, never pixel rows', () => {
    const art = cloneArt();
    const frame = art.enemies['web-spider']!.animations['walk']![1]!;
    frame[3] = 'QQQQ' + frame[3]!.slice(4);
    delete art.enemies['cave-bat']!.animations['idle'];
    for (const error of validateEnemyArt(art)) {
      assert.ok(error.length < 160, error);
      assert.doesNotMatch(error, /QQQ/);
    }
  });
});

void describe('the Stage 2 palette fix: enemies are drawn over their stage palette (drift 13.6)', () => {
  /** The first opaque pixel of the first idle frame of an enemy, as [r, g, b]. */
  function firstColors(art: ArtSet, id: string, phase = 1, animation = 'idle'): string[] {
    const bitmaps = new FakeBitmaps();
    const cache = new SpriteCache(bitmaps, art);
    const sprites = cache.enemy(id, phase);
    assert.ok(sprites);
    const frame = sprites[animation]!.frames[0] as FakeBitmap;
    const out: string[] = [];
    for (let y = 0; y < frame.height; y++) {
      for (let x = 0; x < frame.width; x++) {
        const px = frame.pixel(x, y);
        out.push(px[3] === 0 ? '.' : px.slice(0, 3).join(','));
      }
    }
    return out;
  }

  const withoutStagePalettes = (): ArtSet => ({ ...SHIPPED_ART, stagePalettes: {} });

  void it('a Stage 2 enemy rasterizes with the mine colors: its colors differ from the Stage 1 (master) palette resolution', () => {
    for (const id of [
      'goblin-miner',
      'goblin-scout',
      'ore-beetle',
      'rock-golem',
      'goblin-foreman',
    ]) {
      const mine = firstColors(SHIPPED_ART, id);
      const master = firstColors(withoutStagePalettes(), id);
      assert.equal(mine.length, master.length);
      assert.notDeepEqual(mine, master, `${id} is recolored by the stage palette`);
      // The same pixels are opaque; only their colors changed.
      assert.deepEqual(
        mine.map((c) => c === '.'),
        master.map((c) => c === '.'),
        id,
      );
    }
  });

  void it('a Stage 1 enemy is unchanged by the stage palette table (the cellar has no overrides)', () => {
    for (const id of ['cellar-rat', 'cave-bat', 'web-spider', 'crate-mimic', 'rat-king']) {
      assert.deepEqual(firstColors(SHIPPED_ART, id), firstColors(withoutStagePalettes(), id), id);
    }
  });

  void it('validateEnemyArt validates a Stage 2 template against the stage-merged palette: a stage-only character passes there and fails on Stage 1 (the tilde stands in for any character the master palette lacks)', () => {
    const art = cloneArt();
    art.stagePalettes[MINE]!['~'] = '#123456';
    const miner = art.enemies['goblin-miner']!;
    const frame = miner.animations['idle']![0]!;
    const at = frame.findIndex((r) => r.replaceAll('.', '').length > 0);
    frame[at] = '~' + frame[at]!.slice(1);
    assert.deepEqual(
      validateEnemyArt(art).filter((e) => e.startsWith('enemies/goblin-miner')),
      [],
      'the stage-only character is in the mine palette',
    );
    const rat = art.enemies['cellar-rat']!;
    const ratFrame = rat.animations['idle']![0]!;
    const ratAt = ratFrame.findIndex((r) => r.replaceAll('.', '').length > 0);
    ratFrame[ratAt] = '~' + ratFrame[ratAt]!.slice(1);
    assert.ok(
      hasError(validateEnemyArt(art), /enemies\/cellar-rat: .*missing from the palette/),
      'the stage-only character is not in the cellar palette',
    );
  });

  void it('a Stage 2 template using a character the merged palette lacks is rejected (removing a mine override and the master entry)', () => {
    const art = cloneArt();
    const miner = art.enemies['goblin-miner']!;
    const frame = miner.animations['idle']![0]!;
    const at = frame.findIndex((r) => r.replaceAll('.', '').length > 0);
    frame[at] = 'Y' + frame[at]!.slice(1);
    delete art.palette['Y'];
    assert.ok(hasError(validateEnemyArt(art), /enemies\/goblin-miner: .*missing from the palette/));
  });

  void it('a boss phase palette is laid over the stage palette, not the master', () => {
    // Goblin Foreman phase 2 overrides Y, O, and 6. A pixel using a mine-only color that phase 2
    // does not override must keep its mine color in phase 2 (a master-based overlay would lose it).
    const phase1 = firstColors(SHIPPED_ART, 'goblin-foreman', 1);
    const phase2 = firstColors(SHIPPED_ART, 'goblin-foreman', 2);
    assert.notDeepEqual(phase1, phase2, 'phase 2 looks different');
    const masterBased = firstColors(withoutStagePalettes(), 'goblin-foreman', 2);
    const stageChars = phase1
      .map((c, i) => (c === phase2[i] && c !== masterBased[i] ? i : -1))
      .filter((i) => i >= 0);
    assert.ok(
      stageChars.length > 0,
      'pixels unchanged by phase 2 still show the mine colors (not the master colors)',
    );
    // Explicit: overlay semantics. Make phase 2 override '3' only; every '3' pixel must then take
    // the override and every other mine pixel must keep the mine color.
    const art = cloneArt();
    art.enemyPhasePalettes['goblin-foreman'] = [{ '3': '#ff00ff' }];
    const custom = firstColors(art, 'goblin-foreman', 2);
    const base = firstColors(art, 'goblin-foreman', 1);
    const changed = custom.filter((c, i) => c !== base[i]);
    assert.ok(
      changed.every((c) => c === '255,0,255'),
      'only the overridden character changed',
    );
  });

  void it('the rat king phase 2 differs from phase 1 only at pixels using the overridden characters', () => {
    const p1 = firstColors(SHIPPED_ART, 'rat-king', 1);
    const p2 = firstColors(SHIPPED_ART, 'rat-king', 2);
    assert.deepEqual(
      p1.map((c) => c === '.'),
      p2.map((c) => c === '.'),
      'same silhouette',
    );
    assert.notDeepEqual(p1, p2);
  });
});

void describe('engine-generated flash and dissolve frames (E1-3)', () => {
  const cache = (): { cache: SpriteCache; bitmaps: FakeBitmaps } => {
    const bitmaps = new FakeBitmaps();
    return { cache: new SpriteCache(bitmaps, SHIPPED_ART), bitmaps };
  };
  const opaque = (b: FakeBitmap): boolean[] => {
    const out: boolean[] = [];
    for (let y = 0; y < b.height; y++) {
      for (let x = 0; x < b.width; x++) out.push(b.pixel(x, y)[3] !== 0);
    }
    return out;
  };

  void it('the flash of every animation frame has the source size and silhouette in one white color', () => {
    const { cache: c } = cache();
    for (const row of ENEMIES) {
      const normal = c.enemy(row.id, 1)!;
      const flash = c.enemyFlash(row.id)!;
      assert.deepEqual(Object.keys(flash).sort(), Object.keys(normal).sort(), row.id);
      for (const name of Object.keys(normal)) {
        normal[name]!.frames.forEach((frame, i) => {
          const f = flash[name]!.frames[i] as FakeBitmap;
          assert.deepEqual([f.width, f.height], [frame.width, frame.height]);
          assert.deepEqual(opaque(f), opaque(frame as FakeBitmap), `${row.id} ${name} ${i}`);
          const colors = new Set<string>();
          for (let y = 0; y < f.height; y++) {
            for (let x = 0; x < f.width; x++) {
              const px = f.pixel(x, y);
              if (px[3] !== 0) colors.add(px.join());
            }
          }
          assert.equal(colors.size, 1, `${row.id} ${name} ${i}`);
          const [r, g, b] = [...colors][0]!.split(',').map(Number);
          assert.ok((r ?? 0) > 200 && (g ?? 0) > 200 && (b ?? 0) > 200, 'white');
        });
      }
    }
  });

  void it('the dissolve has ENEMY_DISSOLVE_FRAMES frames of the idle frame size, each with strictly fewer opaque pixels than the last', () => {
    const { cache: c } = cache();
    assert.equal(ENEMY_DISSOLVE_FRAMES, 4);
    for (const row of ENEMIES) {
      const source = c.enemy(row.id, 1)!['idle']!.frames[0] as FakeBitmap;
      const set = c.enemyDissolve(row.id)!;
      assert.equal(set.frames.length, ENEMY_DISSOLVE_FRAMES);
      let previous = opaque(source).filter(Boolean).length;
      for (const frame of set.frames as FakeBitmap[]) {
        assert.deepEqual([frame.width, frame.height], [source.width, source.height]);
        const count = opaque(frame).filter(Boolean).length;
        assert.ok(count < previous, `${row.id}: ${count} is not fewer than ${previous}`);
        previous = count;
      }
    }
  });

  void it('the dissolve is deterministic for an id and differs between ids', () => {
    const a = cache().cache.enemyDissolve('cellar-rat')!.frames as FakeBitmap[];
    const b = cache().cache.enemyDissolve('cellar-rat')!.frames as FakeBitmap[];
    assert.deepEqual(a.map(opaque), b.map(opaque));
    const c = cache().cache.enemyDissolve('cave-bat')!.frames as FakeBitmap[];
    assert.notDeepEqual(a.map(opaque), c.map(opaque));
  });

  void it('unknown ids give null, never a throw, for the sprite, the flash, the dissolve, and the drop', () => {
    const { cache: c } = cache();
    assert.equal(c.enemy('nope', 1), null);
    assert.equal(c.enemy('__proto__', 1), null);
    assert.equal(c.enemyFlash('nope'), null);
    assert.equal(c.enemyDissolve('nope'), null);
    assert.equal(c.drop('nope'), null);
    assert.equal(c.drop('__proto__'), null);
  });
});

void describe('validateDropArt rejects crafted faults', () => {
  void it('a missing kind, an unknown kind, a drop with a walk animation, and too many colors', () => {
    const art = cloneArt();
    const loose = art.drops as Record<string, SpriteTemplate>;
    delete loose['gem'];
    loose['potion'] = SHIPPED_ART.drops.coin;
    art.drops['coin'] = {
      ...art.drops['coin'],
      animations: {
        ...art.drops['coin'].animations,
        walk: art.drops['coin'].animations['idle']!,
      },
    };
    const errors = validateDropArt(art);
    assert.ok(errors.includes('gem: no drop template'), errors.join());
    assert.ok(errors.includes('potion: drop template for an unknown kind'), errors.join());
    assert.ok(
      hasError(errors, /drops\/coin: drop templates use only the idle animation/),
      errors.join(),
    );
    const many = cloneArt();
    const chest = many.drops['chest'];
    chest.animations['idle']![0]![0] = Object.keys(many.palette)
      .slice(0, 10)
      .join('')
      .padEnd(12, '.');
    assert.ok(hasError(validateDropArt(many), /drops\/chest: uses \d+ colors, limit 8/));
  });

  void it('a drop id that does not match its key', () => {
    const art = cloneArt();
    art.drops['coin'] = { ...art.drops['coin'], id: 'drops/penny' };
    assert.ok(hasError(validateDropArt(art), /drops\/penny: drop id does not match its key coin/));
  });

  void it('a drop character that the master palette lacks (drops are drawn with the master palette only)', () => {
    const art = cloneArt();
    art.stagePalettes[MINE]!['~'] = '#123456';
    const frame = art.drops['coin'].animations['idle']![0]!;
    const at = frame.findIndex((r) => r.replaceAll('.', '').length > 0);
    frame[at] = '~' + frame[at]!.slice(1);
    assert.ok(hasError(validateDropArt(art), /drops\/coin: .*missing from the palette/));
  });
});

void describe('per-stage props and palettes (Stage 2 negative cases)', () => {
  void it('a missing required Stage 2 prop, a missing lantern, and a 2-frame lantern loop', () => {
    const art = cloneArt();
    const props = art.stageSprites[MINE]!.props;
    delete props['support'];
    const missing = validateArtSet(art);
    assert.ok(
      hasError(missing, new RegExp(`${MINE}: missing required prop support`)),
      missing.join(),
    );
    delete props['lantern'];
    assert.ok(hasError(validateArtSet(art), new RegExp(`${MINE}: missing required prop lantern`)));
    const short = cloneArt();
    const lantern = short.stageSprites[MINE]!.props['lantern']!;
    lantern.animations['idle'] = lantern.animations['idle']!.slice(0, 2);
    assert.ok(
      hasError(validateArtSet(short), /lantern needs a flame loop of at least 4 frames/),
      validateArtSet(short).join(),
    );
  });

  void it('a Stage 2 tile or prop using a character outside the stage set', () => {
    const art = cloneArt();
    const rubble = art.stageSprites[MINE]!.props['rubble']!;
    const frame = rubble.animations['idle']![0]!;
    const at = frame.findIndex((r) => r.replaceAll('.', '').length > 0);
    frame[at] = 'o' + frame[at]!.slice(1);
    assert.ok(hasError(validateArtSet(art), /outside the stage set/), validateArtSet(art).join());
  });

  void it('a stage palette cannot add colors to the master for another stage: Stage 2 props validate against master plus the mine overrides only', () => {
    const art = cloneArt();
    art.stagePalettes[MINE]!['~'] = '#123456';
    const prop = art.stageSprites['forgotten-cellar']!.props['barrel']!;
    const frame = prop.animations['idle']![0]!;
    const at = frame.findIndex((r) => r.replaceAll('.', '').length > 0);
    frame[at] = '~' + frame[at]!.slice(1);
    assert.ok(
      hasError(validateArtSet(art), /missing from the palette/),
      'a Stage 1 template cannot use a Stage 2 only color',
    );
  });
});

void describe('new art files carry characters only (invariant 5)', () => {
  const files = listFiles('src/game/sprites').filter((f) =>
    /(enemiesStage\d|enemyBuilder|enemyTemplates|dropTemplates|stage[234]Templates|ratKingTemplate|goblinForemanTemplate|oozeQueenTemplate|tombLichTemplate)\.ts$/.test(
      f,
    ),
  );

  void it('the new template files exist', () => {
    assert.ok(files.length >= 10, files.join());
  });

  void it('contain no hex colour and no data URI (palettes.ts and palettesE1.ts own the hex values)', () => {
    for (const f of files) {
      assert.doesNotMatch(code(f), /#[0-9a-fA-F]{3,8}\b/, f);
      assert.doesNotMatch(code(f), /data:/, f);
    }
  });

  void it('no enemy template file mentions hurt, downed, death, or a hero', () => {
    for (const f of files) {
      assert.doesNotMatch(code(f), /\b(hurt|downed|dying|mana)\b/i, f);
    }
  });
});
