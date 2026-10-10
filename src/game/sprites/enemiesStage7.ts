// Stage 7 "Frozen Citadel" regular enemies (batch E4, step A-E4-4). Owned by the pixel-artist.
// Ids match src/game/data/enemies.ts: rime-penguin, frost-hare, snow-sentry, snow-yeti.
// Templates `enemies/<id>`, LEFT-facing, foot anchor on the bottom outline row (minion (8, 15),
// elite (12, 23)), idle 2 / walk 2 / attack 3; no hit or dissolve art (engine flash and dissolve).
// Characters: the stage's `1` outline and `2 to 8` (recolored by STAGE_PALETTES['frozen-citadel'])
// plus master accents; at most 12 colors per sprite. The citadel stone is cool and dark, so the
// enemies are paler and warmer-edged than it (white fur, ice blue, orange beak and nose).
// Silhouettes: penguin an upright oval with flippers out and a beak point; hare tall, long ears to
// the top rows and a big haunch; sentry three stacked balls narrowing to the top with stick arms;
// yeti a wide-shouldered hunch with arms hanging to the knees. Hand-drawn base frames (fill only,
// outlined by fromFill or finish); the other frames come from enemyFrames.ts.

import { dots, draft, ellipse, enemyTemplate, finish, poly, put, stroke } from './enemyBuilder';
import type { Draft } from './enemyBuilder';
import { checked, lift, shiftRows, squash } from './enemyFrames';
import type { SpriteTemplate } from './spriteTypes';

const W = 16;
const ANCHOR = { x: 8, y: 15 };

// Look-alike note: with only shape to separate them (the stage palette gives one color family) and
// a policy measured on the idle silhouette (overlap under 0.85, IoU at most 0.80, same-stage
// minions under 0.75), the three minions are drawn tall and narrow and placed apart: the penguin
// two pixels left of the foot anchor, the hare two pixels right, the sentry on it. The plan's
// silhouette cues (oval with flippers, tall long ears, three balls) stay intact.

// ---------------------------------------------------------------- Rime Penguin (16x16)
// A narrow upright penguin with an ice crest of three rime spikes, glinting eyes, an orange beak
// pointing left, a white belly, two flippers held out and orange feet. `attack` lunges the beak
// forward. Colors: 1 5 4 e O 7 = 6.

function penguinFrame(): string[] {
  const d: Draft = draft(W, W);
  const cx = 5;
  ellipse(d, cx, 9, 2.5, 4, '4');
  ellipse(d, cx, 4.5, 2.1, 2.4, '4');
  ellipse(d, cx, 10, 1.5, 3.6, '7');
  dots(d, [
    [cx - 2, 4, 'e'],
    [cx + 1, 4, 'e'],
    [cx - 3, 4, 'O'],
    [cx - 4, 4, 'O'],
    [cx - 3, 5, 'O'],
    [cx - 2, 1, '5'],
    [cx, 1, '5'],
    [cx + 2, 1, '5'],
    [cx - 2, 2, '5'],
    [cx - 1, 2, '5'],
    [cx, 2, '5'],
    [cx + 1, 2, '5'],
    [cx + 2, 2, '5'],
    [cx - 2, 14, 'O'],
    [cx - 1, 14, 'O'],
    [cx - 3, 14, 'O'],
    [cx + 1, 14, 'O'],
    [cx + 2, 14, 'O'],
    [cx + 3, 14, 'O'],
  ]);
  // flippers held out and down
  stroke(
    d,
    [
      [cx - 3, 6],
      [cx - 5, 9],
    ],
    '4',
  );
  stroke(
    d,
    [
      [cx + 3, 6],
      [cx + 5, 9],
    ],
    '4',
  );
  return finish(d);
}
const PENGUIN = penguinFrame();

export const RIME_PENGUIN: SpriteTemplate = enemyTemplate('rime-penguin', W, W, ANCHOR, {
  idle: [checked(PENGUIN, W, W), squash(PENGUIN, 8)],
  walk: [shiftRows(PENGUIN, 13, 15, -1), shiftRows(squash(PENGUIN, 8), 13, 15, 1)],
  attack: [
    shiftRows(squash(PENGUIN, 8), 2, 14, 1),
    shiftRows(PENGUIN, 1, 13, -1),
    checked(PENGUIN, W, W),
  ],
});

