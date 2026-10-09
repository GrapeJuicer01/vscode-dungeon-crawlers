// Class layers for H3 (batch A3-2 Druid and Monk, A3-3 Artificer and Berserker).
// Owned by the pixel-artist. Same construction as classTemplates.ts / classTemplatesH2.ts: every class
// reuses the shared base body (`hero/body`, recolored by its class palette) and supplies `head`,
// `gear`, and `weapon` rendered from the same poses as the base hero (HERO_POSES), so all eleven
// animations and all 26 frames line up with the body.
//
// Design notes (silhouette at 16x20, faces right, characters only, no hex):
// - Druid (earth brown + leaf green): pale forked antlers over a leaf crown (head sits 1 px lower),
//   a leafy shoulder wrap and leaf fringe, a crooked wooden staff with a leaf cluster on top.
// - Monk (orange + cream): cream headband with a trailing knot and a small topknot, orange gi with a
//   cream sash, BARE forearms, no weapon. The weapon layer holds the glowing fists (a near fist and
//   a far fist behind the body, each with a small `Y` halo; art only).
// - Artificer (copper + teal): steel-rimmed teal goggles pushed up on the brow, a big copper gear
//   backpack (a bump behind the shoulders), teal gauge on the chest, a steel wrench.
// - Berserker (fur brown + war paint): wild spiky hair, bare chest with a leather strap and fur
//   mantle, bare arms, an oversized axe. WAR PAINT: exactly two `a` (red) pixels, a horizontal
//   cheek bar at head (x+4..x+5, y+5), drawn in the head layer, identical in every frame of every
//   animation relative to the head. `a` is used nowhere else in this class (the torso scarf row of the
//   base body, which is `a`, is covered by fur in every pose), so there is no other red on the hero.
//   No hurt cue: the mouth is open only mid-roar in `ability` frames 0 and 1 (weapon layer), and the
//   face is otherwise calm. No meter look: nothing grows, pulses, or varies with any state.
// Colors: the eleven hero characters `o s h e c d b k m w a`, plus `Y` (glow) for Druid and Monk, so a
// composited look is at most 12 colors. No hurt, downed, or dying frames exist; sleep is a
// closed-eye line and a small "z" (Core invariant 1). Format: docs/design/sprite-spec.md.

import type { Grid } from './spriteBuilder';
import { ROW, layerSet, piece, type ClassSpec, type Ctx } from './classTemplates';
import type { HeroLayerSet } from './spriteTypes';

/** Sparkle pixels, drawn after the outline so they stay single floating pixels. */
function sparkle(g: Grid, pts: readonly (readonly [number, number])[], ch: string): void {
  for (const [x, y] of pts) g.set(x, y, ch);
}

/** Glow level 0..2 for the item of a class on a given frame (art only, never state). */
function glowOf(anim: string, frame: number): number {
  if (anim === 'ability') return frame < 2 ? 2 : 1;
  if (anim === 'attack') return frame === 1 ? 2 : 0;
  if (anim === 'victory') return 1;
  return 0;
}

/** Recolors the 'd' sleeve pixels of the pose's arm from column `minX` on to skin (bare forearms). */
function bareArm(g: Grid, c: Ctx, minX: number): void {
  for (const [x, y, ch] of c.pose.arm ?? []) {
    if (ch === 'd' && x >= minX) g.set(x, y, 's');
  }
}

// ---- Druid ----

/** Leaf cluster on a staff, upright (3x3, the staff meets the bottom middle). */
function leafHead(s: Grid, x: number, y: number): void {
  s.blit(['aa.', 'aba', '.k.'], x, y);
}

/** Leaf cluster on a staff pointing right (3x3, the staff meets the left middle). */
function leafHeadH(s: Grid, x: number, y: number): void {
  s.blit(['.aa', 'kba', '.aa'], x, y);
}

