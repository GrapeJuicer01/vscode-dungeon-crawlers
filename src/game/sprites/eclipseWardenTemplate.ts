// Stage 8 boss "Eclipse Warden" (batch E4, step A-E4-6). Owned by the pixel-artist.
// `enemies/eclipse-warden`, 48x48, LEFT-facing, foot anchor (24, 47). Animations: idle 2, walk 2,
// attack 3, telegraph 2, intro 2 (11 frames), the same set as the other bosses. A hovering dark
// disc with two cold cyan eyes, a thin gap, a bright lilac corona ring with eight pointed flares,
// and four tendril arms that end in small claws (two reach out and down on each side, the left pair
// longer because it faces left). The hover is a cosmetic draw offset in the engine; the sprite
// itself is drawn complete, its tendril tips reaching row 46. Colors (8): 1 outline, 2 and 3 and 4
// disc, 5 6 7 corona, 8 eyes.
// Phase 2 (BOSS_PHASE_PALETTES_E4 in palettesE4.ts) moves the corona to pale magenta-white by
// overriding `5 6 7 8` while the disc stays dark.
// `telegraph` thickens and brightens the corona over two slow frames (never a flash); `attack` slams
// the two lower tendrils forward and down; `intro` rises from below.

import { dots, draft, ellipse, enemyTemplate, finish, poly, stroke } from './enemyBuilder';
import type { Draft } from './enemyBuilder';
import { lift } from './enemyFrames';
import type { SpriteTemplate } from './spriteTypes';

const S = 48;

/** Silhouette numbers tuned so the idle frame clears every older boss (look-alike policy). */
export interface WardenGeom {
  readonly cx: number;
  readonly cy: number;
  /** Disc radius. */
  readonly disc: number;
  /** Corona ring inner and outer radius. */
  readonly ringIn: number;
  readonly ringOut: number;
  /** Flare length beyond the ring. */
  readonly flare: number;
}

export const WARDEN_GEOM: WardenGeom = {
  cx: 24,
  cy: 19,
  disc: 9,
  ringIn: 13,
  ringOut: 16,
  flare: 5,
};

interface WardenPose {
  /** Whole-body bob in rows (0 or 1). */
  readonly bob?: number;
  /** Shifts which ring pixels glint, so the corona shimmers without moving (0 to 4). */
  readonly glint?: number;
  /** Corona swell in rows added to the ring (the telegraph), and extra hot spots. */
  readonly swell?: 0 | 1 | 2;
  /** Lower tendrils: 0 hanging, 1 swaying out, 2 slammed forward and down. */
  readonly arms?: 0 | 1 | 2;
  /** Intro: rows the whole figure is sunk below the frame. */
  readonly sink?: number;
}

type Pt = readonly [number, number];

export function wardenFrame(p: WardenPose, g: WardenGeom = WARDEN_GEOM): string[] {
  const d: Draft = draft(S, S);
  const b = p.bob ?? 0;
  const sw = p.swell ?? 0;
  const cx = g.cx;
  const cy = g.cy + b;
  const arms = p.arms ?? 0;
  // tendrils first (behind the disc): upper pair reach out sideways, lower pair hang and curl
  const arm = (pts: readonly Pt[], claw: Pt): void => {
    stroke(d, pts, '3', 3);
    dots(d, [
      [claw[0], claw[1], '4'],
      [claw[0] + 1, claw[1], '4'],
    ]);
  };
  arm(
    [
      [cx - 8, cy + 3],
      [cx - 17, cy + 10],
      [cx - 21, cy + 17],
    ],
    [cx - 22, cy + 18],
  );
  arm(
    [
      [cx + 8, cy + 3],
      [cx + 16, cy + 10],
      [cx + 19, cy + 16],
    ],
    [cx + 19, cy + 17],
  );
  if (arms === 2) {
    arm(
      [
        [cx - 5, cy + 9],
        [cx - 14, cy + 15],
        [cx - 21, cy + 20],
      ],
      [cx - 22, cy + 21],
    );
    arm(
      [
        [cx + 4, cy + 9],
        [cx - 4, cy + 18],
        [cx - 12, cy + 24],
      ],
      [cx - 13, cy + 25],
    );
  } else {
    const sway = arms === 1 ? 2 : 0;
    arm(
      [
        [cx - 5, cy + 10],
        [cx - 9 - sway, cy + 18],
        [cx - 8 - sway, cy + 25],
      ],
      [cx - 9 - sway, cy + 26],
    );
    arm(
      [
        [cx + 5, cy + 10],
        [cx + 9 + sway, cy + 18],
        [cx + 8 + sway, cy + 25],
      ],
      [cx + 8 + sway, cy + 26],
    );
  }
  // corona ring (fill only the ring so a thin gap separates it from the disc)
  const rin = g.ringIn;
  const rout = g.ringOut + sw;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const r = Math.hypot(x - cx, y - cy);
      if (r >= rin && r <= rout) {
        const hot = (x * 7 + y * 3 + (p.glint ?? 0)) % 5 === 0;
        d.g.set(x, y, hot || (sw > 0 && r < rin + 1.5) ? '7' : r > rout - 1 ? '5' : '6');
      }
    }
  }
  // eight pointed flares around the ring
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 + Math.PI / 8;
    const r0 = rout - 1;
    const r1 = rout + g.flare + sw;
    const w = 1.3;
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    poly(
      d,
      [
        [cx + Math.cos(a) * r0 + nx * w * 1.8, cy + Math.sin(a) * r0 + ny * w * 1.8],
        [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1],
        [cx + Math.cos(a) * r0 - nx * w * 1.8, cy + Math.sin(a) * r0 - ny * w * 1.8],
      ],
      sw > 0 ? '7' : '6',
    );
  }
  // disc with a lit rim and a darker lower half
  ellipse(d, cx, cy, g.disc, g.disc, '3');
  for (let y = cy + 1; y <= cy + g.disc; y++) {
    for (let x = cx - g.disc; x <= cx + g.disc; x++) {
      if (d.g.get(x, y) === '3' && Math.hypot(x - cx, y - cy) > 3) d.g.set(x, y, '2');
    }
  }
  for (let x = cx - 6; x <= cx + 2; x++) d.g.set(x, cy - g.disc + 1, '4');
  d.g.set(cx - 7, cy - g.disc + 2, '4');
  // eyes: two cold cyan slits on the left half of the face
  dots(d, [
    [cx - 6, cy - 1, '8'],
    [cx - 5, cy - 1, '8'],
    [cx - 1, cy - 1, '8'],
    [cx, cy - 1, '8'],
    [cx - 6, cy, '8'],
    [cx - 1, cy, '8'],
  ]);
  d.g.rect(0, 47, S, 1, '.');
  const out = finish(d);
  return p.sink ? lift(out, -p.sink) : out;
}

export const ECLIPSE_WARDEN: SpriteTemplate = enemyTemplate(
  'eclipse-warden',
  S,
  S,
  { x: 24, y: 47 },
  {
    idle: [wardenFrame({}), wardenFrame({ arms: 1, glint: 2 })],
    walk: [wardenFrame({ arms: 1 }), wardenFrame({ arms: 1, bob: 1 })],
    attack: [wardenFrame({ arms: 1, bob: 1 }), wardenFrame({ arms: 2 }), wardenFrame({})],
    telegraph: [wardenFrame({ swell: 1 }), wardenFrame({ swell: 2, bob: 1 })],
    intro: [wardenFrame({ sink: 26 }), wardenFrame({ sink: 8 })],
  },
);
