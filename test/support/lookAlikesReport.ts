// Entry for the artist feedback command (see lookAlikesReport.mjs). Prints the look-alike matrix for
// the wired enemy art plus any extra template maps named on the command line, without wiring them.
// Args: `<module path>:<ExportName>[:<stage>]` ...; the export is a Record<id, SpriteTemplate>.
import { ENEMIES } from '../../src/game/data/enemies';
import { ENEMY_SPRITES } from '../../src/game/sprites/enemyTemplates';
import type { SpriteTemplate } from '../../src/game/sprites/spriteTypes';
import { formatReport, sameSizePairs } from './lookAlikes';
import type { LookAlikeEntry } from './lookAlikes';

declare const __EXTRAS__: readonly { id: string; stage: number; template: SpriteTemplate }[];

const stageOf = new Map<string, number>(ENEMIES.map((r) => [r.id, r.stage]));
const entries: LookAlikeEntry[] = Object.entries(ENEMY_SPRITES).map(([id, template]) => ({
  id,
  stage: stageOf.get(id) ?? 0,
  template,
}));
// Extras replace wired entries of the same id (a reworked template), otherwise they are added.
for (const x of __EXTRAS__) {
  const at = entries.findIndex((e) => e.id === x.id);
  if (at >= 0) entries[at] = x;
  else entries.push(x);
}
const minions = new Set(
  entries.filter((e) => e.template.w === 16 && e.template.h === 16).map((e) => e.id),
);
const pairs = sameSizePairs(entries);
const changed = new Set(__EXTRAS__.map((x) => x.id));
const shown =
  changed.size === 0 ? pairs : pairs.filter((p) => changed.has(p.a) || changed.has(p.b));
console.log(
  `${entries.length} enemies, ${pairs.length} same-size pairs` +
    (changed.size === 0 ? '' : `, showing pairs with: ${[...changed].join(', ')}`),
);
console.log(formatReport(shown, minions, 40));
