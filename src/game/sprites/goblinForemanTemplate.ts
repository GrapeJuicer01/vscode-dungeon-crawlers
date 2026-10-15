// Stage 2 boss "Goblin Foreman" (batch E1, step A-E1-6). Owned by the pixel-artist.
// `enemies/goblin-foreman`, 48x48, LEFT-facing, foot anchor (24, 47). Animations: idle 2, walk 2,
// attack 3, telegraph 2, intro 2 (11 frames), the same set as the Rat King. A big green goblin
// foreman in a yellow hard hat with a lamp, a timber vest, a lantern in his far hand, and a huge
// pickaxe. Colors (12): 1 N L 6 5 2 m k e w Y O. `Y`/`O` are the lantern core and glow; phase 2
// (ENEMY_PHASE_PALETTES in palettesE1.ts) overrides `Y O 6` for a hotter lantern glow and an
// orange hat over the same silhouette. `telegraph` raises the pickaxe straight overhead, then pulls
// it back behind him; `attack` is a low forward swing with an open mouth.

import { dots, draft, ellipse, enemyTemplate, finish, put, stroke } from './enemyBuilder';
import type { Draft } from './enemyBuilder';
import type { SpriteTemplate } from './spriteTypes';

type Pt = readonly [number, number];
const S = 48;

interface Pick {
  readonly hand: Pt;
  readonly tip: Pt;
  /** The pick head: a bar centred on the tip, drawn perpendicular to the handle. */
  readonly head: readonly Pt[];
}

interface ForemanPose {
  readonly bob?: number;
  readonly head?: Pt;
  readonly mouth?: boolean;
  readonly legs?: 0 | 1 | 2;
  readonly pick: Pick;
  readonly lantern: Pt;
  readonly rays?: boolean;
}

function bar(cx: number, cy: number, dx: number, dy: number, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = -n; i <= n; i++) out.push([cx + dx * i, cy + dy * i]);
  return out;
}

const PICK_SHOULDER: Pick = { hand: [14, 31], tip: [36, 8], head: bar(36, 8, 1, 1, 6) };
const PICK_OVERHEAD: Pick = { hand: [28, 25], tip: [28, 5], head: bar(28, 4, 1, 0, 9) };
const PICK_BACK: Pick = { hand: [30, 27], tip: [40, 14], head: bar(40, 14, 1, -1, 3) };
const PICK_SWING: Pick = { hand: [12, 35], tip: [4, 42], head: bar(4, 42, 1, -1, 4) };
const PICK_PLANT: Pick = { hand: [9, 28], tip: [9, 45], head: bar(9, 45, 1, 0, 4) };
const LANTERN_LOW: Pt = [40, 36];

function lantern(d: Draft, x: number, y: number, rays: boolean): void {
  // bail, frame, glass with a bright core
  stroke(
    d,
    [
      [x + 2, y - 3],
      [x + 2, y],
    ],
    '2',
    1,
  );
  put(d, ['.222.', '2OYO2', '2OYO2', '2OYO2', '.222.'], x, y);
  if (rays) {
    dots(d, [
      [x - 2, y + 2, 'Y'],
      [x + 6, y + 2, 'Y'],
      [x + 2, y + 7, 'Y'],
      [x - 1, y + 6, 'O'],
      [x + 5, y + 6, 'O'],
    ]);
  }
}

