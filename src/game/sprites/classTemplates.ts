// Class layers for H1 (batches A1-2 Warrior and Mage, A1-3 Archer and Rogue).
// Owned by the pixel-artist. Every class reuses the shared base body (`hero/body`, recolored by its
// class palette) and supplies its own `head`, `gear`, and `weapon` layers. The layers are rendered
// from the same poses as the base hero (HERO_POSES), so all eleven animations and all 26 frames
// line up with the body: hand and torso positions come straight from the base poses.
//
// Design notes (silhouette at 16x20, all faces right, characters only, no hex):
// - Warrior: steel helm with a red plume rising and streaming back, broad steel pauldrons, a round
//   red-and-steel shield on the near arm, a two-pixel-wide sword.
// - Mage: tallest silhouette. Pointed, bent blue hat with a gold band and wide brim (head sits 1 px
//   lower so the cone fits), flared robe with a gold hem and belt, orb staff beside the hand.
// - Archer: pointed hood with a back peak, quiver bulging behind the shoulder, chest strap, a bow
//   whose string pulls back on the strike frame.
// - Rogue: low rounded cowl, mask over the lower face, purple scarf tail, trailing cape, belt,
//   head 1 px lower and 1 px forward (crouch and lean), a front dagger plus a back dagger.
// No hurt, downed, or dying frames exist; sleep is a closed-eye line and a small "z" (Core
// invariant 1). Format: docs/design/sprite-spec.md.

import { Grid, type Px } from './spriteBuilder';
import { BASE_HERO, HERO_HEAD, HERO_POSES, type HeroPose } from './heroTemplates';
import type { HeroLayerSet, SpriteTemplate } from './spriteTypes';

export const W = 16;
export const H = 20;
export const WEAPON_W = 24;
export const ANCHOR = { x: 8, y: 19 } as const;

export type Role = 'up' | 'fwd' | 'low' | 'angle' | 'lap';

export interface Ctx {
  readonly anim: string;
  readonly frame: number;
  readonly role: Role | null;
  readonly hx: number;
  readonly hy: number;
  readonly tx: number;
  readonly ty: number;
  readonly pose: HeroPose;
}

export interface ClassSpec {
  readonly id: string;
  /** Head shift in pixels (crouch and lean). */
  readonly shift: { readonly dx: number; readonly dy: number };
  /** Draws head gear over the base head (HERO_HEAD already blitted at x, y). Pre-outline. */
  readonly head: (g: Grid, x: number, y: number) => void;
  readonly gear: (g: Grid, under: Grid, c: Ctx) => void;
  readonly weapon: (g: Grid, under: Grid, c: Ctx) => void;
  /** Polish pose: the item across the lap (pre-outline); the rag overlay is added by the caller. */
  readonly lap: (g: Grid) => void;
}

// ---- Shared helpers ----

export function roleOf(anim: string, frame: number): Role | null {
  switch (anim) {
    case 'idle':
    case 'walk':
    case 'victory':
      return 'up';
    case 'attack':
      return (['up', 'fwd', 'low'] as const)[frame] ?? 'up';
    case 'ability':
      return (['up', 'fwd', 'angle'] as const)[frame] ?? 'up';
    case 'polish':
      return 'lap';
    default:
      return null;
  }
}

/** Top-left of the 2x2 hand in the body layer (the skin pixels of the pose's arm). */
export function handOf(p: HeroPose): { x: number; y: number } {
  let x = 99;
  let y = 99;
  for (const [px, py, ch] of p.arm ?? []) {
    if (ch !== 's') continue;
    if (py < y || (py === y && px < x)) {
      x = px;
      y = py;
    }
  }
  return { x: x === 99 ? 13 : x, y: y === 99 ? 12 : y };
}

/**
 * Draws a piece into `target` with a 1px outline. `ring` 'all' keeps the outline over the body;
 * 'outside' keeps it only where nothing is underneath. Outline never covers skin or the eye.
 */
