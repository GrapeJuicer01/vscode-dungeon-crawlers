// Stage 10 "Void Spire" regular enemies (batch E5, step A-E5-5). Owned by the pixel-artist.
// Ids match src/game/data/enemies.ts: crescent-drifter, comet-tadpole, eye-strider,
// obelisk-sentinel. Templates `enemies/<id>`, LEFT-facing, foot anchor on the bottom outline row
// (minion (8, 15), elite (12, 23)), idle 2 / walk 2 / attack 3; no hit or dissolve art (engine
// flash and dissolve). Characters: the stage's `1` outline and `2 to 8` (recolored by
// STAGE_PALETTES['void-spire']) plus master accents; at most 12 colors per sprite. The spire's
// stone is very dark slate-blue, so the enemies carry pale magenta-white (`6`), cold highlight
// (`7`), cyan (`8`), and teal (`5`) and read lighter than the floor. Cute-spooky, never gory.
// Silhouettes: drifter a C-shaped crescent whose horns point left around a floating pale eye;
// tadpole a round head with a long wavy tail trailing up and back; strider one big round eye on two
// long thin legs with an open gap below; sentinel a slim pointed monolith with two detached
// fragments at its sides. Fill is drawn per frame (outlined by finish) from small primitives.

import { dots, draft, ellipse, enemyTemplate, finish, poly, stroke } from './enemyBuilder';
import type { Draft } from './enemyBuilder';
import { checked } from './enemyFrames';
import type { SpriteTemplate } from './spriteTypes';

const W = 16;
const ANCHOR = { x: 8, y: 15 };

/** Recolors only cells that already hold fill, so a silhouette is never changed by details. */
function paintOn(d: Draft, x: number, y: number, ch: string): void {
  if (d.g.get(x, y) !== '.') d.g.set(x, y, ch);
}

// ---------------------------------------------------------------- Crescent Drifter (16x16)
// A floating crescent moon with its hollow facing left: a cold pale body, teal shade along the
// outer curve, and a pale cyan eye hovering in the hollow. It hovers. `attack` tips the horns
// forward. Colors: 1 7 5 6 8 e w = 7.

function drifterFrame(bob: number, lunge: number, tilt: number, glint: boolean): string[] {
  const d: Draft = draft(W, W);
  const ox = 7.72 - lunge;
  const cy = 7.56 + bob;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const outer = Math.hypot(x - ox, y - cy);
      const inner = Math.hypot(x - (ox - 2.09), y - (cy + tilt * 0.6));
      if (outer <= 6.24 && inner > 3.68) d.g.set(x, y, '7');
    }
  }
  // teal shade along the outer curve, a pale glint near the upper horn
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      if (d.g.get(x, y) === '7' && d.g.get(x + 1, y) === '.') paintOn(d, x, y, '5');
      else if (d.g.get(x, y) === '7' && d.g.get(x + 2, y) === '.' && y > cy) {
        paintOn(d, x, y, '5');
      }
    }
  }
  paintOn(d, 5 - lunge, 3 + bob, '6');
  paintOn(d, 6 - lunge, 2 + bob, '6');
  if (glint) paintOn(d, 11 - lunge, 5 + bob, '6');
  // the eye floating in the hollow
  const ex = 7 - lunge;
  const ey = Math.round(cy) - 1;
  dots(d, [
    [ex, ey, '6'],
    [ex + 1, ey, '6'],
    [ex, ey + 1, '8'],
    [ex + 1, ey + 1, 'e'],
    [ex, ey + 2, '6'],
    [ex + 1, ey + 2, '6'],
  ]);
  d.g.rect(0, 15, W, 1, '.');
  return finish(d);
}

export const CRESCENT_DRIFTER: SpriteTemplate = enemyTemplate('crescent-drifter', W, W, ANCHOR, {
  idle: [checked(drifterFrame(0, 0, 0, false), W, W), checked(drifterFrame(1, 0, 0, true), W, W)],
  walk: [checked(drifterFrame(1, 0, 0, false), W, W), checked(drifterFrame(0, 0, 0, true), W, W)],
  attack: [
    checked(drifterFrame(0, -1, 0, false), W, W),
    checked(drifterFrame(0, 1, 1, false), W, W),
    checked(drifterFrame(1, 0, 0, true), W, W),
  ],
});

// ---------------------------------------------------------------- Comet Tadpole (16x16)
// A round pale head with two big dark eyes at the lower left and a long wavy cyan tail trailing up
// and back to the right, fading to teal at the tip. It hops (the engine bounces it). `attack` flicks
// the tail forward over the head. Colors: 1 6 7 e w 8 5 = 7.