function foremanFrame(p: ForemanPose): string[] {
  const d = draft(S, S);
  const bob = p.bob ?? 0;
  const [hdx, hdy] = p.head ?? [0, 0];
  // legs and boots
  const lx = p.legs === 1 ? [15, 29] : p.legs === 2 ? [19, 25] : [17, 27];
  for (const x of lx) {
    put(d, ['2222222', '2222222', '2222222', '2222222', '2222222'], x, 37);
    put(d, ['kkkkkkkkk', 'kkkkkkkkk', 'kkkkkkkkk'], x - 3, 44);
  }
  // torso: vest with a lighter belly opening
  ellipse(d, 27, 29 + bob, 10, 10, '2');
  ellipse(d, 26, 28 + bob, 10, 10, '5');
  ellipse(d, 21, 31 + bob, 4, 6, 'N');
  stroke(
    d,
    [
      [19, 21 + bob],
      [31, 38 + bob],
    ],
    '2',
    1,
  );
  put(d, ['kkkkkkkk'], 18, 34 + bob);
  put(d, ['66'], 25, 34 + bob);
  // far arm holding the lantern
  stroke(
    d,
    [
      [33, 24 + bob],
      [p.lantern[0] + 1, p.lantern[1] - 4],
    ],
    'N',
    4,
  );
  put(d, ['LLL', 'LLL'], p.lantern[0], p.lantern[1] - 4);
  lantern(d, p.lantern[0] - 1, p.lantern[1] + bob, p.rays === true);
  // head: ears behind, face, nose, eye, tusks
  const hx = 16 + hdx;
  const hy = 17 + hdy + bob;
  stroke(
    d,
    [
      [hx + 6, hy - 2],
      [hx + 14, hy - 8],
    ],
    'N',
    3,
  );
  stroke(
    d,
    [
      [hx + 7, hy + 1],
      [hx + 16, hy - 1],
    ],
    'N',
    3,
  );
  dots(d, [
    [hx + 14, hy - 8, 'L'],
    [hx + 16, hy - 1, 'L'],
  ]);
  ellipse(d, hx, hy, 9, 8, 'N');
  put(d, ['LL', 'L'], hx - 7, hy - 5);
  put(d, ['LLL', 'LLL'], hx - 11, hy + 1);
  put(d, ['.ww.', 'wwww', 'wwww', '.ww.'], hx - 6, hy - 4);
  put(d, ['ee', 'ee', 'ee'], hx - 6, hy - 3);
  put(d, ['2222'], hx - 6, hy - 6);
  if (p.mouth) {
    put(d, ['eeeeee', 'eeeeee', 'eeeeee'], hx - 8, hy + 5);
    dots(d, [
      [hx - 8, hy + 5, 'w'],
      [hx - 4, hy + 5, 'w'],
      [hx - 6, hy + 7, 'w'],
    ]);
  } else {
    put(d, ['eeeee'], hx - 8, hy + 6);
    dots(d, [
      [hx - 8, hy + 5, 'w'],
      [hx - 4, hy + 5, 'w'],
    ]);
  }
  // hard hat: dome, brim, lamp
  ellipse(d, hx, hy - 8, 9, 5, '6');
  put(d, ['55555555555555'], hx - 8, hy - 4);
  put(d, ['.55555555555.'], hx - 6, hy - 3);
  dots(d, [
    [hx - 9, hy - 8, 'Y'],
    [hx - 9, hy - 7, 'Y'],
    [hx - 10, hy - 8, 'O'],
  ]);
  put(d, ['66', '6'], hx - 3, hy - 12);
  // near arm and the pickaxe (in front of everything)
  const pk = p.pick;
  stroke(
    d,
    [
      [pk.hand[0], pk.hand[1] + bob],
      [pk.tip[0], pk.tip[1] + bob],
    ],
    'k',
    2,
  );
  stroke(
    d,
    pk.head.map((q) => [q[0], q[1] + bob] as Pt),
    'm',
    3,
  );
  stroke(
    d,
    [
      [20, 24 + bob],
      [pk.hand[0] + 2, pk.hand[1] + 1 + bob],
    ],
    'N',
    4,
  );
  put(d, ['LLLL', 'LLLL', 'LLLL'], pk.hand[0] - 1, pk.hand[1] - 1 + bob);
  d.g.rect(0, 47, S, 1, '.');
  return finish(d);
}

const IDLE: ForemanPose = { pick: PICK_SHOULDER, lantern: LANTERN_LOW };

export const GOBLIN_FOREMAN: SpriteTemplate = enemyTemplate(
  'goblin-foreman',
  S,
  S,
  { x: 24, y: 47 },
  {
    idle: [foremanFrame(IDLE), foremanFrame({ ...IDLE, bob: 1, lantern: [40, 37] })],
    walk: [
      foremanFrame({ ...IDLE, legs: 1, bob: 1, head: [-1, 0] }),
      foremanFrame({ ...IDLE, legs: 2 }),
    ],
    attack: [
      foremanFrame({ pick: PICK_BACK, lantern: LANTERN_LOW, head: [2, -1], bob: 0 }),
      foremanFrame({ pick: PICK_SWING, lantern: LANTERN_LOW, head: [-3, 1], mouth: true, bob: 1 }),
      foremanFrame({
        pick: { hand: [13, 32], tip: [30, 14], head: bar(30, 14, 1, 1, 5) },
        lantern: LANTERN_LOW,
        head: [-1, 0],
      }),
    ],
    telegraph: [
      foremanFrame({ pick: PICK_OVERHEAD, lantern: LANTERN_LOW, bob: -2, mouth: true }),
      foremanFrame({
        pick: PICK_BACK,
        lantern: [41, 33],
        bob: -2,
        head: [3, 0],
        mouth: true,
        rays: true,
      }),
    ],
    intro: [
      foremanFrame({ pick: PICK_PLANT, lantern: [40, 20], bob: -1 }),
      foremanFrame({ pick: PICK_PLANT, lantern: [40, 14], bob: -2, mouth: true, rays: true }),
    ],
  },
);