export function piece(
  target: Grid,
  under: Grid,
  ring: 'all' | 'outside',
  draw: (s: Grid) => void,
): void {
  const s = new Grid(target.w, target.h);
  draw(s);
  const filled = s.rows();
  s.outline('o');
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const ch = s.get(x, y);
      if (ch === '.') continue;
      if (filled[y]?.charAt(x) === '.') {
        const u = under.get(x, y);
        if (ring === 'outside' && u !== '.') continue;
        if (u === 's' || u === 'e') continue;
      }
      target.set(x, y, ch);
    }
  }
}

export const ROW = (g: Grid, x0: number, x1: number, y: number, ch: string): void =>
  g.rect(x0, y, x1 - x0 + 1, 1, ch);

/** A rag-wiping hand over a lap item, as in the base hero (rag in white cloth). */
export function ragOverlay(g: Grid, rx: number): void {
  const s = new Grid(g.w, g.h);
  s.line(10, 13, rx + 1, 11, 'd');
  s.rect(rx, 11, 2, 2, 's');
  s.rect(rx, 13, 3, 4, 'w');
  s.outline('o');
  g.blit(s.rows(), 0, 0);
}

// ---- Warrior ----

function warriorSword(s: Grid, c: Ctx): void {
  const { hx, hy, role } = c;
  if (role === 'up') {
    const len = Math.min(7, hy - 2);
    s.rect(hx, hy - 1, 4, 1, 'k');
    s.rect(hx + 1, hy - 1 - len, 1, len, 'w');
    s.rect(hx + 2, hy - 1 - len, 1, len, 'm');
    s.set(hx + 2, hy - 1 - len, 'w');
  } else if (role === 'fwd') {
    s.rect(hx + 2, hy - 1, 1, 4, 'k');
    s.rect(hx + 3, hy, 7, 1, 'w');
    s.rect(hx + 3, hy + 1, 6, 1, 'm');
  } else if (role === 'low') {
    s.rect(hx + 2, hy + 1, 2, 2, 'k');
    s.line(hx + 4, hy + 2, hx + 10, hy + 5, 'm');
    s.line(hx + 4, hy + 1, hx + 10, hy + 4, 'w');
  } else if (role === 'angle') {
    s.rect(hx + 2, hy - 1, 1, 4, 'k');
    s.line(hx + 3, hy, hx + 9, hy - 3, 'w');
    s.line(hx + 3, hy + 1, hx + 9, hy - 2, 'm');
  }
}

const WARRIOR: ClassSpec = {
  id: 'warrior',
  shift: { dx: 0, dy: 0 },
  head: (g, x, y) => {
    // steel helm: dome, brow band, back and neck guard
    ROW(g, x + 1, x + 8, y, 'm');
    ROW(g, x, x + 9, y + 1, 'm');
    ROW(g, x, x + 9, y + 2, 'd');
    g.rect(x, y + 3, 4, 2, 'm');
    ROW(g, x + 1, x + 3, y + 5, 'd');
    g.plot([
      [x + 3, y, 'w'],
      [x + 4, y, 'w'],
      [x + 2, y + 1, 'w'],
    ]);
    // red plume: rises over the crown and streams down the back
    g.plot([
      [x + 3, y - 2, 'a'],
      [x + 4, y - 2, 'a'],
      [x + 2, y - 1, 'a'],
      [x + 3, y - 1, 'a'],
      [x + 4, y - 1, 'a'],
      [x + 5, y - 1, 'a'],
      [x + 6, y - 1, 'a'],
      [x, y, 'a'],
      [x - 1, y + 1, 'a'],
      [x - 1, y + 2, 'a'],
      [x - 1, y + 3, 'a'],
    ]);
  },
  gear: (g, under, c) => {
    const { tx, ty } = c;
    // round shield on the near arm
    piece(g, under, 'all', (s) => {
      const rows = ['.mmmm.', 'maaaam', 'maawam', 'maaaam', 'maaaam', '.mmmm.'];
      s.blit(rows, tx - 1, ty + 1);
    });
    // broad pauldrons, back and front
    piece(g, under, 'all', (s) => {
      s.blit(['mmmm', 'dddd'], tx - 2, ty);
      s.blit(['mwmm', 'dddd'], tx + 4, ty);
    });
  },
  weapon: (g, under, c) => {
    if (c.role === 'fwd' && c.anim === 'attack') {
      // crescent of air behind the swing
      for (let a = -55; a <= 55; a += 5) {
        const r = (a * Math.PI) / 180;
        g.set(Math.round(14 + 8 * Math.cos(r)), Math.round(c.hy + 8 * Math.sin(r)), 'w');
        g.set(Math.round(14 + 7 * Math.cos(r)), Math.round(c.hy + 7 * Math.sin(r)), 'm');
      }
    }
    if (c.role === 'fwd' && c.anim === 'ability') {
      // spin lines above and below the blade
      for (const dy of [-3, 4]) ROW(g, c.hx + 4, c.hx + 8, c.hy + dy, 'w');
    }
    piece(g, under, 'all', (s) => warriorSword(s, c));
  },
  lap: (g) => {
    g.rect(13, 13, 1, 4, 'k');
    g.rect(14, 14, 9, 1, 'w');
    g.rect(14, 15, 8, 1, 'm');
  },
};