function tadpoleFrame(wave: number, lunge: number, flick: number): string[] {
  const d: Draft = draft(W, W);
  const hx = 5.33 - lunge;
  const hy = 10.28;
  const tails: readonly (readonly (readonly [number, number])[])[] = [
    [
      [8.33, 9.28],
      [9.42, 6.29],
      [10.53, 4.13],
      [12.14, 1.11],
      [13.4, 1],
    ],
    [
      [8.33, 9.28],
      [10.4, 7.2],
      [10.0, 4.13],
      [12.14, 2.6],
      [13.4, 1],
    ],
  ];
  const t = tails[wave] ?? tails[0] ?? [];
  const pts: (readonly [number, number])[] = flick
    ? [
        [8.33, 9.28],
        [9.4, 6.3],
        [8, 3.2],
        [5, 1.6],
        [2, 2],
      ]
    : t.map(([x, y]) => [x, y] as const);
  stroke(d, pts, '8');
  ellipse(d, hx, hy, 3.38, 3.38, '6');
  const ix = Math.round(hx);
  const iy = Math.round(hy);
  paintOn(d, ix, iy - 3, '7');
  paintOn(d, ix + 1, iy - 3, '7');
  paintOn(d, ix - 1, iy - 2, '7');
  for (const [dx, dy, ch] of [
    [-2, 0, 'e'],
    [-1, 0, 'e'],
    [-2, 1, 'e'],
    [-1, 1, 'w'],
    [1, 0, 'e'],
    [2, 0, 'e'],
    [1, 1, 'e'],
    [2, 1, 'w'],
  ] as const) {
    paintOn(d, ix + dx, iy + dy, ch);
  }
  const tip = pts[pts.length - 1];
  if (tip) paintOn(d, Math.round(tip[0]), Math.round(tip[1]), '5');
  d.g.rect(0, 15, W, 1, '.');
  return finish(d);
}

export const COMET_TADPOLE: SpriteTemplate = enemyTemplate('comet-tadpole', W, W, ANCHOR, {
  idle: [checked(tadpoleFrame(0, 0, 0), W, W), checked(tadpoleFrame(1, 0, 0), W, W)],
  walk: [checked(tadpoleFrame(1, 0, 0), W, W), checked(tadpoleFrame(0, 0, 0), W, W)],
  attack: [
    checked(tadpoleFrame(1, -1, 0), W, W),
    checked(tadpoleFrame(0, 1, 1), W, W),
    checked(tadpoleFrame(0, 0, 0), W, W),
  ],
});

// ---------------------------------------------------------------- Eye Strider (16x16)
// One big round eye (white, a cyan iris, a dark pupil, a lit lid) held up on two long thin teal
// legs with bent knees, so a wide gap of open space shows under the eye. `attack` leans the eye
// forward. Colors: 1 w 8 e 5 4 6 = 7.

function striderFrame(bob: number, lunge: number, step: number): string[] {
  const d: Draft = draft(W, W);
  const ex = 6.48 - lunge;
  const ey = 4.79 + bob;
  const hip = 1.2;
  const knee = 3.51;
  const foot = 3.58;
  const ky = 11.62;
  stroke(
    d,
    [
      [ex - hip, ey + 3.24],
      [ex - hip - knee - step, ky],
      [ex - hip - foot - step, 14],
    ],
    '5',
  );
  stroke(
    d,
    [
      [ex + hip, ey + 3.24],
      [ex + hip + knee + step, ky],
      [ex + hip + foot + step, 14],
    ],
    '5',
  );
  ellipse(d, ex, ey, 4.12, 3.24, 'w');
  const ix = Math.round(ex);
  const iy = Math.round(ey);
  // the iris sits toward the front (left), with a dark pupil and a lit upper lid
  for (const [dx, dy, ch] of [
    [-3, 0, '8'],
    [-2, -1, '8'],
    [-1, -1, '8'],
    [-2, 0, '8'],
    [-1, 0, 'e'],
    [-3, 1, '8'],
    [-2, 1, '8'],
    [-1, 1, '8'],
  ] as const) {
    paintOn(d, ix + dx, iy + dy, ch);
  }
  for (let x = ix - 3; x <= ix + 3; x++) paintOn(d, x, iy - 3, '6');
  for (const x of [ex - hip - foot - step, ex + hip + foot + step]) {
    paintOn(d, Math.round(x), 14, '8');
  }
  d.g.rect(0, 15, W, 1, '.');
  return finish(d);
}