const DRUID: ClassSpec = {
  id: 'druid',
  shift: { dx: 0, dy: 1 },
  head: (g, x, y) => {
    // forked pale antlers over a leaf crown, a leaf tuft trailing behind
    g.plot([
      [x + 1, y - 2, 'm'],
      [x + 3, y - 2, 'm'],
      [x + 6, y - 2, 'm'],
      [x + 8, y - 2, 'm'],
    ]);
    ROW(g, x + 1, x + 3, y - 1, 'm');
    ROW(g, x + 6, x + 8, y - 1, 'm');
    for (let i = 1; i <= 8; i++) g.set(x + i, y, i % 2 === 1 ? 'a' : 'b');
    g.plot([
      [x - 1, y + 1, 'a'],
      [x - 2, y + 2, 'a'],
      [x - 1, y + 2, 'b'],
    ]);
  },
  gear: (g, under, c) => {
    const { tx, ty } = c;
    // leafy wrap over the shoulders, brown strap, leaf fringe at the hip
    piece(g, under, 'outside', (s) => {
      for (let i = 0; i < 8; i++) s.set(tx - 1 + i, ty, i % 2 === 0 ? 'a' : 'b');
    });
    g.plot([
      [tx + 1, ty + 1, 'k'],
      [tx + 2, ty + 2, 'k'],
      [tx + 3, ty + 3, 'k'],
    ]);
    for (let i = 0; i < 6; i++) g.set(tx + i, ty + 4, i % 2 === 0 ? 'a' : 'b');
    g.plot([
      [tx + 1, ty + 5, 'a'],
      [tx + 4, ty + 5, 'b'],
    ]);
  },
  weapon: (g, under, c) => {
    const { hx, hy, role } = c;
    const glow = glowOf(c.anim, c.frame);
    let at: [number, number] = [hx + 2, hy - 8];
    piece(g, under, 'all', (s) => {
      if (role === 'up') {
        const sx = hx + 2;
        const y0 = Math.max(1, hy - 11);
        s.rect(sx, y0 + 3, 1, hy + 5 - (y0 + 3), 'k');
        s.plot([
          [sx, y0 + 5, 'm'],
          [sx + 1, y0 + 7, 'k'],
        ]);
        leafHead(s, sx - 1, y0);
        at = [sx, y0 + 1];
      } else if (role === 'fwd') {
        ROW(s, hx + 2, hx + 6, hy, 'k');
        s.set(hx + 4, hy, 'm');
        leafHeadH(s, hx + 7, hy - 1);
        at = [hx + 9, hy];
      } else if (role === 'low') {
        s.line(hx + 2, hy + 1, hx + 6, hy + 4, 'k');
        leafHeadH(s, hx + 7, hy + 3);
        at = [hx + 9, hy + 4];
      } else {
        s.line(hx + 1, hy + 3, hx + 6, hy - 1, 'k');
        leafHeadH(s, hx + 7, hy - 3);
        at = [hx + 9, hy - 2];
      }
    });
    if (glow > 0) {
      const [cx, cy] = at;
      const pts: [number, number][] = [
        [cx - 2, cy - 3],
        [cx + 3, cy + 2],
      ];
      if (glow > 1) pts.push([cx + 2, cy - 3], [cx - 3, cy + 1], [cx, cy - 4]);
      sparkle(g, pts, 'Y');
    }
  },
  lap: (g) => {
    ROW(g, 13, 19, 14, 'k');
    ROW(g, 13, 19, 15, 'k');
    g.set(16, 14, 'm');
    leafHeadH(g, 20, 13);
  },
};

// ---- Monk ----