// ---- Mage ----

/** Pale-blue orb in a diamond with a white heart; `glow` fills it out and adds gold sparks. */
function orb(s: Grid, cx: number, cy: number, glow: number): void {
  s.plot([
    [cx, cy - 1, 'm'],
    [cx - 1, cy, 'm'],
    [cx + 1, cy, 'm'],
    [cx, cy + 1, 'm'],
    [cx, cy, 'w'],
  ]);
  if (glow > 0) {
    s.plot([
      [cx - 1, cy - 1, 'm'],
      [cx + 1, cy - 1, 'm'],
      [cx - 1, cy + 1, 'm'],
      [cx + 1, cy + 1, 'm'],
    ]);
  }
}

function mageGlow(anim: string, frame: number): number {
  if (anim === 'ability') return frame < 2 ? 2 : 1;
  if (anim === 'attack') return frame === 1 ? 2 : 0;
  if (anim === 'victory') return 1;
  return 0;
}

const MAGE_CONE: readonly (readonly [number, number])[][] = [
  [[1, 8]],
  [
    [2, 6],
    [1, 8],
  ],
  [
    [2, 3],
    [2, 6],
    [1, 8],
  ],
  [
    [1, 2],
    [2, 5],
    [2, 6],
    [1, 8],
  ],
  [
    [0, 1],
    [1, 3],
    [2, 5],
    [2, 6],
    [1, 8],
  ],
];

