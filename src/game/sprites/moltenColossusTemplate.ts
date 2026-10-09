// Stage 6 boss "Molten Colossus" (batch E3, step A-E3-6). Owned by the pixel-artist.
// `enemies/molten-colossus`, 48x48, LEFT-facing, foot anchor (24, 47). Animations: idle 2, walk 2,
// attack 3, telegraph 2, intro 2 (11 frames), the same set as the other bosses. A hulking basalt
// giant: a small blocky head with glowing eyes between huge rust-banded shoulders, a furnace door
// in the chest, orange cracks across the stone, and two heavy fists raised at the sides. Colors (8):
// the stage characters 1 to 8 only. Phase 2 (BOSS_PHASE_PALETTES_E3 in palettesE3.ts) overrides
// `5 6 7 8` so the cracks and chest glow go white-hot and the rust bands heat up, over the same
// silhouette.
// `telegraph` gathers both fists in front of the chest while the cracks brighten; `attack` is a
// slam of both fists to the floor; `intro` climbs out of the ground.

import { dots, draft, enemyTemplate, finish, poly, put, stroke } from './enemyBuilder';
import type { Draft } from './enemyBuilder';
import { lift } from './enemyFrames';
import type { SpriteTemplate } from './spriteTypes';

const S = 48;

type FistKind = 'low' | 'gather' | 'raised' | 'slam';

interface ColossusPose {
  /** Torso bob in rows (0 or 1). */
  readonly bob?: number;
  /** Which leg is lifted: none, front (left), back (right). */
  readonly step?: 'none' | 'front' | 'back';
  /** Fists: low at the sides, gathered in front of the chest, raised, or slammed to the floor. */
  readonly front: FistKind;
  /** The back (right) fist; the same as the front when omitted. */
  readonly back?: FistKind;
  /** Crack brightness: 0 dim, 1 normal, 2 bright (more hot pixels). */
  readonly glow: 0 | 1 | 2;
  readonly mouth?: boolean;
  /** Intro: rows the whole figure is sunk into the ground. */
  readonly sink?: number;
}

function block(d: Draft, x: number, y: number, w: number, h: number, light: boolean): void {
  d.g.rect(x, y, w, h, '3');
  d.g.rect(x, y, w, 1, light ? '4' : '3');
  d.g.rect(x, y, 1, h, '4');
  d.g.rect(x + w - 2, y + 1, 2, h - 1, '2');
}

function fist(d: Draft, x: number, y: number, w: number, h: number): void {
  block(d, x, y, w, h, true);
  d.g.rect(x + 1, y + h - 3, w - 2, 1, '2');
  // knuckle cracks
  dots(d, [
    [x + 2, y + 2, '8'],
    [x + 3, y + 3, '6'],
    [x + w - 4, y + 2, '8'],
  ]);
}