/** Halo pixels around a 2x2 fist at (fx, fy); `near` puts them on the open (right) side. */
function fistHalo(
  fx: number,
  fy: number,
  level: number,
  alt: boolean,
  near: boolean,
): [number, number][] {
  if (level <= 0) return [];
  const dir = near ? 1 : -1;
  const sideX = near ? fx + 2 : fx - 1;
  if (alt)
    return [
      [sideX, fy + 1],
      [near ? fx + 1 : fx, fy + 2],
    ];
  const pts: [number, number][] = [
    [sideX, fy],
    [fx + (near ? 0 : 1), fy - 1],
  ];
  if (level > 1) {
    pts.push([sideX, fy + 1], [fx + (near ? 1 : 0), fy - 1], [fx + (near ? 0 : 1), fy + 2]);
    pts.push([sideX + dir, fy - 1]);
  }
  return pts;
}

const MONK: ClassSpec = {
  id: 'monk',
  shift: { dx: 0, dy: 1 },
  head: (g, x, y) => {
    // small topknot, cream headband across the brow with a knot and two tails trailing back
    ROW(g, x + 3, x + 5, y - 1, 'h');
    g.set(x + 4, y - 2, 'h');
    ROW(g, x, x + 9, y + 1, 'a');
    g.plot([
      [x - 1, y + 1, 'a'],
      [x - 2, y + 2, 'c'],
      [x - 3, y + 2, 'c'],
      [x - 2, y + 3, 'a'],
      [x - 4, y + 3, 'c'],
    ]);
  },
  gear: (g, under, c) => {
    const { tx, ty } = c;
    // cream gi lapel, cream sash at the waist with a knot and tail behind
    g.plot([
      [tx + 3, ty + 1, 'a'],
      [tx + 4, ty + 2, 'a'],
    ]);
    ROW(g, tx, tx + 5, ty + 3, 'a');
    piece(g, under, 'outside', (s) => {
      s.plot([
        [tx - 1, ty + 3, 'a'],
        [tx - 2, ty + 4, 'a'],
        [tx - 1, ty + 4, 'c'],
      ]);
    });
    bareArm(g, c, 10);
  },
  weapon: (g, under, c) => {
    // No weapon: the glowing fists. The near fist is the pose's hand; the far fist sits behind the body.
    const { hx, hy, tx, ty } = c;
    const level =
      c.anim === 'ability'
        ? 2
        : c.anim === 'idle'
          ? 1
          : c.anim === 'attack' && c.frame === 1
            ? 2
            : 1;
    const alt = c.anim === 'idle' && c.frame === 1;
    piece(g, under, 'outside', (s) => s.rect(tx - 3, ty + 2, 2, 2, 's'));
    sparkle(g, fistHalo(hx, hy, level, alt, true), 'Y');
    sparkle(g, fistHalo(tx - 3, ty + 2, level, alt, false), 'Y');
  },
  lap: (g) => {
    // a folded cream sash with two orange ends
    ROW(g, 13, 19, 14, 'a');
    ROW(g, 13, 19, 15, 'a');
    ROW(g, 20, 21, 14, 'c');
    ROW(g, 20, 22, 15, 'c');
  },
};

// ---- Artificer ----

/** Wrench jaw (open head), 6 wide and 3 tall. */
const JAW = ['mm..mm', 'mmmmmm', '.mmmm.'];

