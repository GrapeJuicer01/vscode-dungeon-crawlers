// The art validator (M4 plan test note 4): the shipped art passes, and each rule rejects a crafted
// fault with an error that names the template id and leaks no pixels.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SHIPPED_ART } from '../../src/game/sprites/artSet';
import type { Palette } from '../../src/game/sprites/palettes';
import type { ArtSet } from '../../src/game/sprites/spriteFactory';
import {
  REQUIRED_HERO_ANIMATIONS,
  validateArtSet,
  validateHeroLayers,
  validateTemplate,
} from '../../src/game/sprites/spriteValidator';
import type { SpriteTemplate } from '../../src/game/sprites/spriteTypes';

/** A deep, mutable copy of the shipped art (it is plain data). */
type MutableArt = Omit<ArtSet, 'skinTones' | 'hairColors' | 'particlePalette'> & {
  -readonly [K in 'skinTones' | 'hairColors']: Palette[];
} & {
  particlePalette: Record<
    | 'ember'
    | 'spark'
    | 'drip'
    | 'splash'
    | 'mote'
    | 'bubble'
    | 'wisp'
    | 'firefly'
    | 'snow'
    | 'murk'
    | 'shimmer'
    | 'rift',
    string[]
  >;
};

function cloneArt(): MutableArt {
  return structuredClone(SHIPPED_ART) as unknown as MutableArt;
}

const STAGE_ID = 'forgotten-cellar';
const P = { a: '#111111', b: '#222222' };

function tpl(rows: string[][], extra: Partial<SpriteTemplate> = {}): SpriteTemplate {
  return {
    id: 'test/t',
    w: rows[0]?.[0]?.length ?? 1,
    h: rows[0]?.length ?? 1,
    anchor: { x: 0, y: 0 },
    animations: { idle: rows },
    ...extra,
  };
}