const MAGE: ClassSpec = {
  id: 'mage',
  shift: { dx: 0, dy: 1 },
  head: (g, x, y) => {
    // y is the (already lowered) head top; the cone rises above it, clipped at the sprite top
    const n = Math.min(5, y + 1);
    const cone = MAGE_CONE[n - 1] ?? [];
    cone.forEach(([lo, hi], i) => {
      const ry = y - (n - 1) + i;
      ROW(g, x + lo, x + hi, ry, 'c');
      if (i < n - 1 && hi > lo) g.set(x + hi, ry, 'd');
    });
    if (n >= 4) g.set(x + 4, y - 1, 'a');
    if (n === 5) g.set(x, y - 4, 'd');
    ROW(g, x, x + 9, y + 1, 'a'); // gold band
    ROW(g, x - 1, x + 10, y + 2, 'd'); // brim
  },
  gear: (g, under, c) => {
    const { tx, ty } = c;
    const { rows, x: lx, y: ly } = c.pose.legs;
    // robe skirt over the legs, boots stay visible
    piece(g, under, 'outside', (s) => {
      if (rows.length >= 4) {
        ROW(s, tx - 1, tx + 6, ly - 1, 'c');
        ROW(s, tx - 1, tx + 6, ly, 'c');
        ROW(s, tx - 2, tx + 7, ly + 1, 'c');
        ROW(s, tx - 2, tx + 7, ly + 2, 'a');
        s.rect(tx + 2, ly, 1, 2, 'd');
        s.rect(tx + 6, ly - 1, 1, 3, 'd');
      } else {
        ROW(s, tx - 1, tx + 6, ly - 1, 'c');
        ROW(s, tx - 2, lx + 5, ly, 'c');
        ROW(s, tx - 2, lx + 4, ly + 1, 'a');
        s.rect(tx + 2, ly, 1, 1, 'd');
      }
    });
    // gold belt
    piece(g, under, 'outside', (s) => ROW(s, tx, tx + 5, ty + 3, 'a'));
  },
  weapon: (g, under, c) => {
    const { hx, hy, role } = c;
    const glow = mageGlow(c.anim, c.frame);
    let orbAt: [number, number] | null = null;
    piece(g, under, 'all', (s) => {
      if (role === 'up') {
        const sx = hx + 2;
        const y0 = Math.max(1, hy - 11);
        s.rect(sx, y0 + 3, 1, hy + 5 - (y0 + 3), 'k');
        s.plot([
          [sx - 1, y0 + 3, 'a'],
          [sx + 1, y0 + 3, 'a'],
        ]);
        orb(s, sx, y0 + 1, glow);
        orbAt = [sx, y0 + 1];
      } else if (role === 'fwd') {
        ROW(s, hx + 2, hx + 4, hy, 'k');
        s.rect(hx + 5, hy - 1, 1, 3, 'a');
        orb(s, hx + 7, hy, glow);
        orbAt = [hx + 7, hy];
      } else if (role === 'low' || role === 'angle') {
        s.line(hx + 1, hy + 4, hx + 7, hy - 1, 'k');
        orb(s, hx + 8, hy - 2, glow);
        orbAt = [hx + 8, hy - 2];
      }
    });
    const at = orbAt as [number, number] | null;
    if (at && glow >= 2) {
      const [cx, cy] = at;
      g.plot([
        [cx - 2, cy - 2, 'a'],
        [cx + 2, cy - 2, 'a'],
        [cx + 2, cy + 2, 'a'],
        [cx, cy - 3, 'a'],
        [cx + 3, cy, 'a'],
      ]);
    }
  },
  lap: (g) => {
    ROW(g, 13, 19, 14, 'k');
    ROW(g, 13, 19, 15, 'k');
    g.rect(20, 13, 1, 4, 'a');
    orb(g, 22, 14, 0);
  },
};

// ---- Archer ----

const BOW_DX = [0, 1, 1, 2, 2, 2, 2, 1, 1, 0] as const;

function archerPull(anim: string, frame: number): number {
  if (anim === 'attack') return [1, 3, 0][frame] ?? 0;
  if (anim === 'ability') return [2, 0, 0][frame] ?? 0;
  return 0;
}

const ARCHER: ClassSpec = {
  id: 'archer',
  shift: { dx: 0, dy: 0 },
  head: (g, x, y) => {
    // hood: crown, front rim shade, back drape, and a peak that bends back
    ROW(g, x + 1, x + 8, y, 'c');
    ROW(g, x, x + 9, y + 1, 'c');
    ROW(g, x + 4, x + 9, y + 2, 'd');
    g.rect(x, y + 2, 4, 4, 'c');
    ROW(g, x, x + 3, y + 5, 'd');
    ROW(g, x, x + 4, y - 1, 'c');
    g.plot([
      [x, y - 2, 'c'],
      [x - 1, y - 2, 'd'],
    ]);
    g.set(x + 8, y, 'd');
  },
  gear: (g, under, c) => {
    const { tx, ty } = c;
    // quiver behind the shoulder with fletching, and a chest strap
    piece(g, under, 'all', (s) => {
      s.plot([
        [tx - 3, ty - 2, 'w'],
        [tx - 1, ty - 2, 'w'],
      ]);
      s.blit(['kkk', 'aaa', 'aad', 'aaa', 'aad', '.dd'], tx - 3, ty - 1);
    });
    g.plot([
      [tx + 1, ty + 1, 'k'],
      [tx + 2, ty + 2, 'k'],
      [tx + 3, ty + 3, 'k'],
    ]);
  },
  weapon: (g, under, c) => {
    if (c.role === 'lap' || c.role === null) return;
    const { hx, hy } = c;
    const bx = hx;
    const pull = archerPull(c.anim, c.frame);
    piece(g, under, 'all', (s) => {
      BOW_DX.forEach((dx, i) => s.set(bx + dx, hy - 4 + i, 'a'));
      s.plot([
        [bx, hy - 4, 'k'],
        [bx, hy + 5, 'k'],
        [bx + 2, hy, 'k'],
        [bx + 2, hy + 1, 'k'],
      ]);
    });
    // string (drawn after the outline so it stays one pixel wide); skipped behind the hand
    const string = new Grid(g.w, g.h);
    if (pull === 0) {
      string.line(bx, hy - 3, bx, hy + 4, 'w');
    } else {
      string.line(bx, hy - 3, bx - pull, hy - 1, 'w');
      string.line(bx - pull, hy - 1, bx, hy + 4, 'w');
    }
    string.rect(hx, hy, 2, 2, '.');
    g.blit(string.rows(), 0, 0);
    if (pull > 0) {
      // nocked arrow: shaft, steel tip beyond the bow, white fletching at the string
      ROW(g, bx - pull, bx + 3, hy - 1, 'a');
      g.plot([
        [bx + 4, hy - 1, 'm'],
        [bx - pull, hy - 1, 'w'],
        [bx - pull + 1, hy - 1, 'w'],
      ]);
    }
  },
  lap: (g) => {
    ROW(g, 13, 14, 14, 'a');
    ROW(g, 15, 16, 15, 'a');
    ROW(g, 17, 18, 16, 'a');
    ROW(g, 19, 20, 15, 'a');
    ROW(g, 21, 22, 14, 'a');
    g.outline('o');
    ROW(g, 15, 20, 14, 'w');
  },
};