export const EYE_STRIDER: SpriteTemplate = enemyTemplate('eye-strider', W, W, ANCHOR, {
  idle: [checked(striderFrame(0, 0, 0), W, W), checked(striderFrame(1, 0, 0), W, W)],
  walk: [checked(striderFrame(0, 0, 1), W, W), checked(striderFrame(0, 0, -1), W, W)],
  attack: [
    checked(striderFrame(0, -1, 0), W, W),
    checked(striderFrame(1, 1, 0), W, W),
    checked(striderFrame(0, 0, 0), W, W),
  ],
});

// ---------------------------------------------------------------- Obelisk Sentinel (elite 24x24)
// A slim pointed monolith of lit slate, leaning back: a lit left face and a dark right face, a glowing cyan rune
// and a pale tip, on a low base slab. Two small stone fragments hover detached at its sides and
// bob in turn. It hovers. `attack` tips the monolith forward and draws the fragments in.
// Colors: 1 4 3 2 8 6 7 = 7.

const TW = 24;

function obeliskFrame(bob: number, lean: number, near: number): string[] {
  const d: Draft = draft(TW, TW);
  const top = 1.5;
  const by = 19.9;
  const w = 2.44;
  const bw = 3.64;
  const sx = (y: number): number => 12 + lean * (1 - (y - top) / (by - top));
  // the shaft: a slim pointed column that leans back and widens gently toward the base
  poly(
    d,
    [
      [sx(top), top],
      [sx(top + 5) + w, top + 5],
      [sx(by) + bw, by],
      [sx(by) - bw, by],
      [sx(top + 5) - w, top + 5],
    ],
    '3',
  );
  poly(
    d,
    [
      [sx(top), top],
      [sx(top + 5) - w, top + 5],
      [sx(by) - bw, by],
      [sx(by), by],
    ],
    '4',
  );
  const bx0 = Math.round(sx(by) - bw - 1);
  d.g.rect(bx0, Math.round(by), Math.round(bw * 2 + 2), 3, '3');
  d.g.rect(bx0, Math.round(by), Math.round(bw * 2 + 2), 1, '4');
  // a glowing rune down the shaft and a pale tip (colors only, the silhouette is unchanged)
  for (const [dy, dx, ch] of [
    [2, 0, '7'],
    [3, 0, '7'],
    [8, 0, '8'],
    [9, -1, '8'],
    [9, 1, '8'],
    [10, 0, '8'],
    [12, 0, '6'],
    [13, 0, '8'],
    [14, -1, '8'],
    [14, 1, '8'],
  ] as const) {
    paintOn(d, Math.round(sx(top + dy)) + dx, Math.round(top + dy), ch);
  }
  // two fragments, detached, bobbing in turn
  const frag = (fx: number, fy: number, r: number): void => {
    poly(
      d,
      [
        [fx, fy],
        [fx + r, fy + r],
        [fx, fy + 2 * r],
        [fx - r, fy + r],
      ],
      '4',
    );
    paintOn(d, Math.round(fx), Math.round(fy) + 1, '7');
  };
  frag(4.69 + near, 2.04 + bob, 3.21);
  frag(19.4 - near, 12.4 - bob, 2.9);
  d.g.rect(0, 23, TW, 1, '.');
  return finish(d);
}

export const OBELISK_SENTINEL: SpriteTemplate = enemyTemplate(
  'obelisk-sentinel',
  TW,
  TW,
  { x: 12, y: 23 },
  {
    idle: [checked(obeliskFrame(0, 5.9, 0), TW, TW), checked(obeliskFrame(1, 5.9, 0), TW, TW)],
    walk: [checked(obeliskFrame(1, 5.9, 0), TW, TW), checked(obeliskFrame(0, 5.9, 0), TW, TW)],
    attack: [
      checked(obeliskFrame(0, 7, 0), TW, TW),
      checked(obeliskFrame(1, 2.5, 1), TW, TW),
      checked(obeliskFrame(0, 4.5, 0), TW, TW),
    ],
  },
);

/** Stage 10 regular enemies, id -> template. */
export const ENEMIES_STAGE10: Readonly<Record<string, SpriteTemplate>> = {
  'crescent-drifter': CRESCENT_DRIFTER,
  'comet-tadpole': COMET_TADPOLE,
  'eye-strider': EYE_STRIDER,
  'obelisk-sentinel': OBELISK_SENTINEL,
};