void describe('validateArtSet on the shipped art', () => {
  void it('reports no errors', () => {
    assert.deepEqual(validateArtSet(SHIPPED_ART), []);
  });

  void it('the required hero animations are the eleven documented ones with documented counts', () => {
    assert.deepEqual(REQUIRED_HERO_ANIMATIONS, {
      idle: 2,
      walk: 4,
      attack: 3,
      ability: 3,
      sit: 2,
      eat: 2,
      sleep: 2,
      polish: 2,
      read: 2,
      warmHands: 2,
      victory: 2,
    });
  });

  void it('the shipped hero has no animation named like hurt, downed, or death (invariant 1 in the art)', () => {
    for (const t of [
      SHIPPED_ART.baseHero.body,
      SHIPPED_ART.baseHero.head,
      SHIPPED_ART.baseHero.weapon,
    ]) {
      for (const name of Object.keys(t.animations)) {
        assert.doesNotMatch(name, /hurt|downed|death|dead|die|dying/i);
      }
    }
  });

  void it('no shipped template contains a hex colour or data URI (characters only)', () => {
    const text = JSON.stringify([
      SHIPPED_ART.baseHero,
      SHIPPED_ART.campfire,
      SHIPPED_ART.stageSprites,
    ]);
    assert.doesNotMatch(text, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(text, /data:/);
  });
});

void describe('validateTemplate', () => {
  void it('accepts a well-formed template', () => {
    assert.deepEqual(validateTemplate(tpl([['ab', 'b.']]), P, null, 12), []);
  });

  void it('rejects a row of the wrong length and names the template', () => {
    const errors = validateTemplate(tpl([['ab', 'b']], { w: 2, h: 2 }), P, null, 12);
    assert.equal(errors.length, 1);
    assert.match(errors[0] ?? '', /^test\/t: .*wrong width/);
  });

  void it('rejects a wrong frame height (row count)', () => {
    const errors = validateTemplate(tpl([['ab']], { w: 2, h: 2 }), P, null, 12);
    assert.match(errors.join('\n'), /test\/t: .*1 rows, expected 2/);
  });

  void it('rejects a character missing from the palette without echoing it', () => {
    const errors = validateTemplate(tpl([['aZ']]), P, null, 12);
    assert.equal(errors.length, 1);
    assert.match(errors[0] ?? '', /^test\/t: .*missing from the palette/);
    assert.doesNotMatch(errors[0] ?? '', /Z/);
  });

  void it('rejects more colours than the limit', () => {
    const palette: Record<string, string> = {};
    const chars = 'abcdefghijklm';
    for (const ch of chars) {
      palette[ch] = '#000000';
    }
    const errors = validateTemplate(tpl([[chars]]), palette, null, 12);
    assert.match(errors.join('\n'), /test\/t: uses 13 colors, limit 12/);
    assert.deepEqual(validateTemplate(tpl([[chars.slice(0, 12)]]), palette, null, 12), []);
  });

  void it('rejects a character outside the allowed stage set', () => {
    const errors = validateTemplate(tpl([['ab']]), P, 'a', 8);
    assert.match(errors.join('\n'), /test\/t: .*outside the stage set/);
  });

  void it('rejects an anchor outside the sprite, an empty animation, no animations, and bad sizes', () => {
    assert.match(
      validateTemplate(tpl([['ab']], { anchor: { x: 2, y: 0 } }), P, null, 12).join(),
      /anchor/,
    );
    assert.match(
      validateTemplate(tpl([['ab']], { anchor: { x: 0, y: -1 } }), P, null, 12).join(),
      /anchor/,
    );
    assert.match(
      validateTemplate(tpl([['ab']], { anchor: { x: 0.5, y: 0 } }), P, null, 12).join(),
      /anchor/,
    );
    assert.match(validateTemplate(tpl([], {}), P, null, 12).join(), /no frames/);
    assert.match(
      validateTemplate(tpl([['ab']], { animations: {} }), P, null, 12).join(),
      /no animations/,
    );
    assert.match(
      validateTemplate(tpl([['ab']], { w: 0 }), P, null, 12).join(),
      /positive integers/,
    );
  });
});

void describe('validateArtSet rejects crafted faults', () => {
  void it('one palette-foreign character in a hero layer is exactly one error naming the template', () => {
    const art = cloneArt();
    const frame = art.baseHero.body.animations['idle']?.[0];
    assert.ok(frame);
    frame[0] = 'Z' + (frame[0] ?? '').slice(1);
    const errors = validateArtSet(art);
    assert.equal(errors.length, 1, errors.join('\n'));
    assert.ok(errors[0]?.startsWith(`${art.baseHero.body.id}:`));
  });

  void it('rejects a missing required animation', () => {
    const art = cloneArt();
    for (const t of [art.baseHero.body, art.baseHero.head, art.baseHero.weapon]) {
      delete t.animations['sleep'];
    }
    assert.match(validateArtSet(art).join('\n'), /missing required animation sleep/);
  });

  void it('rejects a wrong frame count for a required animation', () => {
    const art = cloneArt();
    for (const t of [art.baseHero.body, art.baseHero.head, art.baseHero.weapon]) {
      t.animations['walk']?.pop();
    }
    assert.match(validateArtSet(art).join('\n'), /animation walk has 3 frames, expected 4/);
  });

  void it('rejects layers that disagree on the frame count of an animation', () => {
    const art = cloneArt();
    const extra = art.baseHero.head.animations['victory']?.[0];
    assert.ok(extra);
    art.baseHero.head.animations['victory']?.push(extra);
    assert.match(validateArtSet(art).join('\n'), /layers disagree on the frame count of victory/);
  });

  void it('rejects layers whose animation names differ', () => {
    const art = cloneArt();
    delete art.baseHero.weapon.animations['read'];
    assert.match(
      validateHeroLayers(art.baseHero, art.palette).join('\n'),
      /names differ from the body/,
    );
  });

  void it('rejects an anchor outside a hero layer', () => {
    const art = cloneArt();
    art.baseHero.body.anchor = { x: 99, y: 0 };
    assert.match(validateArtSet(art).join('\n'), /anchor outside the sprite/);
  });

  void it('rejects hero animations named like hurt, downed, or death (invariant 1 in the art)', () => {
    for (const forbidden of ['hurt', 'downed', 'death', 'dead', 'die', 'Dying']) {
      const art = cloneArt();
      for (const t of [art.baseHero.body, art.baseHero.head, art.baseHero.weapon]) {
        t.animations[forbidden] = structuredClone(t.animations['idle']) ?? [];
      }
      assert.match(
        validateArtSet(art).join('\n'),
        new RegExp(`forbidden hero animation name ${forbidden}`),
        forbidden,
      );
    }
  });

  void it('rejects a stage template using a character outside the stage set', () => {
    const art = cloneArt();
    const set = art.stageSprites[STAGE_ID];
    assert.ok(set);
    const tile = set.tiles.wallTop[0];
    assert.ok(tile);
    const allowed = art.stageTileChars[STAGE_ID] ?? '';
    const foreign = 'oshecdbkmwa'.split('').find((ch) => !allowed.includes(ch));
    assert.ok(foreign !== undefined);
    const row = tile.animations['idle']?.[0]?.[5];
    assert.ok(row !== undefined);
    const frame = tile.animations['idle']?.[0];
    assert.ok(frame);
    frame[5] = foreign + row.slice(1);
    const errors = validateArtSet(art);
    assert.ok(
      errors.some((e) => e.startsWith(`${tile.id}:`) && /outside the stage set/.test(e)),
      errors.join('\n'),
    );
  });

  void it('rejects a stage with fewer tile variants than required, and a missing required prop', () => {
    const art = cloneArt();
    const set = art.stageSprites[STAGE_ID];
    assert.ok(set);
    set.tiles.wallMid.length = 2;
    delete set.props['barrel'];
    const text = validateArtSet(art).join('\n');
    assert.match(text, /tile set wallMid has 2 variants, need 4/);
    assert.match(text, /missing required prop barrel/);
  });

  void it('rejects a stage with no transparent wall tile (no barred window to the backdrop)', () => {
    const art = cloneArt();
    const set = art.stageSprites[STAGE_ID];
    assert.ok(set);
    for (const tile of set.tiles.wallMid) {
      const frame = tile.animations['idle']?.[0];
      assert.ok(frame);
      for (let y = 0; y < frame.length; y++) {
        frame[y] = (frame[y] ?? '').replaceAll('.', '1');
      }
    }
    assert.match(validateArtSet(art).join('\n'), /no wallMid variant has transparent pixels/);
  });

  void it('rejects wrong swap counts and swaps that override more than their character', () => {
    const art = cloneArt();
    art.skinTones.pop();
    art.hairColors[0] = { h: '#000000', s: '#ffffff' };
    const text = validateArtSet(art).join('\n');
    assert.match(text, /3 skin tones, expected 4/);
    assert.match(text, /hair color 0 must override only h/);
  });

  void it('rejects a master palette missing a hero character, and a clear colour that is not near-black', () => {
    const art = cloneArt();
    delete art.palette['w'];
    assert.match(validateArtSet(art).join('\n'), /hero character w is not defined/);
    const bright = cloneArt();
    const clear = bright.stageClearChar[STAGE_ID] ?? '';
    bright.palette[clear] = '#ffffff';
    assert.match(validateArtSet(bright).join('\n'), /clear color is not near-black/);
  });

  void it('rejects a campfire flame with too few frames and a bad particle ramp', () => {
    const art = cloneArt();
    art.campfire.flameSmall.animations['idle'] = (
      art.campfire.flameSmall.animations['idle'] ?? []
    ).slice(0, 2);
    art.particlePalette.ember = ['Y'];
    const text = validateArtSet(art).join('\n');
    assert.match(text, /flame needs at least 3 frames/);
    assert.match(text, /particle ramp ember is too short/);
  });

  void it('the E4 snow and murk ramps are validated like every other kind: too short or an unknown character is reported (a missing key is a compile error, not a runtime check)', () => {
    for (const kind of ['snow', 'murk'] as const) {
      const short = cloneArt();
      short.particlePalette[kind] = ['w'];
      assert.match(
        validateArtSet(short).join('\n'),
        new RegExp(`particle ramp ${kind} is too short`),
      );
      const unknown = cloneArt();
      unknown.particlePalette[kind] = ['w', '?', 'q'];
      assert.ok(
        validateArtSet(unknown).some((e) => e.includes(kind)),
        `${kind}: an unknown ramp character is reported`,
      );
    }
  });

  void it('error text contains template ids and indexes only, never pixel rows', () => {
    const art = cloneArt();
    const frame = art.baseHero.body.animations['walk']?.[1];
    assert.ok(frame);
    frame[2] = 'Q'.repeat(3) + frame[2];
    for (const error of validateArtSet(art)) {
      assert.ok(error.length < 160, error);
      assert.doesNotMatch(error, /QQQ/);
    }
  });
});