const ARTIFICER: ClassSpec = {
  id: 'artificer',
  shift: { dx: 0, dy: 0 },
  head: (g, x, y) => {
    // goggles pushed up on the forehead: two steel-rimmed teal lenses on a dark strap
    g.blit(['mmm.mmm', 'mam.mam', 'mmm.mmm'], x + 2, y - 1);
    g.plot([
      [x + 5, y, 'k'],
      [x, y, 'k'],
      [x + 1, y, 'k'],
    ]);
  },
  gear: (g, under, c) => {
    const { tx, ty } = c;
    // gear-and-pipes backpack: a copper box with a teal cog and two steel pipes
    piece(g, under, 'outside', (s) => {
      s.blit(['.m.m', 'cccc', 'camc', 'cccd', 'dddd'], tx - 4, ty - 1);
    });
    // bandolier strap, belt, and a teal gauge on the chest
    g.plot([
      [tx + 1, ty + 1, 'k'],
      [tx + 2, ty + 2, 'k'],
    ]);
    ROW(g, tx, tx + 5, ty + 3, 'k');
    g.plot([
      [tx + 4, ty + 1, 'a'],
      [tx + 3, ty + 3, 'm'],
    ]);
  },
  weapon: (g, under, c) => {
    const { hx, hy, role } = c;
    piece(g, under, 'all', (s) => {
      if (role === 'up') {
        const top = Math.max(1, hy - 8);
        s.rect(hx + 2, top + 3, 2, hy + 3 - (top + 3), 'm');
        s.rect(hx + 2, hy + 1, 2, 2, 'c');
        s.blit(JAW, hx, top);
        s.set(hx + 1, top + 1, 'w');
      } else if (role === 'fwd') {
        s.rect(hx + 2, hy, 5, 2, 'm');
        s.rect(hx + 2, hy, 2, 2, 'c');
        s.blit(['mmm', 'mm.', 'mm.', 'mm.', 'mm.', 'mmm'], hx + 7, hy - 2);
        s.set(hx + 7, hy - 2, 'w');
      } else if (role === 'low') {
        s.line(hx + 2, hy + 1, hx + 7, hy + 4, 'm');
        s.line(hx + 2, hy + 2, hx + 7, hy + 5, 'm');
        s.rect(hx + 2, hy + 1, 2, 2, 'c');
        s.blit(['mm.m', 'mmmm'], hx + 7, hy + 4);
      } else {
        s.line(hx + 1, hy + 1, hx + 6, hy - 3, 'm');
        s.line(hx + 2, hy + 1, hx + 7, hy - 3, 'm');
        s.rect(hx + 1, hy, 2, 2, 'c');
        s.blit(['mm.mm', 'mmmmm'], hx + 6, hy - 6);
      }
    });
    if (c.anim === 'ability' && c.frame < 2) {
      // a lens glint on the goggles
      const px = c.pose.head.x;
      const py = c.pose.head.y;
      sparkle(
        g,
        [
          [px + 1, py - 2],
          [px + 10, py - 2],
        ],
        'w',
      );
    }
  },
  lap: (g) => {
    ROW(g, 13, 19, 14, 'm');
    ROW(g, 13, 19, 15, 'm');
    ROW(g, 13, 14, 14, 'c');
    ROW(g, 13, 14, 15, 'c');
    g.blit(['mm.m', 'mmmm', 'mm.m'], 20, 13);
  },
};

// ---- Berserker ----

/** Axe head seen from the side, 6 wide and 7 tall; column 0 is the haft. */
const BLADE_UP = ['cmm...', 'cmmmm.', 'cmmmmw', 'cmmmmw', 'cmmmmw', 'cmmmm.', 'cmm...'];
/** Axe head turned toward the viewer (4 wide): used when the swing is forward, low, or angled. */
const BLADE_SMALL = ['.mmw', 'mmmw', 'mmmw', '.mmw'];

const BERSERKER_SHIFT_DX = 0;
const BERSERKER_SHIFT_DY = 1;

