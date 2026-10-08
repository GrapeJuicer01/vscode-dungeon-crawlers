// Class layers for H2 (batch A2-1 Cleric and Paladin, A2-2 Necromancer and Bard).
// Owned by the pixel-artist. New file so the committed H1 classTemplates.ts stays clean: the small
// layer-building helpers below mirror the ones in classTemplates.ts on purpose (they are private
// there). When H1 lands, a dedupe pass can export them and delete the copies. Every class reuses
// the shared base body (`hero/body`, recolored by its class palette) and supplies `head`, `gear`,
// and `weapon` rendered from the same poses as the base hero (HERO_POSES), so all eleven
// animations and all 26 frames line up with the body.
//
// Design notes (silhouette at 16x20, faces right, characters only, no hex):
// - Cleric (white + gold): wide flat-topped mitre with a gold cross and two gold ribbons hanging
//   behind, white mantle with a gold stole, a flanged mace with a pale-gold head.
// - Paladin (gold + white): gold winged helm (a white wing sweeps up and back), white cape behind,
//   a tall gold kite shield with a white cross (a small buckler while resting), a glowing sword.
// - Necromancer (dark purple + sickly green): deep hood drooping forward with a shadowed brow,
//   hunched back hump and a ragged hem trimmed in green, a skull staff with a green eye glint.
// - Bard (teal + magenta): wide-brim teal hat with a long magenta feather, magenta sash and cape,
//   a golden lute (strummed across the body in attack and ability).
// Colors: the eleven hero characters `o s h e c d b k m w a`, plus `Y` (glow) for Cleric and
// Paladin, so a composited look is at most 12 colors. No hurt, downed, or dying frames exist; sleep
// is a closed-eye line and a small "z" (Core invariant 1). Format: docs/design/sprite-spec.md.

import { Grid, type Px } from './spriteBuilder';
import { BASE_HERO, HERO_HEAD, HERO_POSES, type HeroPose } from './heroTemplates';
import type { HeroLayerSet, SpriteTemplate } from './spriteTypes';

const W = 16;
const H = 20;
const WEAPON_W = 24;
const ANCHOR = { x: 8, y: 19 } as const;

type Role = 'up' | 'fwd' | 'low' | 'angle' | 'lap';

interface Ctx {
  readonly anim: string;
  readonly frame: number;
  readonly role: Role | null;
  readonly hx: number;
  readonly hy: number;
  readonly tx: number;
  readonly ty: number;
  readonly pose: HeroPose;
}

interface ClassSpec {
  readonly id: string;
  /** Head shift in pixels (lowered for tall hats, leaned for a hunch). */
  readonly shift: { readonly dx: number; readonly dy: number };
  /** Draws head gear over the base head (HERO_HEAD already blitted at x, y). Pre-outline. */
  readonly head: (g: Grid, x: number, y: number) => void;
  readonly gear: (g: Grid, under: Grid, c: Ctx) => void;
  readonly weapon: (g: Grid, under: Grid, c: Ctx) => void;
  /** Polish pose: the item across the lap (pre-outline); the rag overlay is added by the caller. */
  readonly lap: (g: Grid) => void;
}

// ---- Helpers (mirrors of the private ones in classTemplates.ts) ----