// ---- Rogue ----

const ROGUE: ClassSpec = {
  id: 'rogue',
  shift: { dx: 1, dy: 1 },
  head: (g, x, y) => {
    // low rounded cowl, mask over the lower face, one eye slit, purple scarf tail
    ROW(g, x + 1, x + 8, y, 'c');
    ROW(g, x, x + 9, y + 1, 'c');
    ROW(g, x, x + 4, y + 2, 'c');
    ROW(g, x + 5, x + 9, y + 2, 'd');
    g.rect(x, y + 3, 2, 3, 'c');
    g.rect(x + 3, y + 4, 7, 2, 'd');
    ROW(g, x + 3, x + 8, y + 6, 'd');
    g.plot([
      [x + 2, y - 1, 'c'],
      [x + 3, y - 1, 'c'],
      [x - 1, y + 4, 'a'],
      [x - 2, y + 5, 'a'],
      [x - 3, y + 5, 'a'],
    ]);
  },
  gear: (g, under, c) => {
    const { tx, ty } = c;
    // cape trailing behind the lean, purple belt with a steel buckle
    piece(g, under, 'outside', (s) => {
      s.blit(['c', 'cc', 'ccd', 'dccd', '.ddd'], tx - 3, ty);
      s.blit(['d', 'd'], tx - 1, ty + 4);
    });
    piece(g, under, 'outside', (s) => {
      ROW(s, tx, tx + 5, ty + 3, 'a');
      s.set(tx + 3, ty + 3, 'm');
    });
  },
  weapon: (g, under, c) => {
    const { hx, hy, role } = c;
    if (role === null || role === 'lap') return;
    const gone = c.anim === 'ability' && c.frame === 2;
    // back dagger on the lower back, reverse grip
    if (!gone) {
      const { tx, ty } = c;
      piece(g, under, 'all', (s) => {
        s.line(tx - 1, ty + 4, tx - 4, ty + 2, 'm');
        s.set(tx - 4, ty + 2, 'w');
        s.rect(tx, ty + 4, 2, 1, 'a');
      });
    }
    // twin dagger throw: a second blade flies beside the first
    if (c.anim === 'ability' && c.frame === 1) {
      piece(g, under, 'all', (s) => {
        s.rect(hx + 3, hy - 4, 1, 2, 'a');
        ROW(s, hx + 4, hx + 8, hy - 4, 'w');
        ROW(s, hx + 4, hx + 8, hy - 3, 'm');
      });
    }
    if (gone) return;
    piece(g, under, 'all', (s) => {
      if (role === 'up') {
        const len = Math.min(5, hy - 2);
        ROW(s, hx, hx + 2, hy - 1, 'a');
        s.rect(hx + 1, hy - 1 - len, 1, len, 'm');
        s.set(hx + 1, hy - 1 - len, 'w');
      } else if (role === 'fwd') {
        s.rect(hx + 2, hy - 1, 1, 3, 'a');
        ROW(s, hx + 3, hx + 8, hy, 'w');
        ROW(s, hx + 3, hx + 7, hy + 1, 'm');
      } else {
        s.rect(hx + 2, hy, 1, 2, 'a');
        s.line(hx + 3, hy + 1, hx + 7, hy + 3, 'm');
        s.set(hx + 7, hy + 3, 'w');
      }
    });
  },
  lap: (g) => {
    g.rect(13, 13, 1, 4, 'a');
    ROW(g, 14, 19, 14, 'w');
    ROW(g, 14, 18, 15, 'm');
  },
};