// ---------------------------------------------------------------- Frost Hare (16x16)
// A hare sitting tall: two long ears reaching up and out in a V, a pink nose, a
// dot eye, a round pale-cyan haunch and a short hind foot. It hops. `attack` kicks the hind foot
// forward. Colors: 1 7 R e 6 = 5.

function hareFrame(kick: boolean): string[] {
  const d: Draft = draft(W, W);
  const cx = 8;
  // ears: two long strokes up and outward from the head
  stroke(
    d,
    [
      [cx - 1, 5],
      [cx - 5, 1],
    ],
    '7',
    2,
  );
  stroke(
    d,
    [
      [cx + 2, 5],
      [cx + 6, 1],
    ],
    '7',
    2,
  );
  ellipse(d, cx, 7.5, 3.4, 2.4, '7');
  dots(d, [
    [cx - 3, 8, 'R'],
    [cx - 2, 7, 'e'],
  ]);
  ellipse(d, cx + 1, 11, 3, 3, '7');
  ellipse(d, cx + 2, 11.5, 3, 2.6, '6');
  if (kick) put(d, ['7777'], cx - 5, 13);
  else put(d, ['777'], cx - 1, 14);
  return finish(d);
}
const HARE = hareFrame(false);

export const FROST_HARE: SpriteTemplate = enemyTemplate('frost-hare', W, W, ANCHOR, {
  idle: [checked(HARE, W, W), squash(HARE, 9)],
  walk: [lift(HARE, 2), squash(HARE, 9)],
  attack: [
    shiftRows(squash(HARE, 9), 5, 13, 1),
    checked(hareFrame(true), W, W),
    checked(HARE, W, W),
  ],
});

// ---------------------------------------------------------------- Snow Sentry (16x16)
// A little snowman guard: three stacked snow balls (a wide base, a mid ball, a small head), stick
// arms held out and down, coal eyes, a carrot nose pointing left and a tiny blue-steel helmet. It
// waddles. `attack` swings the near stick arm forward. Colors: 1 7 6 5 e O k 4 = 8.

function sentryFrame(swing: boolean): string[] {
  const d: Draft = draft(W, W);
  const cx = 8;
  ellipse(d, cx, 12, 3.5, 2.5, '7');
  ellipse(d, cx, 7.5, 3, 2.6, '7');
  ellipse(d, cx, 3.7, 2.5, 1.9, '7');
  put(d, ['5555', '4..4'], cx - 2, 1);
  dots(d, [
    [cx - 1, 3, 'e'],
    [cx + 1, 3, 'e'],
    [cx - 2, 4, 'O'],
    [cx - 3, 4, 'O'],
    [cx, 7, 'e'],
    [cx, 10, 'e'],
    [cx + 1, 13, '6'],
    [cx + 2, 12, '6'],
  ]);
  stroke(
    d,
    [
      [cx - 3, 7],
      [cx - (swing ? 6 : 6), swing ? 6 : 9],
    ],
    'k',
  );
  stroke(
    d,
    [
      [cx + 3, 7],
      [cx + 6, 9],
    ],
    'k',
  );
  return finish(d);
}
const SENTRY = sentryFrame(false);

export const SNOW_SENTRY: SpriteTemplate = enemyTemplate('snow-sentry', W, W, ANCHOR, {
  idle: [checked(SENTRY, W, W), squash(SENTRY, 9)],
  walk: [shiftRows(SENTRY, 13, 15, -1), shiftRows(squash(SENTRY, 9), 13, 15, 1)],
  attack: [squash(SENTRY, 9), checked(sentryFrame(true), W, W), checked(SENTRY, W, W)],
});

// ---------------------------------------------------------------- Snow Yeti (elite 24x24)
// A hunched yeti: white fur with ice-blue shade, a high back hump over very wide shoulders, a
// small pale-blue face sunk low in front of it, long arms hanging out to the sides down to the
// knees with big fists, and a narrow waist over two stumpy legs. `attack` swings the near arm
// forward at chest height (never overhead). Drawn tall and wide so it clears the Crate Mimic's box
// (see the look-alike note above). Colors: 1 7 6 5 e w = 6.