function roleOf(anim: string, frame: number): Role | null {
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

function handOf(p: HeroPose): { x: number; y: number } {
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
function piece(target: Grid, under: Grid, ring: 'all' | 'outside', draw: (s: Grid) => void): void {
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

const ROW = (g: Grid, x0: number, x1: number, y: number, ch: string): void =>
  g.rect(x0, y, x1 - x0 + 1, 1, ch);

function ragOverlay(g: Grid, rx: number): void {
  const s = new Grid(g.w, g.h);
  s.line(10, 13, rx + 1, 11, 'd');
  s.rect(rx, 11, 2, 2, 's');
  s.rect(rx, 13, 3, 4, 'w');
  s.outline('o');
  g.blit(s.rows(), 0, 0);
}

/** Robe skirt over the legs (boots stay visible), shared by the robed classes. */
function skirt(s: Grid, c: Ctx, body: string, hem: string, ragged: boolean): void {
  const { tx } = c;
  const { rows, x: lx, y: ly } = c.pose.legs;
  if (rows.length >= 4) {
    ROW(s, tx - 1, tx + 6, ly - 1, body);
    ROW(s, tx - 1, tx + 6, ly, body);
    ROW(s, tx - 2, tx + 7, ly + 1, body);
    ROW(s, tx - 2, tx + 7, ly + 2, hem);
    if (ragged) {
      s.plot([
        [tx - 1, ly + 2, '.'],
        [tx + 2, ly + 2, '.'],
        [tx + 5, ly + 2, '.'],
      ]);
    }
    s.rect(tx + 2, ly, 1, 2, 'd');
    s.rect(tx + 6, ly - 1, 1, 3, 'd');
  } else {
    ROW(s, tx - 1, tx + 6, ly - 1, body);
    ROW(s, tx - 2, lx + 5, ly, body);
    ROW(s, tx - 2, lx + 4, ly + 1, hem);
    s.rect(tx + 2, ly, 1, 1, 'd');
  }
}

/** Sparkle pixels, drawn after the outline so they stay single floating pixels. */
function sparkle(g: Grid, pts: readonly (readonly [number, number])[], ch: string): void {
  for (const [x, y] of pts) g.set(x, y, ch);
}

/** Glow level 0..2 for the item of a class on a given frame. */
function glowOf(anim: string, frame: number): number {
  if (anim === 'ability') return frame < 2 ? 2 : 1;
  if (anim === 'attack') return frame === 1 ? 2 : 0;
  if (anim === 'victory') return 1;
  return 0;
}

// ---- Cleric ----

/** Flanged mace head (5 wide cross): 3x3 core in `m`, a white glint, flange pixels each side. */
function maceHead(s: Grid, x: number, y: number): void {
  s.rect(x, y, 3, 3, 'm');
  s.set(x, y, 'w');
  s.plot([
    [x - 1, y + 1, 'm'],
    [x + 3, y + 1, 'm'],
    [x + 1, y - 1, 'm'],
    [x + 1, y + 3, 'm'],
  ]);
}

const CLERIC: ClassSpec = {
  id: 'cleric',
  shift: { dx: 0, dy: 1 },
  head: (g, x, y) => {
    // mitre: two nubs, a wide white body with a gold cross, a gold band, gold ribbons behind
    g.plot([
      [x + 2, y - 3, 'c'],
      [x + 3, y - 3, 'c'],
      [x + 6, y - 3, 'c'],
      [x + 7, y - 3, 'c'],
    ]);
    ROW(g, x + 1, x + 8, y - 2, 'c');
    ROW(g, x + 1, x + 8, y - 1, 'c');
    ROW(g, x + 1, x + 8, y, 'c');
    g.rect(x + 1, y - 2, 1, 3, 'd');
    g.plot([
      [x + 5, y - 2, 'a'],
      [x + 4, y - 1, 'a'],
      [x + 5, y - 1, 'a'],
      [x + 6, y - 1, 'a'],
      [x + 5, y, 'a'],
    ]);
    ROW(g, x, x + 9, y + 1, 'a');
    g.plot([
      [x - 1, y + 2, 'a'],
      [x - 1, y + 3, 'a'],
      [x - 1, y + 4, 'a'],
      [x - 2, y + 4, 'd'],
      [x, y + 5, 'a'],
    ]);
  },
  gear: (g, under, c) => {
    const { tx, ty } = c;
    piece(g, under, 'outside', (s) => skirt(s, c, 'c', 'a', false));
    // mantle over the shoulders and a gold stole down the front
    piece(g, under, 'outside', (s) => {
      ROW(s, tx - 1, tx + 6, ty, 'c');
      ROW(s, tx - 1, tx + 6, ty + 1, 'd');
    });
    g.rect(tx + 2, ty, 2, 5, 'a');
    g.set(tx + 3, ty + 1, 'w');
  },
  weapon: (g, under, c) => {
    const { hx, hy, role } = c;
    const glow = glowOf(c.anim, c.frame);
    let at: [number, number] = [hx + 1, hy - 8];
    piece(g, under, 'all', (s) => {
      if (role === 'up') {
        const top = Math.max(1, hy - 9);
        s.rect(hx + 1, top + 3, 1, hy - 1 - (top + 3) + 1, 'k');
        maceHead(s, hx, top);
        at = [hx + 1, top + 1];
      } else if (role === 'fwd') {
        ROW(s, hx + 1, hx + 4, hy, 'k');
        maceHead(s, hx + 5, hy - 1);
        at = [hx + 6, hy];
      } else if (role === 'low') {
        s.line(hx + 2, hy + 1, hx + 5, hy + 3, 'k');
        maceHead(s, hx + 6, hy + 3);
        at = [hx + 7, hy + 4];
      } else {
        s.line(hx + 1, hy + 3, hx + 5, hy, 'k');
        maceHead(s, hx + 5, hy - 3);
        at = [hx + 6, hy - 2];
      }
    });
    if (glow > 0) {
      const [cx, cy] = at;
      const pts: [number, number][] = [
        [cx - 3, cy - 3],
        [cx + 3, cy + 3],
      ];
      if (glow > 1) pts.push([cx + 3, cy - 3], [cx - 3, cy + 3], [cx, cy - 4]);
      sparkle(g, pts, 'Y');
    }
  },
  lap: (g) => {
    ROW(g, 13, 19, 14, 'k');
    ROW(g, 13, 19, 15, 'k');
    maceHead(g, 20, 14);
  },
};

// ---- Paladin ----

const PALADIN: ClassSpec = {
  id: 'paladin',
  shift: { dx: 0, dy: 1 },
  head: (g, x, y) => {
    // gold helm: crest, dome, brim band, cheek guard; a white wing sweeps up and back
    ROW(g, x + 2, x + 7, y - 1, 'c');
    ROW(g, x + 1, x + 8, y, 'c');
    ROW(g, x, x + 9, y + 1, 'c');
    ROW(g, x, x + 9, y + 2, 'd');
    g.rect(x, y + 3, 3, 3, 'c');
    ROW(g, x, x + 2, y + 5, 'd');
    g.set(x + 9, y + 3, 'd'); // nasal bar
    g.set(x + 3, y, 'w');
    g.blit(['..ww.', '.wwwa', 'wwwaa', 'w.wa.', '..w..'], x - 3, y - 4);
  },
  gear: (g, under, c) => {
    const { tx, ty } = c;
    const active = c.role !== null && c.role !== 'lap';
    // white cape behind the shoulders, gold pauldron, white-field shield with a gold cross
    piece(g, under, 'outside', (s) => {
      s.blit(['aa', 'aaa', 'aaad', '.aad', '..dd'], tx - 3, ty);
    });
    piece(g, under, 'all', (s) => s.blit(['cwcc', 'dddd'], tx + 4, ty - 1));
    // kite shield on the near arm (a short buckler when resting)
    piece(g, under, 'all', (s) => {
      const rows = active
        ? ['dddddd', 'daccad', 'cccccc', 'daccad', 'daccad', '.dccd.', '..dd..']
        : ['dddddd', 'daccad', 'cccccc', 'daccad', '.dccd.'];
      s.blit(rows, tx - 1, active ? ty : ty + 1);
    });
  },
  weapon: (g, under, c) => {
    const { hx, hy, role } = c;
    const glow = Math.max(1, glowOf(c.anim, c.frame)); // the blade always glows a little
    const halo: [number, number][] = [];
    piece(g, under, 'all', (s) => {
      if (role === 'up') {
        const len = Math.min(7, hy - 2);
        s.rect(hx, hy - 1, 4, 1, 'c');
        s.rect(hx + 1, hy - 1 - len, 1, len, 'w');
        s.rect(hx + 2, hy - 1 - len, 1, len, 'm');
        s.set(hx + 2, hy - 1 - len, 'w');
        for (let i = 0; i < len; i += 2) halo.push([hx - 1, hy - 3 - i], [hx + 4, hy - 4 - i]);
      } else if (role === 'fwd') {
        s.rect(hx + 2, hy - 1, 1, 4, 'c');
        s.rect(hx + 3, hy, 7, 1, 'w');
        s.rect(hx + 3, hy + 1, 6, 1, 'm');
        for (let i = 0; i < 7; i += 2) halo.push([hx + 4 + i, hy - 2], [hx + 4 + i, hy + 3]);
      } else if (role === 'low') {
        s.rect(hx + 2, hy + 1, 2, 2, 'c');
        s.line(hx + 4, hy + 2, hx + 10, hy + 5, 'm');
        s.line(hx + 4, hy + 1, hx + 10, hy + 4, 'w');
        halo.push([hx + 8, hy], [hx + 6, hy + 5], [hx + 11, hy + 7]);
      } else if (role === 'angle') {
        s.rect(hx + 2, hy - 1, 1, 4, 'c');
        s.line(hx + 3, hy, hx + 9, hy - 3, 'w');
        s.line(hx + 3, hy + 1, hx + 9, hy - 2, 'm');
        halo.push([hx + 5, hy - 4], [hx + 8, hy + 1], [hx + 11, hy - 4]);
      }
    });
    if (glow > 0) sparkle(g, glow > 1 ? halo : halo.filter((_p, i) => i % 2 === 0), 'Y');
  },
  lap: (g) => {
    g.rect(13, 13, 1, 4, 'c');
    g.rect(14, 14, 9, 1, 'w');
    g.rect(14, 15, 8, 1, 'm');
  },
};

// ---- Necromancer ----

/** Skull on a staff, 5 wide and 4 tall; the eye socket holds a green glint. */
function skull(s: Grid, x: number, y: number): void {
  s.blit(['.mmm.', 'mmmam', 'mmmmm', '.mom.'], x, y);
  s.set(x + 1, y + 1, 'w');
}

const NECRO: ClassSpec = {
  id: 'necromancer',
  shift: { dx: 1, dy: 1 },
  head: (g, x, y) => {
    // deep hood drooping forward over a shadowed brow, green clasp at the throat
    ROW(g, x + 3, x + 6, y - 2, 'c');
    ROW(g, x + 2, x + 8, y - 1, 'c');
    ROW(g, x + 1, x + 9, y, 'c');
    g.set(x + 9, y - 1, 'c');
    ROW(g, x, x + 9, y + 1, 'c');
    g.set(x + 9, y + 1, 'd');
    ROW(g, x, x + 4, y + 2, 'c');
    ROW(g, x + 5, x + 9, y + 2, 'd');
    g.rect(x, y + 3, 3, 3, 'c');
    ROW(g, x, x + 3, y + 5, 'd');
    g.plot([
      [x + 4, y, 'd'],
      [x + 5, y - 1, 'd'],
      [x + 6, y + 6, 'a'],
    ]);
  },
  gear: (g, under, c) => {
    const { tx, ty } = c;
    // hunched back hump, ragged robe hem trimmed in green, a bone shoulder spike, skull buckle
    piece(g, under, 'outside', (s) => {
      s.blit(['.cc', 'ccc', 'ccd', 'cdd', 'dd'], tx - 3, ty - 1);
    });
    piece(g, under, 'outside', (s) => skirt(s, c, 'c', 'a', true));
    piece(g, under, 'all', (s) => {
      s.plot([
        [tx - 2, ty - 1, 'm'],
        [tx - 3, ty - 2, 'm'],
      ]);
    });
    ROW(g, tx, tx + 5, ty + 3, 'd');
    g.plot([
      [tx + 3, ty + 3, 'm'],
      [tx + 3, ty + 2, 'a'],
    ]);
  },
  weapon: (g, under, c) => {
    const { hx, hy, role } = c;
    const glow = glowOf(c.anim, c.frame);
    let at: [number, number] = [hx + 2, hy - 8];
    piece(g, under, 'all', (s) => {
      if (role === 'up') {
        const y0 = Math.max(1, hy - 11);
        s.rect(hx + 2, y0 + 4, 1, hy + 5 - (y0 + 4), 'k');
        s.plot([
          [hx + 1, y0 + 4, 'k'],
          [hx + 3, y0 + 4, 'k'],
        ]);
        skull(s, hx, y0);
        at = [hx + 2, y0];
      } else if (role === 'fwd') {
        ROW(s, hx + 2, hx + 6, hy, 'k');
        skull(s, hx + 7, hy - 2);
        at = [hx + 9, hy - 2];
      } else if (role === 'low') {
        s.line(hx + 1, hy, hx + 6, hy + 3, 'k');
        skull(s, hx + 6, hy + 2);
        at = [hx + 8, hy + 2];
      } else {
        s.line(hx + 1, hy + 4, hx + 6, hy - 1, 'k');
        skull(s, hx + 5, hy - 5);
        at = [hx + 7, hy - 5];
      }
    });
    if (glow > 0) {
      const [cx, cy] = at;
      const pts: [number, number][] = [
        [cx, cy - 2],
        [cx - 3, cy + 1],
      ];
      if (glow > 1) pts.push([cx + 1, cy - 3], [cx + 4, cy], [cx - 4, cy - 1], [cx + 3, cy - 2]);
      sparkle(g, pts, 'a');
    }
  },
  lap: (g) => {
    ROW(g, 13, 18, 14, 'k');
    ROW(g, 13, 18, 15, 'k');
    skull(g, 19, 13);
  },
};

// ---- Bard ----

/** A lute: oval golden body with a dark rim and sound hole, `neck` runs to a magenta headstock. */
function luteBody(s: Grid, x: number, y: number): void {
  s.blit(['.kkk.', 'kmmmk', 'kmomk', 'kmmmk', '.kkk.'], x, y);
}

const BARD: ClassSpec = {
  id: 'bard',
  shift: { dx: 0, dy: 1 },
  head: (g, x, y) => {
    // wide-brim hat: dome, magenta band, brim, and a long feather curling up and back
    ROW(g, x + 3, x + 6, y - 2, 'c');
    ROW(g, x + 2, x + 7, y - 1, 'c');
    ROW(g, x + 2, x + 7, y, 'c');
    g.set(x + 2, y - 1, 'd');
    g.set(x + 2, y, 'd');
    ROW(g, x + 1, x + 8, y + 1, 'a');
    ROW(g, x - 1, x + 10, y + 2, 'd');
    g.plot([
      [x + 2, y - 2, 'a'],
      [x + 1, y - 3, 'a'],
      [x + 2, y - 3, 'a'],
      [x, y - 3, 'a'],
      [x - 1, y - 2, 'a'],
      [x - 2, y - 2, 'a'],
      [x - 2, y - 1, 'w'],
      [x - 3, y, 'a'],
    ]);
  },
  gear: (g, under, c) => {
    const { tx, ty } = c;
    // short cape behind, magenta sash across the chest, golden buckle, magenta boot cuffs
    piece(g, under, 'outside', (s) => s.blit(['a', 'aa', 'aad', '.dd'], tx - 2, ty));
    g.plot([
      [tx, ty + 1, 'a'],
      [tx + 1, ty + 1, 'a'],
      [tx + 2, ty + 2, 'a'],
      [tx + 3, ty + 2, 'a'],
      [tx + 4, ty + 3, 'a'],
      [tx + 5, ty + 3, 'a'],
    ]);
    g.set(tx + 3, ty + 3, 'm');
  },
  weapon: (g, under, c) => {
    const { hx, hy, role } = c;
    piece(g, under, 'all', (s) => {
      if (role === 'up') {
        // held at the hip, neck rising up and forward
        luteBody(s, hx - 1, hy + 2);
        s.line(hx + 1, hy + 2, hx + 4, hy - 5, 'k');
        s.plot([
          [hx + 4, hy - 6, 'a'],
          [hx + 5, hy - 6, 'a'],
        ]);
      } else if (role === 'fwd') {
        // strummed across the body: body behind the hand, neck out to the right
        luteBody(s, hx - 3, hy - 2);
        ROW(s, hx + 2, hx + 9, hy, 'k');
        ROW(s, hx + 10, hx + 11, hy, 'a');
        ROW(s, hx + 3, hx + 8, hy - 1, 'w');
      } else if (role === 'low') {
        luteBody(s, hx - 3, hy - 1);
        s.line(hx + 2, hy + 1, hx + 8, hy + 4, 'k');
        ROW(s, hx + 9, hx + 10, hy + 5, 'a');
      } else {
        luteBody(s, hx - 3, hy);
        s.line(hx + 2, hy + 1, hx + 8, hy - 3, 'k');
        ROW(s, hx + 9, hx + 10, hy - 4, 'a');
      }
    });
  },
  lap: (g) => {
    luteBody(g, 13, 12);
    ROW(g, 18, 21, 14, 'k');
    ROW(g, 22, 23, 14, 'a');
  },
};

// ---- Rendering ----

function renderHead(spec: ClassSpec, p: HeroPose): string[] {
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

function layerSet(spec: ClassSpec): HeroLayerSet {
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
        weaponG.outline('o');
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

/** Class id -> layers for batch H2. Merge with `CLASS_LAYERS` when wiring. */
export const CLASS_LAYERS_H2: Readonly<Record<string, HeroLayerSet>> = {
  cleric: layerSet(CLERIC),
  paladin: layerSet(PALADIN),
  necromancer: layerSet(NECRO),
  bard: layerSet(BARD),
};