// ---- Rendering ----

export function renderHead(spec: ClassSpec, p: HeroPose): string[] {
  const x = p.head.x + spec.shift.dx;
  const y = p.head.y + spec.shift.dy;
  const g = new Grid(W, H);
  g.blit(HERO_HEAD, x, y);
  spec.head(g, x, y);
  g.outline('o');
  const ex = x + 6;
  const ey = y + 3;
  if (p.head.closed) {
    g.set(ex, ey, 'o');
    g.set(ex + 1, ey, 'o');
  } else {
    g.set(ex, ey, 'e');
  }
  if (p.deco) {
    const shifted: Px[] = p.deco.map(([dx, dy, ch]) => [
      dx + spec.shift.dx,
      dy + spec.shift.dy,
      ch,
    ]);
    g.plot(shifted);
  }
  return g.rows();
}

export function layerSet(spec: ClassSpec): HeroLayerSet {
  const head: Record<string, string[][]> = {};
  const gear: Record<string, string[][]> = {};
  const weapon: Record<string, string[][]> = {};
  for (const [anim, poses] of Object.entries(HERO_POSES)) {
    const headFrames: string[][] = [];
    const gearFrames: string[][] = [];
    const weaponFrames: string[][] = [];
    head[anim] = headFrames;
    gear[anim] = gearFrames;
    weapon[anim] = weaponFrames;
    poses.forEach((p, frame) => {
      const bodyRows = BASE_HERO.body.animations[anim]?.[frame] ?? [];
      const headRows = renderHead(spec, p);
      const under = new Grid(W, H);
      under.blit(bodyRows, 0, 0);
      under.blit(headRows, 0, 0);
      const hand = handOf(p);
      const ctx: Ctx = {
        anim,
        frame,
        role: roleOf(anim, frame),
        hx: hand.x,
        hy: hand.y,
        tx: p.torso.x,
        ty: p.torso.y,
        pose: p,
      };
      const gearG = new Grid(W, H);
      spec.gear(gearG, under, ctx);
      under.blit(gearG.rows(), 0, 0);
      const weaponG = new Grid(WEAPON_W, H);
      if (ctx.role === 'lap') {
        spec.lap(weaponG);
        if (spec.id !== 'archer') weaponG.outline('o');
        ragOverlay(weaponG, frame === 0 ? 16 : 19);
      } else if (ctx.role !== null) {
        spec.weapon(weaponG, under, ctx);
      }
      headFrames.push(headRows);
      gearFrames.push(gearG.rows());
      weaponFrames.push(weaponG.rows());
    });
  }
  const mk = (
    suffix: string,
    w: number,
    animations: Record<string, string[][]>,
  ): SpriteTemplate => ({
    id: `${spec.id}/${suffix}`,
    w,
    h: H,
    anchor: { x: ANCHOR.x, y: ANCHOR.y },
    animations,
  });
  return {
    body: BASE_HERO.body,
    head: mk('head', W, head),
    gear: mk('gear', W, gear),
    weapon: mk('weapon', WEAPON_W, weapon),
  };
}

/** H1 class id -> layers. The merged table with all eight classes is `CLASS_LAYERS` in spriteTemplates.ts. */
export const CLASS_LAYERS_H1: Readonly<Record<string, HeroLayerSet>> = {
  warrior: layerSet(WARRIOR),
  mage: layerSet(MAGE),
  archer: layerSet(ARCHER),
  rogue: layerSet(ROGUE),
};