function colossusFrame(p: ColossusPose): string[] {
  const d: Draft = draft(S, S);
  const b = p.bob ?? 0;
  // legs: two thick pillars with wide feet; one may lift
  const lf = p.step === 'front' ? 3 : 0;
  const lb = p.step === 'back' ? 3 : 0;
  block(d, 5, 34, 10, 12 - lf, false);
  block(d, 33, 34, 10, 12 - lb, false);
  d.g.rect(3, 44 - lf, 14, 3, '2');
  d.g.rect(3, 44 - lf, 14, 1, '3');
  d.g.rect(31, 44 - lb, 14, 3, '2');
  d.g.rect(31, 44 - lb, 14, 1, '3');
  // torso: wide shoulders tapering to the waist
  poly(
    d,
    [
      [4, 14 + b],
      [44, 14 + b],
      [31, 36],
      [17, 36],
    ],
    '3',
  );
  d.g.rect(5, 14 + b, 38, 2, '4');
  for (let y = 16 + b; y < 36; y++) {
    for (let x = 0; x < S; x++) {
      if (d.g.get(x, y) !== '3') continue;
      if (x > 34) d.g.set(x, y, '2');
      else if (x < 9 + (y - 16) / 3) d.g.set(x, y, '4');
    }
  }
  // shoulder blocks with rust bands
  block(d, 2, 11 + b, 12, 9, true);
  block(d, 34, 11 + b, 12, 9, true);
  d.g.rect(2, 15 + b, 12, 2, '5');
  d.g.rect(34, 15 + b, 12, 2, '5');
  dots(d, [
    [4, 15 + b, '4'],
    [10, 15 + b, '4'],
    [36, 15 + b, '4'],
    [42, 15 + b, '4'],
  ]);
  // head: a small block set between the shoulders, a jagged crest, glowing eyes
  block(d, 18, 4 + b, 12, 9, true);
  put(d, ['4..4.4..4', '.4.444.4.'], 19, 2 + b);
  dots(d, [
    [20, 7 + b, '6'],
    [21, 7 + b, '7'],
    [26, 7 + b, '7'],
    [27, 7 + b, '6'],
  ]);
  if (p.mouth) put(d, ['6666', '8888'], 22, 10 + b);
  else
    dots(d, [
      [22, 10 + b, '8'],
      [23, 10 + b, '8'],
      [24, 10 + b, '8'],
      [25, 10 + b, '8'],
    ]);
  // furnace door in the chest: a rust frame, a dark opening with glowing bars
  d.g.rect(16, 19 + b, 16, 14, '5');
  d.g.rect(17, 20 + b, 14, 12, '8');
  for (const x of [19, 22, 25, 28]) d.g.rect(x, 21 + b, 2, 10, '6');
  d.g.rect(17, 25 + b, 14, 2, '7');
  dots(d, [
    [16, 19 + b, '4'],
    [31, 19 + b, '4'],
    [16, 32 + b, '2'],
    [31, 32 + b, '2'],
  ]);
  // arms and fists, one side at a time: front (left) and back (right)
  const sideArm = (front: boolean, kind: FistKind): void => {
    const x = front ? 0 : 36;
    const ax = front ? 1 : 39;
    if (kind === 'low') {
      block(d, ax, 20 + b, 8, 14, false);
      fist(d, front ? 0 : 37, 33 + b, 11, 10);
    } else if (kind === 'gather') {
      block(d, front ? 5 : 35, 20 + b, 8, 10, false);
      fist(d, front ? 6 : 30, 28 + b, 12, 10);
    } else if (kind === 'raised') {
      block(d, front ? 0 : 40, 6 + b, 8, 12, false);
      fist(d, front ? 0 : 37, 0, 11, 9);
    } else {
      block(d, front ? 0 : 40, 22 + b, 8, 14, false);
      fist(d, x, 36, 12, 10);
    }
  };
  sideArm(true, p.front);
  sideArm(false, p.back ?? p.front);
  // lava cracks across the stone (dim, normal, bright)
  const hot = p.glow === 2 ? '7' : '6';
  const crack = (pts: readonly (readonly [number, number])[]): void => {
    stroke(d, pts, p.glow === 0 ? '8' : '6', 1);
  };
  crack([
    [34, 22 + b],
    [36, 26 + b],
    [34, 30 + b],
    [35, 34],
  ]);
  crack([
    [12, 22 + b],
    [10, 27 + b],
    [12, 32 + b],
  ]);
  crack([
    [6, 12 + b],
    [8, 14 + b],
  ]);
  crack([
    [16, 38],
    [18, 42],
  ]);
  crack([
    [32, 38],
    [30, 42],
  ]);
  dots(d, [
    [35, 26 + b, hot],
    [10, 27 + b, hot],
    [17, 40, hot],
    [31, 40, hot],
  ]);
  d.g.rect(0, 47, S, 1, '.');
  const out = finish(d);
  return p.sink ? lift(out, -p.sink) : out;
}

export const MOLTEN_COLOSSUS: SpriteTemplate = enemyTemplate(
  'molten-colossus',
  S,
  S,
  { x: 24, y: 47 },
  {
    idle: [
      colossusFrame({ front: 'raised', glow: 1 }),
      colossusFrame({ front: 'raised', glow: 0, bob: 1 }),
    ],
    walk: [
      colossusFrame({ front: 'raised', glow: 1, bob: 1, step: 'front' }),
      colossusFrame({ front: 'raised', glow: 1, step: 'back' }),
    ],
    attack: [
      colossusFrame({ front: 'raised', glow: 1 }),
      colossusFrame({ front: 'slam', glow: 2, mouth: true, bob: 1 }),
      colossusFrame({ front: 'low', glow: 1 }),
    ],
    telegraph: [
      colossusFrame({ front: 'gather', glow: 1 }),
      colossusFrame({ front: 'gather', glow: 2, bob: 1 }),
    ],
    intro: [
      colossusFrame({ front: 'low', glow: 0, sink: 26 }),
      colossusFrame({ front: 'low', glow: 1, sink: 9, mouth: true }),
    ],
  },
);
