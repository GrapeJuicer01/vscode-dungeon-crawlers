// Fixture for test/repo/legibilityReportCli.test.ts: a candidate stage palette and two floor tiles
// in the shape the artist passes to test/support/legibilityReport.mjs. Not wired into any stage.
import type { SpriteTemplate } from '../../../src/game/sprites/spriteTypes';

const tile = (id: string, rows: string[]): SpriteTemplate => ({
  id,
  w: 16,
  h: 16,
  anchor: { x: 0, y: 0 },
  animations: { idle: [rows] },
});
const ROWS = ['1'.repeat(16), '2'.repeat(16)].flatMap((r) => [r, r, r, r, r, r, r, r]);

/** A deliberately bright floor: fails the cloth-contrast rule. */
export const BRIGHT_PALETTE: Readonly<Record<string, string>> = {
  '1': '#c8a060',
  '2': '#b89050',
  g: '#ffffff',
};
/** A deliberately dark floor: passes the cloth-contrast rule. */
export const DARK_PALETTE: Readonly<Record<string, string>> = {
  '1': '#181820',
  '2': '#14141c',
  g: '#ffffff',
};
export const FLOOR_BACK: SpriteTemplate = tile('candidate/floorBack', ROWS);
export const FLOOR_FRONT: SpriteTemplate = tile('candidate/floorFront', ROWS);