const BERSERKER: ClassSpec = {
  id: 'berserker',
  shift: { dx: BERSERKER_SHIFT_DX, dy: BERSERKER_SHIFT_DY },
  head: (g, x, y) => {
    // wild spiky hair: three spikes over the crown, two strands streaming back
    g.plot([
      [x + 2, y - 2, 'h'],
      [x + 5, y - 2, 'h'],
      [x + 8, y - 2, 'h'],
    ]);
    ROW(g, x + 1, x + 3, y - 1, 'h');
    ROW(g, x + 5, x + 8, y - 1, 'h');
    g.plot([
      [x - 1, y + 1, 'h'],
      [x - 2, y + 2, 'h'],
      [x - 1, y + 3, 'h'],
    ]);
    // WAR PAINT: two fixed red pixels (a horizontal cheek bar), the same in every frame
    g.plot([
      [x + 4, y + 5, 'a'],
      [x + 5, y + 5, 'a'],
    ]);
  },
  gear: (g, under, c) => {
    const { tx, ty } = c;
    // fur collar covers the scarf row; bare chest; leather strap and belt; fur loincloth
    ROW(g, tx, tx + 5, ty, 'c');
    g.plot([
      [tx + 2, ty, 'd'],
      [tx + 4, ty, 'd'],
    ]);
    g.rect(tx, ty + 1, 2, 3, 'c');
    g.rect(tx + 2, ty + 1, 4, 3, 's');
    g.plot([
      [tx + 2, ty + 1, 'k'],
      [tx + 3, ty + 2, 'k'],
      [tx + 4, ty + 3, 'k'],
    ]);
    ROW(g, tx, tx + 5, ty + 3, 'k');
    g.set(tx + 3, ty + 3, 'm');
    for (let i = 0; i < 6; i++) g.set(tx + i, ty + 4, i % 2 === 0 ? 'c' : 'd');
    // fur mantle on the back shoulder
    piece(g, under, 'outside', (s) => {
      s.blit(['.cc', 'ccc', 'cdc', '.d.'], tx - 3, ty - 1);
    });
    bareArm(g, c, 9);
    // In the lowered poses (sleep) the head overlaps the collar: keep the two war-paint pixels
    // visible by leaving those gear cells empty (the head layer paints them).
    const px = c.pose.head.x + BERSERKER_SHIFT_DX;
    const py = c.pose.head.y + BERSERKER_SHIFT_DY;
    g.set(px + 4, py + 5, '.');
    g.set(px + 5, py + 5, '.');
  },
  weapon: (g, under, c) => {
    const { hx, hy, role } = c;
    piece(g, under, 'all', (s) => {
      if (role === 'up') {
        const x = hx + 1;
        const y0 = Math.max(1, hy - 9);
        s.blit(BLADE_UP, x, y0);
        for (let yy = y0 + 7; yy <= hy + 4; yy++) s.set(x, yy, yy % 2 === 0 ? 'c' : 'd');
      } else if (role === 'fwd') {
        ROW(s, hx + 2, hx + 5, hy, 'c');
        ROW(s, hx + 2, hx + 5, hy + 1, 'd');
        s.blit(
          ['.mmw', 'mmmw', 'mmmw', 'mmmw', 'cmmw', 'dmmw', 'mmmw', 'mmmw', '.mmw'],
          hx + 6,
          hy - 4,
        );
      } else if (role === 'low') {
        s.line(hx + 2, hy + 1, hx + 6, hy + 4, 'c');
        s.blit(BLADE_SMALL, hx + 6, hy + 3);
      } else {
        s.line(hx + 1, hy + 2, hx + 5, hy - 3, 'c');
        s.blit(['.mmw', 'mmmw', 'mmmw', 'mmmw', 'mmmw', '.mmw'], hx + 5, hy - 8);
      }
    });
    if (c.anim === 'ability' && c.frame < 2) {
      // mouth open mid-roar (two dark pixels at the chin), only in these two frames
      const mx = c.pose.head.x;
      const my = c.pose.head.y + BERSERKER_SHIFT_DY;
      g.plot([
        [mx + 7, my + 5, 'o'],
        [mx + 8, my + 5, 'o'],
      ]);
    }
  },
  lap: (g) => {
    ROW(g, 13, 19, 14, 'c');
    ROW(g, 13, 19, 15, 'd');
    g.blit(BLADE_SMALL, 20, 13);
  },
};

/** Class id -> layers for batch H3 (rendered by the shared `layerSet` in classTemplates.ts). */
export const CLASS_LAYERS_H3: Readonly<Record<string, HeroLayerSet>> = {
  druid: layerSet(DRUID),
  monk: layerSet(MONK),
  artificer: layerSet(ARTIFICER),
  berserker: layerSet(BERSERKER),
};