const TW = 24;

function yetiFrame(swing: boolean, bob = 0): string[] {
  const d: Draft = draft(TW, TW);
  const cx = 11;
  // legs: two stumps with a seam between them
  d.g.rect(cx - 2, 17, 3, 6, '6');
  d.g.rect(cx + 1, 17, 3, 6, '6');
  // torso: a high hump over wide shoulders, narrowing to the hips so the arms hang clear
  poly(
    d,
    [
      [cx - 2, 1 + bob],
      [cx + 4, 1 + bob],
      [cx + 9, 5 + bob],
      [cx + 9, 10 + bob],
      [cx + 3, 15],
      [cx + 3, 18],
      [cx - 3, 18],
      [cx - 3, 15],
      [cx - 8, 10 + bob],
      [cx - 8, 5 + bob],
    ],
    '7',
  );
  // head: small, sunk low and forward of the hump
  ellipse(d, cx - 6, 10 + bob, 3, 2.6, '5');
  dots(d, [
    [cx - 8, 9 + bob, 'e'],
    [cx - 5, 9 + bob, 'e'],
    [cx - 7, 12 + bob, 'w'],
    [cx - 6, 12 + bob, 'w'],
    [cx - 5, 12 + bob, 'w'],
  ]);
  // shade down the back and fur tufts on the hump
  for (let y = 4 + bob; y < 15; y++) {
    const edge = y < 10 + bob ? cx + 8 : cx + 8 - Math.min(5, y - 10 - bob);
    dots(d, [
      [edge, y, '6'],
      [edge - 1, y, '5'],
    ]);
  }
  // fur tufts on the hump and chest
  dots(d, [
    [cx, 3 + bob, '6'],
    [cx + 2, 5 + bob, '6'],
    [cx - 2, 6 + bob, '6'],
    [cx + 5, 7 + bob, '6'],
    [cx + 1, 9 + bob, '6'],
    [cx + 3, 12 + bob, '6'],
    [cx - 1, 13 + bob, '6'],
    [cx + 6, 10 + bob, '6'],
    [cx - 2, 16, '6'],
    [cx + 2, 16, '6'],
  ]);
  // arms hang out to the sides (the near one swings forward when attacking), fists at the knees
  stroke(
    d,
    [
      [cx + 10, 9],
      [cx + 14, 14],
      [cx + 14, 18],
    ],
    '6',
    2,
  );
  ellipse(d, cx + 14, 19.5, 2.2, 2, '5');
  if (swing) {
    stroke(
      d,
      [
        [cx - 7, 10 + bob],
        [cx - 10, 12 + bob],
        [cx - 11, 13 + bob],
      ],
      '6',
      2,
    );
    ellipse(d, cx - 11, 14 + bob, 2.2, 2.2, '5');
  } else {
    stroke(
      d,
      [
        [cx - 8, 10],
        [cx - 12, 15],
        [cx - 12, 18],
      ],
      '6',
      2,
    );
    ellipse(d, cx - 12, 19.5, 2.4, 2, '5');
  }
  d.g.rect(0, 23, TW, 1, '.');
  return finish(d);
}

export const SNOW_YETI: SpriteTemplate = enemyTemplate(
  'snow-yeti',
  TW,
  TW,
  { x: 12, y: 23 },
  {
    idle: [yetiFrame(false), yetiFrame(false, 1)],
    walk: [shiftRows(yetiFrame(false), 18, 23, -1), shiftRows(yetiFrame(false, 1), 18, 23, 1)],
    attack: [yetiFrame(false, 1), yetiFrame(true, 1), yetiFrame(true)],
  },
);

/** Stage 7 regular enemies, id -> template. */
export const ENEMIES_STAGE7: Readonly<Record<string, SpriteTemplate>> = {
  'rime-penguin': RIME_PENGUIN,
  'frost-hare': FROST_HARE,
  'snow-sentry': SNOW_SENTRY,
  'snow-yeti': SNOW_YETI,
};
