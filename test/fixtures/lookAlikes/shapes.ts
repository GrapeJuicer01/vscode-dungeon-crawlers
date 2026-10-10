// Fixture for test/repo/lookAlikesReportCli.test.ts: both export shapes the report accepts, built
// from wired art so the policy verdict is unchanged when they replace their own id.
import { ENEMY_SPRITES } from '../../../src/game/sprites/enemyTemplates';
import type { SpriteTemplate } from '../../../src/game/sprites/spriteTypes';

export const FIRST_ID: string = Object.keys(ENEMY_SPRITES)[0] ?? '';
const FIRST: SpriteTemplate = ENEMY_SPRITES[FIRST_ID] as SpriteTemplate;

/** Record shape (like ENEMIES_STAGE5). */
export const RECORD_SHAPE: Readonly<Record<string, SpriteTemplate>> = { [FIRST_ID]: FIRST };
/** Single-template shape (like a boss export). */
export const SINGLE_SHAPE: SpriteTemplate = FIRST;
